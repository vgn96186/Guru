import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { TopicProgress } from '../../types';
import { getDrizzleDb } from '../drizzle';
import { topicProgress } from '../drizzleSchema';

type TopicProgressRow = typeof topicProgress.$inferSelect;

type UpsertTopicProgressPatch = Partial<Omit<TopicProgress, 'topicId'>>;

function mapRowToTopicProgress(row: TopicProgressRow): TopicProgress {
  return {
    topicId: row.topicId,
    status: row.status as TopicProgress['status'],
    confidence: row.confidence,
    lastStudiedAt: row.lastStudiedAt ?? null,
    timesStudied: row.timesStudied,
    xpEarned: row.xpEarned,
    nextReviewDate: row.nextReviewDate ?? null,
    userNotes: row.userNotes,
    fsrsDue: row.fsrsDue ?? null,
    fsrsStability: row.fsrsStability ?? 0,
    fsrsDifficulty: row.fsrsDifficulty ?? 0,
    fsrsElapsedDays: row.fsrsElapsedDays ?? 0,
    fsrsScheduledDays: row.fsrsScheduledDays ?? 0,
    fsrsReps: row.fsrsReps ?? 0,
    fsrsLapses: row.fsrsLapses ?? 0,
    fsrsState: row.fsrsState ?? 0,
    fsrsLastReview: row.fsrsLastReview ?? null,
    wrongCount: row.wrongCount,
    isNemesis: row.isNemesis === 1,
  };
}

function mapPatchToDrizzleUpdate(
  patch: UpsertTopicProgressPatch,
): Partial<typeof topicProgress.$inferInsert> {
  const update: Partial<typeof topicProgress.$inferInsert> = {};

  if (patch.status !== undefined) update.status = patch.status;
  if (patch.confidence !== undefined) update.confidence = patch.confidence;
  if (patch.lastStudiedAt !== undefined) update.lastStudiedAt = patch.lastStudiedAt;
  if (patch.timesStudied !== undefined) update.timesStudied = patch.timesStudied;
  if (patch.xpEarned !== undefined) update.xpEarned = patch.xpEarned;
  if (patch.nextReviewDate !== undefined) update.nextReviewDate = patch.nextReviewDate;
  if (patch.userNotes !== undefined) update.userNotes = patch.userNotes;
  if (patch.fsrsDue !== undefined) update.fsrsDue = patch.fsrsDue;
  if (patch.fsrsStability !== undefined) update.fsrsStability = patch.fsrsStability;
  if (patch.fsrsDifficulty !== undefined) update.fsrsDifficulty = patch.fsrsDifficulty;
  if (patch.fsrsElapsedDays !== undefined) update.fsrsElapsedDays = patch.fsrsElapsedDays;
  if (patch.fsrsScheduledDays !== undefined) update.fsrsScheduledDays = patch.fsrsScheduledDays;
  if (patch.fsrsReps !== undefined) update.fsrsReps = patch.fsrsReps;
  if (patch.fsrsLapses !== undefined) update.fsrsLapses = patch.fsrsLapses;
  if (patch.fsrsState !== undefined) update.fsrsState = patch.fsrsState;
  if (patch.fsrsLastReview !== undefined) update.fsrsLastReview = patch.fsrsLastReview;
  if (patch.wrongCount !== undefined) update.wrongCount = patch.wrongCount;
  if (patch.isNemesis !== undefined) update.isNemesis = patch.isNemesis ? 1 : 0;

  return update;
}

export const topicProgressRepositoryDrizzle = {
  async getTopicProgress(topicId: number): Promise<TopicProgress | null> {
    const db = getDrizzleDb();
    const rows = await db
      .select()
      .from(topicProgress)
      .where(eq(topicProgress.topicId, topicId))
      .limit(1);

    if (rows.length === 0) return null;
    return mapRowToTopicProgress(rows[0]);
  },

  async upsertTopicProgress(topicId: number, patch: UpsertTopicProgressPatch): Promise<void> {
    const db = getDrizzleDb();
    const update = mapPatchToDrizzleUpdate(patch);

    if (Object.keys(update).length === 0) {
      await db.insert(topicProgress).values({ topicId }).onConflictDoNothing();
      return;
    }

    await db
      .insert(topicProgress)
      .values({ topicId, ...update })
      .onConflictDoUpdate({
        target: topicProgress.topicId,
        set: update,
      });
  },

  async markTopicSeen(topicId: number, confidence = 1): Promise<void> {
    const existing = await this.getTopicProgress(topicId);
    const now = Date.now();
    const nextConfidence = Math.max(existing?.confidence ?? 0, confidence);
    const nextStatus: TopicProgress['status'] =
      existing?.status && existing.status !== 'unseen' ? existing.status : 'seen';

    await this.upsertTopicProgress(topicId, {
      status: nextStatus,
      confidence: nextConfidence,
      lastStudiedAt: now,
      timesStudied: (existing?.timesStudied ?? 0) + 1,
    });
  },

  async listDueTopicsByFsrsDue(todayIso: string): Promise<TopicProgress[]> {
    const db = getDrizzleDb();
    const rows = await db
      .select()
      .from(topicProgress)
      .where(
        and(
          isNotNull(topicProgress.fsrsDue),
          sql`DATE(${topicProgress.fsrsDue}) <= DATE(${todayIso})`,
        ),
      )
      .orderBy(topicProgress.fsrsDue);

    return rows.map(mapRowToTopicProgress);
  },
};
