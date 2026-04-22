import { getDrizzleDb } from '../drizzle';
import { dailyAgendaRepositoryDrizzle } from './dailyAgendaRepository.drizzle';

jest.mock('../drizzle', () => ({
  getDrizzleDb: jest.fn(),
}));

type DailyAgendaRow = {
  id: number;
  date: string;
  planJson: string;
  source: string | null;
  createdAt: number;
  updatedAt: number;
};

function createSelectChain(rows: DailyAgendaRow[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
}

describe('dailyAgendaRepositoryDrizzle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getDailyAgenda returns parsed JSON plan for the latest row', async () => {
    const selectChain = createSelectChain([
      {
        id: 2,
        date: '2026-04-21',
        planJson: JSON.stringify({
          blocks: [
            {
              id: 'b1',
              title: 'Review CVS',
              topicIds: [1, 2],
              durationMinutes: 45,
              type: 'review',
              why: 'due topics',
            },
          ],
          guruNote: 'Do reviews first',
          prioritySubjectId: 7,
        }),
        source: 'guru',
        createdAt: 1,
        updatedAt: 2,
      },
    ]);
    const select = jest.fn().mockReturnValue(selectChain);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select });

    const result = await dailyAgendaRepositoryDrizzle.getDailyAgenda('2026-04-21');

    expect(selectChain.limit).toHaveBeenCalledWith(1);
    expect(result).toEqual({
      blocks: [
        {
          id: 'b1',
          title: 'Review CVS',
          topicIds: [1, 2],
          durationMinutes: 45,
          type: 'review',
          why: 'due topics',
        },
      ],
      guruNote: 'Do reviews first',
      prioritySubjectId: 7,
    });
  });

  it('getDailyAgenda returns null when no row exists', async () => {
    const selectChain = createSelectChain([]);
    const select = jest.fn().mockReturnValue(selectChain);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select });

    const result = await dailyAgendaRepositoryDrizzle.getDailyAgenda('2026-04-22');

    expect(result).toBeNull();
  });

  it('saveDailyAgenda replaces existing date rows and inserts JSON with default source', async () => {
    const where = jest.fn().mockResolvedValue(undefined);
    const deleteFn = jest.fn().mockReturnValue({ where });

    const values = jest.fn().mockResolvedValue(undefined);
    const insert = jest.fn().mockReturnValue({ values });

    (getDrizzleDb as jest.Mock).mockReturnValue({
      delete: deleteFn,
      insert,
    });

    await dailyAgendaRepositoryDrizzle.saveDailyAgenda('2026-04-21', {
      blocks: [
        {
          id: 'study-1',
          title: 'Micro',
          topicIds: [4],
          durationMinutes: 30,
          type: 'study',
          why: 'new intake',
        },
      ],
      guruNote: 'Keep it short',
    });

    expect(deleteFn).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-04-21',
        planJson: JSON.stringify({
          blocks: [
            {
              id: 'study-1',
              title: 'Micro',
              topicIds: [4],
              durationMinutes: 30,
              type: 'study',
              why: 'new intake',
            },
          ],
          guruNote: 'Keep it short',
        }),
        source: 'guru',
      }),
    );
    const inserted = values.mock.calls[0]?.[0] as { createdAt: number; updatedAt: number };
    expect(inserted.createdAt).toEqual(expect.any(Number));
    expect(inserted.updatedAt).toEqual(expect.any(Number));
  });

  it('deleteDailyAgenda deletes rows for the requested date', async () => {
    const where = jest.fn().mockResolvedValue(undefined);
    const deleteFn = jest.fn().mockReturnValue({ where });

    (getDrizzleDb as jest.Mock).mockReturnValue({ delete: deleteFn });

    await dailyAgendaRepositoryDrizzle.deleteDailyAgenda('2026-04-23');

    expect(deleteFn).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('logPlanEvent appends an event with JSON payload', async () => {
    const values = jest.fn().mockResolvedValue(undefined);
    const insert = jest.fn().mockReturnValue({ values });
    (getDrizzleDb as jest.Mock).mockReturnValue({ insert });

    await dailyAgendaRepositoryDrizzle.logPlanEvent('2026-04-21', 'agenda_regenerated', {
      reason: 'backlog',
      skippedTopics: 3,
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-04-21',
        eventType: 'agenda_regenerated',
        payloadJson: JSON.stringify({
          reason: 'backlog',
          skippedTopics: 3,
        }),
        createdAt: expect.any(Number),
      }),
    );
  });
});
