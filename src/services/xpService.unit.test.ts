import { getLevelInfo, grantXp, calculateAndAwardSessionXp } from './xpService';
import { profileRepository } from '../db/repositories';
import { runInTransaction } from '../db/database';
import { addXpInTx } from '../db/queries/progress';

jest.mock('../db/repositories', () => ({
  profileRepository: {
    addXp: jest.fn(),
    getProfile: jest.fn(),
  },
}));

jest.mock('../db/database', () => {
  const txDb = {
    runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
  };
  return {
    getDb: jest.fn(),
    runInTransaction: jest.fn(async (fn: (db: any) => Promise<any>) => fn(txDb)),
    __txDb: txDb,
  };
});

jest.mock('../db/queries/progress', () => ({
  addXpInTx: jest.fn(),
}));

jest.mock('expo-sqlite', () => ({}), { virtual: true });

// Access the txDb created inside the mock factory
const dbMod = jest.requireMock('../db/database') as any;
const mockTxDb = dbMod.__txDb;

describe('xpService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-set mocks after clearAllMocks wipes return values / implementations
    (runInTransaction as jest.Mock).mockImplementation(async (fn: (db: any) => Promise<any>) =>
      fn(mockTxDb),
    );
    (addXpInTx as jest.Mock).mockResolvedValue({ newTotal: 100, leveledUp: false, newLevel: 1 });
    mockTxDb.runAsync.mockResolvedValue({ changes: 1 });
  });

  describe('getLevelInfo', () => {
    it('calculates correct progress for a user at level 1', () => {
      const result = getLevelInfo(250, 1);
      expect(result).toEqual({
        level: 1,
        name: 'Intern',
        xpRequired: 0,
        xpForNext: 500,
        progress: 0.5,
      });
    });

    it('calculates correct progress for a user with 0 XP', () => {
      const result = getLevelInfo(0, 1);
      expect(result.progress).toBe(0);
    });

    it('calculates correct progress for an intermediate level', () => {
      const result = getLevelInfo(1000, 2);
      expect(result).toEqual({
        level: 2,
        name: 'House Officer',
        xpRequired: 500,
        xpForNext: 1500,
        progress: 0.5,
      });
    });

    it('handles maximum level gracefully (Level 10)', () => {
      const result = getLevelInfo(80000, 10);
      expect(result).toEqual({
        level: 10,
        name: 'AIIMS Director',
        xpRequired: 75000,
        xpForNext: 75000,
        progress: 1,
      });
    });

    it('handles unknown currentLevel by defaulting to the first level', () => {
      const result = getLevelInfo(100, 999);
      expect(result).toEqual({
        level: 1,
        name: 'Intern',
        xpRequired: 0,
        xpForNext: 0,
        progress: 1,
      });
    });

    it('caps progress at 1 if totalXp exceeds next level requirement', () => {
      const result = getLevelInfo(600, 1);
      expect(result.progress).toBe(1);
    });
  });

  describe('grantXp', () => {
    it('grants XP and returns level up status', async () => {
      (profileRepository.addXp as jest.Mock).mockResolvedValue({ leveledUp: true, newLevel: 2 });

      const result = await grantXp(100);
      expect(result).toEqual({ leveledUp: true, newLevel: 2 });
      expect(profileRepository.addXp).toHaveBeenCalledWith(100);
    });

    it('returns default if amount is 0 or negative', async () => {
      const result1 = await grantXp(0);
      expect(result1).toEqual({ leveledUp: false, newLevel: 1 });

      const result2 = await grantXp(-50);
      expect(result2).toEqual({ leveledUp: false, newLevel: 1 });

      expect(profileRepository.addXp).not.toHaveBeenCalled();
    });
  });

  describe('calculateAndAwardSessionXp', () => {
    beforeEach(() => {
      (profileRepository.getProfile as jest.Mock).mockResolvedValue({ streakCurrent: 0 });
    });

    it('calculates XP for topics and quizzes', async () => {
      const topics: any[] = [
        { name: 'Topic 1', progress: { status: 'unseen' } },
        { name: 'Topic 2', progress: { status: 'review' } },
      ];
      const quizzes = [{ correct: 2, total: 2 }];

      const result = await calculateAndAwardSessionXp(topics, quizzes, true);

      // Topic 1: 150 (unseen), Topic 2: 80 (review),
      // Quiz: 2*20=40, Perfect: 50, Session: 100 → 420
      expect(result.total).toBe(420);
      expect(result.breakdown).toEqual([
        { label: 'Topic 1', amount: 150 },
        { label: 'Topic 2', amount: 80 },
        { label: 'Quiz correct answers', amount: 40 },
        { label: 'Perfect quiz bonus!', amount: 50 },
        { label: 'Session complete', amount: 100 },
      ]);
      expect(addXpInTx).toHaveBeenCalledWith(420);
      expect(mockTxDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_profile SET quiz_correct_count'),
        [2],
      );
    });

    it('applies streak bonus', async () => {
      (profileRepository.getProfile as jest.Mock).mockResolvedValue({ streakCurrent: 5 });

      const topics: any[] = [{ name: 'Topic 1', progress: { status: 'review' } }];
      const result = await calculateAndAwardSessionXp(topics, [], false);

      expect(result.total).toBe(120);
      expect(result.breakdown).toContainEqual({ label: '🔥 5-day streak (+50%)', amount: 40 });
    });

    it('caps streak bonus at 50%', async () => {
      (profileRepository.getProfile as jest.Mock).mockResolvedValue({ streakCurrent: 10 });

      const topics: any[] = [{ name: 'Topic 1', progress: { status: 'review' } }];
      const result = await calculateAndAwardSessionXp(topics, [], false);

      expect(result.total).toBe(120);
    });

    it('handles empty session gracefully', async () => {
      const result = await calculateAndAwardSessionXp([], [], false);
      expect(result.total).toBe(0);
      expect(result.breakdown).toEqual([]);
      expect(addXpInTx).toHaveBeenCalledWith(0);
    });

    it('does not award perfect bonus if quiz has 0 questions', async () => {
      const quizzes = [{ correct: 0, total: 0 }];
      const result = await calculateAndAwardSessionXp([], quizzes, false);
      expect(result.total).toBe(0);
      expect(result.breakdown).not.toContainEqual(
        expect.objectContaining({ label: 'Perfect quiz bonus!' }),
      );
    });
  });
});
