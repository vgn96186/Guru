import { markTopicsFromLecture } from './matching';
import { setDbForTests } from '../../db/database';
import { resetDrizzleDb } from '../../db/drizzle';
import { createTestDatabase } from '../../db/testing/createTestDatabase';
import * as topicsQueries from '../../db/queries/topics';
import * as embeddingService from '../ai/embeddingService';

jest.mock('../../db/database', () => {
  const actual = jest.requireActual('../../db/database');
  return {
    ...actual,
    getDb: jest.fn().mockReturnValue({
      getAllAsync: jest.fn().mockResolvedValue([]),
    }),
  };
});

import { getDb } from '../../db/database';

jest.mock('../../db/queries/topics', () => ({
  queueTopicSuggestionInTx: jest.fn().mockResolvedValue(undefined),
  updateTopicProgressInTx: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../ai/embeddingService', () => ({
  generateEmbedding: jest.fn(),
  blobToEmbedding: jest.fn(),
  embeddingToBlob: jest.fn(),
}));

describe('markTopicsFromLecture', () => {
  let db: ReturnType<typeof createTestDatabase>;

  beforeEach(async () => {
    jest.clearAllMocks();
    db = createTestDatabase();
    setDbForTests(db);
    resetDrizzleDb();

    await db.runAsync(
      'INSERT INTO subjects (id, name, short_code, color_hex, inicet_weight, neet_weight, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [1, 'Medicine', 'MED', '#123456', 1, 1, 1],
    );
    await db.runAsync(
      'INSERT INTO subjects (id, name, short_code, color_hex, inicet_weight, neet_weight, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [2, 'Pathology', 'PATH', '#654321', 1, 1, 2],
    );
    await db.runAsync(
      'INSERT INTO subjects (id, name, short_code, color_hex, inicet_weight, neet_weight, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [3, 'Surgery', 'SURG', '#abcdef', 1, 1, 3],
    );
    await db.runAsync('INSERT INTO topics (id, subject_id, name) VALUES (?, ?, ?)', [
      101,
      1,
      'Diabetes',
    ]);
    await db.runAsync('INSERT INTO topics (id, subject_id, name, embedding) VALUES (?, ?, ?, ?)', [
      55,
      2,
      'Kidney topic',
      new Uint8Array([1, 2, 3]),
    ]);
  });

  afterEach(() => {
    setDbForTests(null);
    resetDrizzleDb();
  });

  it('returns immediately when no topics and no lecture summary', async () => {
    await markTopicsFromLecture({}, [], 2, 'Anatomy');

    expect(topicsQueries.updateTopicProgressInTx).not.toHaveBeenCalled();
  });

  it('matches a topic by keyword and updates progress', async () => {
    const tx = {};
    await markTopicsFromLecture(tx, ['  diabetes  '], 2, 'Medicine');

    expect(topicsQueries.updateTopicProgressInTx).toHaveBeenCalledWith(
      tx,
      101,
      'seen',
      2,
      0,
      undefined,
    );
  });

  it('runs semantic matching when lectureSummary is provided', async () => {
    (embeddingService.generateEmbedding as jest.Mock).mockResolvedValue([0.1, 0.2, 0.3]);
    (embeddingService.blobToEmbedding as jest.Mock).mockReturnValue([0.1, 0.2, 0.3]);
    (embeddingService.embeddingToBlob as jest.Mock).mockReturnValue(new Uint8Array([1, 2, 3]));
    
    const mockGetAllAsync = jest.fn().mockResolvedValue([{ id: 55, distance: 0.1 }]);
    (getDb as jest.Mock).mockReturnValue({
      getAllAsync: mockGetAllAsync,
    });

    const tx = {};
    await markTopicsFromLecture(tx, [], 2, 'Pathology', 'Some lecture about kidneys', undefined);

    expect(embeddingService.generateEmbedding).toHaveBeenCalledWith('Some lecture about kidneys');
    expect(mockGetAllAsync).toHaveBeenCalled();
    expect(topicsQueries.updateTopicProgressInTx).toHaveBeenCalledWith(
      tx,
      55,
      'seen',
      2,
      0,
      'Some lecture about kidneys',
    );
  });

  it('queues unmatched topic names when subject exists', async () => {
    const tx = {};
    await markTopicsFromLecture(tx, ['Totally Unknown Topic Xyz'], 2, 'Surgery', undefined);

    expect(topicsQueries.queueTopicSuggestionInTx).toHaveBeenCalledWith(
      tx,
      3,
      'Totally Unknown Topic Xyz',
      undefined,
    );
  });
});
