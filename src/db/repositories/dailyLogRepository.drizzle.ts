import { and, desc, gte, gt, or, sql } from 'drizzle-orm';
import { showToast } from '../../components/Toast';
import { notifyDbUpdate, DB_EVENT_KEYS } from '../../services/databaseEvents';
import type { DailyLog, Mood } from '../../types';
import { dateStr, todayStr } from '../database';
import { getDrizzleDb } from '../drizzle';
import { dailyLog } from '../drizzleSchema';

type DailyLogRow = typeof dailyLog.$inferSelect;

function mapRowToDailyLog(row: Partial<DailyLogRow>): DailyLog {
  return {
    date: row.date ?? '',
    checkedIn: (row.checkedIn ?? 0) === 1,
    mood: (row.mood ?? null) as Mood | null,
    totalMinutes: row.totalMinutes ?? 0,
    xpEarned: row.xpEarned ?? 0,
    sessionCount: row.sessionCount ?? 0,
  };
}

async function getActivityHistory(days: number): Promise<DailyLog[]> {
  const db = getDrizzleDb();
  const rows = await db.select().from(dailyLog).orderBy(desc(dailyLog.date)).limit(days);

  return rows.map(mapRowToDailyLog);
}

export const dailyLogRepositoryDrizzle = {
  async getDailyLog(date?: string): Promise<DailyLog | null> {
    const db = getDrizzleDb();
    const rows = await db
      .select()
      .from(dailyLog)
      .where(sql`${dailyLog.date} = ${date ?? todayStr()}`)
      .orderBy(desc(dailyLog.date))
      .limit(1);

    if (rows.length === 0) return null;
    return mapRowToDailyLog(rows[0]);
  },

  async getLast30DaysLog(): Promise<DailyLog[]> {
    return getActivityHistory(30);
  },

  async getActiveStudyDays(days = 30): Promise<number> {
    if (days <= 0) return 0;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const db = getDrizzleDb();
    const rows = await db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(dailyLog)
      .where(
        and(
          gte(dailyLog.date, dateStr(start)),
          or(gt(dailyLog.sessionCount, 0), gt(dailyLog.totalMinutes, 0)),
        ),
      )
      .limit(1);

    return rows[0]?.count ?? 0;
  },

  async checkinToday(mood?: Mood | null): Promise<void> {
    const db = getDrizzleDb();
    const date = todayStr();
    const nextMood = mood ?? null;

    try {
      await db
        .insert(dailyLog)
        .values({
          date,
          checkedIn: 1,
          mood: nextMood,
        })
        .onConflictDoUpdate({
          target: dailyLog.date,
          set: {
            checkedIn: 1,
            mood: nextMood,
          },
        });
      notifyDbUpdate(DB_EVENT_KEYS.PROGRESS_UPDATED);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(`Check-in failed: ${message || 'Unknown error'}`, 'error');
      throw error;
    }
  },
};

export type { DailyLog, Mood };
