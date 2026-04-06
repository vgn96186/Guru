import { z } from 'zod';
import { generateTextWithRouting } from './ai/generate';
import { parseStructuredJson } from './ai/jsonRepair';
import type { Message } from './ai/types';

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
  if (v && typeof v === 'object' && 'label' in v) return String((v as any).label);
  if (v && typeof v === 'object' && 'name' in v) return String((v as any).name);
  if (v && typeof v === 'object' && 'title' in v) return String((v as any).title);
  return undefined;
}

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
      ? children.map((c: any) => normalizeBranchNode(c))
      : undefined,
    crossLinks: Array.isArray(crossLinks)
      ? crossLinks.map((cl: any) => ({
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

  // ── Pattern: { "topic": "X", "center": { "label": "X", ... }, "branches": [...] }
  // where center is an object with description but the label is what we need
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

  // NotebookLM horizontal rightward-branching tree settings
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
          edges.push({ sourceIndex: srcIdx, targetIndex: tgtIdx, label: link.relation });
        }
      }
    }
  }

  return { nodes, edges, centerLabel: resp.centerLabel };
}

// ── JSON example for prompts ──────────────────────────────────────────────

const JSON_EXAMPLE = `{
  "centerLabel": "Example Topic",
  "nodes": [
    { "label": "Branch 1" },
    { "label": "Branch 2" },
    { "label": "Branch 3" }
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
        // Fall through to the generic parseStructuredJson
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
  depth: 'compact' | 'rich' = 'compact',
): Promise<MindMapLayout> {
  const nodeCount = depth === 'rich' ? '15-20' : '5-8';

  const messages: Message[] = [
    {
      role: 'system',
      content: `You are Guru, a NEET-PG/INICET medical concept mapping expert. Generate a mind map as JSON.
Rules:
- Center the map on the given topic.
- Generate ${nodeCount} main branches ONLY. Do NOT include sub-branches.
- CRITICAL STRUCTURING: Organize the map realistically using established medical frameworks!
  - For Diseases: 'Etiology/Patho', 'Clinical Features', 'Investigations/Diagnosis', 'Management', 'Complications'.
  - For Pharmacology: 'Mechanism', 'Indications', 'Adverse Effects', 'Contraindications'.
  - For Anatomy/Physiology: Structural/Functional breakdown.
- Do not just list random associations.
- Labels must be incredibly concise (2-5 words) and represent highly-testable NEET-PG categories.
- You MUST use EXACTLY these key names: "centerLabel" (center topic), "nodes" (branches array), "label" (node name).
- Return ONLY valid JSON matching this exact schema:
${JSON_EXAMPLE}`,
    },
    {
      role: 'user',
      content: subject
        ? `Create a strictly-structured, high-yield medical mind map for "${topic}" in ${subject}. Return JSON only.`
        : `Create a strictly-structured, high-yield medical mind map for "${topic}". Return JSON only.`,
    },
  ];

  // Use generateTextWithRouting (full provider fallback chain) then parse
  // with our custom normalizer that handles many AI output variations.
  const { text, modelUsed } = await generateTextWithRouting(messages);

  if (__DEV__) {
    console.info('[MindMapAI] Raw response', { length: text.length, modelUsed });
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
  const messages: Message[] = [
    {
      role: 'system',
      content: `You are Guru, an elite NEET-PG/INICET tutor. Expand a specific mind map node into sub-branches.
Rules:
- The overall map is about: "${rootTopic}".
- The user tapped the node labeled: "${nodeLabel}". Generate 4-6 high-yield child branches specifically for this aspect of the topic.
- Do NOT nest children. Keep it completely flat — just first-level sub-branches.
- INJECT HIGH-YIELD FACTS: Focus strictly on exam-tested buzzwords, classic triads, first-line drugs, gold standard tests, and critical side effects. Do not generate generic filler.
- Labels must be concise (2-5 words).
- You MUST use EXACTLY these key names: "centerLabel" for the tapped node label, "nodes" for the sub-branches array, "label" for each node name.
- Return ONLY valid JSON matching this exact schema:
${JSON_EXAMPLE}`,
    },
    {
      role: 'user',
      content: subject
        ? `Map topic: "${rootTopic}" (${subject}). Expand the node "${nodeLabel}" with clinical buzzwords and high-yield facts. Return JSON only.`
        : `Map topic: "${rootTopic}". Expand the node "${nodeLabel}" with clinical buzzwords and high-yield facts. Return JSON only.`,
    },
  ];

  const { text } = await generateTextWithRouting(messages);
  const parsed = await parseMindMapJson(text);
  return layoutFromAIResponse(parsed);
}

export async function explainMindMapNode(
  rootTopic: string,
  nodeLabel: string,
  parentLabel?: string,
): Promise<string> {
  const messages: Message[] = [
    {
      role: 'system',
      content: `You are Guru, a medical tutor helping a beginner learner.
Rules:
- Explain the tapped concept in plain language.
- Use 1-2 very short sentences only.
- First sentence: what it means.
- Second sentence: why it matters in the bigger topic.
- Avoid jargon unless you immediately decode it.
- No bullet points, no markdown, no JSON, no code fences.`,
    },
    {
      role: 'user',
      content: parentLabel
        ? `Main topic: "${rootTopic}". Tapped node: "${nodeLabel}". Parent branch: "${parentLabel}". Give a very short explanation.`
        : `Main topic: "${rootTopic}". Tapped node: "${nodeLabel}". Give a very short explanation.`,
    },
  ];

  const { text } = await generateTextWithRouting(messages);
  return normalizeMindMapExplanation(text);
}
