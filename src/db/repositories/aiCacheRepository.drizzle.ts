import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { AIContent, ContentType } from '../../types';
import { getDrizzleDb } from '../drizzle';
import { aiCache, subjects, topics, topicSuggestions } from '../drizzleSchema';

export interface MockQuestion {
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  topicName: string;
  subjectName: string;
}

export interface FlaggedItem {
  topicId: number;
  topicName: string;
  subjectName: string;
  contentType: ContentType;
  content: AIContent;
  modelUsed: string;
  createdAt: number;
}

export interface TopicSuggestionRecord {
  id: number;
  subjectId: number;
  subjectName: string;
  subjectColor: string;
  name: string;
  sourceSummary: string | null;
  mentionCount: number;
  status: 'pending' | 'approved' | 'rejected';
  approvedTopicId: number | null;
  firstDetectedAt: number;
  lastDetectedAt: number;
}

type CachedContentRow = {
  contentJson: string;
  modelUsed: string | null;
};

type TopicSuggestionRow = {
  id: number;
  subjectId: number;
  subjectName: string;
  subjectColor: string;
  name: string;
  sourceSummary: string | null;
  mentionCount: number;
  status: 'pending' | 'approved' | 'rejected';
  approvedTopicId: number | null;
  firstDetectedAt: number;
  lastDetectedAt: number;
};

function parseCachedContent(row: CachedContentRow): AIContent | null {
  try {
    const parsed = JSON.parse(row.contentJson) as AIContent;
    const fromColumn = (row.modelUsed ?? '').trim();
    const modelUsed =
      (typeof parsed.modelUsed === 'string' && parsed.modelUsed.trim()) || fromColumn || undefined;

    return { ...parsed, ...(modelUsed ? { modelUsed } : {}) };
  } catch (error) {
    if (__DEV__) {
      console.warn('[aiCacheRepositoryDrizzle] Failed to parse cached content:', error);
    }
    return null;
  }
}

