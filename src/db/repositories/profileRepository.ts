/**
 * Profile repository — decouples Zustand store from persistence logic.
 * Delegates to db/queries/progress for implementation.
 */
import type { UserProfile } from '../../types';
import {
  getUserProfile,
  updateUserProfile as updateUserProfileQuery,
  addXp,
  updateStreak,
  useStreakShield,
  getDaysToExam,
  resetStudyProgress,
  clearAiCache,
  getReviewDueTopics,
  applyConfidenceDecay,
} from '../queries/progress';

export const profileRepository = {
  getProfile: getUserProfile,
  updateProfile: updateUserProfileQuery,
  addXp,
  updateStreak,
  useStreakShield,
  getDaysToExam,
  resetStudyProgress,
  clearAiCache,
  getReviewDueTopics,
  applyConfidenceDecay,
};

export type { UserProfile };
