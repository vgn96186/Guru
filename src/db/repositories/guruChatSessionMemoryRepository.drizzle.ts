import { eq } from 'drizzle-orm';
import { getDrizzleDb } from '../drizzle';
import { guruChatSessionMemory } from '../drizzleSchema';

export interface GuruChatSessionMemoryRow {
  threadId: number;
  topicName: string;
  summaryText: string;
  stateJson: string;
  updatedAt: number;
  messagesAtLastSummary: number;
}

type SessionMemorySelectRow = typeof guruChatSessionMemory.$inferSelect;

function mapSessionMemoryRow(row: SessionMemorySelectRow): GuruChatSessionMemoryRow {
  return {
    threadId: row.threadId,
    topicName: row.topicName,
    summaryText: row.summaryText,
    stateJson: row.stateJson ?? '{}',
    updatedAt: row.updatedAt,
    messagesAtLastSummary: row.messagesAtLastSummary,
  };
}

export const guruChatSessionMemoryRepositoryDrizzle = {
  async getSessionMemoryRow(threadId: number): Promise<GuruChatSessionMemoryRow | null> {
    const db = getDrizzleDb();
    const rows = await db
      .select()
      .from(guruChatSessionMemory)
      .where(eq(guruChatSessionMemory.threadId, threadId))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    return mapSessionMemoryRow(rows[0]);
  },

  async upsertSessionMemory(
    threadId: number,
    topicName: string,
    summaryText: string,
    messagesAtLastSummary: number,
    stateJson = '{}',
  ): Promise<void> {
    const db = getDrizzleDb();
    const updatedAt = Date.now();
    const values = {
      threadId,
      topicName,
      summaryText,
      stateJson,
      updatedAt,
      messagesAtLastSummary,
    };

    await db.insert(guruChatSessionMemory).values(values).onConflictDoUpdate({
      target: guruChatSessionMemory.threadId,
      set: values,
    });
  },

  async deleteSessionMemory(threadId: number): Promise<void> {
    const db = getDrizzleDb();
    await db.delete(guruChatSessionMemory).where(eq(guruChatSessionMemory.threadId, threadId));
  },
};
