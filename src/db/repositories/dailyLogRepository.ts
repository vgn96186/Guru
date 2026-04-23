/**
 * Daily log repository — decouples UI from persistence logic.
 * Delegates to the Drizzle-backed progressRepositoryDrizzle for implementation.
 */
import type { DailyLog, Mood } from '../../types';
import { progressRepositoryDrizzle } from './progressRepository.drizzle';

export const dailyLogRepository = {
  getDailyLog: progressRepositoryDrizzle.getDailyLog,
  getLast30DaysLog: progressRepositoryDrizzle.getLast30DaysLog,
  getActivityHistory: progressRepositoryDrizzle.getActivityHistory,
  getActiveStudyDays: progressRepositoryDrizzle.getActiveStudyDays,
  getDailyMinutesSeries: progressRepositoryDrizzle.getDailyMinutesSeries,
  checkinToday: progressRepositoryDrizzle.checkinToday,
};

export type { DailyLog, Mood };
