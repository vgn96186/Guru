import { and, desc, eq, gt, gte, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';
import type { Mood, SessionMode, StudySession } from '../../types';
import { safeJsonParse } from '../../utils/safeJsonParse';
import { MS_PER_DAY } from '../../constants/time';
import { dateStr, todayStr } from '../database';
import { getDrizzleDb } from '../drizzle';
import { runInTransaction } from '../database';
import { dailyLog, sessions, topics } from '../drizzleSchema';

type SessionRow = typeof sessions.$inferSelect;

type WeeklyStatsBucket = {
  minutes: number;
  sessions: number;
  topics: number;
};

function mapRowToStudySession(row: SessionRow): StudySession {
  return {
    id: row.id,
    startedAt: row.startedAt,
    endedAt: row.endedAt ?? null,
    plannedTopics: safeJsonParse<number[]>(row.plannedTopics, []),
    completedTopics: safeJsonParse<number[]>(row.completedTopics, []),
    totalXpEarned: row.totalXpEarned,
    durationMinutes: row.durationMinutes ?? null,
    mood: (row.mood ?? null) as Mood | null,
    mode: row.mode as SessionMode,
  };
}

export const sessionsRepositoryDrizzle = {
  async getTotalStudyMinutes(): Promise<number> {
    const db = getDrizzleDb();
    const rows = await db
      .select({
        total: sql<number>`COALESCE(SUM(${sessions.durationMinutes}), 0)`,
      })
      .from(sessions)
      .where(isNotNull(sessions.endedAt))
      .limit(1);

    return rows[0]?.total ?? 0;
  },

  async getCompletedSessionCount(): Promise<number> {
    const db = getDrizzleDb();
    const rows = await db
      .select({
        cnt: sql<number>`COUNT(*)`,
      })
      .from(sessions)
      .where(isNotNull(sessions.endedAt))
      .limit(1);

    return rows[0]?.cnt ?? 0;
  },

  async createSession(
    plannedTopics: number[],
    mood: Mood | null,
    mode: SessionMode,
  ): Promise<number> {
    const db = getDrizzleDb();
    const insertedRows = await db
      .insert(sessions)
      .values({
        startedAt: Date.now(),
        plannedTopics: JSON.stringify(plannedTopics),
        mood,
        mode,
      })
      .returning({ id: sessions.id });

    return insertedRows[0]?.id ?? 0;
  },

  async isSessionAlreadyFinalized(sessionId: number): Promise<boolean> {
    const db = getDrizzleDb();
    const rows = await db
      .select({
        endedAt: sessions.endedAt,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    return rows[0]?.endedAt != null;
  },

  async endSession(
    sessionId: number,
    completedTopics: number[],
    xpEarned: number,
    durationMinutes: number,
    notes?: string,
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    await runInTransaction(async (tx: any) => {
      const row = await tx
        .select({ endedAt: sessions.endedAt })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);

      if (row[0]?.endedAt != null) return;

      await tx
        .update(sessions)
        .set({
          endedAt: Date.now(),
          completedTopics: JSON.stringify(completedTopics),
          totalXpEarned: xpEarned,
          durationMinutes,
          notes: notes ?? null,
        })
        .where(eq(sessions.id, sessionId));

      await tx
        .insert(dailyLog)
        .values({
          date: todayStr(),
          sessionCount: 1,
          totalMinutes: durationMinutes,
          xpEarned: xpEarned,
        })
        .onConflictDoUpdate({
          target: dailyLog.date,
          set: {
            sessionCount: sql`${dailyLog.sessionCount} + 1`,
            totalMinutes: sql`${dailyLog.totalMinutes} + ${durationMinutes}`,
            xpEarned: sql`${dailyLog.xpEarned} + ${xpEarned}`,
          },
        });
    });
  },

  async updateSessionProgress(
    sessionId: number,
    durationMinutes: number,
    xpEarned: number,
    completedTopics: number[] = [],
    notes?: string,
  ): Promise<void> {
    const today = todayStr();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    await runInTransaction(async (tx: any) => {
      const prevRows = await tx
        .select({
          durationMinutes: sessions.durationMinutes,
          totalXpEarned: sessions.totalXpEarned,
        })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);

      const prev = prevRows[0];
      const prevMins = prev?.durationMinutes ?? 0;
      const prevXp = prev?.totalXpEarned ?? 0;

      const deltaMins = Math.max(0, durationMinutes - prevMins);
      const deltaXp = Math.max(0, xpEarned - prevXp);

      await tx
        .update(sessions)
        .set({
          completedTopics: JSON.stringify(completedTopics),
          totalXpEarned: xpEarned,
          durationMinutes,
          notes: notes ?? null,
        })
        .where(eq(sessions.id, sessionId));

      if (deltaMins > 0 || deltaXp > 0) {
        await tx
          .insert(dailyLog)
          .values({
            date: today,
            sessionCount: 1,
            totalMinutes: deltaMins,
            xpEarned: deltaXp,
          })
          .onConflictDoUpdate({
            target: dailyLog.date,
            set: {
              totalMinutes: sql`${dailyLog.totalMinutes} + ${deltaMins}`,
              xpEarned: sql`${dailyLog.xpEarned} + ${deltaXp}`,
            },
          });
      }
    });
  },

  async getRecentSessions(limit = 7): Promise<StudySession[]> {
    const db = getDrizzleDb();
    const rows = await db.select().from(sessions).orderBy(desc(sessions.startedAt)).limit(limit);
    return rows.map(mapRowToStudySession);
  },

  async getRecentlyStudiedTopicNames(sessionCount = 3): Promise<string[]> {
    const db = getDrizzleDb();
    const sessionRows = await db
      .select({ completedTopics: sessions.completedTopics })
      .from(sessions)
      .where(isNotNull(sessions.endedAt))
      .orderBy(desc(sessions.startedAt))
      .limit(sessionCount);

    const topicIds = sessionRows.flatMap((r) => safeJsonParse<number[]>(r.completedTopics, []));
    if (topicIds.length === 0) return [];

    const nameRows = await db
      .select({ name: topics.name })
      .from(topics)
      .where(inArray(topics.id, topicIds));

    return nameRows.map((r) => r.name);
  },

  async getCompletedTopicIdsBetween(startTs: number, endTs?: number): Promise<number[]> {
    const db = getDrizzleDb();

    const query = db
      .select({ completedTopics: sessions.completedTopics })
      .from(sessions)
      .where(
        endTs != null
          ? and(
              isNotNull(sessions.endedAt),
              gte(sessions.startedAt, startTs),
              lt(sessions.startedAt, endTs),
            )
          : and(isNotNull(sessions.endedAt), gte(sessions.startedAt, startTs)),
      );

    const rows = await query;
    return rows.flatMap((row) => safeJsonParse<number[]>(row.completedTopics, []));
  },

  async getPreferredStudyHours(): Promise<number[]> {
    const db = getDrizzleDb();
    const rows = await db
      .select({ startedAt: sessions.startedAt })
      .from(sessions)
      .where(gte(sessions.durationMinutes, 10))
      .orderBy(desc(sessions.startedAt))
      .limit(50);

    if (rows.length === 0) return [9, 14, 19];

    const hourCounts: Record<number, number> = {};
    for (const r of rows) {
      const hour = new Date(r.startedAt).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }

    const sorted = Object.entries(hourCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([h]) => parseInt(h, 10));

    if (sorted.length >= 3) return sorted.slice(0, 3);

    const defaults = [9, 19, 21];
    const uniqueHours: number[] = [];

    for (const hour of [...sorted, ...defaults]) {
      if (!uniqueHours.includes(hour)) {
        uniqueHours.push(hour);
      }
      if (uniqueHours.length >= 3) break;
    }

    return uniqueHours.sort((a, b) => a - b);
  },

  async getWeeklyComparison(): Promise<{
    thisWeek: WeeklyStatsBucket;
    lastWeek: WeeklyStatsBucket;
  }> {
    const db = getDrizzleDb();
    const now = Date.now();
    const dayMs = MS_PER_DAY;

    const today = new Date(now);
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const midnightOffsetMs =
      today.getHours() * 3_600_000 +
      today.getMinutes() * 60_000 +
      today.getSeconds() * 1_000 +
      today.getMilliseconds();
    const thisWeekStart = now - mondayOffset * dayMs - midnightOffsetMs;
    const lastWeekStart = thisWeekStart - 7 * dayMs;

    const rows = await db
      .select({
        bucket: sql<
          'thisWeek' | 'lastWeek'
        >`CASE WHEN ${sessions.startedAt} >= ${thisWeekStart} THEN 'thisWeek' ELSE 'lastWeek' END`,
        minutes: sql<number>`COALESCE(SUM(${sessions.durationMinutes}), 0)`,
        sessions: sql<number>`COUNT(*)`,
        topics: sql<number>`
          COALESCE(
            SUM(
              CASE
                WHEN json_valid(${sessions.completedTopics}) THEN json_array_length(${sessions.completedTopics})
                ELSE 0
              END
            ),
            0
          )
        `,
      })
      .from(sessions)
      .where(and(isNotNull(sessions.endedAt), gte(sessions.startedAt, lastWeekStart)))
      .groupBy(sql`bucket`);

    const emptyBucket: WeeklyStatsBucket = { minutes: 0, sessions: 0, topics: 0 };
    const stats = rows.reduce<Record<'thisWeek' | 'lastWeek', WeeklyStatsBucket>>(
      (acc, row) => {
        acc[row.bucket] = {
          minutes: row.minutes ?? 0,
          sessions: row.sessions ?? 0,
          topics: row.topics ?? 0,
        };
        return acc;
      },
      {
        thisWeek: { ...emptyBucket },
        lastWeek: { ...emptyBucket },
      },
    );

    return {
      thisWeek: stats.thisWeek,
      lastWeek: stats.lastWeek,
    };
  },

  async calculateCurrentStreak(): Promise<number> {
    const db = getDrizzleDb();
    const rows = await db
      .select({ date: dailyLog.date })
      .from(dailyLog)
      .where(or(gt(dailyLog.totalMinutes, 0), gt(dailyLog.sessionCount, 0)))
      .orderBy(desc(dailyLog.date));

    if (rows.length === 0) return 0;

    const today = todayStr();
    const yesterday = dateStr(new Date(Date.now() - MS_PER_DAY));

    const dateSet = new Set(rows.map((r) => r.date));

    if (!dateSet.has(today) && !dateSet.has(yesterday)) {
      return 0;
    }

    let currentStreak = 0;
    const d = new Date();
    if (!dateSet.has(today)) {
      d.setDate(d.getDate() - 1);
    }

    while (true) {
      const dStr = dateStr(d);
      if (dateSet.has(dStr)) {
        currentStreak++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return currentStreak;
  },
};
