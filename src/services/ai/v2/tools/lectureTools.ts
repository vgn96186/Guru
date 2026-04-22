/**
 * Lecture tools — analyze transcripts/notes for study optimization.
 */

import { z } from 'zod';
import { tool } from '../tool';
import { getDb } from '../../../../db/database';
import { CatalystSchema } from '../../schemas';
import { profileRepository } from '../../../../db/repositories/profileRepository';
import { createGuruFallbackModel } from '../providers/guruFallback';
import { generateObject } from '../generateObject';
import { SYSTEM_PROMPT } from '../../../../constants/prompts';
import { DEFAULT_PROVIDER_ORDER } from '../../../../types';
import type { z as zType } from 'zod';

/**
 * analyze_lecture — "Catalyze" lecture content: extract key topics, match syllabus,
 * generate summary + active recall prompts + weak area flags.
 */
export const analyzeLectureTool = tool({
  name: 'analyze_lecture',
  description: `Analyze lecture transcript/notes. Extracts NEET-PG syllabus topics mentioned, flags weak areas based on your progress, generates 3-5 active recall questions, and suggests next actions (review, quiz, deep dive).`,
  inputSchema: z.object({
    transcript: z.string().describe('Lecture transcript or notes text'),
    focus: z
      .enum(['summary', 'topics', 'questions', 'weak-areas'])
      .optional()
      .describe('Prioritize one analysis aspect'),
  }),
  execute: async ({ transcript, focus }) => {
    const db = await getDb();

    interface TopicMatch {
      name: string;
      confidence: number;
      status: string;
    }

    // Simple keyword-based topic extraction (improve with LLM later)
    const topicCandidates = extractTopics(transcript);

    // Match against syllabus
    const matchedTopics: TopicMatch[] = [];
    for (const candidate of topicCandidates) {
      const row = await db.getFirstAsync<{
        name: string;
        status: string | null;
        confidence: number | null;
      }>(
        `
        SELECT t.name, p.status, p.confidence
        FROM topics t LEFT JOIN topic_progress p ON p.topic_id = t.id
        WHERE lower(t.name) LIKE lower(?)
        ORDER BY LENGTH(t.name) ASC LIMIT 1
      `,
        [`%${candidate}%`],
      );

      if (row) {
        matchedTopics.push({
          name: row.name,
          confidence: row.confidence ?? 0,
          status: row.status ?? 'unseen',
        });
      }
    }

    // Generate summary/questions based on focus
    const summary = focus === 'summary' || !focus ? generateSummary(transcript) : '';
    const questions =
      focus === 'questions' || !focus ? generateRecallQuestions(transcript, matchedTopics) : [];
    const weakAreas = matchedTopics.filter((t) => t.confidence < 3 || t.status === 'failed');

    return {
      topics: matchedTopics,
      summary,
      questions,
      weakAreas,
      recommendations:
        weakAreas.length > 0
          ? `Prioritize review: ${weakAreas.map((t) => t.name).join(', ')}`
          : 'All topics strong - consider practice MCQs.',
      topicCount: matchedTopics.length,
    };
  },
});

// Simple heuristics (replace with generateObject later)
function extractTopics(transcript: string): string[] {
  const lower = transcript.toLowerCase();
  const candidates =
    lower.match(
      /\b(diabetes|hypertension|asthma|anatomy|physiology|pathology|pharmacology|microbiology)\b/gi,
    ) || [];
  return [...new Set(candidates.slice(0, 10))]; // dedupe, limit
}

function generateSummary(transcript: string): string {
  const sentences = transcript.split(/[.!?]+/).slice(0, 5);
  return sentences.join('. ') + '.';
}

function generateRecallQuestions(transcript: string, topics: Array<{ name: string }>): string[] {
  return topics.slice(0, 5).map((t, i) => `What are the key ${t.name} mechanisms?`);
}

/**
 * catalyze_transcript — LLM-powered: extract subject + topics + key concepts
 * + 3-question MCQ quiz from a raw lecture transcript. This is the canonical
 * "catalyze" path — `catalyzeTranscript()` delegates here.
 *
 * On LLM failure the caller receives a thrown error and should fall back to
 * the heuristic `analyze_lecture` tool above.
 */
export const catalyzeTranscriptTool = tool({
  name: 'catalyze_transcript',
  description:
    'Analyze a raw lecture transcript with an LLM: identify the subject, extract topic names, a 2-line summary, 5 high-yield key concepts, and a 3-question MCQ quiz. Returns structured JSON.',
  inputSchema: z.object({
    transcript: z.string().min(1).describe('Full lecture transcript or running summary'),
  }),
  execute: async ({ transcript }): Promise<zType.infer<typeof CatalystSchema>> => {
    const userPrompt = `
You are a medical lecture analyst. Below is a raw transcript or summary of a lecture.
Your task is to:
1. Identify the primary medical subject.
2. Extract specific topic names mentioned.
3. Provide a 2-line high-level summary.
4. Extract 5 high-yield key concepts.
5. Generate a 3-question MCQ quiz based on the content.

TRANSCRIPT:
${transcript}

Return ONLY a JSON object matching this structure:
{
  "subject": "string",
  "topics": ["string", "string"],
  "summary": "string",
  "keyConcepts": ["string", "string"],
  "quiz": {
    "questions": [
      { "question": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "explanation": "..." }
    ]
  }
}
`;
    const profile = await profileRepository.getProfile();
    const model = createGuruFallbackModel({ profile, forceOrder: DEFAULT_PROVIDER_ORDER });
    const { object } = await generateObject({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      schema: CatalystSchema,
    });
    return object;
  },
});
