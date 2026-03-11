import {
  calculateCurrentStreakFromDailyLogs,
  getWeekBoundaries,
  summarizeWeeklyRows,
} from './sessionMetrics';

describe('sessionMetrics', () => {
  it('summarizes weekly rows', () => {
    const summary = summarizeWeeklyRows([
      { startedAt: 1, durationMinutes: 30, completedTopicsJson: '[1,2]' },
      { startedAt: 2, durationMinutes: 45, completedTopicsJson: '[3]' },
      { startedAt: 3, durationMinutes: 0, completedTopicsJson: 'invalid-json' },
    ]);

    expect(summary).toEqual({ minutes: 75, sessions: 3, topics: 3 });
  });

  it('computes week boundaries from monday', () => {
    const now = new Date('2026-03-11T15:30:00.000Z').getTime(); // Wednesday
    const { thisWeekStart, lastWeekStart } = getWeekBoundaries(now);
    const thisWeek = new Date(thisWeekStart);
    const lastWeek = new Date(lastWeekStart);

    expect(thisWeek.getDay()).toBe(1); // Monday (local time)
    expect(thisWeek.getHours()).toBe(0);
    expect(thisWeek.getMinutes()).toBe(0);
    expect(thisWeek.getSeconds()).toBe(0);
    expect((thisWeekStart - lastWeekStart) / 86_400_000).toBe(7);
    expect(lastWeek.getDay()).toBe(1);
  });

  it('calculates streak from descending daily logs', () => {
    const rows = [
      { date: '2026-03-11', totalMinutes: 40, sessionCount: 2 },
      { date: '2026-03-10', totalMinutes: 25, sessionCount: 1 },
      { date: '2026-03-09', totalMinutes: 0, sessionCount: 0 },
      { date: '2026-03-08', totalMinutes: 15, sessionCount: 1 },
    ];

    const streak = calculateCurrentStreakFromDailyLogs(rows, new Date('2026-03-11T10:00:00.000Z'));
    expect(streak).toBe(2);
  });
});
