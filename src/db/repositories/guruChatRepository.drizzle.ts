import { asc, desc, eq } from 'drizzle-orm';
import { getDrizzleDb } from '../drizzle';
import { chatHistory, guruChatThreads } from '../drizzleSchema';

export interface ChatHistoryMessage {
  id: number;
  threadId: number | null;
  topicName: string;
  role: 'user' | 'guru';
  message: string;
  timestamp: number;
  sourcesJson?: string;
  modelUsed?: string;
}

export interface GuruChatThread {
  id: number;
  topicName: string;
  syllabusTopicId: number | null;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number;
  lastMessagePreview: string;
}

type GuruChatThreadRow = {
  id: number;
  topicName: string;
  syllabusTopicId: number | null;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number;
  lastMessagePreview: string;
};

type ChatHistoryRow = {
  id: number;
  threadId: number | null;
  topicName: string;
  role: string;
  message: string;
  timestamp: number;
  sourcesJson: string | null;
  modelUsed: string | null;
};

function buildThreadTitle(topicName: string, message?: string | null): string {
  const trimmed = (message ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return topicName;
  const clipped = trimmed.slice(0, 56).trim();
  return clipped.length < trimmed.length ? `${clipped}...` : clipped;
}

function buildThreadPreview(message: string): string {
  const trimmed = message.replace(/\s+/g, ' ').trim();
  const clipped = trimmed.slice(0, 96).trim();
  return clipped.length < trimmed.length ? `${clipped}...` : clipped;
}

function mapThreadRow(row: GuruChatThreadRow): GuruChatThread {
  return {
    id: row.id,
    topicName: row.topicName,
    syllabusTopicId: row.syllabusTopicId ?? null,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastMessageAt: row.lastMessageAt,
    lastMessagePreview: row.lastMessagePreview,
  };
}

function mapHistoryRow(row: ChatHistoryRow): ChatHistoryMessage {
  return {
    id: row.id,
    threadId: row.threadId ?? null,
    topicName: row.topicName,
    role: row.role as 'user' | 'guru',
    message: row.message,
    timestamp: row.timestamp,
    sourcesJson: row.sourcesJson ?? undefined,
    modelUsed: row.modelUsed ?? undefined,
  };
}

export const guruChatRepositoryDrizzle = {
  async createGuruChatThread(
    topicName: string,
    syllabusTopicId?: number | null,
    title?: string | null,
  ): Promise<GuruChatThread> {
    const db = getDrizzleDb();
    const timestamp = Date.now();
    const normalizedTitle = (title ?? '').trim() || topicName;

    const insertedRows = await db
      .insert(guruChatThreads)
      .values({
        topicName,
        syllabusTopicId: syllabusTopicId ?? null,
        title: normalizedTitle,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastMessageAt: timestamp,
        lastMessagePreview: '',
      })
      .returning({ id: guruChatThreads.id });

    const threadId = insertedRows[0]?.id ?? 0;
    const thread = await this.getGuruChatThreadById(threadId);

    if (!thread) {
      throw new Error('Failed to create Guru chat thread');
    }

    return thread;
  },

  async getGuruChatThreadById(threadId: number): Promise<GuruChatThread | null> {
    const db = getDrizzleDb();
    const rows = await db
      .select({
        id: guruChatThreads.id,
        topicName: guruChatThreads.topicName,
        syllabusTopicId: guruChatThreads.syllabusTopicId,
        title: guruChatThreads.title,
        createdAt: guruChatThreads.createdAt,
        updatedAt: guruChatThreads.updatedAt,
        lastMessageAt: guruChatThreads.lastMessageAt,
        lastMessagePreview: guruChatThreads.lastMessagePreview,
      })
      .from(guruChatThreads)
      .where(eq(guruChatThreads.id, threadId))
      .limit(1);

    const row = rows[0] as GuruChatThreadRow | undefined;
    return row ? mapThreadRow(row) : null;
  },

  async listGuruChatThreads(limit = 40): Promise<GuruChatThread[]> {
    const db = getDrizzleDb();
    const rows = await db
      .select({
        id: guruChatThreads.id,
        topicName: guruChatThreads.topicName,
        syllabusTopicId: guruChatThreads.syllabusTopicId,
        title: guruChatThreads.title,
        createdAt: guruChatThreads.createdAt,
        updatedAt: guruChatThreads.updatedAt,
        lastMessageAt: guruChatThreads.lastMessageAt,
        lastMessagePreview: guruChatThreads.lastMessagePreview,
      })
      .from(guruChatThreads)
      .orderBy(
        desc(guruChatThreads.lastMessageAt),
        desc(guruChatThreads.updatedAt),
        desc(guruChatThreads.id),
      )
      .limit(limit);

    return rows.map((row) => mapThreadRow(row as GuruChatThreadRow));
  },

  async saveChatMessage(
    threadId: number,
    topicName: string,
    role: 'user' | 'guru',
    message: string,
    timestamp: number,
    sourcesJson?: string,
    modelUsed?: string,
  ): Promise<void> {
    const db = getDrizzleDb();

    await db.insert(chatHistory).values({
      threadId,
      topicName,
      role,
      message,
      timestamp,
      sourcesJson: sourcesJson ?? null,
      modelUsed: modelUsed ?? null,
    });

    const preview = buildThreadPreview(message);
    const thread = await this.getGuruChatThreadById(threadId);
    const shouldRefreshTitle =
      role === 'user' &&
      thread &&
      (thread.title.trim() === '' ||
        thread.title === thread.topicName ||
        thread.title === topicName);

    await db
      .update(guruChatThreads)
      .set({
        updatedAt: timestamp,
        lastMessageAt: timestamp,
        lastMessagePreview: preview,
        title: shouldRefreshTitle
          ? buildThreadTitle(topicName, message)
          : (thread?.title ?? topicName),
      })
      .where(eq(guruChatThreads.id, threadId));
  },

  async getChatHistory(threadId: number, limit = 20): Promise<ChatHistoryMessage[]> {
    const db = getDrizzleDb();
    const rows = await db
      .select({
        id: chatHistory.id,
        threadId: chatHistory.threadId,
        topicName: chatHistory.topicName,
        role: chatHistory.role,
        message: chatHistory.message,
        timestamp: chatHistory.timestamp,
        sourcesJson: chatHistory.sourcesJson,
        modelUsed: chatHistory.modelUsed,
      })
      .from(chatHistory)
      .where(eq(chatHistory.threadId, threadId))
      .orderBy(asc(chatHistory.timestamp))
      .limit(limit);

    return rows.map((row) => mapHistoryRow(row as ChatHistoryRow));
  },
};
