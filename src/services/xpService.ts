import { XP_REWARDS, LEVELS } from '../constants/gamification';
import { addXp } from '../db/queries/progress';
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

export function calculateAndAwardSessionXp(
  completedTopics: TopicWithProgress[],
  quizResults: Array<{ correct: number; total: number }>,
  isFirstSessionToday: boolean,
): SessionXpResult {
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
    const { getDb } = require('../db/database');
    getDb().runSync('UPDATE user_profile SET quiz_correct_count = quiz_correct_count + ? WHERE id = 1', [totalQuizCorrect]);
  }

  if (isFirstSessionToday) {
    breakdown.push({ label: 'Session complete', amount: XP_REWARDS.SESSION_COMPLETE });
  }

  let total = breakdown.reduce((s, b) => s + b.amount, 0);

  // 15% chance for a Lucky Day 2x multiplier
  if (Math.random() < 0.15) {
    total *= 2;
    breakdown.push({ label: '🎰 Lucky Day! 2x Multiplier', amount: total / 2 });
  }

  const { newTotal, leveledUp, newLevel } = addXp(total);

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
