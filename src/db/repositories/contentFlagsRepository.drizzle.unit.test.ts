import { getDrizzleDb } from '../drizzle';
import { contentFlagsRepositoryDrizzle } from './contentFlagsRepository.drizzle';

jest.mock('../drizzle', () => ({
  getDrizzleDb: jest.fn(),
}));

type MockDb = {
  insert: jest.Mock;
  update: jest.Mock;
  select: jest.Mock;
};

const makeDb = (): MockDb => ({
  insert: jest.fn(),
  update: jest.fn(),
  select: jest.fn(),
});

const createSelectChain = (rows: Array<Record<string, unknown>>) => ({
  from: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  join: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockResolvedValue(rows),
});

describe('contentFlagsRepositoryDrizzle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('flagContentWithReason inserts a user flag and marks matching AI cache content as flagged', async () => {
    const db = makeDb();
    const flagValues = jest.fn().mockResolvedValue(undefined);
    const cacheWhere = jest.fn().mockResolvedValue(undefined);
    const cacheSet = jest.fn(() => ({ where: cacheWhere }));

    db.insert.mockReturnValue({ values: flagValues });
    db.update.mockReturnValue({ set: cacheSet });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);
    jest.spyOn(Date, 'now').mockReturnValue(1713000000000);

    await contentFlagsRepositoryDrizzle.flagContentWithReason(
      12,
      'quiz',
      'incorrect_fact',
      'Statement contradicts Robbins',
    );

    expect(flagValues).toHaveBeenCalledWith({
      topicId: 12,
      contentType: 'quiz',
      flagReason: 'incorrect_fact',
      userNote: 'Statement contradicts Robbins',
      flaggedAt: 1713000000000,
    });
    expect(cacheSet).toHaveBeenCalledWith({ isFlagged: 1 });
    expect(cacheWhere).toHaveBeenCalledTimes(1);
  });

  it('logFactCheckResult persists contradictions JSON and auto-flags failed content', async () => {
    const db = makeDb();
    const factValues = jest.fn().mockResolvedValue(undefined);
    const cacheWhere = jest.fn().mockResolvedValue(undefined);
    const cacheSet = jest.fn(() => ({ where: cacheWhere }));

    db.insert.mockReturnValue({ values: factValues });
    db.update.mockReturnValue({ set: cacheSet });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);
    jest.spyOn(Date, 'now').mockReturnValue(1714000000000);

    await contentFlagsRepositoryDrizzle.logFactCheckResult(7, 'keypoints', 'failed', [
      {
        claim: 'ACE inhibitors are first-line in pregnancy',
        trustedSource: 'WHO',
        trustedText: 'ACE inhibitors are contraindicated in pregnancy.',
        similarity: 0.94,
      },
    ]);

    expect(factValues).toHaveBeenCalledWith({
      topicId: 7,
      contentType: 'keypoints',
      checkStatus: 'failed',
      contradictionsJson: JSON.stringify([
        {
          claim: 'ACE inhibitors are first-line in pregnancy',
          trustedSource: 'WHO',
          trustedText: 'ACE inhibitors are contraindicated in pregnancy.',
          similarity: 0.94,
        },
      ]),
      checkedAt: 1714000000000,
    });
    expect(cacheSet).toHaveBeenCalledWith({ isFlagged: 1 });
    expect(cacheWhere).toHaveBeenCalledTimes(1);
  });

  it('logFactCheckResult does not auto-flag AI cache when the check does not fail', async () => {
    const db = makeDb();
    const factValues = jest.fn().mockResolvedValue(undefined);

    db.insert.mockReturnValue({ values: factValues });
    db.update.mockReturnValue({ set: jest.fn() });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    await contentFlagsRepositoryDrizzle.logFactCheckResult(5, 'story', 'passed', []);

    expect(factValues).toHaveBeenCalledTimes(1);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('resolveContentFlags marks matching user flags as resolved', async () => {
    const db = makeDb();
    const where = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn(() => ({ where }));

    db.update.mockReturnValue({ set });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);
    jest.spyOn(Date, 'now').mockReturnValue(1715000000000);

    await contentFlagsRepositoryDrizzle.resolveContentFlags(22, 'mnemonic');

    expect(set).toHaveBeenCalledWith({
      resolved: 1,
      resolvedAt: 1715000000000,
    });
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('getFlaggedContentReview returns mapped flagged items with auto_flagged fallback', async () => {
    const db = makeDb();
    const selectChain = createSelectChain([
      {
        topicId: 4,
        topicName: 'Mitral stenosis',
        subjectName: 'Medicine',
        contentType: 'flashcards',
        flagReason: null,
        userNote: null,
        flaggedAt: 1716000000000,
        resolved: 0,
      },
      {
        topicId: 5,
        topicName: 'Anemia',
        subjectName: 'Pathology',
        contentType: 'quiz',
        flagReason: 'missing_concept',
        userNote: 'Reticulocyte response omitted',
        flaggedAt: 1716100000000,
        resolved: 1,
      },
    ]);
    db.select.mockReturnValue(selectChain);
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await contentFlagsRepositoryDrizzle.getFlaggedContentReview();

    expect(selectChain.orderBy).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        topicId: 4,
        topicName: 'Mitral stenosis',
        subjectName: 'Medicine',
        contentType: 'flashcards',
        flagReason: 'auto_flagged',
        userNote: undefined,
        flaggedAt: 1716000000000,
        resolved: false,
      },
      {
        topicId: 5,
        topicName: 'Anemia',
        subjectName: 'Pathology',
        contentType: 'quiz',
        flagReason: 'missing_concept',
        userNote: 'Reticulocyte response omitted',
        flaggedAt: 1716100000000,
        resolved: true,
      },
    ]);
  });
});
