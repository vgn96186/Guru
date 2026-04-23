import { eq, sql, isNotNull, and, desc, gt } from 'drizzle-orm';
import { getDrizzleDb } from '../drizzle';
import { getDb, runInTransaction, todayStr, dateStr, SQL_AI_CACHE } from '../database';
import { getAiCacheDb } from '../aiCacheDatabase';
import { userProfile, dailyLog, topicProgress, topics, subjects } from '../drizzleSchema';
import { MS_PER_DAY, INTERVALS } from '../../constants/time';
import { LEVELS } from '../../constants/gamification';
import { notifyDbUpdate, DB_EVENT_KEYS } from '../../services/databaseEvents';
import { showToast } from '../../components/Toast';
import { profileRepositoryDrizzle } from './profileRepository.drizzle';
import { dailyLogRepositoryDrizzle } from './dailyLogRepository.drizzle';
import type { DailyLog, Mood } from '../../types';

export const progressRepositoryDrizzle = {
  // Re-exporting profile methods to maintain exactly the same surface area
  getProfile: profileRepositoryDrizzle.getProfile,
  updateProfile: profileRepositoryDrizzle.updateProfile,

  // Re-exporting daily log methods
  getDailyLog: dailyLogRepositoryDrizzle.getDailyLog,
  getLast30DaysLog: dailyLogRepositoryDrizzle.getLast30DaysLog,
  getActiveStudyDays: dailyLogRepositoryDrizzle.getActiveStudyDays,
  checkinToday: dailyLogRepositoryDrizzle.checkinToday,

  async getActivityHistory(days = 90): Promise<DailyLog[]> {
    const db = getDrizzleDb();
    const rows = await db.select().from(dailyLog).orderBy(desc(dailyLog.date)).limit(days);

    return rows.map((r) => ({
      date: r.date,
      checkedIn: r.checkedIn === 1,
      mood: r.mood as Mood | null,
      totalMinutes: r.totalMinutes ?? 0,
      xpEarned: r.xpEarned ?? 0,
      sessionCount: r.sessionCount ?? 0,
    }));
  },

  async getDailyMinutesSeries(days = 7): Promise<number[]> {
    if (days <= 0) return [];

    // We'll use SQLite for the recursive date generation, it's simpler than trying to build it in Drizzle builder
    const db = getDb();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const rows = await db.getAllAsync<{ total_minutes: number }>(
      `WITH RECURSIVE date_span(day, remaining) AS (
         SELECT ?, ?
         UNION ALL
         SELECT DATE(day, '+1 day'), remaining - 1
         FROM date_span
         WHERE remaining > 1
       )
       SELECT COALESCE(d.total_minutes, 0) AS total_minutes
       FROM date_span
       LEFT JOIN daily_log d ON d.date = date_span.day
       ORDER BY date_span.day ASC`,
      [dateStr(start), days],
    );

    return rows.map((row) => row.total_minutes ?? 0);
  },

  async addXp(amount: number): Promise<{ newTotal: number; leveledUp: boolean; newLevel: number }> {
    const db = getDrizzleDb();
    const profile = await db
      .select({ totalXp: userProfile.totalXp, currentLevel: userProfile.currentLevel })
      .from(userProfile)
      .where(eq(userProfile.id, 1))
      .limit(1);
    const oldLevel = profile[0]?.currentLevel ?? 1;

    try {
      const result = await runInTransaction(async () => {
        await db
          .update(userProfile)
          .set({ totalXp: sql`${userProfile.totalXp} + ${amount}` })
          .where(eq(userProfile.id, 1));

        const row = await db
          .select({ totalXp: userProfile.totalXp })
          .from(userProfile)
          .where(eq(userProfile.id, 1))
          .limit(1);
        const newTotal = row[0]?.totalXp ?? 0;

        let newLevel = 1;
        for (let i = LEVELS.length - 1; i >= 0; i--) {
          if (newTotal >= LEVELS[i].xpRequired) {
            newLevel = LEVELS[i].level;
            break;
          }
        }

        await db.update(userProfile).set({ currentLevel: newLevel }).where(eq(userProfile.id, 1));
        return { newTotal, newLevel };
      });
      notifyDbUpdate(DB_EVENT_KEYS.PROGRESS_UPDATED);
      return {
        newTotal: result.newTotal,
        leveledUp: result.newLevel > oldLevel,
        newLevel: result.newLevel,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Failed to update XP: ${message || 'Unknown error'}`, 'error');
      throw err;
    }
  },

  async addXpInTx(
    amount: number,
  ): Promise<{ newTotal: number; leveledUp: boolean; newLevel: number }> {
    const db = getDrizzleDb();
    const profileRows = await db
      .select({ totalXp: userProfile.totalXp, currentLevel: userProfile.currentLevel })
      .from(userProfile)
      .where(eq(userProfile.id, 1))
      .limit(1);
    const oldTotal = profileRows[0]?.totalXp ?? 0;
    const oldLevel = profileRows[0]?.currentLevel ?? 1;

    if (amount <= 0) {
      return { newTotal: oldTotal, leveledUp: false, newLevel: oldLevel };
    }

    await db
      .update(userProfile)
      .set({ totalXp: sql`${userProfile.totalXp} + ${amount}` })
      .where(eq(userProfile.id, 1));
    const newRows = await db
      .select({ totalXp: userProfile.totalXp })
      .from(userProfile)
      .where(eq(userProfile.id, 1))
      .limit(1);
    const newTotal = newRows[0]?.totalXp ?? 0;

    let newLevel = 1;
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (newTotal >= LEVELS[i].xpRequired) {
        newLevel = LEVELS[i].level;
        break;
      }
    }

    await db.update(userProfile).set({ currentLevel: newLevel }).where(eq(userProfile.id, 1));

    return {
      newTotal,
      leveledUp: newLevel > oldLevel,
      newLevel,
    };
  },

  async updateStreak(studiedToday: boolean, useShield = false): Promise<void> {
    const db = getDrizzleDb();
    const today = todayStr();
    const profile = await this.getProfile();

    if (profile.lastActiveDate === today) return;

    if (useShield && profile.streakCurrent > 0) {
      try {
        await db
          .update(userProfile)
          .set({ streakShieldAvailable: 0, lastActiveDate: today })
          .where(eq(userProfile.id, 1));
        notifyDbUpdate(DB_EVENT_KEYS.PROFILE_UPDATED);
        return;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(`Failed to use shield: ${message || 'Unknown error'}`, 'error');
        throw err;
      }
    }

    if (!studiedToday) return;

    const yesterday = dateStr(new Date(Date.now() - MS_PER_DAY));
    const newStreak = profile.lastActiveDate === yesterday ? profile.streakCurrent + 1 : 1;
    const newBest = Math.max(newStreak, profile.streakBest);
    const shieldAvailable = newStreak === 1 ? 1 : profile.streakCurrent === 0 ? 1 : 0;

    try {
      await db
        .update(userProfile)
        .set({
          streakCurrent: newStreak,
          streakBest: newBest,
          lastActiveDate: today,
          streakShieldAvailable: shieldAvailable,
        })
        .where(eq(userProfile.id, 1));
      notifyDbUpdate(DB_EVENT_KEYS.PROFILE_UPDATED);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Failed to update streak: ${message || 'Unknown error'}`, 'error');
      throw err;
    }
  },

  async useStreakShield(): Promise<boolean> {
    const db = getDrizzleDb();
    const profile = await this.getProfile();
    const row = await db
      .select({ streakShieldAvailable: userProfile.streakShieldAvailable })
      .from(userProfile)
      .where(eq(userProfile.id, 1))
      .limit(1);

    if (profile.streakCurrent === 0 || row[0]?.streakShieldAvailable !== 1) return false;
    await this.updateStreak(false, true);
    return true;
  },

  async resetStudyProgress(): Promise<void> {
    const db = getDrizzleDb();
    try {
      await runInTransaction(async () => {
        await db.update(topicProgress).set({
          status: 'unseen',
          confidence: 0,
          lastStudiedAt: null,
          timesStudied: 0,
          xpEarned: 0,
          nextReviewDate: null,
          fsrsDue: null,
          fsrsStability: 0,
          fsrsDifficulty: 0,
          fsrsElapsedDays: 0,
          fsrsScheduledDays: 0,
          fsrsReps: 0,
          fsrsLapses: 0,
          fsrsState: 0,
          fsrsLastReview: null,
          wrongCount: 0,
          isNemesis: 0,
        });
        await db
          .update(userProfile)
          .set({
            totalXp: 0,
            currentLevel: 1,
            streakCurrent: 0,
            streakBest: 0,
            lastActiveDate: null,
          })
          .where(eq(userProfile.id, 1));
        await db.delete(dailyLog);
      });
      notifyDbUpdate(DB_EVENT_KEYS.PROGRESS_UPDATED);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Failed to reset progress: ${message || 'Unknown error'}`, 'error');
      throw err;
    }
  },

  async clearAiCache(): Promise<void> {
    try {
      await getAiCacheDb().runAsync(`DELETE FROM ${SQL_AI_CACHE}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Failed to clear AI cache: ${message || 'Unknown error'}`, 'error');
      throw err;
    }
  },

  getDaysToExam(examDateStr: string): number {
    if (!examDateStr) {
      if (__DEV__) console.warn('[getDaysToExam] Empty exam date string');
      return 0;
    }

    let examTime = 0;
    const parts = examDateStr.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d) && y >= 2024) {
        examTime = new Date(y, m, d).getTime();
      }
    }

    if (!examTime) {
      examTime = new Date(examDateStr).getTime();
    }

    if (isNaN(examTime) || examTime === 0) {
      if (__DEV__) console.warn(`[getDaysToExam] Unparseable exam date: "${examDateStr}"`);
      return 0;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const exam = new Date(examTime);
    exam.setHours(0, 0, 0, 0);

    return Math.max(0, Math.ceil((exam.getTime() - now.getTime()) / MS_PER_DAY));
  },

  async applyConfidenceDecay(): Promise<{ decayed: number }> {
    const db = getDrizzleDb();
    const today = new Date().toISOString().slice(0, 10);

    const overdue = await db
      .select({
        topicId: topicProgress.topicId,
        confidence: topicProgress.confidence,
        fsrsDue: topicProgress.fsrsDue,
        status: topicProgress.status,
      })
      .from(topicProgress)
      .where(
        and(
          isNotNull(topicProgress.fsrsDue),
          sql`DATE(${topicProgress.fsrsDue}) < DATE(${today})`,
          gt(topicProgress.confidence, 0),
        ),
      );

    if (overdue.length === 0) return { decayed: 0 };

    const updates: Array<{ topicId: number; newConf: number; newStatus: string }> = [];

    for (const row of overdue) {
      const reviewDate = new Date(row.fsrsDue as string);
      const daysOverdue = Math.floor((Date.now() - reviewDate.getTime()) / MS_PER_DAY);

      let newConf = row.confidence;
      let newStatus = row.status;

      if (daysOverdue > 30) {
        newConf = 0;
        if (row.status === 'mastered' || row.status === 'reviewed') newStatus = 'seen';
      } else if (daysOverdue > 7) {
        newConf = Math.max(0, row.confidence - 2);
      } else if (daysOverdue >= 1) {
        newConf = Math.max(0, row.confidence - 1);
      }

      if (newConf !== row.confidence || newStatus !== row.status) {
        updates.push({ topicId: row.topicId, newConf, newStatus });
      }
    }

    if (updates.length === 0) return { decayed: 0 };

    // Bulk update using a single raw SQL statement with CASE expressions
    // instead of N individual Drizzle UPDATE round-trips
    await runInTransaction(async (txDb) => {
      const idList = updates.map((u) => u.topicId);
      const confCases = updates
        .map((u) => `WHEN ${u.topicId} THEN ${u.newConf}`)
        .join(' ');
      const statusCases = updates
        .map((u) => `WHEN ${u.topicId} THEN '${u.newStatus}'`)
        .join(' ');
      const idPlaceholders = idList.map(() => '?').join(',');
      await txDb.runAsync(
        `UPDATE topic_progress
         SET confidence = CASE topic_id ${confCases} END,
             status = CASE topic_id ${statusCases} END
         WHERE topic_id IN (${idPlaceholders})`,
        idList,
      );
    });

    notifyDbUpdate(DB_EVENT_KEYS.PROGRESS_UPDATED);
    return { decayed: updates.length };
  },

  async getReviewDueTopics(): Promise<
    Array<{
      topicId: number;
      topicName: string;
      subjectName: string;
      confidence: number;
      nextReviewDate: string;
      daysOverdue: number;
    }>
  > {
    const db = getDrizzleDb();
    const todayIso = new Date().toISOString().slice(0, 10);

    const rows = await db
      .select({
        topicId: topicProgress.topicId,
        topicName: topics.name,
        subjectName: subjects.name,
        confidence: topicProgress.confidence,
        fsrsDue: topicProgress.fsrsDue,
      })
      .from(topicProgress)
      .innerJoin(topics, eq(topicProgress.topicId, topics.id))
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .where(
        and(
          isNotNull(topicProgress.fsrsDue),
          sql`DATE(${topicProgress.fsrsDue}) <= DATE(${todayIso})`,
        ),
      )
      .orderBy(topicProgress.fsrsDue)
      .limit(50);

    return rows.map((r) => ({
      topicId: r.topicId,
      topicName: r.topicName,
      subjectName: r.subjectName,
      confidence: r.confidence,
      nextReviewDate: (r.fsrsDue as string).slice(0, 10),
      daysOverdue: Math.max(
        0,
        Math.floor((Date.now() - new Date(r.fsrsDue as string).getTime()) / MS_PER_DAY),
      ),
    }));
  },

  async getRecentTopics(limit = 10): Promise<string[]> {
    const db = getDrizzleDb();
    const twoDaysAgo = Date.now() - INTERVALS.TWO_DAYS;

    const rows = await db
      .selectDistinct({
        topicName: topics.name,
      })
      .from(topicProgress)
      .innerJoin(topics, eq(topicProgress.topicId, topics.id))
      .where(sql`${topicProgress.lastStudiedAt} > ${twoDaysAgo}`)
      .orderBy(desc(topicProgress.lastStudiedAt))
      .limit(limit);

    return rows.map((r) => r.topicName);
  },
};
