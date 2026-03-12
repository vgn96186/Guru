/**
 * Daily log repository — decouples UI from persistence logic.
 * Delegates to db/queries/progress for implementation.
 */
import type { DailyLog, Mood } from '../../types';
import {
  getDailyLog,
  getLast30DaysLog,
  getActivityHistory,
  getActiveStudyDays,
  getDailyMinutesSeries,
  checkinToday,
} from '../queries/progress';

export const dailyLogRepository = {
  getDailyLog,
  getLast30DaysLog,
  getActivityHistory,
  getActiveStudyDays,
  getDailyMinutesSeries,
  checkinToday,
};

export type { DailyLog, Mood };
