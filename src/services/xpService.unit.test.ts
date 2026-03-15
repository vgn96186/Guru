import { XP_REWARDS, LEVELS } from '../constants/gamification';
import { grantXp, calculateAndAwardSessionXp, getLevelInfo } from './xpService';
import { profileRepository } from '../db/repositories';
import { getDb } from '../db/database';
import type { TopicWithProgress } from '../types';

jest.mock('../db/repositories', () => ({
  profileRepository: {
    getProfile: jest.fn(),
    addXp: jest.fn(),
  },
}));

jest.mock('../db/database', () => ({
  getDb: jest.fn(),
}));

describe('xpService', () => {
  let mockRunAsync: jest.Mock;

  beforeEach(() => {
    jest.restoreAllMocks();
    mockRunAsync = jest.fn().mockResolvedValue(undefined);
    (getDb as jest.Mock).mockReturnValue({
      runAsync: mockRunAsync,
    });
  });

  describe('grantXp', () => {
    it('returns early with 0 level gain if amount <= 0', async () => {
      const result = await grantXp(0);
      expect(result).toEqual({ leveledUp: false, newLevel: 1 });
      expect(profileRepository.addXp).not.toHaveBeenCalled();

      const resultNegative = await grantXp(-10);
      expect(resultNegative).toEqual({ leveledUp: false, newLevel: 1 });
      expect(profileRepository.addXp).not.toHaveBeenCalled();
    });

    it('delegates to profileRepository.addXp when amount > 0', async () => {
      (profileRepository.addXp as jest.Mock).mockResolvedValue({
        leveledUp: true,
        newLevel: 2,
        newTotal: 500,
      });

      const result = await grantXp(100);
      expect(profileRepository.addXp).toHaveBeenCalledWith(100);
      expect(result).toEqual({ leveledUp: true, newLevel: 2 });
    });
  });

  describe('calculateAndAwardSessionXp', () => {
    const defaultProfile = { streakCurrent: 0 };
    const mockTopics = [
      {
        id: 1,
        name: 'Topic Unseen',
        progress: { status: 'unseen' },
      } as unknown as TopicWithProgress,
      {
        id: 2,
        name: 'Topic Review',
        progress: { status: 'review' },
      } as unknown as TopicWithProgress,
    ];

    beforeEach(() => {
      (profileRepository.getProfile as jest.Mock).mockResolvedValue(defaultProfile);
      (profileRepository.addXp as jest.Mock).mockResolvedValue({
        leveledUp: false,
        newLevel: 1,
        newTotal: 1000,
      });
    });

    it('calculates baseline XP from completed topics correctly', async () => {
      const result = await calculateAndAwardSessionXp(mockTopics, [], false);

      const expectedTotal = XP_REWARDS.TOPIC_UNSEEN + XP_REWARDS.TOPIC_REVIEW;

      expect(result.total).toBe(expectedTotal);
      expect(result.breakdown).toEqual([
        { label: 'Topic Unseen', amount: XP_REWARDS.TOPIC_UNSEEN },
        { label: 'Topic Review', amount: XP_REWARDS.TOPIC_REVIEW },
      ]);
      expect(profileRepository.addXp).toHaveBeenCalledWith(expectedTotal);
      expect(mockRunAsync).not.toHaveBeenCalled(); // No quiz correct count
    });

    it('adds quiz XP properly and updates quiz correct count in DB', async () => {
      const quizResults = [
        { correct: 3, total: 5 }, // Partial
        { correct: 2, total: 2 }, // Perfect
      ];

      const result = await calculateAndAwardSessionXp([], quizResults, false);

      const partialXp = 3 * XP_REWARDS.QUIZ_CORRECT;
      const perfectQuizTotalXp = 2 * XP_REWARDS.QUIZ_CORRECT;
      const perfectBonusXp = XP_REWARDS.QUIZ_PERFECT;

      const expectedTotal = partialXp + perfectQuizTotalXp + perfectBonusXp;

      expect(result.total).toBe(expectedTotal);
      expect(result.breakdown).toEqual([
        { label: 'Quiz correct answers', amount: partialXp },
        { label: 'Quiz correct answers', amount: perfectQuizTotalXp },
        { label: 'Perfect quiz bonus!', amount: perfectBonusXp },
      ]);

      // total correct = 3 + 2 = 5
      expect(mockRunAsync).toHaveBeenCalledWith(
        'UPDATE user_profile SET quiz_correct_count = quiz_correct_count + ? WHERE id = 1',
        [5]
      );
      expect(profileRepository.addXp).toHaveBeenCalledWith(expectedTotal);
    });

    it('adds session complete XP when isFirstSessionToday is true', async () => {
      const result = await calculateAndAwardSessionXp([], [], true);

      expect(result.total).toBe(XP_REWARDS.SESSION_COMPLETE);
      expect(result.breakdown).toEqual([
        { label: 'Session complete', amount: XP_REWARDS.SESSION_COMPLETE },
      ]);
      expect(profileRepository.addXp).toHaveBeenCalledWith(XP_REWARDS.SESSION_COMPLETE);
    });

    it('calculates streak bonus correctly (10% per streak day, max 50%)', async () => {
      // Setup profile with a 3-day streak -> 30% bonus
      (profileRepository.getProfile as jest.Mock).mockResolvedValue({
        streakCurrent: 3,
      });

      // Total XP base = 100 (Session complete)
      const result = await calculateAndAwardSessionXp([], [], true);

      const baseAmount = XP_REWARDS.SESSION_COMPLETE;
      const streakBonusAmount = Math.round(baseAmount * 0.3); // 30
      const expectedTotal = baseAmount + streakBonusAmount;

      expect(result.total).toBe(expectedTotal);
      expect(result.breakdown).toEqual([
        { label: 'Session complete', amount: baseAmount },
        { label: '🔥 3-day streak (+30%)', amount: streakBonusAmount },
      ]);
      expect(profileRepository.addXp).toHaveBeenCalledWith(expectedTotal);
    });

    it('caps streak bonus at 50% for streaks > 5', async () => {
      // 10-day streak -> max 50% bonus
      (profileRepository.getProfile as jest.Mock).mockResolvedValue({
        streakCurrent: 10,
      });

      const result = await calculateAndAwardSessionXp([], [], true);

      const baseAmount = XP_REWARDS.SESSION_COMPLETE;
      const streakBonusAmount = Math.round(baseAmount * 0.5); // 50
      const expectedTotal = baseAmount + streakBonusAmount;

      expect(result.total).toBe(expectedTotal);
      expect(result.breakdown).toContainEqual(
        { label: '🔥 10-day streak (+50%)', amount: streakBonusAmount }
      );
      expect(profileRepository.addXp).toHaveBeenCalledWith(expectedTotal);
    });

    it('handles leveling up correctly and returns the correct newLevelName', async () => {
      (profileRepository.addXp as jest.Mock).mockResolvedValue({
        leveledUp: true,
        newLevel: 2, // House Officer
        newTotal: 600,
      });

      const result = await calculateAndAwardSessionXp([], [], false);

      expect(result.leveledUp).toBe(true);
      expect(result.newLevel).toBe(2);
      expect(result.newLevelName).toBe('House Officer'); // From LEVELS constant
    });

    it('defaults to level 1 name if level is somehow not found', async () => {
      (profileRepository.addXp as jest.Mock).mockResolvedValue({
        leveledUp: true,
        newLevel: 999, // Unmatched level
        newTotal: 999999,
      });

      const result = await calculateAndAwardSessionXp([], [], false);

      expect(result.leveledUp).toBe(true);
      expect(result.newLevel).toBe(999);
      expect(result.newLevelName).toBe(LEVELS[0].name); // Intern
    });

    it('returns zero XP if no activities are completed and not first session', async () => {
      const result = await calculateAndAwardSessionXp([], [], false);

      expect(result.total).toBe(0);
      expect(result.breakdown).toEqual([]);
      expect(profileRepository.addXp).toHaveBeenCalledWith(0);
      expect(mockRunAsync).not.toHaveBeenCalled();
    });
  });

  describe('getLevelInfo', () => {
    it('returns the correct level info for a valid total XP and level', () => {
      // Level 1: 0 XP required, Level 2: 500 XP required.
      // Total 250 XP at Level 1 should be 50% progress.
      const result = getLevelInfo(250, 1);

      expect(result).toEqual({
        level: 1,
        name: 'Intern',
        xpRequired: 0,
        xpForNext: 500,
        progress: 0.5,
      });
    });

    it('caps progress at 1 if total XP somehow exceeds the requirement for the next level without updating level yet', () => {
      const result = getLevelInfo(1000, 1);

      expect(result.progress).toBe(1);
    });

    it('handles max level gracefully without throwing', () => {
      // Max level is 10
      const maxLevel = LEVELS[LEVELS.length - 1];
      const result = getLevelInfo(100000, 10);

      expect(result).toEqual({
        level: 10,
        name: maxLevel.name,
        xpRequired: maxLevel.xpRequired,
        xpForNext: maxLevel.xpRequired, // Next level requirement falls back to current level
        progress: 1, // Math.min(1, >0 / 1)
      });
    });

    it('falls back to level 1 if current level is not found', () => {
      const result = getLevelInfo(100, 999);

      expect(result.level).toBe(1);
      expect(result.name).toBe('Intern');
    });
  });
});
