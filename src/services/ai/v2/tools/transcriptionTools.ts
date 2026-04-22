/**
 * Transcription tools — LLM passes for lecture analysis.
 *
 * Two analysis passes (`analyze_transcript_segment`, `meta_summarize_lecture`)
 * plus ADHD-formatted note generation (`generate_adhd_note`). The orchestrator
 * lives in `src/services/transcription/analysis.ts` and delegates per-pass
 * calls through `invokeTool`.
 */

import { z } from 'zod';
import { tool } from '../tool';
import type { ProviderId } from '../../../../types';
import { DEFAULT_PROVIDER_ORDER } from '../../../../types';
import { profileRepository } from '../../../../db/repositories/profileRepository';
import { createGuruFallbackModel } from '../providers/guruFallback';
import { generateObject } from '../generateObject';
import { generateText } from '../generateText';

export const LectureAnalysisRawSchema = z.object({
  subject: z.string().nullable().catch('Unknown'),
  topics: z.array(z.string()).catch([]),
  key_concepts: z.array(z.string()).catch([]),
  high_yield_highlights: z.array(z.string()).catch([]),
  lecture_summary: z.string().nullable().catch('Lecture content recorded.'),
  estimated_confidence: z.number().min(1).max(3).catch(1),
});

const GROQ_FIRST_ORDER: ProviderId[] = [
  'groq',
  'openrouter',
  'deepseek',
  'cloudflare',
  'github',
  'gemini',
  'gemini_fallback',
  'agentrouter',
  'kilo',
  'chatgpt',
  'github_copilot',
  'gitlab_duo',
  'poe',
  'qwen',
];

const MEDICAL_EXTRACT_PROMPT = `You are a medical scribe. Extract key clinical facts, subject, and topics from the following transcript segment.`;
const META_SUMMARIZE_PROMPT = `Combine the following medical transcript segment analyses into a single coherent lecture analysis.`;

export const analyzeTranscriptSegmentTool = tool({
  name: 'analyze_transcript_segment',
  description:
    'Run one LLM extraction pass on a lecture transcript chunk. Returns raw subject/topics/key concepts/summary.',
  inputSchema: z.object({
    segment: z.string().min(1),
  }),
  execute: async ({ segment }) => {
    const profile = await profileRepository.getProfile();
    const model = createGuruFallbackModel({ profile, forceOrder: GROQ_FIRST_ORDER });
    const { object } = await generateObject({
      model,
      messages: [
        {
          role: 'user',
          content: `${MEDICAL_EXTRACT_PROMPT}\n\nHere is the transcript segment:\n"""\n${segment}\n"""`,
        },
      ],
      schema: LectureAnalysisRawSchema,
    });
    return object;
  },
});

export const metaSummarizeLectureTool = tool({
  name: 'meta_summarize_lecture',
  description:
    'Merge multiple per-segment lecture analyses into a single coherent lecture analysis.',
  inputSchema: z.object({
    aggregatedInput: z.string().min(1),
  }),
  execute: async ({ aggregatedInput }) => {
    const profile = await profileRepository.getProfile();
    const model = createGuruFallbackModel({ profile, forceOrder: GROQ_FIRST_ORDER });
    const { object } = await generateObject({
      model,
      messages: [
        {
          role: 'user',
          content: `${META_SUMMARIZE_PROMPT}\n\nHere are the segment summaries:\n"""\n${aggregatedInput}\n"""`,
        },
      ],
      schema: LectureAnalysisRawSchema,
    });
    return object;
  },
});

const ADHD_NOTE_SYSTEM_PROMPT = `You create elite medical study notes for a NEET-PG student with ADHD.
Rules:
- STRUCTURE: Use clear emoji headers: 🎯 **Subject**, 📌 **Topics**, 💡 **Key Concepts**, 🚀 **High-Yield Facts**, 🧠 **Clinical Links**, 📝 **Integrated Summary**, ❓ **Check Yourself**.
- HIGHLIGHTS: Use markdown bolding (**keyword**) for clinical anchors, specific drug names, mechanisms, contraindications, diagnostic criteria, staging, scoring systems, and hallmark associations.
- SCANNABLE: Short bullets, compact subsections, never walls of text. Ensure comprehensive coverage of the ENTIRE lecture, not just the opening or closing segments.
- STITCHING: Assume the source transcript may have been split and merged from multiple chunks. Your job is to produce ONE coherent note with no repetition, no abrupt transitions, and no chunk-boundary artifacts.
- COMPLETENESS: Preserve all exam-relevant details that appear in the transcript, including differentials, definitions, classifications, investigations, treatment steps, side effects, exceptions, and classic traps.
- PRIORITIZATION: Emphasize what is most testable for NEET-PG/INICET, but do not omit secondary details if they help understanding.
- VISUAL: Use emoji anchors throughout.
- MEMORABLE: Include one brief mnemonic or clinical anchor for the most tested concept.
- ACTIONABLE: End with 2-4 quick "check-your-understanding" questions.
- OUTPUT: Return polished markdown only. Do not mention chunking, splitting, or missing context.
`;

export const generateAdhdNoteTool = tool({
  name: 'generate_adhd_note',
  description:
    'Generate a polished, ADHD-friendly markdown lecture note from a structured lecture analysis.',
  inputSchema: z.object({
    input: z.string().min(1).describe('Pre-formatted analysis + transcript excerpt payload'),
  }),
  execute: async ({ input }) => {
    const profile = await profileRepository.getProfile();
    const model = createGuruFallbackModel({ profile, forceOrder: DEFAULT_PROVIDER_ORDER });
    const { text } = await generateText({
      model,
      messages: [
        { role: 'system', content: ADHD_NOTE_SYSTEM_PROMPT },
        { role: 'user', content: input },
      ],
    });
    return { text: text.trim() };
  },
});

export const guruTranscriptionTools = {
  analyze_transcript_segment: analyzeTranscriptSegmentTool,
  meta_summarize_lecture: metaSummarizeLectureTool,
  generate_adhd_note: generateAdhdNoteTool,
};
