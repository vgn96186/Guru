import { and, asc, eq, lt, or, sql } from 'drizzle-orm';
import { getDrizzleDb } from '../drizzle';
import { offlineAiQueue } from '../drizzleSchema';

export type OfflineRequestType = 'generate_json' | 'generate_text' | 'transcribe';

export interface OfflineQueueItemRecord {
  id: number;
  requestType: OfflineRequestType;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'failed' | 'completed';
  attempts: number;
  createdAt: number;
  lastAttemptAt: number | null;
  errorMessage: string | null;
}

type OfflineQueueRow = typeof offlineAiQueue.$inferSelect;

const MAX_ATTEMPTS = 5;
const PENDING_BATCH_LIMIT = 20;

function canonicalPayloadString(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, Object.keys(payload).sort());
}

function mapRowToOfflineQueueItem(row: OfflineQueueRow): OfflineQueueItemRecord {
  return {
    id: row.id,
    requestType: row.requestType as OfflineRequestType,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    status: (row.status ?? 'pending') as OfflineQueueItemRecord['status'],
    attempts: row.attempts ?? 0,
    createdAt: row.createdAt,
    lastAttemptAt: row.lastAttemptAt ?? null,
    errorMessage: row.errorMessage ?? null,
  };
}

export const offlineQueueRepositoryDrizzle = {
  async enqueueRequest(
    requestType: OfflineRequestType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const db = getDrizzleDb();
    await db.insert(offlineAiQueue).values({
      requestType,
      payload: canonicalPayloadString(payload),
      status: 'pending',
      attempts: 0,
      createdAt: Date.now(),
    });
  },

  async getPendingRequests(): Promise<OfflineQueueItemRecord[]> {
    const db = getDrizzleDb();
    const rows = await db
      .select()
      .from(offlineAiQueue)
      .where(
        and(
          or(eq(offlineAiQueue.status, 'pending'), eq(offlineAiQueue.status, 'failed')),
          lt(offlineAiQueue.attempts, MAX_ATTEMPTS),
        ),
      )
      .orderBy(
        sql`CASE ${offlineAiQueue.status} WHEN 'failed' THEN 1 ELSE 0 END`,
        asc(offlineAiQueue.createdAt),
      )
      .limit(PENDING_BATCH_LIMIT);

    return rows.map((row) => mapRowToOfflineQueueItem(row));
  },

  async markCompleted(id: number): Promise<void> {
    const db = getDrizzleDb();
    await db
      .update(offlineAiQueue)
      .set({
        status: 'completed',
      })
      .where(eq(offlineAiQueue.id, id));
  },

  async markFailed(id: number, errorMessage: string): Promise<void> {
    const db = getDrizzleDb();
    await db
      .update(offlineAiQueue)
      .set({
        status: 'failed',
        errorMessage,
      })
      .where(eq(offlineAiQueue.id, id));
  },
};
