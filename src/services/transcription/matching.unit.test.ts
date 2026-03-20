import { markTopicsFromLecture } from './matching';
import * as topicsQueries from '../../db/queries/topics';
import * as embeddingService from '../ai/embeddingService';

jest.mock('../../db/queries/topics', () => ({
  queueTopicSuggestionInTx: jest.fn().mockResolvedValue(undefined),
  updateTopicProgressInTx: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../ai/embeddingService', () => ({
  generateEmbedding: jest.fn(),
  cosineSimilarity: jest.fn(),
  blobToEmbedding: jest.fn(),
}));

function mockDb(
  overrides: Partial<{
    getFirstAsync: jest.Mock;
    getAllAsync: jest.Mock;
  }> = {},
) {
  return {
    getFirstAsync: jest.fn().mockResolvedValue(null),
    getAllAsync: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as import('expo-sqlite').SQLiteDatabase;
}

describe('markTopicsFromLecture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns immediately when no topics and no lecture summary', async () => {
    const db = mockDb();
    await markTopicsFromLecture(db, [], 2, 'Anatomy');
    expect(db.getFirstAsync).not.toHaveBeenCalled();
    expect(topicsQueries.updateTopicProgressInTx).not.toHaveBeenCalled();
  });

  it('matches a topic by keyword and updates progress', async () => {
    const db = mockDb({
      getFirstAsync: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('JOIN subjects') && sql.includes('LOWER(t.name) =')) {
          return Promise.resolve({ id: 101 });
        }
        return Promise.resolve(null);
      }),
      getAllAsync: jest.fn().mockResolvedValue([]),
    });

    await markTopicsFromLecture(db, ['  diabetes  '], 2, 'Medicine');

    expect(topicsQueries.updateTopicProgressInTx).toHaveBeenCalledWith(
      db,
      101,
      'seen',
      2,
      0,
      undefined,
    );
  });

  it('runs semantic matching when lectureSummary is provided', async () => {
    (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue([0.1, 0.2, 0.3]);
    (embeddingService.cosineSimilarity as jest.Mock).mockReturnValue(0.9);
    (embeddingService.blobToEmbedding as jest.Mock).mockReturnValue([0.1, 0.2, 0.3]);

    const rows = [{ id: 55, embedding: new Uint8Array([1, 2, 3]) }];
    const db = mockDb({
      getFirstAsync: jest.fn().mockResolvedValue(null),
      getAllAsync: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('embedding')) {
          return Promise.resolve(rows);
        }
        return Promise.resolve([]);
      }),
    });

    // Pass undefined so the pipeline generates an embedding (null would skip generation)
    await markTopicsFromLecture(db, [], 2, 'Pathology', 'Some lecture about kidneys', undefined);

    expect(embeddingService.generateEmbedding).toHaveBeenCalledWith('Some lecture about kidneys');
    expect(topicsQueries.updateTopicProgressInTx).toHaveBeenCalled();
  });

  it('queues unmatched topic names when subject exists', async () => {
    const db = mockDb({
      getFirstAsync: jest.fn().mockImplementation((sql: string, params?: string[]) => {
        if (sql.includes('FROM subjects') && params?.[0]?.toLowerCase() === 'surgery') {
          return Promise.resolve({ id: 9 });
        }
        return Promise.resolve(null);
      }),
      getAllAsync: jest.fn().mockResolvedValue([]),
    });

    await markTopicsFromLecture(db, ['Totally Unknown Topic Xyz'], 2, 'Surgery', undefined);

    expect(topicsQueries.queueTopicSuggestionInTx).toHaveBeenCalledWith(
      db,
      9,
      'Totally Unknown Topic Xyz',
      undefined,
    );
  });
});
