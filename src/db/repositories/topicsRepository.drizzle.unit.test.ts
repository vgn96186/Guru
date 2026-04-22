import { getDrizzleDb } from '../drizzle';
import { topicsRepositoryDrizzle } from './topicsRepository.drizzle';

jest.mock('../drizzle', () => ({
  getDrizzleDb: jest.fn(),
}));

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
};

const makeDb = (): MockDb => ({
  select: jest.fn(),
  insert: jest.fn(),
});

const makeTopicRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 11,
  subjectId: 2,
  parentTopicId: null,
  name: 'Renal physiology',
  estimatedMinutes: 40,
  inicetPriority: 8,
  status: 'reviewed',
  confidence: 2,
  lastStudiedAt: 1710000000000,
  timesStudied: 3,
  xpEarned: 25,
  nextReviewDate: '2026-04-25',
  userNotes: 'Important',
  fsrsDue: '2026-04-25T00:00:00.000Z',
  fsrsStability: 1.2,
  fsrsDifficulty: 4.1,
  fsrsElapsedDays: 2,
  fsrsScheduledDays: 5,
  fsrsReps: 3,
  fsrsLapses: 0,
  fsrsState: 2,
  fsrsLastReview: '2026-04-20T00:00:00.000Z',
  wrongCount: 1,
  isNemesis: 1,
  subjectName: 'Physiology',
  subjectCode: 'PHY',
  subjectColor: '#00AAFF',
  childCount: 2,
  ...overrides,
});

describe('topicsRepositoryDrizzle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array for invalid subject id', async () => {
    const db = makeDb();
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await topicsRepositoryDrizzle.getTopicsBySubject('invalid');

    expect(result).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('maps getTopicsBySubject rows to TopicWithProgress shape', async () => {
    const db = makeDb();
    const orderBy = jest
      .fn()
      .mockResolvedValue([makeTopicRow({ status: null, isNemesis: 0, userNotes: null })]);
    const where = jest.fn(() => ({ orderBy }));
    const leftJoin = jest.fn(() => ({ where }));
    const innerJoin = jest.fn(() => ({ leftJoin }));
    const from = jest.fn(() => ({ innerJoin }));
    db.select.mockReturnValue({ from });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await topicsRepositoryDrizzle.getTopicsBySubject(2);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 11,
      subjectId: 2,
      subjectName: 'Physiology',
      subjectCode: 'PHY',
      subjectColor: '#00AAFF',
      progress: {
        status: 'unseen',
        userNotes: '',
        isNemesis: false,
      },
    });
    expect(where).toHaveBeenCalledTimes(1);
    expect(orderBy).toHaveBeenCalledTimes(1);
  });

  it('returns null when getTopicById has no row', async () => {
    const db = makeDb();
    const limit = jest.fn().mockResolvedValue([]);
    const where = jest.fn(() => ({ limit }));
    const leftJoin = jest.fn(() => ({ where }));
    const innerJoin = jest.fn(() => ({ leftJoin }));
    const from = jest.fn(() => ({ innerJoin }));
    db.select.mockReturnValue({ from });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await topicsRepositoryDrizzle.getTopicById(9999);

    expect(result).toBeNull();
    expect(limit).toHaveBeenCalledWith(1);
  });

  it('createTopic inserts trimmed values and returns created topic', async () => {
    const db = makeDb();
    const returning = jest.fn().mockResolvedValue([{ id: 77 }]);
    const values = jest.fn(() => ({ returning }));
    db.insert.mockReturnValue({ values });

    const limit = jest.fn().mockResolvedValue([makeTopicRow({ id: 77, name: 'Acidosis' })]);
    const where = jest.fn(() => ({ limit }));
    const leftJoin = jest.fn(() => ({ where }));
    const innerJoin = jest.fn(() => ({ leftJoin }));
    const from = jest.fn(() => ({ innerJoin }));
    db.select.mockReturnValue({ from });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await topicsRepositoryDrizzle.createTopic({
      subjectId: 3,
      name: '  Acidosis  ',
      estimatedMinutes: 20,
      inicetPriority: 9,
    });

    expect(values).toHaveBeenCalledWith({
      subjectId: 3,
      parentTopicId: null,
      name: 'Acidosis',
      estimatedMinutes: 20,
      inicetPriority: 9,
    });
    expect(result?.id).toBe(77);
    expect(result?.name).toBe('Acidosis');
  });

  it('searchTopicsByName returns empty for blank query and maps result for non-blank', async () => {
    const db = makeDb();
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const emptyResult = await topicsRepositoryDrizzle.searchTopicsByName('   ');
    expect(emptyResult).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();

    const limit = jest.fn().mockResolvedValue([makeTopicRow({ name: 'Cardiac cycle' })]);
    const orderBy = jest.fn(() => ({ limit }));
    const where = jest.fn(() => ({ orderBy }));
    const leftJoin = jest.fn(() => ({ where }));
    const innerJoin = jest.fn(() => ({ leftJoin }));
    const from = jest.fn(() => ({ innerJoin }));
    db.select.mockReturnValue({ from });

    const result = await topicsRepositoryDrizzle.searchTopicsByName('Cardiac');
    expect(limit).toHaveBeenCalledWith(50);
    expect(result[0]?.name).toBe('Cardiac cycle');
  });
});
