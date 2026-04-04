import { z } from 'zod';
import { generateJSONWithRouting } from './ai/generate';
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

  // First ring — main branches
  const branchCount = resp.nodes.length;
  const ringRadius = 220;

  resp.nodes.forEach((branch, i) => {
    const angle = (2 * Math.PI * i) / branchCount - Math.PI / 2;
    const x = Math.cos(angle) * ringRadius;
    const y = Math.sin(angle) * ringRadius;

    const branchIdx = nodes.length;
    nodes.push({ label: branch.label, x, y, isCenter: false });
    labelToIndex.set(branch.label, branchIdx);
    edges.push({ sourceIndex: 0, targetIndex: branchIdx });

    // Second ring — children of branches
    if (branch.children?.length) {
      const childRadius = 140;
      const spreadAngle = Math.min(0.8, (2 * Math.PI) / branchCount);
      branch.children.forEach((child, j) => {
        const childAngle =
          angle +
          (j - (branch.children!.length - 1) / 2) *
            (spreadAngle / Math.max(branch.children!.length - 1, 1));
        const cx = x + Math.cos(childAngle) * childRadius;
        const cy = y + Math.sin(childAngle) * childRadius;

        const childIdx = nodes.length;
        nodes.push({ label: child.label, x: cx, y: cy, isCenter: false });
        labelToIndex.set(child.label, childIdx);
        edges.push({
          sourceIndex: branchIdx,
          targetIndex: childIdx,
          label: child.relation,
        });

        // Third ring
        if (child.children?.length) {
          const leafRadius = 100;
          child.children.forEach((leaf, k) => {
            const leafAngle =
              childAngle +
              (k - (child.children!.length - 1) / 2) *
                ((spreadAngle / Math.max(child.children!.length - 1, 1)) * 0.6);
            const lx = cx + Math.cos(leafAngle) * leafRadius;
            const ly = cy + Math.sin(leafAngle) * leafRadius;

            const leafIdx = nodes.length;
            nodes.push({ label: leaf.label, x: lx, y: ly, isCenter: false });
            labelToIndex.set(leaf.label, leafIdx);
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
      content: `You are Guru, a NEET-PG/INICET concept mapper. Generate a mind map as JSON.
Rules:
- Center the map on the given topic.
- Generate ${nodeCount} main branches (first-level nodes) with 2-3 children each where appropriate.
- Each branch can have "crossLinks" pointing to other branch labels to show inter-topic connections.
- Labels should be concise (2-5 words), medically precise.
- "relation" describes the edge (e.g. "causes", "treats", "diagnosed by").
- Focus on high-yield NEET-PG/INICET connections.
- Return ONLY valid JSON matching the schema. No markdown.`,
    },
    {
      role: 'user',
      content: subject
        ? `Create a mind map for "${topic}" in ${subject}.`
        : `Create a mind map for "${topic}".`,
    },
  ];

  const { parsed } = await generateJSONWithRouting(messages, MindMapAIResponseSchema, 'low');
  return layoutFromAIResponse(parsed);
}

export async function expandNode(
  nodeLabel: string,
  existingLabels: string[],
  subject?: string,
): Promise<MindMapLayout> {
  const messages: Message[] = [
    {
      role: 'system',
      content: `You are Guru, a NEET-PG/INICET concept mapper. Expand a mind map node into sub-branches.
Rules:
- The user tapped a node labeled "${nodeLabel}". Generate 3-5 child branches for it.
- Each child can also have 1-2 children.
- Add crossLinks to any of these existing labels if relevant: ${existingLabels.slice(0, 30).join(', ')}
- Labels should be concise (2-5 words), medically precise.
- Return ONLY valid JSON matching the schema. No markdown.`,
    },
    {
      role: 'user',
      content: subject
        ? `Expand the concept "${nodeLabel}" in ${subject} for a mind map.`
        : `Expand the concept "${nodeLabel}" for a mind map.`,
    },
  ];

  const { parsed } = await generateJSONWithRouting(messages, MindMapAIResponseSchema, 'low');
  return layoutFromAIResponse(parsed);
}
