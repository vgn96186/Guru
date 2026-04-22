import { getDrizzleDb } from '../drizzle';
import { todayStr } from '../database';
import { dailyLogRepositoryDrizzle } from './dailyLogRepository.drizzle';

jest.mock('../drizzle', () => ({
  getDrizzleDb: jest.fn(),
}));

jest.mock('../database', () => ({
  todayStr: jest.fn(() => '2026-04-21'),
  dateStr: jest.fn((value: Date) => value.toISOString().slice(0, 10)),
}));

jest.mock('../../services/databaseEvents', () => ({
  DB_EVENT_KEYS: { PROGRESS_UPDATED: 'progress_updated' },
  notifyDbUpdate: jest.fn(),
}));

jest.mock('../../components/Toast', () => ({
  showToast: jest.fn(),
}));

type DailyLogRow = {
  date: string;
  checkedIn: number;
  mood: string | null;
  totalMinutes: number;
  xpEarned: number;
  sessionCount: number;
};

function buildSelectChain<T>(rows: T[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const orderBy = jest.fn().mockReturnValue({ limit });
  const where = jest.fn().mockReturnValue({ orderBy, limit });
  const from = jest.fn().mockReturnValue({ where, orderBy, limit });
  const select = jest.fn().mockReturnValue({ from });
  return { select, from, where, orderBy, limit };
}

describe('dailyLogRepositoryDrizzle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (todayStr as jest.Mock).mockReturnValue('2026-04-21');
  });

  it('getDailyLog maps a stored row to DailyLog shape', async () => {
    const row: DailyLogRow = {
      date: '2026-04-21',
      checkedIn: 1,
      mood: 'good',
      totalMinutes: 95,
      xpEarned: 120,
      sessionCount: 3,
    };
    const chain = buildSelectChain([row]);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select: chain.select });

    const result = await dailyLogRepositoryDrizzle.getDailyLog('2026-04-21');

    expect(chain.limit).toHaveBeenCalledWith(1);
    expect(result).toEqual({
      date: '2026-04-21',
      checkedIn: true,
      mood: 'good',
      totalMinutes: 95,
      xpEarned: 120,
      sessionCount: 3,
    });
  });

  it('getDailyLog returns null when no row exists', async () => {
    const chain = buildSelectChain([]);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select: chain.select });

    const result = await dailyLogRepositoryDrizzle.getDailyLog('2026-04-20');

    expect(result).toBeNull();
  });

  it('getLast30DaysLog returns mapped rows ordered by date desc and capped to 30', async () => {
    const rows: DailyLogRow[] = [
      {
        date: '2026-04-21',
        checkedIn: 1,
        mood: 'energetic',
        totalMinutes: 80,
        xpEarned: 100,
        sessionCount: 2,
      },
      {
        date: '2026-04-20',
        checkedIn: 0,
        mood: null,
        totalMinutes: 0,
        xpEarned: 0,
        sessionCount: 0,
      },
    ];
    const chain = buildSelectChain(rows);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select: chain.select });

    const result = await dailyLogRepositoryDrizzle.getLast30DaysLog();

    expect(chain.orderBy).toHaveBeenCalledTimes(1);
    expect(chain.limit).toHaveBeenCalledWith(30);
    expect(result).toEqual([
      {
        date: '2026-04-21',
        checkedIn: true,
        mood: 'energetic',
        totalMinutes: 80,
        xpEarned: 100,
        sessionCount: 2,
      },
      {
        date: '2026-04-20',
        checkedIn: false,
        mood: null,
        totalMinutes: 0,
        xpEarned: 0,
        sessionCount: 0,
      },
    ]);
  });

  it('getActiveStudyDays returns zero for invalid windows and counts matching rows otherwise', async () => {
    expect(await dailyLogRepositoryDrizzle.getActiveStudyDays(0)).toBe(0);
    expect(getDrizzleDb).not.toHaveBeenCalled();

    const chain = buildSelectChain([{ count: 6 }]);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select: chain.select });

    const result = await dailyLogRepositoryDrizzle.getActiveStudyDays(7);

    expect(result).toBe(6);
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it('checkinToday upserts today with checkedIn flag and mood', async () => {
    const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
    const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = jest.fn().mockReturnValue({ values });
    (getDrizzleDb as jest.Mock).mockReturnValue({ insert });

    await dailyLogRepositoryDrizzle.checkinToday('okay');

    expect(todayStr).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith({
      date: '2026-04-21',
      checkedIn: 1,
      mood: 'okay',
    });
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });
});
