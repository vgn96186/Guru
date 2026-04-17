/**
 * Content tools — fetch study materials and generate quizzes.
 */

import { z } from 'zod';
import { tool } from '../tool';
import { getDb } from '../../../../db/database';

/**
 * create_quiz — Generate a custom quiz for a specific topic or subject.
 */
export const createQuizTool = tool({
  name: 'create_quiz',
  description:
    "Generate a custom multiple-choice quiz for a specific topic. Use this to test the user's knowledge after an explanation.",
  inputSchema: z.object({
    topicName: z.string().describe('The name of the topic to quiz on, e.g., "Diabetes mellitus"'),
    questionCount: z
      .number()
      .min(1)
      .max(10)
      .optional()
      .describe('Number of questions to generate (default: 3)'),
    difficulty: z
      .enum(['easy', 'medium', 'hard'])
      .optional()
      .describe('Difficulty level of the questions'),
  }),
  execute: async ({ topicName, questionCount = 3, difficulty = 'medium' }) => {
    const db = await getDb();

    // Find the topic ID
    const topicRow = await db.getFirstAsync<{ id: number; name: string }>(
      `
      SELECT id, name FROM topics
      WHERE lower(name) LIKE lower(?)
      ORDER BY LENGTH(name) ASC LIMIT 1
    `,
      [`%${topicName}%`],
    );

    if (!topicRow) {
      return { error: `Topic not found matching "${topicName}"` };
    }

    // Fetch questions from the question bank
    const questions = await db.getAllAsync<{
      id: number;
      stem: string;
      options_json: string;
      correct_index: number;
      explanation: string | null;
    }>(
      `
      SELECT id, stem, options_json, correct_index, explanation
      FROM question_bank
      WHERE topic_id = ?
      ORDER BY RANDOM()
      LIMIT ?
    `,
      [topicRow.id, questionCount],
    );

    if (questions.length === 0) {
      return { error: `No questions available for topic "${topicRow.name}"` };
    }

    return {
      topic: topicRow.name,
      difficulty,
      questions: questions.map((q) => ({
        id: q.id,
        stem: q.stem,
        options: safeParseArray(q.options_json),
        correctIndex: q.correct_index,
        explanation: q.explanation,
      })),
    };
  },
});

/**
 * fetch_content — Fetch study notes or summary for a specific topic.
 */
export const fetchContentTool = tool({
  name: 'fetch_content',
  description:
    'Fetch study notes, summaries, or key points for a specific topic from the syllabus.',
  inputSchema: z.object({
    topicName: z.string().describe('The name of the topic to fetch content for'),
    contentType: z
      .enum(['summary', 'full', 'key_points'])
      .optional()
      .describe('Type of content to fetch'),
  }),
  execute: async ({ topicName, contentType = 'summary' }) => {
    const db = await getDb();

    // Find the topic
    const topicRow = await db.getFirstAsync<{
      id: number;
      name: string;
      description: string | null;
    }>(
      `
      SELECT id, name, description FROM topics
      WHERE lower(name) LIKE lower(?)
      ORDER BY LENGTH(name) ASC LIMIT 1
    `,
      [`%${topicName}%`],
    );

    if (!topicRow) {
      return { error: `Topic not found matching "${topicName}"` };
    }

    // In a real app, this might fetch from a 'notes' or 'content' table.
    // For now, we return the description or a placeholder.
    const content =
      topicRow.description ||
      `Detailed study material for ${topicRow.name} is currently being updated. Focus on key mechanisms and clinical presentations.`;

    return {
      topic: topicRow.name,
      contentType,
      content: contentType === 'summary' ? content.substring(0, 200) + '...' : content,
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
