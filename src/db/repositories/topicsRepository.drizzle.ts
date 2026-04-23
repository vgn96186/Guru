import {
  eq,
  sql,
  desc,
  asc,
  and,
  isNull,
  inArray,
  isNotNull,
  or,
  gte,
  lt,
  count,
  SQL,
} from 'drizzle-orm';
import { getDrizzleDb } from '../drizzle';
import { getDb } from '../database';
import { subjects, topics, topicProgress, topicSuggestions } from '../drizzleSchema';
import type { Subject, TopicWithProgress, TopicProgress } from '../../types';
import { getInitialCard, reviewCardFromConfidence } from '../../services/fsrsService';
import type { Card } from 'ts-fsrs';
import { todayStr, runInTransaction } from '../database';

// Types
export interface TopicSuggestion {
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

export type SubjectStatsRow = {
  subjectId: number;
  total: number;
  seen: number;
  due: number;
  highYield: number;
  unseen: number;
  withNotes: number;
  weak: number;
};

export interface SubjectBreakdownRow {
  id: number;
  name: string;
  shortCode: string;
  color: string;
  total: number;
  covered: number;
  mastered: number;
  highYieldTotal: number;
  highYieldCovered: number;
  percent: number;
}

export interface ReviewDay {
  date: string; // YYYY-MM-DD
  count: number;
  topics: Array<{ name: string; confidence: number }>;
}

export interface TopicProgressUpdate {
  topicId: number;
  status: TopicProgress['status'];
  confidence: number;
  xpToAdd: number;
  noteToAppend?: string;
}

// Helpers
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
function mapTopicRow(r: any): TopicWithProgress {
  const tid = r.id;
  const tname = r.topicName || r.name || 'Unnamed Topic';
  const sname = r.subjectName || 'Unknown';
  const scode = r.subjectCode || '???';
  const scolor = r.subjectColor || '#555';

  void r; // Flat structure already used via r.* below

  return {
    id: tid,
    subjectId: r.subjectId,
    parentTopicId: r.parentTopicId,
    name: tname,
    subtopics: [],
    estimatedMinutes: r.estimatedMinutes ?? 35,
    inicetPriority: r.inicetPriority ?? 5,
    childCount: r.childCount ?? 0,
    subjectName: sname,
    subjectCode: scode,
    subjectColor: scolor,
    progress: {
      topicId: tid,
      status: (r.status ?? 'unseen') as TopicProgress['status'],
      confidence: r.confidence ?? 0,
      lastStudiedAt: r.lastStudiedAt ?? null,
      timesStudied: r.timesStudied ?? 0,
      xpEarned: r.xpEarned ?? 0,
      nextReviewDate: r.nextReviewDate ?? null,
      userNotes: r.userNotes ?? '',
      fsrsDue: r.fsrsDue ?? null,
      fsrsStability: r.fsrsStability ?? 0,
      fsrsDifficulty: r.fsrsDifficulty ?? 0,
      fsrsElapsedDays: r.fsrsElapsedDays ?? 0,
      fsrsScheduledDays: r.fsrsScheduledDays ?? 0,
      fsrsReps: r.fsrsReps ?? 0,
      fsrsLapses: r.fsrsLapses ?? 0,
      fsrsState: r.fsrsState ?? 0,
      fsrsLastReview: r.fsrsLastReview ?? null,
      wrongCount: r.wrongCount ?? 0,
      isNemesis: (r.isNemesis ?? 0) === 1,
    },
  };
}

const buildTopicsQuery = async (
  whereClause?: SQL<unknown>,
  limitCount?: number,
  orderClauses?: SQL<unknown>[],
) => {
  const db = getDrizzleDb();
  let query = db
    .select({
      id: sql<number>`${topics.id} AS id`,
      subjectId: sql<number>`${topics.subjectId} AS subjectId`,
      parentTopicId: sql<number | null>`${topics.parentTopicId} AS parentTopicId`,
      name: sql<string>`${topics.name} AS name`,
      estimatedMinutes: sql<number>`${topics.estimatedMinutes} AS estimatedMinutes`,
      inicetPriority: sql<number>`${topics.inicetPriority} AS inicetPriority`,
      status: sql<string>`${topicProgress.status} AS status`,
      confidence: sql<number>`${topicProgress.confidence} AS confidence`,
      lastStudiedAt: sql<number | null>`${topicProgress.lastStudiedAt} AS lastStudiedAt`,
      timesStudied: sql<number>`${topicProgress.timesStudied} AS timesStudied`,
      xpEarned: sql<number>`${topicProgress.xpEarned} AS xpEarned`,
      nextReviewDate: sql<string | null>`${topicProgress.nextReviewDate} AS nextReviewDate`,
      userNotes: sql<string>`${topicProgress.userNotes} AS userNotes`,
      fsrsDue: sql<string | null>`${topicProgress.fsrsDue} AS fsrsDue`,
      fsrsStability: sql<number | null>`${topicProgress.fsrsStability} AS fsrsStability`,
      fsrsDifficulty: sql<number | null>`${topicProgress.fsrsDifficulty} AS fsrsDifficulty`,
      fsrsElapsedDays: sql<number | null>`${topicProgress.fsrsElapsedDays} AS fsrsElapsedDays`,
      fsrsScheduledDays: sql<
        number | null
      >`${topicProgress.fsrsScheduledDays} AS fsrsScheduledDays`,
      fsrsReps: sql<number | null>`${topicProgress.fsrsReps} AS fsrsReps`,
      fsrsLapses: sql<number | null>`${topicProgress.fsrsLapses} AS fsrsLapses`,
      fsrsState: sql<number | null>`${topicProgress.fsrsState} AS fsrsState`,
      fsrsLastReview: sql<string | null>`${topicProgress.fsrsLastReview} AS fsrsLastReview`,
      wrongCount: sql<number>`${topicProgress.wrongCount} AS wrongCount`,
      isNemesis: sql<number>`${topicProgress.isNemesis} AS isNemesis`,
      subjectName: sql<string>`${subjects.name} AS subjectName`,
      subjectCode: sql<string>`${subjects.shortCode} AS subjectCode`,
      subjectColor: sql<string>`${subjects.colorHex} AS subjectColor`,
      childCount: sql<number>`(SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = topics.id) AS childCount`,
    })
    .from(topics)
    .innerJoin(subjects, eq(topics.subjectId, subjects.id))
    .leftJoin(topicProgress, eq(topics.id, topicProgress.topicId));

  if (whereClause) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    query = query.where(whereClause) as any;
  }
  if (orderClauses && orderClauses.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    query = query.orderBy(...orderClauses) as any;
  }
  if (limitCount !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    query = query.limit(limitCount) as any;
  }

