// Mock expo-sqlite FIRST, before anything else
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(),
  useSQLiteContext: jest.fn(),
}), { virtual: true });

jest.mock('expo-asset', () => ({
  Asset: {
    loadAsync: jest.fn(),
  },
}), { virtual: true });

import { grantXp, calculateAndAwardSessionXp, getLevelInfo } from './xpService';
import { profileRepository } from '../db/repositories';
import { getDb } from '../db/database';
import { XP_REWARDS, LEVELS } from '../constants/gamification';

// Mock dependencies
jest.mock('../db/repositories', () => ({
  profileRepository: {
    addXp: jest.fn(),
    getProfile: jest.fn(),
  },
}));

jest.mock('../db/database', () => {
  const mockDb = {
    runAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
    execAsync: jest.fn(),
  };
  return {
    getDb: jest.fn(() => mockDb),
    todayStr: jest.fn(() => '2023-10-27'),
    dateStr: jest.fn((d: Date) => d.toISOString().split('T')[0]),
  };
});

describe('xpService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('grantXp', () => {
    it('returns default object if amount is 0 or less', async () => {
      const result = await grantXp(0);
      expect(result).toEqual({ leveledUp: false, newLevel: 1 });
      expect(profileRepository.addXp).not.toHaveBeenCalled();

      const resultNegative = await grantXp(-10);
      expect(resultNegative).toEqual({ leveledUp: false, newLevel: 1 });
      expect(profileRepository.addXp).not.toHaveBeenCalled();
    });

    it('calls addXp and returns its result if amount is greater than 0', async () => {
      (profileRepository.addXp as jest.Mock).mockResolvedValue({
        leveledUp: true,
        newLevel: 2,
        newTotal: 500,
      });

      const result = await grantXp(100);
      expect(result).toEqual({ leveledUp: true, newLevel: 2 });
      expect(profileRepository.addXp).toHaveBeenCalledWith(100);
    });
  });

  describe('calculateAndAwardSessionXp', () => {
    const mockTopics: any[] = [
      { name: 'Topic A', progress: { status: 'unseen' } },
      { name: 'Topic B', progress: { status: 'seen' } },
    ];

    beforeEach(() => {
      (profileRepository.getProfile as jest.Mock).mockResolvedValue({ streakCurrent: 0 });
      (profileRepository.addXp as jest.Mock).mockResolvedValue({
        newTotal: 500,
        leveledUp: false,
        newLevel: 2,
      });
      (getDb().runAsync as jest.Mock).mockResolvedValue(undefined);
    });

    it('calculates XP breakdown and awards XP correctly', async () => {
      const quizResults = [{ correct: 4, total: 5 }, { correct: 2, total: 2 }];
      const isFirstSessionToday = true;

      const result = await calculateAndAwardSessionXp(mockTopics as any, quizResults, isFirstSessionToday);

      const expectedTotal =
        XP_REWARDS.TOPIC_UNSEEN +
        XP_REWARDS.TOPIC_REVIEW +
        (4 * XP_REWARDS.QUIZ_CORRECT) +
        (2 * XP_REWARDS.QUIZ_CORRECT) +
        XP_REWARDS.QUIZ_PERFECT +
        XP_REWARDS.SESSION_COMPLETE;

      expect(result.total).toBe(expectedTotal);
      expect(result.leveledUp).toBe(false);
      expect(result.newLevel).toBe(2);
      expect(result.newLevelName).toBe(LEVELS[1].name);

      expect(profileRepository.addXp).toHaveBeenCalledWith(expectedTotal);
      expect(getDb().runAsync).toHaveBeenCalledWith(
        'UPDATE user_profile SET quiz_correct_count = quiz_correct_count + ? WHERE id = 1',
        [6] // 4 + 2 total correct
      );
    });

    it('applies streak bonus up to 50%', async () => {
      (profileRepository.getProfile as jest.Mock).mockResolvedValue({ streakCurrent: 10 }); // 10 days = 100%, but capped at 50%

      const quizResults: any[] = [];
      const isFirstSessionToday = false;

      const result = await calculateAndAwardSessionXp(mockTopics as any, quizResults, isFirstSessionToday);

      const baseTotal = XP_REWARDS.TOPIC_UNSEEN + XP_REWARDS.TOPIC_REVIEW;
      const expectedBonus = Math.round(baseTotal * 0.5); // 50% cap
      const expectedTotal = baseTotal + expectedBonus;

      expect(result.total).toBe(expectedTotal);
      expect(profileRepository.addXp).toHaveBeenCalledWith(expectedTotal);

      const bonusBreakdown = result.breakdown.find(b => b.label.includes('streak'));
      expect(bonusBreakdown).toBeDefined();
      expect(bonusBreakdown?.amount).toBe(expectedBonus);
    });
  });

  describe('getLevelInfo', () => {
    it('returns correct level info for a valid total and current level', () => {
      const currentLevel = 2; // xpRequired: 500
      const totalXp = 1000;
      // next level 3 xpRequired: 1500

      const result = getLevelInfo(totalXp, currentLevel);

      expect(result).toEqual({
        level: 2,
        name: LEVELS[1].name,
        xpRequired: 500,
        xpForNext: 1500,
        progress: (1000 - 500) / (1500 - 500), // 500 / 1000 = 0.5
      });
    });

    it('caps progress at 1 if totalXp exceeds next level requirement', () => {
      const currentLevel = 2; // xpRequired: 500
      const totalXp = 2000; // exceeding next level (1500)

      const result = getLevelInfo(totalXp, currentLevel);

      expect(result.progress).toBe(1);
    });

    it('handles max level (no next level)', () => {
      const maxLevelIndex = LEVELS.length - 1;
      const currentLevel = LEVELS[maxLevelIndex].level;
      const totalXp = LEVELS[maxLevelIndex].xpRequired + 1000;

      const result = getLevelInfo(totalXp, currentLevel);

      expect(result.xpForNext).toBe(LEVELS[maxLevelIndex].xpRequired);
      expect(result.progress).toBe(1);
    });

    it('defaults to first level if currentLevel is not found', () => {
      const result = getLevelInfo(0, 999);
      expect(result.level).toBe(LEVELS[0].level);
    });
  });
});
