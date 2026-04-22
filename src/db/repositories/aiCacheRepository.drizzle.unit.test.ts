import { aiCacheRepositoryDrizzle } from './aiCacheRepository.drizzle';
import { getDrizzleDb } from '../drizzle';

jest.mock('../drizzle', () => ({
  getDrizzleDb: jest.fn(),
}));

function buildSelectChain<T>(rows: T[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const orderBy = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit, orderBy });
  const innerJoin = jest.fn().mockReturnValue({ where });
  const from = jest.fn().mockReturnValue({ where, innerJoin });
  const select = jest.fn().mockReturnValue({ from });
  return { select, from, where, innerJoin, orderBy, limit };
}

describe('aiCacheRepositoryDrizzle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getCachedContent returns parsed AI content and fills modelUsed from column when missing in JSON', async () => {
    const chain = buildSelectChain([
      {
        contentJson: JSON.stringify({
          type: 'keypoints',
          topicName: 'Heart Failure',
          points: ['Point 1'],
          memoryHook: 'Hook',
        }),
        modelUsed: 'gemini/test-model',
      },
    ]);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select: chain.select });

    const result = await aiCacheRepositoryDrizzle.getCachedContent(12, 'keypoints');

    expect(chain.limit).toHaveBeenCalledWith(1);
    expect(result).toEqual({
      type: 'keypoints',
      topicName: 'Heart Failure',
      points: ['Point 1'],
      memoryHook: 'Hook',
      modelUsed: 'gemini/test-model',
    });
  });

  it('getCachedContent returns null for malformed cached JSON', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const chain = buildSelectChain([
      {
        contentJson: '{bad json',
        modelUsed: 'broken-model',
      },
    ]);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select: chain.select });

    const result = await aiCacheRepositoryDrizzle.getCachedContent(9, 'quiz');

    expect(result).toBeNull();
    warnSpy.mockRestore();
  });

  it('setCachedContent upserts serialized content with modelUsed and createdAt', async () => {
    const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
    const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = jest.fn().mockReturnValue({ values });
    (getDrizzleDb as jest.Mock).mockReturnValue({ insert });

    await aiCacheRepositoryDrizzle.setCachedContent(
      5,
      'manual',
      {
        type: 'manual',
        topicName: 'ARDS',
      },
      'manual-review',
    );

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        topicId: 5,
        contentType: 'manual',
        contentJson: JSON.stringify({
          type: 'manual',
          topicName: 'ARDS',
        }),
        modelUsed: 'manual-review',
        createdAt: expect.any(Number),
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          modelUsed: 'manual-review',
          createdAt: expect.any(Number),
        }),
      }),
    );
  });

  it('clearSpecificContentCache deletes the requested topic/content pair', async () => {
    const where = jest.fn().mockResolvedValue(undefined);
    const del = jest.fn().mockReturnValue({ where });
    (getDrizzleDb as jest.Mock).mockReturnValue({ delete: del });

    await aiCacheRepositoryDrizzle.clearSpecificContentCache(33, 'flashcards');

    expect(del).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('getPendingTopicSuggestions returns legacy-shaped suggestion rows ordered by recency', async () => {
    const chain = buildSelectChain([
      {
        id: 4,
        subjectId: 7,
        subjectName: 'Medicine',
        subjectColor: '#2288ff',
        name: 'Cardiogenic shock',
        sourceSummary: 'Mentioned in lecture summary',
        mentionCount: 3,
        status: 'pending' as const,
        approvedTopicId: null,
        firstDetectedAt: 1710000000000,
        lastDetectedAt: 1711000000000,
      },
    ]);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select: chain.select });

    const result = await aiCacheRepositoryDrizzle.getPendingTopicSuggestions();

    expect(chain.innerJoin).toHaveBeenCalledTimes(1);
    expect(chain.where).toHaveBeenCalledTimes(1);
    expect(chain.orderBy).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        id: 4,
        subjectId: 7,
        subjectName: 'Medicine',
        subjectColor: '#2288ff',
        name: 'Cardiogenic shock',
        sourceSummary: 'Mentioned in lecture summary',
        mentionCount: 3,
        status: 'pending',
        approvedTopicId: null,
        firstDetectedAt: 1710000000000,
        lastDetectedAt: 1711000000000,
      },
    ]);
  });
});