  const { sql: sqlString, params } = query.toSQL();
  const rawDb = getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  const rawRows = await rawDb.getAllAsync<any>(sqlString, params as string[]);

  return rawRows;
};

// Repository implementation
export const topicsRepositoryDrizzle = {
  async createTopic(input: CreateTopicInput): Promise<TopicWithProgress | null> {
    const db = getDrizzleDb();
    const result = await db
      .insert(topics)
      .values({
        subjectId: input.subjectId,
        name: input.name.trim(),
        parentTopicId: input.parentTopicId ?? null,
        inicetPriority: input.inicetPriority ?? 5,
        estimatedMinutes: input.estimatedMinutes ?? 20,
      })
      .returning({ id: topics.id });

    if (!result || result.length === 0) return null;
    return topicsRepositoryDrizzle.getTopicById(result[0].id);
  },

  async searchTopicsByName(query: string, limitCount = 50): Promise<TopicWithProgress[]> {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    const rawDb = getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    const rows = await rawDb.getAllAsync<any>(
      `
      SELECT 
        t.id, t.subject_id as subjectId, t.parent_topic_id as parentTopicId, t.name as topicName, t.estimated_minutes as estimatedMinutes, t.inicet_priority as inicetPriority,
        p.status, p.confidence, p.last_studied_at as lastStudiedAt, p.times_studied as timesStudied, p.xp_earned as xpEarned, p.next_review_date as nextReviewDate,
        p.user_notes as userNotes, p.fsrs_due as fsrsDue, p.fsrs_stability as fsrsStability, p.fsrs_difficulty as fsrsDifficulty, p.fsrs_elapsed_days as fsrsElapsedDays,
        p.fsrs_scheduled_days as fsrsScheduledDays, p.fsrs_reps as fsrsReps, p.fsrs_lapses as fsrsLapses, p.fsrs_state as fsrsState, p.fsrs_last_review as fsrsLastReview,
        p.wrong_count as wrongCount, p.is_nemesis as isNemesis,
        s.name as subjectName, s.short_code as subjectCode, s.color_hex as subjectColor,
        (SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = t.id) as childCount
      FROM topics t
      INNER JOIN subjects s ON t.subject_id = s.id
      LEFT JOIN topic_progress p ON t.id = p.topic_id
      WHERE LOWER(t.name) LIKE ?
      ORDER BY t.inicet_priority DESC, t.name ASC
      LIMIT ?
    `,
      [`%${trimmed}%`, limitCount],
    );
    return rows.map(mapTopicRow);
  },

  async getAllSubjects(): Promise<Subject[]> {
    const rawDb = getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    const rows = await rawDb.getAllAsync<any>(`
      SELECT id, name, short_code as shortCode, color_hex as colorHex, inicet_weight as inicetWeight, neet_weight as neetWeight, display_order as displayOrder
      FROM subjects
      ORDER BY display_order ASC
    `);
    return rows;
  },

  async getSubjectByName(name: string): Promise<Subject | null> {
    const db = getDrizzleDb();
    const rows = await db
      .select()
      .from(subjects)
      .where(sql`LOWER(${subjects.name}) = LOWER(${name})`)
      .limit(1);
    return rows.length > 0 ? rows[0] : null;
  },

  async getSubjectById(id: number): Promise<Subject | null> {
    const db = getDrizzleDb();
    const rows = await db.select().from(subjects).where(eq(subjects.id, id)).limit(1);
    return rows.length > 0 ? rows[0] : null;
  },

  async queueTopicSuggestionInTx(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    _tx: any, // kept for signature compatibility — Drizzle repo doesn't use the tx param
    subjectId: number,
    topicName: string,
    sourceSummary?: string,
  ): Promise<void> {
    const db = getDrizzleDb();
    const trimmedName = topicName.trim();
    const normalizedName = trimmedName.toLowerCase();
    if (!trimmedName) return;

    const existingTopic = await db
      .select({ id: topics.id })
      .from(topics)
      .where(and(eq(topics.subjectId, subjectId), sql`LOWER(${topics.name}) = ${normalizedName}`))
      .limit(1);
    if (existingTopic.length > 0) return;

    const existingSuggestion = await db
      .select({ id: topicSuggestions.id, mentionCount: topicSuggestions.mentionCount })
      .from(topicSuggestions)
      .where(
        and(
          eq(topicSuggestions.subjectId, subjectId),
          eq(topicSuggestions.normalizedName, normalizedName),
        ),
      )
      .limit(1);

    const now = Date.now();

    if (existingSuggestion.length > 0) {
      await db
        .update(topicSuggestions)
        .set({
          name: trimmedName,
          sourceSummary: sourceSummary ?? sql`COALESCE(${sourceSummary ?? null}, source_summary)`,
          mentionCount: sql`${topicSuggestions.mentionCount} + 1`,
          status: sql`CASE WHEN ${topicSuggestions.status} = 'rejected' THEN 'pending' ELSE ${topicSuggestions.status} END`,
          lastDetectedAt: now,
        })
        .where(eq(topicSuggestions.id, existingSuggestion[0].id));
      return;
    }

    await db.insert(topicSuggestions).values({
      subjectId,
      name: trimmedName,
      normalizedName,
      sourceSummary: sourceSummary ?? null,
      mentionCount: 1,
      status: 'pending',
      firstDetectedAt: now,
      lastDetectedAt: now,
    });
  },

  async getPendingTopicSuggestions(): Promise<TopicSuggestion[]> {
    const db = getDrizzleDb();
    const rows = await db
      .select({
        ts: topicSuggestions,
        subjectName: subjects.name,
        subjectColor: subjects.colorHex,
      })
      .from(topicSuggestions)
      .innerJoin(subjects, eq(subjects.id, topicSuggestions.subjectId))
      .where(eq(topicSuggestions.status, 'pending'))
      .orderBy(desc(topicSuggestions.lastDetectedAt));

    return rows.map((r) => ({
      id: r.ts.id,
      subjectId: r.ts.subjectId,
      subjectName: r.subjectName,
      subjectColor: r.subjectColor,
      name: r.ts.name,
      sourceSummary: r.ts.sourceSummary,
      mentionCount: r.ts.mentionCount,
      status: r.ts.status as 'pending' | 'approved' | 'rejected',
      approvedTopicId: r.ts.approvedTopicId,
      firstDetectedAt: r.ts.firstDetectedAt,
      lastDetectedAt: r.ts.lastDetectedAt,
    }));
  },

  async approveTopicSuggestion(suggestionId: number): Promise<number | null> {
    return runInTransaction(async (_tx) => {
      const db = getDrizzleDb();
      const suggestionRows = await db
        .select({
          id: topicSuggestions.id,
          subjectId: topicSuggestions.subjectId,
          name: topicSuggestions.name,
        })
        .from(topicSuggestions)
        .where(and(eq(topicSuggestions.id, suggestionId), eq(topicSuggestions.status, 'pending')))
        .limit(1);

      if (suggestionRows.length === 0) return null;
      const suggestion = suggestionRows[0];

      let topicId: number | null = null;
      const existingTopic = await db
        .select({ id: topics.id })
        .from(topics)
        .where(
          and(
            eq(topics.subjectId, suggestion.subjectId),
            sql`LOWER(${topics.name}) = LOWER(${suggestion.name})`,
          ),
        )
        .limit(1);

      if (existingTopic.length > 0) {
        topicId = existingTopic[0].id;
      } else {
        const result = await db
          .insert(topics)
          .values({
            subjectId: suggestion.subjectId,
            name: suggestion.name,
            inicetPriority: 5,
            estimatedMinutes: 20,
          })
          .returning({ id: topics.id });
        topicId = result[0].id;
        await db.insert(topicProgress).values({ topicId }).onConflictDoNothing();
      }

      await db
        .update(topicSuggestions)
        .set({ status: 'approved', approvedTopicId: topicId, lastDetectedAt: Date.now() })
        .where(eq(topicSuggestions.id, suggestionId));

      return topicId;
    });
  },

  async rejectTopicSuggestion(suggestionId: number): Promise<void> {
    const db = getDrizzleDb();
    await db
      .update(topicSuggestions)
      .set({ status: 'rejected', lastDetectedAt: Date.now() })
      .where(eq(topicSuggestions.id, suggestionId));
  },

  async getTopicsBySubject(subjectId: number | string): Promise<TopicWithProgress[]> {
    const id = Number(subjectId);
    if (isNaN(id)) return [];
    const rawDb = getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    const rows = await rawDb.getAllAsync<any>(
      `
      SELECT 
        t.id, t.subject_id as subjectId, t.parent_topic_id as parentTopicId, t.name as topicName, t.estimated_minutes as estimatedMinutes, t.inicet_priority as inicetPriority,
        p.status, p.confidence, p.last_studied_at as lastStudiedAt, p.times_studied as timesStudied, p.xp_earned as xpEarned, p.next_review_date as nextReviewDate,
        p.user_notes as userNotes, p.fsrs_due as fsrsDue, p.fsrs_stability as fsrsStability, p.fsrs_difficulty as fsrsDifficulty, p.fsrs_elapsed_days as fsrsElapsedDays,
        p.fsrs_scheduled_days as fsrsScheduledDays, p.fsrs_reps as fsrsReps, p.fsrs_lapses as fsrsLapses, p.fsrs_state as fsrsState, p.fsrs_last_review as fsrsLastReview,
        p.wrong_count as wrongCount, p.is_nemesis as isNemesis,
        s.name as subjectName, s.short_code as subjectCode, s.color_hex as subjectColor,
        (SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = t.id) as childCount
      FROM topics t
      INNER JOIN subjects s ON t.subject_id = s.id
      LEFT JOIN topic_progress p ON t.id = p.topic_id
      WHERE t.subject_id = ?
      ORDER BY COALESCE(t.parent_topic_id, t.id), CASE WHEN t.parent_topic_id IS NULL THEN 0 ELSE 1 END, t.inicet_priority DESC, t.name ASC
    `,
      [id],
    );
    return rows.map(mapTopicRow);
  },

  async getAllTopicsWithProgress(): Promise<TopicWithProgress[]> {
    const rawDb = getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    const rows = await rawDb.getAllAsync<any>(`
      SELECT 
        t.id, t.subject_id as subjectId, t.parent_topic_id as parentTopicId, t.name as topicName, t.estimated_minutes as estimatedMinutes, t.inicet_priority as inicetPriority,
        p.status, p.confidence, p.last_studied_at as lastStudiedAt, p.times_studied as timesStudied, p.xp_earned as xpEarned, p.next_review_date as nextReviewDate,
        p.user_notes as userNotes, p.fsrs_due as fsrsDue, p.fsrs_stability as fsrsStability, p.fsrs_difficulty as fsrsDifficulty, p.fsrs_elapsed_days as fsrsElapsedDays,
        p.fsrs_scheduled_days as fsrsScheduledDays, p.fsrs_reps as fsrsReps, p.fsrs_lapses as fsrsLapses, p.fsrs_state as fsrsState, p.fsrs_last_review as fsrsLastReview,
        p.wrong_count as wrongCount, p.is_nemesis as isNemesis,
        s.name as subjectName, s.short_code as subjectCode, s.color_hex as subjectColor,
        (SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = t.id) as childCount
      FROM topics t
      INNER JOIN subjects s ON t.subject_id = s.id
      LEFT JOIN topic_progress p ON t.id = p.topic_id
      ORDER BY t.inicet_priority DESC
    `);
    return rows.map(mapTopicRow);
  },

  async getTopicById(id: number): Promise<TopicWithProgress | null> {
    const rows = await buildTopicsQuery(eq(topics.id, id), 1);
    if (rows.length === 0) return null;
    return mapTopicRow(rows[0]);
  },

  async updateTopicProgressInTx(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    _tx: any, // legacy param
    topicId: number,
    status: TopicProgress['status'],
    confidence: number,
    xpToAdd: number,
    noteToAppend?: string,
    now = Date.now(),
  ): Promise<void> {
    const db = getDrizzleDb();
    const existingRows = await db
      .select({
        fsrsDue: topicProgress.fsrsDue,
        fsrsStability: topicProgress.fsrsStability,
        fsrsDifficulty: topicProgress.fsrsDifficulty,
        fsrsElapsedDays: topicProgress.fsrsElapsedDays,
        fsrsScheduledDays: topicProgress.fsrsScheduledDays,
        fsrsReps: topicProgress.fsrsReps,
        fsrsLapses: topicProgress.fsrsLapses,
        fsrsState: topicProgress.fsrsState,
        fsrsLastReview: topicProgress.fsrsLastReview,
        userNotes: topicProgress.userNotes,
      })
      .from(topicProgress)
      .where(eq(topicProgress.topicId, topicId))
      .limit(1);

    const existing = existingRows.length > 0 ? existingRows[0] : null;

    let card: Card;
    if (existing && existing.fsrsLastReview && existing.fsrsDue) {
      card = {
        due: new Date(existing.fsrsDue),
        stability: existing.fsrsStability ?? 0,
        difficulty: existing.fsrsDifficulty ?? 0,
        elapsed_days: existing.fsrsElapsedDays ?? 0,
        scheduled_days: existing.fsrsScheduledDays ?? 0,
        reps: existing.fsrsReps ?? 0,
        lapses: existing.fsrsLapses ?? 0,
        state: existing.fsrsState ?? 0,
        last_review: new Date(existing.fsrsLastReview),
      };
    } else {
      card = getInitialCard();
    }

    const log = reviewCardFromConfidence(card, confidence, new Date());
    const updatedCard = log.card;
    const nextReview = updatedCard.due.toISOString().slice(0, 10);

    const newUserNotes =
      noteToAppend && noteToAppend !== ''
        ? existing?.userNotes && existing.userNotes !== ''
          ? `${existing.userNotes}\n\n---\n${noteToAppend}`
          : noteToAppend
        : (existing?.userNotes ?? '');

    await db
      .insert(topicProgress)
      .values({
        topicId,
        status,
        confidence,
        lastStudiedAt: now,
        timesStudied: 1,
        xpEarned: xpToAdd,
        nextReviewDate: nextReview,
        fsrsDue: updatedCard.due.toISOString(),
        fsrsStability: updatedCard.stability,
        fsrsDifficulty: updatedCard.difficulty,
        fsrsElapsedDays: updatedCard.elapsed_days,
        fsrsScheduledDays: updatedCard.scheduled_days,
        fsrsReps: updatedCard.reps,
        fsrsLapses: updatedCard.lapses,
        fsrsState: updatedCard.state,
        fsrsLastReview: updatedCard.last_review?.toISOString() ?? null,
        userNotes: newUserNotes,
      })
      .onConflictDoUpdate({
        target: topicProgress.topicId,
        set: {
          status,
          confidence,
          lastStudiedAt: now,
          timesStudied: sql`${topicProgress.timesStudied} + 1`,
          xpEarned: sql`${topicProgress.xpEarned} + ${xpToAdd}`,
          nextReviewDate: nextReview,
          fsrsDue: updatedCard.due.toISOString(),
          fsrsStability: updatedCard.stability,
          fsrsDifficulty: updatedCard.difficulty,
          fsrsElapsedDays: updatedCard.elapsed_days,
          fsrsScheduledDays: updatedCard.scheduled_days,
          fsrsReps: updatedCard.reps,
          fsrsLapses: updatedCard.lapses,
          fsrsState: updatedCard.state,
          fsrsLastReview: updatedCard.last_review?.toISOString() ?? null,
          userNotes: newUserNotes,
        },
      });
  },

  async updateTopicProgress(
    topicId: number,
    status: TopicProgress['status'],
    confidence: number,
    xpToAdd: number,
    noteToAppend?: string,
  ): Promise<void> {
    await runInTransaction(async (tx) => {
      await topicsRepositoryDrizzle.updateTopicProgressInTx(
        tx,
        topicId,
        status,
        confidence,
        xpToAdd,
        noteToAppend,
      );
    });
  },

  async updateTopicsProgressBatch(updates: TopicProgressUpdate[]): Promise<void> {
    if (!updates || updates.length === 0) return;
    const now = Date.now();
    await runInTransaction(async (tx) => {
      for (const update of updates) {
        await topicsRepositoryDrizzle.updateTopicProgressInTx(
          tx,
          update.topicId,
          update.status,
          update.confidence,
          update.xpToAdd,
          update.noteToAppend,
          now,
        );
      }
    });
  },

  async updateTopicNotes(topicId: number, notes: string): Promise<void> {
    const db = getDrizzleDb();
    await db
      .insert(topicProgress)
      .values({ topicId, userNotes: notes })
      .onConflictDoUpdate({
        target: topicProgress.topicId,
        set: { userNotes: notes },
      });
  },

  async getTopicsDueForReview(limitCount = 10): Promise<TopicWithProgress[]> {
    const today = todayStr();
    const rows = await buildTopicsQuery(
      and(
        inArray(topicProgress.status, ['reviewed', 'mastered']),
        or(isNull(topicProgress.fsrsDue), sql`DATE(${topicProgress.fsrsDue}) <= DATE(${today})`),
        sql`(SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = ${topics.id}) = 0`,
      ),
      limitCount,
      [asc(topicProgress.fsrsDue), asc(topicProgress.confidence)],
    );
    return rows.map(mapTopicRow);
  },

  async getSubjectStatsAggregated(): Promise<SubjectStatsRow[]> {
    const rawDb = getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    const rawRows = await rawDb.getAllAsync<any>(`
      SELECT 
        t.subject_id as subjectId, 
        COUNT(t.id) as total,
        SUM(CASE WHEN p.status IN ('seen','reviewed','mastered') THEN 1 ELSE 0 END) as seen,
        SUM(CASE WHEN COALESCE(p.status, 'unseen') != 'unseen' AND (p.fsrs_due IS NULL OR DATE(p.fsrs_due) <= DATE('now')) THEN 1 ELSE 0 END) as due,
        SUM(CASE WHEN t.inicet_priority >= 8 THEN 1 ELSE 0 END) as highYield,
        SUM(CASE WHEN COALESCE(p.status, 'unseen') = 'unseen' THEN 1 ELSE 0 END) as unseen,
        SUM(CASE WHEN TRIM(COALESCE(p.user_notes, '')) <> '' THEN 1 ELSE 0 END) as withNotes,
        SUM(CASE WHEN COALESCE(p.times_studied, 0) > 0 AND COALESCE(p.confidence, 0) < 3 THEN 1 ELSE 0 END) as weak
      FROM topics t
      LEFT JOIN topic_progress p ON t.id = p.topic_id
      WHERE NOT EXISTS (SELECT 1 FROM topics c WHERE c.parent_topic_id = t.id)
      GROUP BY t.subject_id
    `);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    const rows = rawRows.map((r: any) => ({
      subjectId: r.subjectId !== null ? Number(r.subjectId) : null,
      total: Number(r.total) || 0,
      seen: Number(r.seen) || 0,
      due: Number(r.due) || 0,
      highYield: Number(r.highYield) || 0,
      unseen: Number(r.unseen) || 0,
      withNotes: Number(r.withNotes) || 0,
      weak: Number(r.weak) || 0,
    })) as SubjectStatsRow[];

    return rows;
  },

  async getSubjectCoverage(): Promise<
    Array<{ subjectId: number; total: number; seen: number; mastered: number }>
  > {
    const db = getDrizzleDb();
    const rows = await db
      .select({
        subjectId: topics.subjectId,
        total: count(topics.id),
        seen: sql<number>`SUM(CASE WHEN ${topicProgress.status} IN ('seen','reviewed','mastered') THEN 1 ELSE 0 END)`,
        mastered: sql<number>`SUM(CASE WHEN ${topicProgress.status} = 'mastered' THEN 1 ELSE 0 END)`,
      })
      .from(topics)
      .leftJoin(topicProgress, eq(topics.id, topicProgress.topicId))
      .where(sql`NOT EXISTS (SELECT 1 FROM topics c WHERE c.parent_topic_id = topics.id)`)
      .groupBy(topics.subjectId);
    return rows;
  },

  async getWeakestTopics(limitCount = 5): Promise<TopicWithProgress[]> {
    const rows = await buildTopicsQuery(
      and(
        sql`${topicProgress.timesStudied} > 0`,
        lt(topicProgress.confidence, 3),
        sql`(SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = ${topics.id}) = 0`,
      ),
      limitCount,
      [asc(topicProgress.confidence), desc(topicProgress.timesStudied)],
    );
    return rows.map(mapTopicRow);
  },

  async getHighPriorityUnseenTopics(limitCount = 3): Promise<TopicWithProgress[]> {
    const rows = await buildTopicsQuery(
      and(
        sql`COALESCE(${topicProgress.status}, 'unseen') = 'unseen'`,
        sql`(SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = ${topics.id}) = 0`,
      ),
      limitCount,
      [desc(topics.inicetPriority), sql`RANDOM()`],
    );
    return rows.map(mapTopicRow);
  },

  async getNemesisTopics(): Promise<TopicWithProgress[]> {
    const rows = await buildTopicsQuery(eq(topicProgress.isNemesis, 1), 10, [
      desc(topicProgress.wrongCount),
      asc(topicProgress.confidence),
    ]);
    return rows.map(mapTopicRow);
  },

  async markNemesisTopics(): Promise<void> {
    const db = getDrizzleDb();
    await runInTransaction(async () => {
      await db.update(topicProgress).set({ isNemesis: 0 });
      await db
        .update(topicProgress)
        .set({ isNemesis: 1 })
        .where(
          and(
            gte(topicProgress.wrongCount, 3),
            lt(topicProgress.confidence, 3),
            sql`${topicProgress.timesStudied} > 0`,
          ),
        );
    });
  },

  async incrementWrongCount(topicId: number): Promise<void> {
    const db = getDrizzleDb();
    await runInTransaction(async () => {
      await db
        .update(topicProgress)
        .set({ wrongCount: sql`${topicProgress.wrongCount} + 1` })
        .where(eq(topicProgress.topicId, topicId));
      await db
        .update(topicProgress)
        .set({ isNemesis: 1 })
        .where(
          and(
            eq(topicProgress.topicId, topicId),
            gte(topicProgress.wrongCount, 3),
            lt(topicProgress.confidence, 3),
          ),
        );
    });
  },

  async markTopicNeedsAttention(topicId: number): Promise<void> {
    const db = getDrizzleDb();
    const now = Date.now();
    await runInTransaction(async () => {
      await db
        .insert(topicProgress)
        .values({
          topicId,
          status: 'seen',
          confidence: 1,
          lastStudiedAt: now,
          timesStudied: 1,
        })
        .onConflictDoUpdate({
          target: topicProgress.topicId,
          set: {
            confidence: sql`MIN(${topicProgress.confidence}, 1)`,
            lastStudiedAt: now,
            timesStudied: sql`${topicProgress.timesStudied} + 1`,
          },
        });
    });
  },

  async markTopicDiscussedInChat(topicId: number): Promise<void> {
    const db = getDrizzleDb();
    const now = Date.now();
    await runInTransaction(async () => {
      await db
        .insert(topicProgress)
        .values({
          topicId,
          status: 'seen',
          confidence: 1,
          lastStudiedAt: now,
          timesStudied: 1,
        })
        .onConflictDoUpdate({
          target: topicProgress.topicId,
          set: {
            status: sql`CASE WHEN ${topicProgress.status} = 'unseen' THEN 'seen' ELSE ${topicProgress.status} END`,
            confidence: sql`MAX(${topicProgress.confidence}, 1)`,
            lastStudiedAt: now,
            timesStudied: sql`${topicProgress.timesStudied} + 1`,
          },
        });
    });
  },

  async getSubjectBreakdown(): Promise<SubjectBreakdownRow[]> {
    const db = getDrizzleDb();
    const rows = await db
      .select({
        id: subjects.id,
        name: subjects.name,
        shortCode: subjects.shortCode,
        color: subjects.colorHex,
        total: count(topics.id),
        covered: sql<number>`SUM(CASE WHEN ${topicProgress.status} IN ('seen','reviewed','mastered') THEN 1 ELSE 0 END)`,
        mastered: sql<number>`SUM(CASE WHEN ${topicProgress.status} = 'mastered' THEN 1 ELSE 0 END)`,
        highYieldTotal: sql<number>`SUM(CASE WHEN ${topics.inicetPriority} >= 4 THEN 1 ELSE 0 END)`,
        highYieldCovered: sql<number>`SUM(CASE WHEN ${topics.inicetPriority} >= 4 AND ${topicProgress.status} IN ('seen','reviewed','mastered') THEN 1 ELSE 0 END)`,
      })
      .from(subjects)
      .leftJoin(
        topics,
        and(
          eq(topics.subjectId, subjects.id),
          sql`NOT EXISTS (SELECT 1 FROM topics c WHERE c.parent_topic_id = topics.id)`,
        ),
      )
      .leftJoin(topicProgress, eq(topics.id, topicProgress.topicId))
      .groupBy(subjects.id)
      .orderBy(subjects.name);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      shortCode: r.shortCode,
      color: r.color,
      total: r.total ?? 0,
      covered: r.covered ?? 0,
      mastered: r.mastered ?? 0,
      highYieldTotal: r.highYieldTotal ?? 0,
      highYieldCovered: r.highYieldCovered ?? 0,
      percent: r.total > 0 ? Math.round(((r.covered ?? 0) / r.total) * 100) : 0,
    }));
  },

  async getReviewCalendarData(year: number, month: number): Promise<ReviewDay[]> {
    const db = getDrizzleDb();
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate =
      month === 11 ? `${year + 1}-01-01` : `${year}-${String(month + 2).padStart(2, '0')}-01`;

    const rows = await db
      .select({
        reviewDate: sql<string>`DATE(${topicProgress.fsrsDue})`,
        topicName: topics.name,
        confidence: topicProgress.confidence,
      })
      .from(topicProgress)
      .innerJoin(topics, eq(topicProgress.topicId, topics.id))
      .where(
        and(
          sql`${topicProgress.status} != 'unseen'`,
          isNotNull(topicProgress.fsrsDue),
          gte(sql`DATE(${topicProgress.fsrsDue})`, startDate),
          lt(sql`DATE(${topicProgress.fsrsDue})`, endDate),
        ),
      )
      .orderBy(sql`DATE(${topicProgress.fsrsDue}) ASC`);

    const byDate = new Map<string, ReviewDay>();
    for (const r of rows) {
      const existing = byDate.get(r.reviewDate);
      if (existing) {
        existing.count++;
        existing.topics.push({ name: r.topicName, confidence: r.confidence });
      } else {
        byDate.set(r.reviewDate, {
          date: r.reviewDate,
          count: 1,
          topics: [{ name: r.topicName, confidence: r.confidence }],
        });
      }
    }
    return Array.from(byDate.values());
  },
};

export type CreateTopicInput = {
  subjectId: number;
  name: string;
  parentTopicId?: number | null;
  inicetPriority?: number;
  estimatedMinutes?: number;
};
