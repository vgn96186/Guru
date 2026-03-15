// Mock expo-sqlite FIRST, before anything else
jest.mock(
  'expo-sqlite',
  () => ({
    openDatabaseSync: jest.fn(),
    useSQLiteContext: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  'expo-asset',
  () => ({
    Asset: {
      loadAsync: jest.fn(),
    },
  }),
  { virtual: true },
);

import { dailyAgendaRepository } from './dailyAgendaRepository';
import { getDb } from '../database';

const mockDb = {
  runAsync: jest.fn(),
  getFirstAsync: jest.fn(),
  getAllAsync: jest.fn(),
  execAsync: jest.fn(),
};

jest.mock('../database', () => {
  return {
    getDb: jest.fn(() => mockDb),
    todayStr: jest.fn(() => '2023-10-27'),
    dateStr: jest.fn((d: Date) => d.toISOString().split('T')[0]),
  };
});

describe('dailyAgendaRepository', () => {
  beforeEach(() => {
    (getDb as jest.Mock).mockReturnValue(mockDb);
    jest.clearAllMocks();
  });

  it('gets a daily plan by date', async () => {
    const mockPlan = { date: '2026-03-14', tasks: [] };
    (getDb().getFirstAsync as jest.Mock).mockResolvedValue({ plan_json: JSON.stringify(mockPlan) });

    const result = await dailyAgendaRepository.getDailyAgenda('2026-03-14');

    expect(result).toEqual(mockPlan);
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      'SELECT plan_json FROM daily_agenda WHERE date = ?',
      ['2026-03-14'],
    );
  });

  it('returns null if no plan exists for date', async () => {
    (getDb().getFirstAsync as jest.Mock).mockResolvedValue(null);

    const result = await dailyAgendaRepository.getDailyAgenda('2023-10-27');

    expect(result).toBeNull();
  });

  it('saves a daily plan', async () => {
    const mockPlan = { date: '2026-03-14', tasks: [] } as any;
    (getDb().runAsync as jest.Mock).mockResolvedValue(undefined);

    await dailyAgendaRepository.saveDailyAgenda('2026-03-14', mockPlan, 'guru');

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO daily_agenda'),
      ['2026-03-14', JSON.stringify(mockPlan), 'guru', expect.any(Number), expect.any(Number)],
    );
  });

  it('deletes a daily plan', async () => {
    (getDb().runAsync as jest.Mock).mockResolvedValue(undefined);

    await dailyAgendaRepository.deleteDailyAgenda('2026-03-14');
    expect(mockDb.runAsync).toHaveBeenCalledWith('DELETE FROM daily_agenda WHERE date = ?', [
      '2026-03-14',
    ]);
  });
});
