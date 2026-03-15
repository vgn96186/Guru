import { dateStr } from './database';

describe('database utils', () => {
  describe('dateStr', () => {
    it('returns a correctly formatted YYYY-MM-DD string', () => {
      // Note: Date months are 0-indexed in the constructor (9 is October)
      const date = new Date(2024, 9, 15);
      expect(dateStr(date)).toBe('2024-10-15');
    });

    it('adds zero-padding for single-digit months and days', () => {
      // 0 is January, 5 is the 5th day
      const date = new Date(2024, 0, 5);
      expect(dateStr(date)).toBe('2024-01-05');
    });

    it('handles end-of-year dates correctly', () => {
      // 11 is December, 31 is the 31st day
      const date = new Date(2024, 11, 31);
      expect(dateStr(date)).toBe('2024-12-31');
    });
  });
});
