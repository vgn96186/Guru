import { XP_REWARDS, LEVELS } from '../constants/gamification';
import { profileRepository } from '../db/repositories';
import { getDb } from '../db/database';
import type { TopicWithProgress, LevelInfo } from '../types';

export interface XpBreakdown {
  label: string;
  amount: number;
}

export interface SessionXpResult {
  total: number;
  breakdown: XpBreakdown[];
  leveledUp: boolean;
  newLevel: number;
  newLevelName: string;
}

export async function grantXp(amount: number): Promise<{ leveledUp: boolean; newLevel: number }> {
  if (amount <= 0) return { leveledUp: false, newLevel: 1 };
  const { leveledUp, newLevel } = await profileRepository.addXp(amount);
  return { leveledUp, newLevel };
}

export async function calculateAndAwardSessionXp(
  completedTopics: TopicWithProgress[],
  quizResults: Array<{ correct: number; total: number }>,
  isFirstSessionToday: boolean,
): Promise<SessionXpResult> {
  const breakdown: XpBreakdown[] = [];
  let totalQuizCorrect = 0;

  for (const topic of completedTopics) {
    const isUnseen = topic.progress.status === 'unseen';
    const xp = isUnseen ? XP_REWARDS.TOPIC_UNSEEN : XP_REWARDS.TOPIC_REVIEW;
    breakdown.push({ label: `${topic.name}`, amount: xp });
  }

  for (const result of quizResults) {
    if (result.correct > 0) {
      totalQuizCorrect += result.correct;
      breakdown.push({ label: 'Quiz correct answers', amount: result.correct * XP_REWARDS.QUIZ_CORRECT });
    }
    if (result.correct === result.total && result.total > 0) {
      breakdown.push({ label: 'Perfect quiz bonus!', amount: XP_REWARDS.QUIZ_PERFECT });
    }
  }

  if (totalQuizCorrect > 0) {
    await getDb().runAsync('UPDATE user_profile SET quiz_correct_count = quiz_correct_count + ? WHERE id = 1', [totalQuizCorrect]);
  }

  if (isFirstSessionToday) {
    breakdown.push({ label: 'Session complete', amount: XP_REWARDS.SESSION_COMPLETE });
  }

  let total = breakdown.reduce((s, b) => s + b.amount, 0);

  // Streak bonus: 10% per streak day, max 50%
  const _profile = await profileRepository.getProfile();
  const streakBonus = Math.min((_profile.streakCurrent ?? 0) * 0.1, 0.5);
  if (streakBonus > 0) {
    const bonus = Math.round(total * streakBonus);
    total += bonus;
    breakdown.push({ label: `🔥 ${_profile.streakCurrent}-day streak (+${Math.round(streakBonus * 100)}%)`, amount: bonus });
  }

  const { newTotal, leveledUp, newLevel } = await profileRepository.addXp(total);

  const levelInfo = LEVELS.find(l => l.level === newLevel) ?? LEVELS[0];

  return { total, breakdown, leveledUp, newLevel, newLevelName: levelInfo.name };
}

export function getLevelInfo(totalXp: number, currentLevel: number): LevelInfo {
  const level = LEVELS.find(l => l.level === currentLevel) ?? LEVELS[0];
  const nextLevel = LEVELS.find(l => l.level === currentLevel + 1);

  const xpInCurrentLevel = totalXp - level.xpRequired;
  const xpForNext = nextLevel ? nextLevel.xpRequired - level.xpRequired : 1;
  const progress = Math.min(1, xpInCurrentLevel / xpForNext);

  return {
    level: level.level,
    name: level.name,
    xpRequired: level.xpRequired,
    xpForNext: nextLevel?.xpRequired ?? level.xpRequired,
    progress,
  };
}
