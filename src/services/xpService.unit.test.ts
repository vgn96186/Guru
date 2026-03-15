import { getLevelInfo } from './xpService';

jest.mock('../db/repositories', () => ({
  profileRepository: {
    addXp: jest.fn(),
    getProfile: jest.fn(),
  },
}));

jest.mock('../db/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('expo-sqlite', () => ({}), { virtual: true });

describe('xpService', () => {
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
});
