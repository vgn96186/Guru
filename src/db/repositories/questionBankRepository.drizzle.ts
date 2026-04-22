import { and, asc, desc, eq, isNull, like, lte, notInArray, or, sql } from 'drizzle-orm';
import type { QuestionBankItem, QuestionFilters, SaveQuestionInput } from '../../types';
import { getDrizzleDb } from '../drizzle';
import { questionBank } from '../drizzleSchema';

const SR_INTERVALS = [
  1 * 86_400_000,
  3 * 86_400_000,
  7 * 86_400_000,
  14 * 86_400_000,
  30 * 86_400_000,
];

type QuestionBankRow = typeof questionBank.$inferSelect;

type QuestionAttemptRow = Pick<
  QuestionBankRow,
  'timesSeen' | 'timesCorrect' | 'difficulty' | 'isMastered'
>;

type SubjectStatsRow = {
  subjectName: string;
  total: number;
  mastered: number | null;
  bookmarked: number | null;
};

type QuestionFilterCondition =
  | ReturnType<typeof eq>
  | ReturnType<typeof and>
  | ReturnType<typeof like>;

function nextReviewInterval(consecutiveCorrect: number): number {
  const idx = Math.min(consecutiveCorrect, SR_INTERVALS.length - 1);
  return SR_INTERVALS[idx];
}

function mapQuestionBankRow(row: QuestionBankRow): QuestionBankItem {
  return {
    id: row.id,
    question: row.question,
    options: JSON.parse(row.options) as [string, string, string, string],
    correctIndex: row.correctIndex,
    explanation: row.explanation,
    topicId: row.topicId ?? null,
    topicName: row.topicName,
    subjectName: row.subjectName,
    source: row.source as QuestionBankItem['source'],
    sourceId: row.sourceId ?? null,
    imageUrl: row.imageUrl ?? null,
    isBookmarked: row.isBookmarked === 1,
    isMastered: row.isMastered === 1,
    timesSeen: row.timesSeen,
    timesCorrect: row.timesCorrect,
    lastSeenAt: row.lastSeenAt ?? null,
    nextReviewAt: row.nextReviewAt ?? null,
    difficulty: row.difficulty,
    createdAt: row.createdAt,
  };
}

function buildQuestionFilterConditions(filters?: QuestionFilters, now = Date.now()) {
  const conditions: QuestionFilterCondition[] = [];

  if (filters?.subjectName) {
    conditions.push(eq(questionBank.subjectName, filters.subjectName));
  }
  if (filters?.topicId != null) {
    conditions.push(eq(questionBank.topicId, filters.topicId));
  }
  if (filters?.isBookmarked != null) {
    conditions.push(eq(questionBank.isBookmarked, filters.isBookmarked ? 1 : 0));
  }
  if (filters?.isMastered != null) {
    conditions.push(eq(questionBank.isMastered, filters.isMastered ? 1 : 0));
  }
  if (filters?.dueForReview) {
    conditions.push(
      and(
        or(isNull(questionBank.nextReviewAt), lte(questionBank.nextReviewAt, now)),
        eq(questionBank.isMastered, 0),
      ),
    );
  }
  if (filters?.search) {
    conditions.push(like(questionBank.question, `%${filters.search}%`));
  }

  return conditions;
}

function questionInsertValues(q: SaveQuestionInput, createdAt: number) {
  return {
    question: q.question,
    options: JSON.stringify(q.options),
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    topicId: q.topicId ?? null,
    topicName: q.topicName ?? '',
    subjectName: q.subjectName ?? '',
    source: q.source,
    sourceId: q.sourceId ?? null,
    imageUrl: q.imageUrl ?? null,
    createdAt,
  };
}