function parseMockQuestionsFromRows(
  rows: Array<{
    contentJson: string;
    topicName: string;
    subjectName: string;
  }>,
  limit?: number,
): MockQuestion[] {
  const all: MockQuestion[] = [];
  for (const row of rows) {
    try {
      const quiz = JSON.parse(row.contentJson) as {
        questions: Array<{
          question: string;
          options: [string, string, string, string];
          correctIndex: number;
          explanation: string;
        }>;
      };
      for (const q of quiz.questions ?? []) {
        all.push({ ...q, topicName: row.topicName, subjectName: row.subjectName });
        if (limit && all.length >= limit) {
          return all;
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('[aiCacheRepositoryDrizzle] Skipping malformed quiz row:', err);
    }
  }
  return all;
}

function shuffleQuestions(questions: MockQuestion[]): MockQuestion[] {
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }
  return questions;
}

function mapTopicSuggestionRow(row: TopicSuggestionRow): TopicSuggestionRecord {
  return {
    id: row.id,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    subjectColor: row.subjectColor,
    name: row.name,
    sourceSummary: row.sourceSummary,
    mentionCount: row.mentionCount,
    status: row.status,
    approvedTopicId: row.approvedTopicId,
    firstDetectedAt: row.firstDetectedAt,
    lastDetectedAt: row.lastDetectedAt,
  };
}

export const aiCacheRepositoryDrizzle = {
  async getCachedContent(topicId: number, contentType: ContentType): Promise<AIContent | null> {
    const db = getDrizzleDb();
    const rows = await db
      .select({
        contentJson: aiCache.contentJson,
        modelUsed: aiCache.modelUsed,
      })
      .from(aiCache)
      .where(and(eq(aiCache.topicId, topicId), eq(aiCache.contentType, contentType)))
      .limit(1);

    const row = rows[0] as CachedContentRow | undefined;
    if (!row) return null;
    return parseCachedContent(row);
  },

  async setCachedContent(
    topicId: number,
    contentType: ContentType,
    content: AIContent,
    modelUsed: string,
  ): Promise<void> {
    const db = getDrizzleDb();
    const now = Date.now();

    await db
      .insert(aiCache)
      .values({
        topicId,
        contentType,
        contentJson: JSON.stringify(content),
        modelUsed,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [aiCache.topicId, aiCache.contentType],
        set: {
          contentJson: JSON.stringify(content),
          modelUsed,
          createdAt: now,
        },
      });
  },

  async clearSpecificContentCache(topicId: number, contentType: ContentType): Promise<void> {
    const db = getDrizzleDb();
    await db
      .delete(aiCache)
      .where(and(eq(aiCache.topicId, topicId), eq(aiCache.contentType, contentType)));
  },

  async clearTopicCache(topicId: number): Promise<void> {
    const db = getDrizzleDb();
    await db.delete(aiCache).where(eq(aiCache.topicId, topicId));
  },

  async getCachedQuestionCount(): Promise<number> {
    const db = getDrizzleDb();
    try {
      const rows = await db
        .select({
          count:
            sql<number>`COALESCE(SUM(json_array_length(${aiCache.contentJson}, '$.questions')), 0)`.mapWith(
              Number,
            ),
        })
        .from(aiCache)
        .where(eq(aiCache.contentType, 'quiz'));
      return rows[0]?.count ?? 0;
    } catch (err) {
      if (__DEV__)
        console.warn('[aiCacheRepositoryDrizzle] Falling back to JS question counting:', err);
      const all = await this.getAllCachedQuestions();
      return all.length;
    }
  },

  async getMockQuestions(limit: number): Promise<MockQuestion[]> {
    if (limit <= 0) return [];
    const db = getDrizzleDb();

    const rowIds = await db
      .select({ id: aiCache.id })
      .from(aiCache)
      .where(eq(aiCache.contentType, 'quiz'))
      .orderBy(sql`RANDOM()`);

    if (rowIds.length === 0) return [];

    const _selectedIds: number[] = [];
    const batchSize = Math.min(Math.max(Math.ceil(limit / 3), 8), 24);
    let offset = 0;
    let parsedQuestions: MockQuestion[] = [];

    while (offset < rowIds.length && parsedQuestions.length < limit) {
      const ids = rowIds.slice(offset, offset + batchSize).map((row) => row.id);
      offset += batchSize;
      if (ids.length === 0) break;

      const rows = await db
        .select({
          contentJson: aiCache.contentJson,
          topicName: topics.name,
          subjectName: subjects.name,
        })
        .from(aiCache)
        .innerJoin(topics, eq(aiCache.topicId, topics.id))
        .innerJoin(subjects, eq(topics.subjectId, subjects.id))
        .where(inArray(aiCache.id, ids));

      parsedQuestions = parsedQuestions.concat(
        parseMockQuestionsFromRows(rows, limit - parsedQuestions.length),
      );
    }

    return shuffleQuestions(parsedQuestions).slice(0, limit);
  },

  async getAllCachedQuestions(): Promise<MockQuestion[]> {
    const db = getDrizzleDb();
    const rows = await db
      .select({
        contentJson: aiCache.contentJson,
        topicName: topics.name,
        subjectName: subjects.name,
      })
      .from(aiCache)
      .innerJoin(topics, eq(aiCache.topicId, topics.id))
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .where(eq(aiCache.contentType, 'quiz'));

    return shuffleQuestions(parseMockQuestionsFromRows(rows));
  },

  async setContentFlagged(
    topicId: number,
    contentType: ContentType,
    flagged: boolean,
  ): Promise<void> {
    const db = getDrizzleDb();
    await db
      .update(aiCache)
      .set({ isFlagged: flagged ? 1 : 0 })
      .where(and(eq(aiCache.topicId, topicId), eq(aiCache.contentType, contentType)));
  },

  async isContentFlagged(topicId: number, contentType: ContentType): Promise<boolean> {
    const db = getDrizzleDb();
    const rows = await db
      .select({ isFlagged: aiCache.isFlagged })
      .from(aiCache)
      .where(and(eq(aiCache.topicId, topicId), eq(aiCache.contentType, contentType)))
      .limit(1);

    return (rows[0]?.isFlagged ?? 0) === 1;
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  async getFlaggedContent(): Promise<any[]> {
    const db = getDrizzleDb();
    const rows = await db
      .select({
        topicId: aiCache.topicId,
        topicName: topics.name,
        subjectName: subjects.name,
        contentType: aiCache.contentType,
        contentJson: aiCache.contentJson,
        modelUsed: aiCache.modelUsed,
        createdAt: aiCache.createdAt,
      })
      .from(aiCache)
      .innerJoin(topics, eq(aiCache.topicId, topics.id))
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .where(eq(aiCache.isFlagged, 1))
      .orderBy(desc(aiCache.createdAt));

    return rows.map((r) => ({
      topicId: r.topicId,
      topicName: r.topicName,
      subjectName: r.subjectName,
      contentType: r.contentType as ContentType,
      content: JSON.parse(r.contentJson) as AIContent,
      modelUsed: r.modelUsed,
      createdAt: r.createdAt,
    }));
  },

  async getPendingTopicSuggestions(): Promise<TopicSuggestionRecord[]> {
    const db = getDrizzleDb();
    const rows = await db
      .select({
        id: topicSuggestions.id,
        subjectId: topicSuggestions.subjectId,
        subjectName: subjects.name,
        subjectColor: subjects.colorHex,
        name: topicSuggestions.name,
        sourceSummary: topicSuggestions.sourceSummary,
        mentionCount: topicSuggestions.mentionCount,
        status: topicSuggestions.status,
        approvedTopicId: topicSuggestions.approvedTopicId,
        firstDetectedAt: topicSuggestions.firstDetectedAt,
        lastDetectedAt: topicSuggestions.lastDetectedAt,
      })
      .from(topicSuggestions)
      .innerJoin(subjects, eq(topicSuggestions.subjectId, subjects.id))
      .where(eq(topicSuggestions.status, 'pending'))
      .orderBy(desc(topicSuggestions.lastDetectedAt));

    return rows.map((row) => mapTopicSuggestionRow(row as TopicSuggestionRow));
  },
};
