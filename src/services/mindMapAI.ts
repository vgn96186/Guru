import { z } from 'zod';
import { profileRepository } from '../db/repositories/profileRepository';
import { createGuruFallbackModel } from './ai/v2/providers/guruFallback';
import { generateText } from './ai/v2/generateText';
import { parseStructuredJson } from './ai/jsonRepair';
import type { ModelMessage } from './ai/v2/spec';

// ── Schema ─────────────────────────────────────────────────────────────────

const MindMapNodeSchema = z.object({
  label: z.string(),
  children: z
    .array(
      z.object({
        label: z.string(),
        relation: z.string().optional(),
        children: z
          .array(
            z.object({
              label: z.string(),
              relation: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
  crossLinks: z
    .array(
      z.object({
        targetLabel: z.string(),
        relation: z.string(),
      }),
    )
    .optional(),
});

const MindMapAIResponseSchema = z.object({
  centerLabel: z.string(),
  nodes: z.array(MindMapNodeSchema),
});

type MindMapAIResponse = z.infer<typeof MindMapAIResponseSchema>;

// ── Normalization ──────────────────────────────────────────────────────────
// AI models return wildly different structures. This function maps common
// alternative formats into the canonical { centerLabel, nodes } shape
// BEFORE Zod validation.

function extractLabel(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  if (v && typeof v === 'object' && 'label' in v) return String((v as any).label);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  if (v && typeof v === 'object' && 'name' in v) return String((v as any).name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  if (v && typeof v === 'object' && 'title' in v) return String((v as any).title);
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
function normalizeBranchNode(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw;

  const label = raw.label ?? raw.name ?? raw.title ?? raw.text ?? raw.concept;
  if (!label) return raw;

  // Normalize children/sub-nodes/subtopics
  const children =
    raw.children ??
    raw.subtopics ??
    raw.sub_topics ??
    raw.subnodes ??
    raw.sub_nodes ??
    raw.items ??
    raw.subBranches ??
    raw.sub_branches;

  // Normalize crossLinks/cross_links
  const crossLinks =
    raw.crossLinks ?? raw.cross_links ?? raw.connections ?? raw.links ?? raw.crosslinks;

  return {
    label: String(label),
    relation: raw.relation ?? raw.relationship ?? raw.edge_label ?? raw.edgeLabel ?? raw.edge,
    children: Array.isArray(children)
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
        children.map((c: any) => normalizeBranchNode(c))
      : undefined,
    crossLinks: Array.isArray(crossLinks)
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
        crossLinks.map((cl: any) => ({
          targetLabel: String(
            cl.targetLabel ?? cl.target_label ?? cl.target ?? cl.to ?? cl.name ?? '',
          ),
          relation: String(cl.relation ?? cl.relationship ?? cl.label ?? cl.type ?? ''),
        }))
      : undefined,
  };
}

function normalizeMindMapResponse(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  const obj = raw as Record<string, any>;

  // Already in canonical form?
  if (typeof obj.centerLabel === 'string' && Array.isArray(obj.nodes)) {
    return {
      centerLabel: obj.centerLabel,
      nodes: obj.nodes.map(normalizeBranchNode),
    };
  }

  // ── Extract center label from many possible shapes ──
  const centerLabel =
    extractLabel(obj.centerLabel) ??
    extractLabel(obj.center_label) ??
    extractLabel(obj.center) ??
    extractLabel(obj.topic) ??
    extractLabel(obj.title) ??
    extractLabel(obj.name) ??
    extractLabel(obj.root) ??
    extractLabel(obj.main_topic) ??
    extractLabel(obj.mainTopic) ??
    extractLabel(obj.centralTopic) ??
    extractLabel(obj.central_topic);

  // ── Extract branches/nodes from many possible array keys ──
  const nodesRaw =
    obj.nodes ??
    obj.branches ??
    obj.children ??
    obj.subtopics ??
    obj.sub_topics ??
    obj.topics ??
    obj.items ??
    obj.concepts ??
    obj.main_branches ??
    obj.mainBranches ??
    obj.categories ??
    obj.aspects;

  if (centerLabel && Array.isArray(nodesRaw)) {
    if (__DEV__) {
      console.info('[MindMapAI] Normalized response', {
        centerLabel,
        nodeCount: nodesRaw.length,
        originalKeys: Object.keys(obj),
      });
    }
    return {
      centerLabel,
      nodes: nodesRaw.map(normalizeBranchNode),
    };
  }

  // ── Last resort: if there's a single wrapper key containing the real data ──
  const entries = Object.entries(obj);
  if (entries.length === 1) {
    const [, inner] = entries[0];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      return normalizeMindMapResponse(inner);
    }
  }

  // ── Pattern: { "center": { "label": "X", ... }, "branches": [...] }
  if (obj.center && typeof obj.center === 'object' && !Array.isArray(obj.center)) {
    const cl = extractLabel(obj.center);
    const nr = obj.branches ?? obj.nodes ?? obj.children ?? obj.topics ?? obj.items ?? obj.concepts;
    if (cl && Array.isArray(nr)) {
      if (__DEV__) {
        console.info('[MindMapAI] Normalized from center object pattern', { centerLabel: cl });
      }
      return {
        centerLabel: cl,
        nodes: nr.map(normalizeBranchNode),
      };
    }
  }

  // Give up — return as-is and let Zod report the error
  if (__DEV__) {
    console.warn('[MindMapAI] Could not normalize response, keys:', Object.keys(obj));
  }
  return raw;
}

// ── Layout helpers ─────────────────────────────────────────────────────────

interface LayoutNode {
  label: string;
  x: number;
  y: number;
  isCenter: boolean;
}

interface LayoutEdge {
  sourceIndex: number;
  targetIndex: number;
  label?: string;
  isCrossLink?: boolean;
}

export interface MindMapLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  centerLabel: string;
}

function layoutFromAIResponse(resp: MindMapAIResponse): MindMapLayout {
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const labelToIndex = new Map<string, number>();

  // Center node
  nodes.push({ label: resp.centerLabel, x: 0, y: 0, isCenter: true });
  labelToIndex.set(resp.centerLabel, 0);

  // Horizontal rightward-branching tree — spacing is placeholder;
  // the real layout engine (mindMapLayout.ts) recomputes x/y from actual widths.
  const HORIZONTAL_SPACING = 350;
  const VERTICAL_SPACING_L1 = 120;
  const VERTICAL_SPACING_L2 = 80;
  const VERTICAL_SPACING_L3 = 60;

  const branchCount = resp.nodes.length;
  const startY = -((branchCount - 1) * VERTICAL_SPACING_L1) / 2;

  resp.nodes.forEach((branch, i) => {
    const x = HORIZONTAL_SPACING;
    const y = startY + i * VERTICAL_SPACING_L1;

    const branchIdx = nodes.length;
    nodes.push({ label: branch.label, x, y, isCenter: false });
    if (!labelToIndex.has(branch.label)) labelToIndex.set(branch.label, branchIdx);
    edges.push({ sourceIndex: 0, targetIndex: branchIdx });

    if (branch.children?.length) {
      const childCount = branch.children.length;
      const childStartY = y - ((childCount - 1) * VERTICAL_SPACING_L2) / 2;

      branch.children.forEach((child, j) => {
        const cx = x + HORIZONTAL_SPACING * 0.9;
        const cy = childStartY + j * VERTICAL_SPACING_L2;

        const childIdx = nodes.length;
        nodes.push({ label: child.label, x: cx, y: cy, isCenter: false });
        if (!labelToIndex.has(child.label)) labelToIndex.set(child.label, childIdx);
        edges.push({
          sourceIndex: branchIdx,
          targetIndex: childIdx,
          label: child.relation,
        });

        if (child.children?.length) {
          const leafCount = child.children.length;
          const leafStartY = cy - ((leafCount - 1) * VERTICAL_SPACING_L3) / 2;

          child.children.forEach((leaf, k) => {
            const leafIdx = nodes.length;
            const lx = cx + HORIZONTAL_SPACING * 0.8;
            const ly = leafStartY + k * VERTICAL_SPACING_L3;

            nodes.push({ label: leaf.label, x: lx, y: ly, isCenter: false });
            if (!labelToIndex.has(leaf.label)) labelToIndex.set(leaf.label, leafIdx);
            edges.push({
              sourceIndex: childIdx,
              targetIndex: leafIdx,
              label: leaf.relation,
            });
          });
        }
      });
    }
  });

  // Cross-links
  for (const branch of resp.nodes) {
    if (branch.crossLinks) {
      const srcIdx = labelToIndex.get(branch.label);
      for (const link of branch.crossLinks) {
        const tgtIdx = labelToIndex.get(link.targetLabel);
        if (srcIdx != null && tgtIdx != null) {
          edges.push({
            sourceIndex: srcIdx,
            targetIndex: tgtIdx,
            label: link.relation,
            isCrossLink: true,
          });
        }
      }
    }
  }

  return { nodes, edges, centerLabel: resp.centerLabel };
}

// ── JSON example for prompts ──────────────────────────────────────────────

const JSON_EXAMPLE = `{
  "centerLabel": "Diabetes Mellitus",
  "nodes": [
    {
      "label": "Pathophysiology",
      "children": [
        { "label": "Insulin Resistance" },
        { "label": "Beta Cell Failure" },
        { "label": "Glucotoxicity" }
      ]
    },
    {
      "label": "Clinical Features",
      "children": [
        { "label": "Polyuria/Polydipsia" },
        { "label": "Weight Loss" }
      ]
    },
    {
      "label": "Diagnosis",
      "children": [
        { "label": "HbA1c ≥6.5%" },
        { "label": "FBS ≥126 mg/dL" }
      ]
    }
  ]
}`;

export function normalizeMindMapExplanation(rawText: string): string {
  const cleaned = rawText
    .replace(/^\uFEFF/, '')
    .replace(/```[a-z]*\s*/gi, '')
    .replace(/```/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'`]+|[\s"'`]+$/g, '')
    .trim();

  if (!cleaned || cleaned === '{}' || cleaned === '[]') {
    return 'Short explanation unavailable. Tap again after a refresh.';
  }

  return cleaned;
}

// ── Custom parse with normalization ───────────────────────────────────────

async function parseMindMapJson(rawText: string): Promise<MindMapAIResponse> {
  // First strip code fences and parse raw JSON
  const cleaned = rawText
    .replace(/^\uFEFF/, '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try extracting balanced JSON starting from first {
    const start = cleaned.indexOf('{');
    if (start >= 0) {
      try {
        parsed = JSON.parse(cleaned.slice(start));
      } catch {
        return parseStructuredJson(rawText, MindMapAIResponseSchema);
      }
    } else {
      return parseStructuredJson(rawText, MindMapAIResponseSchema);
    }
  }

  // Normalize the parsed object to canonical form
  const normalized = normalizeMindMapResponse(parsed);

  // Validate with Zod
  const result = MindMapAIResponseSchema.safeParse(normalized);
  if (result.success) {
    return result.data;
  }

  if (__DEV__) {
    console.warn('[MindMapAI] Normalization failed, trying generic parser', {
      zodErrors: result.error.issues.slice(0, 3),
      normalizedKeys: normalized && typeof normalized === 'object' ? Object.keys(normalized) : [],
    });
  }

  // Fallback to the generic parseStructuredJson (includes repair heuristics)
  return parseStructuredJson(rawText, MindMapAIResponseSchema);
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function generateMindMap(
  topic: string,
  subject?: string,
  depth: 'compact' | 'rich' = 'rich',
): Promise<MindMapLayout> {
  const branchCount = depth === 'rich' ? '5-7' : '4-6';
  const childNote =
    depth === 'rich'
      ? 'Each branch MUST have 2-4 children with concise, high-yield sub-concepts.'
      : 'Each branch should have 1-3 children where useful.';

  const messages: ModelMessage[] = [
    {
      role: 'system',
      content: `You are Guru, a NEET-PG/INICET medical study expert. Your job is to generate a **comprehensive mind map** that helps a student learn a topic from scratch and master it for the exam.

PURPOSE: The student uses these mind maps to build a complete mental model of a topic before diving into MCQs. The map must cover all dimensions the exam can test.

STRUCTURE RULES:
- Center the map on the given topic.
- Generate ${branchCount} main branches. ${childNote}
- CRITICAL: Use established medical frameworks to organize branches:
  - Diseases → Etiology/Risk Factors, Pathophysiology, Clinical Features, Investigations, Diagnosis, Management (Medical + Surgical), Complications, Prognosis
  - Pharmacology → Classification, Mechanism of Action, Pharmacokinetics, Indications, Adverse Effects, Contraindications, Drug Interactions
  - Anatomy → Blood Supply, Nerve Supply, Relations, Applied Anatomy, Clinical Correlates
  - Physiology → Normal Mechanism, Regulation, Clinical Tests, Disorders
  - Microbiology → Morphology, Culture, Pathogenesis, Lab Diagnosis, Treatment, Prophylaxis
  Pick the framework that fits. Do NOT just list random associations.

CONTENT RULES:
- Labels: 2-6 words max. Be specific and exam-relevant.
- Include buzzwords, classic triads/pentads, gold-standard tests, first-line drugs, pathognomonic signs.
- Prioritize high-yield, frequently-tested facts over obscure details.
- Do NOT include generic filler like "Overview" or "Introduction".

FORMAT: Return ONLY valid JSON using EXACTLY these keys:
- "centerLabel": the topic name
- "nodes": array of branches, each with "label" and optionally "children" array
- Children have "label" and optionally "relation" (edge label)

Example:
${JSON_EXAMPLE}`,
    },
    {
      role: 'user',
      content: subject
        ? `Create a comprehensive, exam-ready mind map for "${topic}" in ${subject}. Cover all testable dimensions. Return JSON only.`
        : `Create a comprehensive, exam-ready mind map for "${topic}". Cover all testable dimensions. Return JSON only.`,
    },
  ];

  const profile = await profileRepository.getProfile();
  const model = createGuruFallbackModel({ profile });
  const { text } = await generateText({ model, messages });

  if (__DEV__) {
    console.info('[MindMapAI] Raw response', { length: text.length });
  }

  const parsed = await parseMindMapJson(text);
  return layoutFromAIResponse(parsed);
}

export async function expandNode(
  rootTopic: string,
  nodeLabel: string,
  existingLabels: string[],
  subject?: string,
): Promise<MindMapLayout> {
  const messages: ModelMessage[] = [
    {
      role: 'system',
      content: `You are Guru, an elite NEET-PG/INICET tutor. Expand a mind map node into detailed sub-branches to deepen the student's understanding.

CONTEXT: The overall map is about "${rootTopic}". The student tapped "${nodeLabel}" to learn more.

RULES:
- Generate 3-5 high-yield child branches that break this concept down further.
- Keep it flat — first-level sub-branches only, no nesting.
- Focus on exam-tested specifics: buzzwords, classic associations, first-line treatments, gold standard tests, pathognomonic findings, important numbers/values.
- Labels: 2-6 words, specific and testable.
- Do NOT duplicate concepts already on the map: ${existingLabels.slice(0, 20).join(', ')}

FORMAT: Return ONLY valid JSON:
- "centerLabel": "${nodeLabel}"
- "nodes": array of sub-branches with "label"

Example:
${JSON_EXAMPLE}`,
    },
    {
      role: 'user',
      content: subject
        ? `Map: "${rootTopic}" (${subject}). Drill into "${nodeLabel}" with exam-critical details. Return JSON only.`
        : `Map: "${rootTopic}". Drill into "${nodeLabel}" with exam-critical details. Return JSON only.`,
    },
  ];

  const profile = await profileRepository.getProfile();
  const model = createGuruFallbackModel({ profile });
  const { text } = await generateText({ model, messages });
  const parsed = await parseMindMapJson(text);
  return layoutFromAIResponse(parsed);
}

export async function explainMindMapNode(
  rootTopic: string,
  nodeLabel: string,
  parentLabel?: string,
): Promise<string> {
  const messages: ModelMessage[] = [
    {
      role: 'system',
      content: `You are Guru, a medical tutor explaining a mind map concept to a student learning from scratch.
Rules:
- Give a clear, concise explanation in 2-3 short sentences.
- First: what this concept means in simple terms.
- Then: why it matters for the exam / how it connects to the bigger topic.
- Include one high-yield fact or buzzword if relevant.
- No bullet points, no markdown, no JSON, no code fences.`,
    },
    {
      role: 'user',
      content: parentLabel
        ? `Topic: "${rootTopic}". Node: "${nodeLabel}" (under "${parentLabel}"). Explain briefly.`
        : `Topic: "${rootTopic}". Node: "${nodeLabel}". Explain briefly.`,
    },
  ];

  const profile = await profileRepository.getProfile();
  const model = createGuruFallbackModel({ profile });
  const { text } = await generateText({ model, messages });
  return normalizeMindMapExplanation(text);
}
