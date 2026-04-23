/**
 * Profile repository — decouples Zustand store from persistence logic.
 * Delegates to the Drizzle-backed progressRepositoryDrizzle for implementation.
 */
import type { UserProfile } from '../../types';
import { progressRepositoryDrizzle } from './progressRepository.drizzle';
import { topicsRepositoryDrizzle } from './topicsRepository.drizzle';

export const profileRepository = {
  getProfile: progressRepositoryDrizzle.getProfile,
  updateProfile: progressRepositoryDrizzle.updateProfile,
  addXp: progressRepositoryDrizzle.addXp,
  updateStreak: progressRepositoryDrizzle.updateStreak,
  useStreakShield: progressRepositoryDrizzle.useStreakShield,
  getDaysToExam: progressRepositoryDrizzle.getDaysToExam,
  resetStudyProgress: progressRepositoryDrizzle.resetStudyProgress,
  clearAiCache: progressRepositoryDrizzle.clearAiCache,
  getReviewDueTopics: progressRepositoryDrizzle.getReviewDueTopics,
  getRecentTopics: progressRepositoryDrizzle.getRecentTopics,
  getSubjectCoverage: topicsRepositoryDrizzle.getSubjectCoverage,
  getWeakestTopics: topicsRepositoryDrizzle.getWeakestTopics,
  applyConfidenceDecay: progressRepositoryDrizzle.applyConfidenceDecay,
};

export type { UserProfile };
