/**
 * Lecture tools — analyze transcripts/notes for study optimization.
 */

import { z } from 'zod';
import { tool } from '../tool';
import { getDb } from '../../../../db/database';

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
