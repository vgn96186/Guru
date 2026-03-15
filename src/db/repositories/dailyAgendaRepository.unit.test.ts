import { dailyAgendaRepository } from './dailyAgendaRepository';
import { getDb } from '../database';

jest.mock('../database', () => ({
  getDb: jest.fn(),
}));

describe('dailyAgendaRepository', () => {
  const mockDb = {
    getFirstAsync: jest.fn(),
    runAsync: jest.fn(),
  };

  beforeEach(() => {
    (getDb as any).mockResolvedValue(mockDb);
    jest.clearAllMocks();
  });

  it('gets a daily plan by date', async () => {
    const mockPlan = { blocks: [], guruNote: 'Focus!' };
    mockDb.getFirstAsync.mockResolvedValue({ plan_json: JSON.stringify(mockPlan) });

    const result = await dailyAgendaRepository.getDailyAgenda('2026-03-14');
    expect(result).toEqual(mockPlan);
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      'SELECT plan_json FROM daily_plan WHERE date = ?',
      ['2026-03-14'],
    );
  });

  it('returns null if no plan exists for date', async () => {
    mockDb.getFirstAsync.mockResolvedValue(null);
    const result = await dailyAgendaRepository.getDailyAgenda('2026-03-14');
    expect(result).toBeNull();
  });

  it('saves a daily plan', async () => {
    const mockPlan = { blocks: [], guruNote: 'Focus!' };
    await dailyAgendaRepository.saveDailyAgenda('2026-03-14', mockPlan as any);

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO daily_plan'),
      ['2026-03-14', JSON.stringify(mockPlan), 'guru', expect.any(Number), expect.any(Number)],
    );
  });

  it('deletes a daily plan', async () => {
    await dailyAgendaRepository.deleteDailyAgenda('2026-03-14');
    expect(mockDb.runAsync).toHaveBeenCalledWith('DELETE FROM daily_plan WHERE date = ?', [
      '2026-03-14',
    ]);
  });
});
