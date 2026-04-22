import { and, desc, eq, sql } from 'drizzle-orm';
import type { ContentType } from '../../types';
import { getDrizzleDb } from '../drizzle';
import { aiCache, contentFactChecks, subjects, topics, userContentFlags } from '../drizzleSchema';

export type FlagReason =
  | 'incorrect_fact'
  | 'outdated_info'
  | 'wrong_dosage'
  | 'missing_concept'
  | 'other';

export interface FactCheckContradiction {
  claim: string;
  trustedSource: string;
  trustedText: string;
  similarity: number;
}

export interface FlaggedContentItem {
  topicId: number;
  topicName: string;
  subjectName: string;
  contentType: ContentType;
  flagReason: FlagReason | 'auto_flagged';
  userNote?: string;
  flaggedAt: number;
  resolved: boolean;
}

type FlaggedContentRow = {
  topicId: number;
  topicName: string;
  subjectName: string;
  contentType: string;
  flagReason: string | null;
  userNote: string | null;
  flaggedAt: number;
  resolved: number;
};

function mapFlaggedContentRow(row: FlaggedContentRow): FlaggedContentItem {
  return {
    topicId: row.topicId,
    topicName: row.topicName,
    subjectName: row.subjectName,
    contentType: row.contentType as ContentType,
    flagReason: (row.flagReason as FlagReason | null) ?? 'auto_flagged',
    userNote: row.userNote ?? undefined,
    flaggedAt: row.flaggedAt,
    resolved: row.resolved === 1,
  };
}

export const contentFlagsRepositoryDrizzle = {
  async flagContentWithReason(
    topicId: number,
    contentType: ContentType,
    reason: FlagReason,
    note?: string,
  ): Promise<void> {
    const db = getDrizzleDb();
    const now = Date.now();

    await db.insert(userContentFlags).values({
      topicId,
      contentType,
      flagReason: reason,
      userNote: note ?? null,
      flaggedAt: now,
    });

    await db
      .update(aiCache)
      .set({ isFlagged: 1 })
      .where(and(eq(aiCache.topicId, topicId), eq(aiCache.contentType, contentType)));
  },

  async logFactCheckResult(
    topicId: number,
    contentType: ContentType,
    status: 'passed' | 'failed' | 'inconclusive',
    contradictions: FactCheckContradiction[],
  ): Promise<void> {
    const db = getDrizzleDb();

    await db.insert(contentFactChecks).values({
      topicId,
      contentType,
      checkStatus: status,
      contradictionsJson: JSON.stringify(contradictions),
      checkedAt: Date.now(),
    });

    if (status === 'failed') {
      await db
        .update(aiCache)
        .set({ isFlagged: 1 })
        .where(and(eq(aiCache.topicId, topicId), eq(aiCache.contentType, contentType)));
    }
  },

  async resolveContentFlags(topicId: number, contentType: ContentType): Promise<void> {
    const db = getDrizzleDb();
    await db
      .update(userContentFlags)
      .set({
        resolved: 1,
        resolvedAt: Date.now(),
      })
      .where(
        and(eq(userContentFlags.topicId, topicId), eq(userContentFlags.contentType, contentType)),
      );
  },

  async getFlaggedContentReview(): Promise<FlaggedContentItem[]> {
    const db = getDrizzleDb();
    const flaggedAtExpr = sql<number>`COALESCE(${userContentFlags.flaggedAt}, ${aiCache.createdAt})`;
    const resolvedExpr = sql<number>`COALESCE(${userContentFlags.resolved}, 0)`;

    const rows = await db
      .select({
        topicId: aiCache.topicId,
        topicName: topics.name,
        subjectName: subjects.name,
        contentType: aiCache.contentType,
        flagReason: userContentFlags.flagReason,
        userNote: userContentFlags.userNote,
        flaggedAt: flaggedAtExpr,
        resolved: resolvedExpr,
      })
      .from(aiCache)
      .leftJoin(
        userContentFlags,
        and(
          eq(aiCache.topicId, userContentFlags.topicId),
          eq(aiCache.contentType, userContentFlags.contentType),
        ),
      )
      .leftJoin(topics, eq(aiCache.topicId, topics.id))
      .leftJoin(subjects, eq(topics.subjectId, subjects.id))
      .where(eq(aiCache.isFlagged, 1))
      .orderBy(desc(flaggedAtExpr));

    return (rows as FlaggedContentRow[]).map(mapFlaggedContentRow);
  },
};
