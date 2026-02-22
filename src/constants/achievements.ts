import { getDb } from '../db/database';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  emoji: string;
  check: () => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_session',
    title: 'First Step',
    description: 'Complete your first study session',
    emoji: '🎯',
    check: () => {
      const r = getDb().getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM sessions WHERE ended_at IS NOT NULL');
      return (r?.count ?? 0) >= 1;
    },
  },
  {
    id: 'ten_topics',
    title: 'Getting Serious',
    description: 'Study 10 topics',
    emoji: '📚',
    check: () => {
      const r = getDb().getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM topic_progress WHERE status != 'unseen'`);
      return (r?.count ?? 0) >= 10;
    },
  },
  {
    id: 'fifty_topics',
    title: 'Knowledge Builder',
    description: 'Study 50 topics',
    emoji: '🏗️',
    check: () => {
      const r = getDb().getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM topic_progress WHERE status != 'unseen'`);
      return (r?.count ?? 0) >= 50;
    },
  },
  {
    id: 'ten_mastered',
    title: 'Mastermind',
    description: 'Master 10 topics',
    emoji: '⭐',
    check: () => {
      const r = getDb().getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM topic_progress WHERE status = 'mastered'`);
      return (r?.count ?? 0) >= 10;
    },
  },
  {
    id: 'fifty_mastered',
    title: 'Expert',
    description: 'Master 50 topics',
    emoji: '🏆',
    check: () => {
      const r = getDb().getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM topic_progress WHERE status = 'mastered'`);
      return (r?.count ?? 0) >= 50;
    },
  },
  {
    id: 'streak_3',
    title: 'Consistent',
    description: '3-day study streak',
    emoji: '🔥',
    check: () => {
      const r = getDb().getFirstSync<{ streak_current: number }>('SELECT streak_current FROM user_profile WHERE id = 1');
      return (r?.streak_current ?? 0) >= 3;
    },
  },
  {
    id: 'streak_7',
    title: 'One Week Warrior',
    description: '7-day study streak',
    emoji: '🗓️',
    check: () => {
      const r = getDb().getFirstSync<{ streak_current: number }>('SELECT streak_current FROM user_profile WHERE id = 1');
      return (r?.streak_current ?? 0) >= 7;
    },
  },
  {
    id: 'streak_30',
    title: 'Unstoppable',
    description: '30-day study streak',
    emoji: '💎',
    check: () => {
      const r = getDb().getFirstSync<{ streak_best: number }>('SELECT streak_best FROM user_profile WHERE id = 1');
      return (r?.streak_best ?? 0) >= 30;
    },
  },
  {
    id: 'xp_1000',
    title: 'XP Collector',
    description: 'Earn 1,000 XP',
    emoji: '✨',
    check: () => {
      const r = getDb().getFirstSync<{ total_xp: number }>('SELECT total_xp FROM user_profile WHERE id = 1');
      return (r?.total_xp ?? 0) >= 1000;
    },
  },
  {
    id: 'xp_10000',
    title: 'XP Legend',
    description: 'Earn 10,000 XP',
    emoji: '👑',
    check: () => {
      const r = getDb().getFirstSync<{ total_xp: number }>('SELECT total_xp FROM user_profile WHERE id = 1');
      return (r?.total_xp ?? 0) >= 10000;
    },
  },
  {
    id: 'quiz_correct_50',
    title: 'Quiz Ace',
    description: 'Answer 50 quiz questions correctly',
    emoji: '🎯',
    check: () => {
      const r = getDb().getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM sessions WHERE mode != 'external' AND ended_at IS NOT NULL`);
      return (r?.count ?? 0) >= 10; // proxy: 10 completed sessions ≈ 50+ correct
    },
  },
  {
    id: 'mock_test',
    title: 'Exam Ready',
    description: 'Complete a mock test',
    emoji: '📝',
    check: () => {
      const r = getDb().getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM sessions WHERE mode = 'mock'`);
      return (r?.count ?? 0) >= 1;
    },
  },
  {
    id: 'boss_battle',
    title: 'Boss Slayer',
    description: 'Win a Boss Battle',
    emoji: '⚔️',
    check: () => {
      const r = getDb().getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM sessions WHERE mode = 'boss'`);
      return (r?.count ?? 0) >= 1;
    },
  },
  {
    id: 'five_subjects',
    title: 'Well Rounded',
    description: 'Study topics in 5 different subjects',
    emoji: '🌐',
    check: () => {
      const r = getDb().getFirstSync<{ count: number }>(`
        SELECT COUNT(DISTINCT t.subject_id) as count
        FROM topic_progress tp JOIN topics t ON t.id = tp.topic_id
        WHERE tp.status != 'unseen'
      `);
      return (r?.count ?? 0) >= 5;
    },
  },
  {
    id: 'hour_grind',
    title: 'Marathon Runner',
    description: 'Study for 60+ minutes in one day',
    emoji: '⏱️',
    check: () => {
      const r = getDb().getFirstSync<{ max_min: number }>('SELECT MAX(total_minutes) as max_min FROM daily_log');
      return (r?.max_min ?? 0) >= 60;
    },
  },
];

export function getUnlockedAchievements(): Achievement[] {
  try {
    return ACHIEVEMENTS.filter(a => { try { return a.check(); } catch { return false; } });
  } catch {
    return [];
  }
}
