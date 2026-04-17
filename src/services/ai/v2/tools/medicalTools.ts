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
    name: z
      .string()
      .describe('Topic name as it would appear in the syllabus, e.g. "Diabetes mellitus"'),
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
/**
 * generate_image — generate a study image (illustration or chart) for a topic.
 */
export const generateImageTool = tool({
  name: 'generate_image',
  description:
    'Generate a study image (illustration or chart) to help explain a medical concept visually.',
  inputSchema: z.object({
    topicName: z.string().describe('The medical topic to illustrate'),
    sourceText: z.string().describe('The text content to base the image on'),
    style: z.enum(['illustration', 'chart']).describe('The style of the image'),
  }),
  execute: async ({ topicName, sourceText, style }) => {
    // We dynamically import to avoid circular dependencies
    const { generateStudyImage } = await import('../../../studyImageService');
    try {
      const image = await generateStudyImage({
        contextType: 'chat',
        contextKey: `tool-gen-${Date.now()}`,
        topicName,
        sourceText,
        style,
      });
      return { success: true, image };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
});

/**
 * save_to_notes — save an important fact or explanation to the user's notes.
 */
export const saveToNotesTool = tool({
  name: 'save_to_notes',
  description:
    "Save an important medical fact or explanation to the user's personal notes for later review.",
  inputSchema: z.object({
    topicId: z.number().describe('The ID of the syllabus topic this note belongs to'),
    content: z.string().describe('The markdown content to save as a note'),
  }),
  execute: async ({ topicId, content }) => {
    const db = await getDb();
    try {
      await db.runAsync(
        `INSERT INTO topic_notes (topic_id, content, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
        [topicId, content, Date.now(), Date.now()],
      );
      return { success: true, message: 'Note saved successfully.' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
});

/**
 * mark_topic_reviewed — mark a topic as reviewed in the user's progress.
 * Requires user approval.
 */
export const markTopicReviewedTool = tool({
  name: 'mark_topic_reviewed',
  description:
    'Mark a syllabus topic as reviewed after the user has successfully demonstrated understanding. Requires user approval.',
  inputSchema: z.object({
    topicId: z.number().describe('The ID of the syllabus topic to mark as reviewed'),
    confidence: z
      .number()
      .min(1)
      .max(5)
      .describe('Estimated confidence level from 1 to 5 based on the chat'),
  }),
  needsApproval: true,
  execute: async ({ topicId, confidence }) => {
    const db = await getDb();
    try {
      await db.runAsync(
        `UPDATE topic_progress 
         SET status = 'reviewed', confidence = ?, last_studied_at = ?
         WHERE topic_id = ?`,
        [confidence, Date.now(), topicId],
      );
      return { success: true, message: 'Topic marked as reviewed.' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
});

/** Standard tool set Guru Chat should expose. */
/**
 * fact_check — check a medical claim against trusted sources.
 */
export const factCheckTool = tool({
  name: 'fact_check',
  description:
    'Check a specific medical claim against trusted sources (PubMed, Wikipedia, user lectures) to verify its accuracy.',
  inputSchema: z.object({
    claim: z.string().describe('The specific medical claim to verify'),
    topicName: z.string().optional().describe('The broader topic context'),
  }),
  execute: async ({ claim, topicName }) => {
    // Dynamically import to avoid circular dependencies
    const { extractMedicalEntities, extractClaims } = await import('../../medicalEntities');
    const { calculateTextSimilarity, detectContradictions } =
      await import('../../medicalFactCheck');

    const entities = extractMedicalEntities(claim);
    const claims = extractClaims(claim, entities.drugs, entities.diseases);

    if (entities.drugs.length === 0 && entities.diseases.length === 0) {
      return {
        status: 'inconclusive',
        message: 'No specific drugs or diseases detected in the claim to verify.',
      };
    }

    // Get trusted sources (simplified version of getTrustedSources)
    const sources: Array<{ source: string; text: string }> = [];
    try {
      const searchQuery = [...entities.drugs.slice(0, 3), ...entities.diseases.slice(0, 3)].join(
        ' ',
      );
      const searchResults = await searchLatestMedicalSources(
        `${searchQuery} ${topicName ?? ''}`,
        3,
      );
      sources.push(
        ...searchResults.map((s) => ({
          source: s.source,
          text: `${s.title} ${s.snippet}`,
        })),
      );
    } catch {
      // Ignore search errors
    }

    if (sources.length === 0) {
      return {
        status: 'inconclusive',
        message: 'Could not find trusted sources to verify the claim.',
      };
    }

    const contradictions = detectContradictions(claims, sources);

    if (contradictions.length > 0) {
      return {
        status: 'contradiction_found',
        contradictions: contradictions.map((c) => ({
          claim: c.claim,
          source: c.trustedSource,
          sourceText: c.trustedText,
        })),
      };
    }

    return { status: 'verified', message: 'No contradictions found in trusted sources.' };
  },
});

/** Standard tool set Guru Chat should expose. */
export const guruMedicalTools = {
  search_medical: searchMedicalTool,
  lookup_topic: lookupTopicTool,
  get_quiz_questions: getQuizQuestionsTool,
  generate_image: generateImageTool,
  save_to_notes: saveToNotesTool,
  mark_topic_reviewed: markTopicReviewedTool,
  fact_check: factCheckTool,
};
