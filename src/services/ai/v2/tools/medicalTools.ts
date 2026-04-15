/**
 * Guru medical tools — definitions the model can call mid-stream.
 *
 * Each tool is a thin wrapper around existing services. The agentic loop in
 * streamText handles invocation, schema validation, and result feeding.
 */

import { z } from 'zod';
import { tool } from '../tool';
import { searchLatestMedicalSources } from '../../medicalSearch';
import { getDb } from '../../../../db/database';

/**
 * search_medical — PubMed / EuropePMC / Wikipedia / Brave (whichever are
 * configured). Returns a trimmed list the model can cite.
 */
export const searchMedicalTool = tool({
  name: 'search_medical',
  description:
    'Search authoritative medical sources (PubMed, EuropePMC, Wikipedia) for a clinical topic. Use when the user asks about diseases, mechanisms, drugs, or needs citations. Prefer this over guessing.',
  inputSchema: z.object({
    query: z.string().describe('Focused clinical search phrase, e.g. "SGLT2 inhibitor mechanism"'),
    maxResults: z.number().optional(),
  }),
  execute: async ({ query, maxResults }) => {
    const sources = await searchLatestMedicalSources(query, maxResults ?? 5);
    return {
      results: sources.map((s) => ({
        title: s.title,
        url: s.url,
        snippet: s.snippet,
        source: s.source,
        journal: s.journal,
        publishedAt: s.publishedAt,
      })),
    };
  },
});

/**
 * lookup_topic — find a topic in Guru's NEET-PG syllabus and return the
 * user's current progress (status, confidence, FSRS stability). Lets the
 * AI tailor explanations to what the user already knows.
 */
export const lookupTopicTool = tool({
  name: 'lookup_topic',
  description:
    "Look up a topic in the user's NEET-PG syllabus by name. Returns the user's current progress (status, confidence, FSRS stability) so you can tailor the explanation. Use at the start of a study-related answer.",
  inputSchema: z.object({
    name: z.string().describe('Topic name as it would appear in the syllabus, e.g. "Diabetes mellitus"'),
  }),
  execute: async ({ name }) => {
    const db = await getDb();
    const row = await db.getFirstAsync<{
      id: number;
      name: string;
      status: string;
      confidence: number | null;
      subject_id: number;
      stability: number | null;
    }>(
      `SELECT t.id, t.name, p.status, p.confidence, t.subject_id, p.stability
         FROM topics t
         LEFT JOIN topic_progress p ON p.topic_id = t.id
        WHERE lower(t.name) LIKE lower(?)
        ORDER BY LENGTH(t.name) ASC
        LIMIT 1`,
      [`%${name}%`],
    );
    if (!row) return { found: false, name };
    return {
      found: true,
      id: row.id,
      name: row.name,
      status: row.status ?? 'unseen',
      confidence: row.confidence ?? 0,
      subjectId: row.subject_id,
      fsrsStability: row.stability,
    };
  },
});

/**
 * get_quiz_questions — pull MCQs from the user's question bank for a given
 * topic. Useful when the AI wants to reinforce the explanation with a quick
 * self-test.
 */
export const getQuizQuestionsTool = tool({
  name: 'get_quiz_questions',
  description:
    "Fetch MCQs from the user's question bank for a given topic id. Use to reinforce an explanation with practice.",
  inputSchema: z.object({
    topicId: z.number(),
    limit: z.number().optional(),
  }),
  execute: async ({ topicId, limit }) => {
    const db = await getDb();
    const rows = await db.getAllAsync<{
      id: number;
      stem: string;
      options_json: string;
      correct_index: number;
      explanation: string | null;
    }>(
      `SELECT id, stem, options_json, correct_index, explanation
         FROM question_bank
        WHERE topic_id = ?
        ORDER BY RANDOM()
        LIMIT ?`,
      [topicId, limit ?? 3],
    );
    return {
      questions: rows.map((r) => ({
        id: r.id,
        stem: r.stem,
        options: safeParseArray(r.options_json),
        correctIndex: r.correct_index,
        explanation: r.explanation,
      })),
    };
  },
});

function safeParseArray(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** Standard tool set Guru Chat should expose. */
export const guruMedicalTools = {
  search_medical: searchMedicalTool,
  lookup_topic: lookupTopicTool,
  get_quiz_questions: getQuizQuestionsTool,
};
