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

import { dailyAgendaRepository } from './dailyAgendaRepository';
import { getDb } from '../database';

jest.mock('../database', () => {
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

describe('dailyAgendaRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('gets a daily plan by date', async () => {
    const mockPlan = { date: '2023-10-27', tasks: [] };
    (getDb().getFirstAsync as jest.Mock).mockResolvedValue({ plan_json: JSON.stringify(mockPlan) });

    const result = await dailyAgendaRepository.getDailyAgenda('2023-10-27');

    expect(result).toEqual(mockPlan);
    expect(getDb().getFirstAsync).toHaveBeenCalledWith(
      'SELECT plan_json FROM daily_agenda WHERE date = ?',
      ['2023-10-27']
    );
  });

  it('returns null if no plan exists for date', async () => {
    (getDb().getFirstAsync as jest.Mock).mockResolvedValue(null);

    const result = await dailyAgendaRepository.getDailyAgenda('2023-10-27');

    expect(result).toBeNull();
  });

  it('saves a daily plan', async () => {
    const mockPlan = { date: '2023-10-27', tasks: [] } as any;
    (getDb().runAsync as jest.Mock).mockResolvedValue(undefined);

    await dailyAgendaRepository.saveDailyAgenda('2023-10-27', mockPlan, 'AI');

    expect(getDb().runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO daily_agenda'),
      expect.arrayContaining(['2023-10-27', JSON.stringify(mockPlan), 'AI'])
    );
  });

  it('deletes a daily plan', async () => {
    (getDb().runAsync as jest.Mock).mockResolvedValue(undefined);

    await dailyAgendaRepository.deleteDailyAgenda('2023-10-27');

    expect(getDb().runAsync).toHaveBeenCalledWith(
      'DELETE FROM daily_agenda WHERE date = ?',
      ['2023-10-27']
    );
  });
});
