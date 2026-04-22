import { sessionsRepositoryDrizzle } from '../repositories/sessionsRepository.drizzle';

export const getTotalStudyMinutes = sessionsRepositoryDrizzle.getTotalStudyMinutes;
export const getCompletedSessionCount = sessionsRepositoryDrizzle.getCompletedSessionCount;
export const createSession = sessionsRepositoryDrizzle.createSession;
export const isSessionAlreadyFinalized = sessionsRepositoryDrizzle.isSessionAlreadyFinalized;
export const endSession = sessionsRepositoryDrizzle.endSession;
export const updateSessionProgress = sessionsRepositoryDrizzle.updateSessionProgress;
export const getRecentSessions = sessionsRepositoryDrizzle.getRecentSessions;
export const getRecentlyStudiedTopicNames = sessionsRepositoryDrizzle.getRecentlyStudiedTopicNames;
export const getCompletedTopicIdsBetween = sessionsRepositoryDrizzle.getCompletedTopicIdsBetween;
export const getPreferredStudyHours = sessionsRepositoryDrizzle.getPreferredStudyHours;
export const getWeeklyComparison = sessionsRepositoryDrizzle.getWeeklyComparison;
export const calculateCurrentStreak = sessionsRepositoryDrizzle.calculateCurrentStreak;
