import { dailyAgendaRepository } from './dailyAgendaRepository';
import { dailyAgendaRepositoryDrizzle } from './dailyAgendaRepository.drizzle';

jest.mock('./dailyAgendaRepository.drizzle', () => ({
  dailyAgendaRepositoryDrizzle: {
    getDailyAgenda: jest.fn(),
    saveDailyAgenda: jest.fn(),
    deleteDailyAgenda: jest.fn(),
    logPlanEvent: jest.fn(),
  },
}));

describe('dailyAgendaRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates getDailyAgenda to the Drizzle repository', async () => {
    const mockPlan = { date: '2026-03-14', tasks: [] };
    (dailyAgendaRepositoryDrizzle.getDailyAgenda as jest.Mock).mockResolvedValue(mockPlan);

    const result = await dailyAgendaRepository.getDailyAgenda('2026-03-14');

    expect(dailyAgendaRepositoryDrizzle.getDailyAgenda).toHaveBeenCalledWith('2026-03-14');
    expect(result).toEqual(mockPlan);
  });

  it('delegates saveDailyAgenda to the Drizzle repository', async () => {
    const mockPlan = { date: '2026-03-14', tasks: [] } as any;

    await dailyAgendaRepository.saveDailyAgenda('2026-03-14', mockPlan, 'guru');

    expect(dailyAgendaRepositoryDrizzle.saveDailyAgenda).toHaveBeenCalledWith(
      '2026-03-14',
      mockPlan,
      'guru',
    );
  });

  it('delegates deleteDailyAgenda to the Drizzle repository', async () => {
    await dailyAgendaRepository.deleteDailyAgenda('2026-03-14');

    expect(dailyAgendaRepositoryDrizzle.deleteDailyAgenda).toHaveBeenCalledWith('2026-03-14');
  });

  it('delegates logPlanEvent to the Drizzle repository', async () => {
    const mockPayload = { foo: 'bar' };

    await dailyAgendaRepository.logPlanEvent('2026-03-14', 'test_event', mockPayload);

    expect(dailyAgendaRepositoryDrizzle.logPlanEvent).toHaveBeenCalledWith(
      '2026-03-14',
      'test_event',
      mockPayload,
    );
  });
});
