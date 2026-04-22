export { progressRepositoryDrizzle } from '../repositories/progressRepository.drizzle';

import { progressRepositoryDrizzle } from '../repositories/progressRepository.drizzle';

export const {
  getProfile: getUserProfile,
  updateProfile: updateUserProfile,
  addXp,
  addXpInTx,
  updateStreak,
  useStreakShield,
  getDailyLog,
  checkinToday,
  getLast30DaysLog,
  getActivityHistory,
  getActiveStudyDays,
  getDailyMinutesSeries,
  resetStudyProgress,
  clearAiCache,
  getDaysToExam,
  applyConfidenceDecay,
  getReviewDueTopics,
  getRecentTopics,
} = progressRepositoryDrizzle;