export const questionBankRepositoryDrizzle = {
  async saveQuestion(q: SaveQuestionInput): Promise<number> {
    const db = getDrizzleDb();
    const insertedRows = await db
      .insert(questionBank)
      .values(questionInsertValues(q, Date.now()))
      .onConflictDoNothing()
      .returning({ id: questionBank.id });

    return insertedRows[0]?.id ?? 0;
  },

  async saveBulkQuestions(questions: SaveQuestionInput[]): Promise<number> {
    if (questions.length === 0) return 0;

    const db = getDrizzleDb();
    return db.transaction(async (tx) => {
      let saved = 0;

      for (const question of questions) {
        const insertedRows = await tx
          .insert(questionBank)
          .values(questionInsertValues(question, Date.now()))
          .onConflictDoNothing()
          .returning({ id: questionBank.id });

        if (insertedRows.length > 0) {
          saved += 1;
        }
      }

      return saved;
    });
  },

  async deleteQuestion(id: number): Promise<void> {
    const db = getDrizzleDb();
    await db.delete(questionBank).where(eq(questionBank.id, id));
  },

  async toggleBookmark(id: number): Promise<void> {
    const db = getDrizzleDb();
    await db
      .update(questionBank)
      .set({
        isBookmarked: sql<number>`CASE WHEN ${questionBank.isBookmarked} = 1 THEN 0 ELSE 1 END`,
      })
      .where(eq(questionBank.id, id));
  },

  async markMastered(id: number, mastered: boolean): Promise<void> {
    const db = getDrizzleDb();
    await db
      .update(questionBank)
      .set({ isMastered: mastered ? 1 : 0 })
      .where(eq(questionBank.id, id));
  },

  async recordAttempt(id: number, correct: boolean): Promise<void> {
    const db = getDrizzleDb();
    const now = Date.now();

    await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          timesSeen: questionBank.timesSeen,
          timesCorrect: questionBank.timesCorrect,
          difficulty: questionBank.difficulty,
          isMastered: questionBank.isMastered,
        })
        .from(questionBank)
        .where(eq(questionBank.id, id))
        .limit(1);

      const row = rows[0] as QuestionAttemptRow | undefined;
      if (!row) return;

      const timesSeen = row.timesSeen + 1;
      const timesCorrect = row.timesCorrect + (correct ? 1 : 0);

      let difficulty = row.difficulty;
      let consecutiveCorrect = 0;

      if (correct) {
        difficulty = Math.max(0, difficulty - 0.05);
        consecutiveCorrect = Math.floor((timesCorrect / Math.max(1, timesSeen)) * 5);
      } else {
        difficulty = Math.min(1, difficulty + 0.1);
      }

      const interval = correct ? nextReviewInterval(consecutiveCorrect) : SR_INTERVALS[0];
      const autoMastered =
        correct && consecutiveCorrect >= 3 && interval >= 14 * 86_400_000 ? 1 : row.isMastered;

      await tx
        .update(questionBank)
        .set({
          timesSeen,
          timesCorrect,
          lastSeenAt: now,
          nextReviewAt: now + interval,
          difficulty,
          isMastered: autoMastered,
        })
        .where(eq(questionBank.id, id));
    });
  },

  async getQuestions(filters?: QuestionFilters): Promise<QuestionBankItem[]> {
    const db = getDrizzleDb();
    const conditions = buildQuestionFilterConditions(filters);
    const query =
      conditions.length > 0
        ? db
            .select()
            .from(questionBank)
            .where(and(...conditions))
        : db.select().from(questionBank);
    const rows = await query.orderBy(desc(questionBank.createdAt));

    return rows.map((row: QuestionBankRow) => mapQuestionBankRow(row));
  },

  async getQuestionCount(filters?: QuestionFilters): Promise<number> {
    const db = getDrizzleDb();
    const conditions = buildQuestionFilterConditions(filters);
    const query =
      conditions.length > 0
        ? db
            .select({
              cnt: sql<number>`COUNT(*)`,
            })
            .from(questionBank)
            .where(and(...conditions))
        : db
            .select({
              cnt: sql<number>`COUNT(*)`,
            })
            .from(questionBank);
    const rows = await query.limit(1);

    return rows[0]?.cnt ?? 0;
  },

  async getPracticeSet(count: number, filters?: QuestionFilters): Promise<QuestionBankItem[]> {
    const db = getDrizzleDb();
    const now = Date.now();
    const dueConditions = [
      ...buildQuestionFilterConditions(filters, now),
      and(
        or(isNull(questionBank.nextReviewAt), lte(questionBank.nextReviewAt, now)),
        eq(questionBank.isMastered, 0),
      ),
    ];

    const dueRows = await db
      .select()
      .from(questionBank)
      .where(and(...dueConditions))
      .orderBy(sql`RANDOM()`)
      .limit(count);
    const due = dueRows.map((row) => mapQuestionBankRow(row as QuestionBankRow));

    if (due.length >= count) {
      return due.slice(0, count);
    }

    const remaining = count - due.length;
    const dueIds = due.map((item) => item.id);
    const extraConditions = [
      ...buildQuestionFilterConditions(filters, now),
      eq(questionBank.isMastered, 0),
    ];

    if (dueIds.length > 0) {
      extraConditions.push(notInArray(questionBank.id, dueIds));
    }

    const extraRows = await db
      .select()
      .from(questionBank)
      .where(and(...extraConditions))
      .orderBy(sql`RANDOM()`)
      .limit(remaining + due.length);
    const extraIdSet = new Set(dueIds);
    const extras = extraRows
      .map((row) => mapQuestionBankRow(row as QuestionBankRow))
      .filter((item) => {
        if (extraIdSet.has(item.id)) return false;
        extraIdSet.add(item.id);
        return true;
      });

    return [...due, ...extras.slice(0, remaining)];
  },

  async getDueForReview(limit: number): Promise<QuestionBankItem[]> {
    const db = getDrizzleDb();
    const now = Date.now();
    const rows = await db
      .select()
      .from(questionBank)
      .where(
        and(
          or(isNull(questionBank.nextReviewAt), lte(questionBank.nextReviewAt, now)),
          eq(questionBank.isMastered, 0),
        ),
      )
      .orderBy(
        sql`CASE WHEN ${questionBank.nextReviewAt} IS NULL THEN 0 ELSE 1 END`,
        asc(questionBank.nextReviewAt),
      )
      .limit(limit);

    return rows.map((row) => mapQuestionBankRow(row as QuestionBankRow));
  },

  async getCachedUnseenQuestionsForSessionFallback(
    topicId: number,
    subjectName: string,
    limit: number,
  ): Promise<QuestionBankItem[]> {
    const db = getDrizzleDb();
    const targetLimit = Math.max(1, limit);
    const collected = new Map<number, QuestionBankItem>();
    const strategies = [
      and(
        eq(questionBank.topicId, topicId),
        eq(questionBank.timesSeen, 0),
        eq(questionBank.isMastered, 0),
      ),
      and(
        eq(questionBank.subjectName, subjectName),
        eq(questionBank.timesSeen, 0),
        eq(questionBank.isMastered, 0),
      ),
      and(eq(questionBank.timesSeen, 0), eq(questionBank.isMastered, 0)),
    ];

    for (const condition of strategies) {
      if (collected.size >= targetLimit) break;

      const rows = await db
        .select()
        .from(questionBank)
        .where(condition)
        .orderBy(
          sql`CASE WHEN ${questionBank.source} = 'content_card' THEN 0 ELSE 1 END`,
          desc(questionBank.createdAt),
        )
        .limit(targetLimit * 3);

      for (const row of rows) {
        const item = mapQuestionBankRow(row as QuestionBankRow);
        if (collected.has(item.id)) continue;
        collected.set(item.id, item);
        if (collected.size >= targetLimit) break;
      }
    }

    return Array.from(collected.values()).slice(0, targetLimit);
  },

  async getSubjectStats(): Promise<
    { subject: string; total: number; mastered: number; bookmarked: number }[]
  > {
    const db = getDrizzleDb();
    const rows = await db
      .select({
        subjectName: questionBank.subjectName,
        total: sql<number>`COUNT(*)`,
        mastered: sql<number | null>`SUM(${questionBank.isMastered})`,
        bookmarked: sql<number | null>`SUM(${questionBank.isBookmarked})`,
      })
      .from(questionBank)
      .groupBy(questionBank.subjectName)
      .orderBy(desc(sql`COUNT(*)`));

    return (rows as SubjectStatsRow[]).map((row) => ({
      subject: row.subjectName || 'Unknown',
      total: row.total,
      mastered: row.mastered ?? 0,
      bookmarked: row.bookmarked ?? 0,
    }));
  },
};
