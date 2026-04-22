import { topicProgressRepositoryDrizzle } from './topicProgressRepository.drizzle';
import { getDrizzleDb } from '../drizzle';

jest.mock('../drizzle', () => ({
  getDrizzleDb: jest.fn(),
}));

function buildSelectChain<T>(rows: T[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });
  return { select, from, where, limit };
}

describe('topicProgressRepositoryDrizzle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getTopicProgress returns mapped TopicProgress row', async () => {
    const row = {
      topicId: 7,
      status: 'seen',
      confidence: 2,
      lastStudiedAt: 123,
      timesStudied: 3,
      xpEarned: 10,
      nextReviewDate: '2026-04-22',
      userNotes: 'n',
      wrongCount: 1,
      isNemesis: 1,
      fsrsDue: '2026-04-22T00:00:00.000Z',
      fsrsStability: 5,
      fsrsDifficulty: 4,
      fsrsElapsedDays: 1,
      fsrsScheduledDays: 3,
      fsrsReps: 2,
      fsrsLapses: 0,
      fsrsState: 1,
      fsrsLastReview: '2026-04-20T00:00:00.000Z',
    };
    const chain = buildSelectChain([row]);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select: chain.select });

    const result = await topicProgressRepositoryDrizzle.getTopicProgress(7);

    expect(result).toEqual({
      topicId: 7,
      status: 'seen',
      confidence: 2,
      lastStudiedAt: 123,
      timesStudied: 3,
      xpEarned: 10,
      nextReviewDate: '2026-04-22',
      userNotes: 'n',
      wrongCount: 1,
      isNemesis: true,
      fsrsDue: '2026-04-22T00:00:00.000Z',
      fsrsStability: 5,
      fsrsDifficulty: 4,
      fsrsElapsedDays: 1,
      fsrsScheduledDays: 3,
      fsrsReps: 2,
      fsrsLapses: 0,
      fsrsState: 1,
      fsrsLastReview: '2026-04-20T00:00:00.000Z',
    });
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it('getTopicProgress returns null when no row exists', async () => {
    const chain = buildSelectChain([]);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select: chain.select });

    const result = await topicProgressRepositoryDrizzle.getTopicProgress(99);

    expect(result).toBeNull();
  });

  it('upsertTopicProgress performs upsert with mapped fields', async () => {
    const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
    const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = jest.fn().mockReturnValue({ values });
    (getDrizzleDb as jest.Mock).mockReturnValue({ insert });

    await topicProgressRepositoryDrizzle.upsertTopicProgress(42, {
      confidence: 3,
      isNemesis: true,
      fsrsDue: '2026-04-21T00:00:00.000Z',
    });

    expect(insert).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        topicId: 42,
        confidence: 3,
        isNemesis: 1,
        fsrsDue: '2026-04-21T00:00:00.000Z',
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalled();
  });

  it('markTopicSeen preserves non-unseen status and bumps counters', async () => {
    const getSpy = jest
      .spyOn(topicProgressRepositoryDrizzle, 'getTopicProgress')
      .mockResolvedValue({
        topicId: 5,
        status: 'reviewed',
        confidence: 2,
        lastStudiedAt: null,
        timesStudied: 4,
        xpEarned: 0,
        nextReviewDate: null,
        userNotes: '',
        fsrsDue: null,
        fsrsStability: 0,
        fsrsDifficulty: 0,
        fsrsElapsedDays: 0,
        fsrsScheduledDays: 0,
        fsrsReps: 0,
        fsrsLapses: 0,
        fsrsState: 0,
        fsrsLastReview: null,
        wrongCount: 0,
        isNemesis: false,
      });
    const upsertSpy = jest
      .spyOn(topicProgressRepositoryDrizzle, 'upsertTopicProgress')
      .mockResolvedValue(undefined);

    await topicProgressRepositoryDrizzle.markTopicSeen(5, 1);

    expect(getSpy).toHaveBeenCalledWith(5);
    expect(upsertSpy).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        status: 'reviewed',
        confidence: 2,
        timesStudied: 5,
      }),
    );
    expect((upsertSpy.mock.calls[0]?.[1] as { lastStudiedAt: number }).lastStudiedAt).toEqual(
      expect.any(Number),
    );
  });

  it('listDueTopicsByFsrsDue returns mapped due rows', async () => {
    const orderBy = jest.fn().mockResolvedValue([
      {
        topicId: 1,
        status: 'seen',
        confidence: 1,
        lastStudiedAt: null,
        timesStudied: 1,
        xpEarned: 0,
        nextReviewDate: null,
        userNotes: '',
        wrongCount: 0,
        isNemesis: 0,
        fsrsDue: '2026-04-20T00:00:00.000Z',
        fsrsStability: null,
        fsrsDifficulty: null,
        fsrsElapsedDays: null,
        fsrsScheduledDays: null,
        fsrsReps: null,
        fsrsLapses: null,
        fsrsState: null,
        fsrsLastReview: null,
      },
    ]);
    const where = jest.fn().mockReturnValue({ orderBy });
    const from = jest.fn().mockReturnValue({ where });
    const select = jest.fn().mockReturnValue({ from });
    (getDrizzleDb as jest.Mock).mockReturnValue({ select });

    const result = await topicProgressRepositoryDrizzle.listDueTopicsByFsrsDue('2026-04-21');

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        topicId: 1,
        fsrsStability: 0,
        isNemesis: false,
      }),
    );
    expect(orderBy).toHaveBeenCalled();
  });
});
