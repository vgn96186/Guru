import { getDrizzleDb } from '../drizzle';
import { runInTransaction } from '../database';
import { sessionsRepositoryDrizzle } from './sessionsRepository.drizzle';
import { dateStr, todayStr } from '../database';
import { MS_PER_DAY } from '../../constants/time';

jest.mock('../drizzle', () => ({
  getDrizzleDb: jest.fn(),
}));

jest.mock('../database', () => ({
  ...jest.requireActual('../database'),
  runInTransaction: jest.fn(),
}));

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  transaction: jest.Mock;
};

const makeDb = (): MockDb => ({
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  transaction: jest.fn(async (cb) => {
    const tx = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ endedAt: null }]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      onConflictDoUpdate: jest.fn().mockResolvedValue({}),
    };
    return cb(tx);
  }),
});

const makeSessionRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 41,
  startedAt: 1710000000000,
  endedAt: 1710003600000,
  plannedTopics: '[1,2,3]',
  completedTopics: '[2,3]',
  totalXpEarned: 50,
  durationMinutes: 60,
  mood: 'good',
  mode: 'normal',
  notes: null,
  ...overrides,
});

describe('sessionsRepositoryDrizzle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns aggregate totals for completed study minutes and sessions', async () => {
    const db = makeDb();
    const minutesLimit = jest.fn().mockResolvedValue([{ total: 245 }]);
    const minutesWhere = jest.fn(() => ({ limit: minutesLimit }));
    const minutesFrom = jest.fn(() => ({ where: minutesWhere }));

    const countLimit = jest.fn().mockResolvedValue([{ cnt: 6 }]);
    const countWhere = jest.fn(() => ({ limit: countLimit }));
    const countFrom = jest.fn(() => ({ where: countWhere }));

    db.select.mockReturnValueOnce({ from: minutesFrom }).mockReturnValueOnce({ from: countFrom });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    await expect(sessionsRepositoryDrizzle.getTotalStudyMinutes()).resolves.toBe(245);
    await expect(sessionsRepositoryDrizzle.getCompletedSessionCount()).resolves.toBe(6);
  });

  it('createSession stores JSON planned topics and returns inserted id', async () => {
    const db = makeDb();
    const returning = jest.fn().mockResolvedValue([{ id: 88 }]);
    const values = jest.fn(() => ({ returning }));
    db.insert.mockReturnValue({ values });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const before = Date.now();
    const result = await sessionsRepositoryDrizzle.createSession([7, 8], 'tired', 'normal');
    const after = Date.now();

    expect(result).toBe(88);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        plannedTopics: '[7,8]',
        mood: 'tired',
        mode: 'normal',
      }),
    );
    const insertedSession = (values.mock.calls as unknown as Array<[{ startedAt: number }]>).at(
      0,
    )?.[0];
    expect(insertedSession).toBeDefined();
    expect(insertedSession?.startedAt).toBeGreaterThanOrEqual(before);
    expect(insertedSession?.startedAt).toBeLessThanOrEqual(after);
  });

  it('reports whether a session is already finalized from endedAt presence', async () => {
    const db = makeDb();
    const finalizedLimit = jest.fn().mockResolvedValue([{ endedAt: 1710003600000 }]);
    const finalizedWhere = jest.fn(() => ({ limit: finalizedLimit }));
    const finalizedFrom = jest.fn(() => ({ where: finalizedWhere }));

    const openLimit = jest.fn().mockResolvedValue([{ endedAt: null }]);
    const openWhere = jest.fn(() => ({ limit: openLimit }));
    const openFrom = jest.fn(() => ({ where: openWhere }));

    db.select.mockReturnValueOnce({ from: finalizedFrom }).mockReturnValueOnce({ from: openFrom });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    await expect(sessionsRepositoryDrizzle.isSessionAlreadyFinalized(1)).resolves.toBe(true);
    await expect(sessionsRepositoryDrizzle.isSessionAlreadyFinalized(2)).resolves.toBe(false);
  });

  it('maps recent sessions to StudySession and preserves JSON fallback behavior', async () => {
    const db = makeDb();
    const limit = jest.fn().mockResolvedValue([
      makeSessionRow({
        id: 9,
        plannedTopics: 'not-json',
        completedTopics: null,
        mood: null,
        endedAt: null,
        durationMinutes: null,
        mode: 'external',
      }),
      makeSessionRow({ id: 8, plannedTopics: '[4]', completedTopics: '[4,5]' }),
    ]);
    const orderBy = jest.fn(() => ({ limit }));
    const from = jest.fn(() => ({ orderBy }));
    db.select.mockReturnValue({ from });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await sessionsRepositoryDrizzle.getRecentSessions(2);

    expect(limit).toHaveBeenCalledWith(2);
    expect(result).toEqual([
      {
        id: 9,
        startedAt: 1710000000000,
        endedAt: null,
        plannedTopics: [],
        completedTopics: [],
        totalXpEarned: 50,
        durationMinutes: null,
        mood: null,
        mode: 'external',
      },
      {
        id: 8,
        startedAt: 1710000000000,
        endedAt: 1710003600000,
        plannedTopics: [4],
        completedTopics: [4, 5],
        totalXpEarned: 50,
        durationMinutes: 60,
        mood: 'good',
        mode: 'normal',
      },
    ]);
  });

  it('returns zero-like defaults when aggregate rows are missing', async () => {
    const db = makeDb();
    const minutesLimit = jest.fn().mockResolvedValue([]);
    const minutesWhere = jest.fn(() => ({ limit: minutesLimit }));
    const minutesFrom = jest.fn(() => ({ where: minutesWhere }));

    const countLimit = jest.fn().mockResolvedValue([]);
    const countWhere = jest.fn(() => ({ limit: countLimit }));
    const countFrom = jest.fn(() => ({ where: countWhere }));

    db.select.mockReturnValueOnce({ from: minutesFrom }).mockReturnValueOnce({ from: countFrom });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    await expect(sessionsRepositoryDrizzle.getTotalStudyMinutes()).resolves.toBe(0);
    await expect(sessionsRepositoryDrizzle.getCompletedSessionCount()).resolves.toBe(0);
  });

  it('endSession runs inside runInTransaction', async () => {
    const limit = jest.fn().mockResolvedValue([{ endedAt: null }]);
    const where = jest.fn(() => ({ limit }));
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));

    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn(() => ({ where: updateWhere }));
    const update = jest.fn(() => ({ set }));

    const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
    const values = jest.fn(() => ({ onConflictDoUpdate }));
    const insert = jest.fn(() => ({ values }));

    (getDrizzleDb as jest.Mock).mockReturnValue({ select, update, insert });
    (runInTransaction as jest.Mock).mockImplementation(
      async (callback: (txn: unknown) => Promise<void>) => callback({ execAsync: jest.fn() }),
    );

    await sessionsRepositoryDrizzle.endSession(1, [1, 2], 100, 30, 'test notes');
    expect(runInTransaction).toHaveBeenCalledTimes(1);
  });

  it('endSession does not treat the expo-sqlite transaction db as a drizzle builder', async () => {
    const limit = jest.fn().mockResolvedValue([{ endedAt: null }]);
    const where = jest.fn(() => ({ limit }));
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));

    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn(() => ({ where: updateWhere }));
    const update = jest.fn(() => ({ set }));

    const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
    const values = jest.fn(() => ({ onConflictDoUpdate }));
    const insert = jest.fn(() => ({ values }));

    (getDrizzleDb as jest.Mock).mockReturnValue({ select, update, insert });
    (runInTransaction as jest.Mock).mockImplementation(
      async (callback: (txn: unknown) => Promise<void>) => callback({ execAsync: jest.fn() }),
    );

    await expect(sessionsRepositoryDrizzle.endSession(1, [1, 2], 100, 30)).resolves.toBeUndefined();
    expect(select).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('updateSessionProgress does not treat the expo-sqlite transaction db as a drizzle builder', async () => {
    const limit = jest.fn().mockResolvedValue([{ durationMinutes: 0, totalXpEarned: 0 }]);
    const where = jest.fn(() => ({ limit }));
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));

    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn(() => ({ where: updateWhere }));
    const update = jest.fn(() => ({ set }));

    const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
    const values = jest.fn(() => ({ onConflictDoUpdate }));
    const insert = jest.fn(() => ({ values }));

    (getDrizzleDb as jest.Mock).mockReturnValue({ select, update, insert });
    (runInTransaction as jest.Mock).mockImplementation(
      async (callback: (txn: unknown) => Promise<void>) => callback({ execAsync: jest.fn() }),
    );

    await expect(
      sessionsRepositoryDrizzle.updateSessionProgress(1, 30, 100, [1, 2]),
    ).resolves.toBeUndefined();
    expect(select).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('calculateCurrentStreak computes streak properly', async () => {
    const db = makeDb();
    const today = todayStr();
    const yesterday = dateStr(new Date(Date.now() - MS_PER_DAY));
    const twoDaysAgo = dateStr(new Date(Date.now() - 2 * MS_PER_DAY));

    const mockRows = [{ date: today }, { date: yesterday }, { date: twoDaysAgo }];

    const orderBy = jest.fn().mockResolvedValue(mockRows);
    const where = jest.fn(() => ({ orderBy }));
    const from = jest.fn(() => ({ where }));
    db.select.mockReturnValue({ from });

    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const streak = await sessionsRepositoryDrizzle.calculateCurrentStreak();
    expect(streak).toBe(3);
  });
});
