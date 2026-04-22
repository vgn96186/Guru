/**
 * Mind map tools — generate, expand, explain.
 *
 * LLM-powered variants of mindMapAI flows. Each tool wraps a single prompt →
 * LLM call and returns raw text; the orchestrator in `services/mindMapAI.ts`
 * parses + normalizes + lays out the result (pure logic, stays out of LLM land).
 */

import { z } from 'zod';
import { tool } from '../tool';
import { profileRepository } from '../../../../db/repositories/profileRepository';
import { createGuruFallbackModel } from '../providers/guruFallback';
import { generateText } from '../generateText';
import type { ModelMessage } from '../spec';

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

async function runMindmapText(messages: ModelMessage[]): Promise<string> {
  const profile = await profileRepository.getProfile();
  const model = createGuruFallbackModel({ profile });
  const { text } = await generateText({ model, messages });
  return text;
}

export const generateMindMapTool = tool({
  name: 'generate_mind_map',
  description:
    'Generate a comprehensive NEET-PG mind map JSON for a topic. Returns raw text that the caller parses into the canonical {centerLabel, nodes} shape.',
  inputSchema: z.object({
    topic: z.string(),
    subject: z.string().optional(),
    depth: z.enum(['compact', 'rich']).optional(),
  }),
  execute: async ({ topic, subject, depth = 'rich' }) => {
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
    return { text: await runMindmapText(messages) };
  },
});

export const expandMindMapNodeTool = tool({
  name: 'expand_mind_map_node',
  description: 'Expand one mind-map node into 3-5 high-yield sub-branches. Returns raw JSON text.',
  inputSchema: z.object({
    rootTopic: z.string(),
    nodeLabel: z.string(),
    existingLabels: z.array(z.string()),
    subject: z.string().optional(),
  }),
  execute: async ({ rootTopic, nodeLabel, existingLabels, subject }) => {
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
    return { text: await runMindmapText(messages) };
  },
});

export const explainMindMapNodeTool = tool({
  name: 'explain_mind_map_node',
  description: 'Short 2-3 sentence explanation of a mind-map concept.',
  inputSchema: z.object({
    rootTopic: z.string(),
    nodeLabel: z.string(),
    parentLabel: z.string().optional(),
  }),
  execute: async ({ rootTopic, nodeLabel, parentLabel }) => {
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
    return { text: await runMindmapText(messages) };
  },
});

export const guruMindMapTools = {
  generate_mind_map: generateMindMapTool,
  expand_mind_map_node: expandMindMapNodeTool,
  explain_mind_map_node: explainMindMapNodeTool,
};
