/**
 * Content tools — fetch study materials and generate quizzes.
 */

import { z } from 'zod';
import { tool } from '../tool';
import { getDrizzleDb } from '../../../../db/drizzle';
import {
  topics,
  questionBank,
  aiCache,
} from '../../../../db/drizzleSchema';
import { sql, like, eq } from 'drizzle-orm';

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
    const db = getDrizzleDb();

    // Find the topic ID
    const rows = await db
      .select({ id: topics.id, name: topics.name })
      .from(topics)
      .where(like(sql`lower(${topics.name})`, `%${topicName.toLowerCase()}%`))
      .orderBy(sql`LENGTH(${topics.name}) ASC`)
      .limit(1);
    const topicRow = rows[0];

    if (!topicRow) {
      return { error: `Topic not found matching "${topicName}"` };
    }

    // Fetch questions from the question bank
    const questionsRaw = await db
      .select({
        id: questionBank.id,
        stem: questionBank.question,
        options_json: questionBank.options,
        correct_index: questionBank.correctIndex,
        explanation: questionBank.explanation,
      })
      .from(questionBank)
      .where(eq(questionBank.topicId, topicRow.id))
      .orderBy(sql`RANDOM()`)
      .limit(questionCount);
    const questions = questionsRaw.map((q) => ({
      id: q.id,
      stem: q.stem,
      options_json: q.options_json ?? '[]',
      correct_index: q.correct_index,
      explanation: q.explanation,
    }));

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
    const db = getDrizzleDb();

    // Find the topic
    const rows = await db
      .select({ id: topics.id, name: topics.name })
      .from(topics)
      .where(like(sql`lower(${topics.name})`, `%${topicName.toLowerCase()}%`))
      .orderBy(sql`LENGTH(${topics.name}) ASC`)
      .limit(1);
    const topicRow = rows[0];

    if (!topicRow) {
      return { error: `Topic not found matching "${topicName}"` };
    }

    // Try to fetch from ai_cache for keypoints (mapped to key_points)
    let content = '';
    if (contentType === 'key_points') {
      const cacheRows = await db
        .select({ content_json: aiCache.contentJson })
        .from(aiCache)
        .where(sql`${aiCache.topicId} = ${topicRow.id} AND ${aiCache.contentType} = 'keypoints'`)
        .limit(1);
      const cachedContent = cacheRows[0];
      if (cachedContent) {
        try {
          const parsed = JSON.parse(cachedContent.content_json);
          if (parsed.points && Array.isArray(parsed.points)) {
            content = parsed.points.join('\n• ');
            if (parsed.memoryHook) {
              content += `\n\nMemory Hook: ${parsed.memoryHook}`;
            }
          }
        } catch {
          // If parsing fails, fall back to description
        }
      }
    }

    // If no content found, return description or placeholder
    if (!content) {
      content = `Detailed study material for ${topicRow.name} is currently being updated. Focus on key mechanisms and clinical presentations.`;
    }

    return {
      topic: topicRow.name,
      contentType,
      content:
        contentType === 'summary'
          ? content.substring(0, 200) + (content.length > 200 ? '...' : '')
          : content,
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

// ─── AI Content Generation Tools (each content type as a tool) ───────────────

/**
 * generate_keypoints — Create high-yield key points with memory hook.
 */
export const generateKeypointsTool = tool({
  name: 'generate_keypoints',
  description:
    'Generate 6 high-yield NEET-PG key points for a topic with a memorable hook. ADHD-friendly format.',
  inputSchema: z.object({
    topicName: z.string().describe('The medical topic to generate key points for'),
  }),
  execute: async ({ topicName }) => {
    const { getDrizzleDb } = await import('../../../../db/drizzle');
    const { topics, topicProgress, subjects } = await import('../../../../db/drizzleSchema');
    const { sql, like, eq } = await import('drizzle-orm');
    const { fetchContent } = await import('../../contentGeneration');
    const db = getDrizzleDb();

    const rows = await db
      .select({
        id: topics.id,
        name: topics.name,
        subjectName: subjects.name,
        status: topicProgress.status,
        confidence: topicProgress.confidence,
      })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .leftJoin(topicProgress, eq(topicProgress.topicId, topics.id))
      .where(like(sql`lower(${topics.name})`, `%${topicName.toLowerCase()}%`))
      .orderBy(sql`LENGTH(${topics.name}) ASC`)
      .limit(1);
    const topicRow = rows[0];

    if (!topicRow) {
      return { error: `Topic not found matching "${topicName}"` };
    }

    const content = await fetchContent(
      {
        id: topicRow.id,
        name: topicRow.name,
        subjectName: topicRow.subjectName,
        progress: {
          status: (topicRow.status as 'unseen' | 'seen' | 'reviewed' | 'mastered') ?? 'unseen',
          confidence: topicRow.confidence ?? 0,
        },
      } as unknown as import('../../../../types').TopicWithProgress,
      'keypoints',
    );

    if (content.type !== 'keypoints') {
      return { error: 'Failed to generate keypoints' };
    }

    return {
      topic: content.topicName,
      points: content.points,
      memoryHook: content.memoryHook,
    };
  },
});

/**
 * generate_must_know — Create must-know vs most-tested exam facts.
 */
export const generateMustKnowTool = tool({
  name: 'generate_must_know',
  description:
    'Generate must-know and most-tested exam facts for a topic with tactical exam-day tips.',
  inputSchema: z.object({
    topicName: z.string().describe('The medical topic to generate must-know facts for'),
  }),
  execute: async ({ topicName }) => {
    const { getDrizzleDb } = await import('../../../../db/drizzle');
    const { topics, topicProgress, subjects } = await import('../../../../db/drizzleSchema');
    const { sql, like, eq } = await import('drizzle-orm');
    const { fetchContent } = await import('../../contentGeneration');
    const db = getDrizzleDb();

    const rows = await db
      .select({
        id: topics.id,
        name: topics.name,
        subjectName: subjects.name,
        status: topicProgress.status,
        confidence: topicProgress.confidence,
      })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .leftJoin(topicProgress, eq(topicProgress.topicId, topics.id))
      .where(like(sql`lower(${topics.name})`, `%${topicName.toLowerCase()}%`))
      .orderBy(sql`LENGTH(${topics.name}) ASC`)
      .limit(1);
    const topicRow = rows[0];

    if (!topicRow) {
      return { error: `Topic not found matching "${topicName}"` };
    }

    const content = await fetchContent(
      {
        id: topicRow.id,
        name: topicRow.name,
        subjectName: topicRow.subjectName,
        progress: {
          status: (topicRow.status as 'unseen' | 'seen' | 'reviewed' | 'mastered') ?? 'unseen',
          confidence: topicRow.confidence ?? 0,
        },
      } as unknown as import('../../../../types').TopicWithProgress,
      'must_know',
    );

    if (content.type !== 'must_know') {
      return { error: 'Failed to generate must_know content' };
    }

    return {
      topic: content.topicName,
      mustKnow: content.mustKnow,
      mostTested: content.mostTested,
      examTip: content.examTip,
    };
  },
});

/**
 * generate_story — Create a clinical story embedding key facts.
 */
export const generateStoryTool = tool({
  name: 'generate_story',
  description:
    'Generate a clinical narrative story that embeds key medical facts naturally. Great for memory anchoring.',
  inputSchema: z.object({
    topicName: z.string().describe('The medical topic to create a story for'),
  }),
  execute: async ({ topicName }) => {
    const { getDrizzleDb } = await import('../../../../db/drizzle');
    const { topics, topicProgress, subjects } = await import('../../../../db/drizzleSchema');
    const { sql, like, eq } = await import('drizzle-orm');
    const { fetchContent } = await import('../../contentGeneration');
    const db = getDrizzleDb();

    const rows = await db
      .select({
        id: topics.id,
        name: topics.name,
        subjectName: subjects.name,
        status: topicProgress.status,
        confidence: topicProgress.confidence,
      })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .leftJoin(topicProgress, eq(topicProgress.topicId, topics.id))
      .where(like(sql`lower(${topics.name})`, `%${topicName.toLowerCase()}%`))
      .orderBy(sql`LENGTH(${topics.name}) ASC`)
      .limit(1);
    const topicRow = rows[0];

    if (!topicRow) {
      return { error: `Topic not found matching "${topicName}"` };
    }

    const content = await fetchContent(
      {
        id: topicRow.id,
        name: topicRow.name,
        subjectName: topicRow.subjectName,
        progress: {
          status: (topicRow.status as 'unseen' | 'seen' | 'reviewed' | 'mastered') ?? 'unseen',
          confidence: topicRow.confidence ?? 0,
        },
      } as unknown as import('../../../../types').TopicWithProgress,
      'story',
    );

    if (content.type !== 'story') {
      return { error: 'Failed to generate story' };
    }

    return {
      topic: content.topicName,
      story: content.story,
      keyConceptHighlights: content.keyConceptHighlights,
    };
  },
});

/**
 * generate_mnemonic — Create a memorable mnemonic with expansion.
 */
export const generateMnemonicTool = tool({
  name: 'generate_mnemonic',
  description:
    'Generate a memorable mnemonic (acronym/poem/pattern) for a medical topic with letter-by-letter expansion.',
  inputSchema: z.object({
    topicName: z.string().describe('The medical topic to create a mnemonic for'),
  }),
  execute: async ({ topicName }) => {
    const { getDrizzleDb } = await import('../../../../db/drizzle');
    const { topics, topicProgress, subjects } = await import('../../../../db/drizzleSchema');
    const { sql, like, eq } = await import('drizzle-orm');
    const { fetchContent } = await import('../../contentGeneration');
    const db = getDrizzleDb();

    const rows = await db
      .select({
        id: topics.id,
        name: topics.name,
        subjectName: subjects.name,
        status: topicProgress.status,
        confidence: topicProgress.confidence,
      })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .leftJoin(topicProgress, eq(topicProgress.topicId, topics.id))
      .where(like(sql`lower(${topics.name})`, `%${topicName.toLowerCase()}%`))
      .orderBy(sql`LENGTH(${topics.name}) ASC`)
      .limit(1);
    const topicRow = rows[0];

    if (!topicRow) {
      return { error: `Topic not found matching "${topicName}"` };
    }

    const content = await fetchContent(
      {
        id: topicRow.id,
        name: topicRow.name,
        subjectName: topicRow.subjectName,
        progress: {
          status: (topicRow.status as 'unseen' | 'seen' | 'reviewed' | 'mastered') ?? 'unseen',
          confidence: topicRow.confidence ?? 0,
        },
      } as unknown as import('../../../../types').TopicWithProgress,
      'mnemonic',
    );

    if (content.type !== 'mnemonic') {
      return { error: 'Failed to generate mnemonic' };
    }

    return {
      topic: content.topicName,
      mnemonic: content.mnemonic,
      expansion: content.expansion,
      tip: content.tip,
    };
  },
});

/**
 * generate_teach_back — Create a teach-back challenge for self-testing.
 */
export const generateTeachBackTool = tool({
  name: 'generate_teach_back',
  description:
    'Generate a "teach back" challenge where the student explains a topic aloud. Includes key points they should mention and Guru reaction template.',
  inputSchema: z.object({
    topicName: z.string().describe('The medical topic for the teach-back challenge'),
  }),
  execute: async ({ topicName }) => {
    const { getDrizzleDb } = await import('../../../../db/drizzle');
    const { topics, topicProgress, subjects } = await import('../../../../db/drizzleSchema');
    const { sql, like, eq } = await import('drizzle-orm');
    const { fetchContent } = await import('../../contentGeneration');
    const db = getDrizzleDb();

    const rows = await db
      .select({
        id: topics.id,
        name: topics.name,
        subjectName: subjects.name,
        status: topicProgress.status,
        confidence: topicProgress.confidence,
      })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .leftJoin(topicProgress, eq(topicProgress.topicId, topics.id))
      .where(like(sql`lower(${topics.name})`, `%${topicName.toLowerCase()}%`))
      .orderBy(sql`LENGTH(${topics.name}) ASC`)
      .limit(1);
    const topicRow = rows[0];

    if (!topicRow) {
      return { error: `Topic not found matching "${topicName}"` };
    }

    const content = await fetchContent(
      {
        id: topicRow.id,
        name: topicRow.name,
        subjectName: topicRow.subjectName,
        progress: {
          status: (topicRow.status as 'unseen' | 'seen' | 'reviewed' | 'mastered') ?? 'unseen',
          confidence: topicRow.confidence ?? 0,
        },
      } as unknown as import('../../../../types').TopicWithProgress,
      'teach_back',
    );

    if (content.type !== 'teach_back') {
      return { error: 'Failed to generate teach_back content' };
    }

    return {
      topic: content.topicName,
      prompt: content.prompt,
      keyPointsToMention: content.keyPointsToMention,
      guruReaction: content.guruReaction,
    };
  },
});

/**
 * generate_error_hunt — Create an error hunt with deliberate mistakes.
 */
export const generateErrorHuntTool = tool({
  name: 'generate_error_hunt',
  description:
    'Generate an "error hunt" - a paragraph with deliberate medical mistakes for the student to identify and correct.',
  inputSchema: z.object({
    topicName: z.string().describe('The medical topic for the error hunt'),
  }),
  execute: async ({ topicName }) => {
    const { getDrizzleDb } = await import('../../../../db/drizzle');
    const { topics, topicProgress, subjects } = await import('../../../../db/drizzleSchema');
    const { sql, like, eq } = await import('drizzle-orm');
    const { fetchContent } = await import('../../contentGeneration');
    const db = getDrizzleDb();

    const rows = await db
      .select({
        id: topics.id,
        name: topics.name,
        subjectName: subjects.name,
        status: topicProgress.status,
        confidence: topicProgress.confidence,
      })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .leftJoin(topicProgress, eq(topicProgress.topicId, topics.id))
      .where(like(sql`lower(${topics.name})`, `%${topicName.toLowerCase()}%`))
      .orderBy(sql`LENGTH(${topics.name}) ASC`)
      .limit(1);
    const topicRow = rows[0];

    if (!topicRow) {
      return { error: `Topic not found matching "${topicName}"` };
    }

    const content = await fetchContent(
      {
        id: topicRow.id,
        name: topicRow.name,
        subjectName: topicRow.subjectName,
        progress: {
          status: (topicRow.status as 'unseen' | 'seen' | 'reviewed' | 'mastered') ?? 'unseen',
          confidence: topicRow.confidence ?? 0,
        },
      } as unknown as import('../../../../types').TopicWithProgress,
      'error_hunt',
    );

    if (content.type !== 'error_hunt') {
      return { error: 'Failed to generate error_hunt content' };
    }

    return {
      topic: content.topicName,
      paragraph: content.paragraph,
      errors: content.errors,
    };
  },
});

/**
 * generate_detective — Create a clinical detective game with clues.
 */
export const generateDetectiveTool = tool({
  name: 'generate_detective',
  description:
    'Generate a "clinical detective" game - ordered clues leading to a diagnosis. Educational and engaging.',
  inputSchema: z.object({
    topicName: z.string().describe('The medical topic for the detective game'),
  }),
  execute: async ({ topicName }) => {
    const { getDrizzleDb } = await import('../../../../db/drizzle');
    const { topics, topicProgress, subjects } = await import('../../../../db/drizzleSchema');
    const { sql, like, eq } = await import('drizzle-orm');
    const { fetchContent } = await import('../../contentGeneration');
    const db = getDrizzleDb();

    const rows = await db
      .select({
        id: topics.id,
        name: topics.name,
        subjectName: subjects.name,
        status: topicProgress.status,
        confidence: topicProgress.confidence,
      })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .leftJoin(topicProgress, eq(topicProgress.topicId, topics.id))
      .where(like(sql`lower(${topics.name})`, `%${topicName.toLowerCase()}%`))
      .orderBy(sql`LENGTH(${topics.name}) ASC`)
      .limit(1);
    const topicRow = rows[0];

    if (!topicRow) {
      return { error: `Topic not found matching "${topicName}"` };
    }

    const content = await fetchContent(
      {
        id: topicRow.id,
        name: topicRow.name,
        subjectName: topicRow.subjectName,
        progress: {
          status: (topicRow.status as 'unseen' | 'seen' | 'reviewed' | 'mastered') ?? 'unseen',
          confidence: topicRow.confidence ?? 0,
        },
      } as unknown as import('../../../../types').TopicWithProgress,
      'detective',
    );

    if (content.type !== 'detective') {
      return { error: 'Failed to generate detective content' };
    }

    return {
      topic: content.topicName,
      clues: content.clues,
      answer: content.answer,
      explanation: content.explanation,
    };
  },
});

/**
 * generate_socratic — Create Socratic questioning drill.
 */
export const generateSocraticTool = tool({
  name: 'generate_socratic',
  description:
    'Generate a Socratic questioning drill - a sequence of questions that guide the student to discover concepts through reasoning.',
  inputSchema: z.object({
    topicName: z.string().describe('The medical topic for the Socratic drill'),
  }),
  execute: async ({ topicName }) => {
    const { getDrizzleDb } = await import('../../../../db/drizzle');
    const { topics, topicProgress, subjects } = await import('../../../../db/drizzleSchema');
    const { sql, like, eq } = await import('drizzle-orm');
    const { fetchContent } = await import('../../contentGeneration');
    const db = getDrizzleDb();

    const rows = await db
      .select({
        id: topics.id,
        name: topics.name,
        subjectName: subjects.name,
        status: topicProgress.status,
        confidence: topicProgress.confidence,
      })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .leftJoin(topicProgress, eq(topicProgress.topicId, topics.id))
      .where(like(sql`lower(${topics.name})`, `%${topicName.toLowerCase()}%`))
      .orderBy(sql`LENGTH(${topics.name}) ASC`)
      .limit(1);
    const topicRow = rows[0];

    if (!topicRow) {
      return { error: `Topic not found matching "${topicName}"` };
    }

    const content = await fetchContent(
      {
        id: topicRow.id,
        name: topicRow.name,
        subjectName: topicRow.subjectName,
        progress: {
          status: (topicRow.status as 'unseen' | 'seen' | 'reviewed' | 'mastered') ?? 'unseen',
          confidence: topicRow.confidence ?? 0,
        },
      } as unknown as import('../../../../types').TopicWithProgress,
      'socratic',
    );

    if (content.type !== 'socratic') {
      return { error: 'Failed to generate socratic content' };
    }

    return {
      topic: content.topicName,
      questions: content.questions,
    };
  },
});
