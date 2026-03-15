import { markTopicsFromLecture } from './matching';
import * as topicsDb from '../../db/queries/topics';

// Mock sqlite for unit testing
const mockDb = {
  getFirstAsync: jest.fn(),
  getAllAsync: jest.fn(),
  runAsync: jest.fn(),
  execAsync: jest.fn(),
};

jest.mock('../../db/database', () => ({
  getDb: () => mockDb,
}));

jest.mock('../../db/queries/topics', () => ({
  updateTopicsProgressBatch: jest.fn(),
}));

jest.mock('../ai/embeddingService', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  cosineSimilarity: jest.fn().mockReturnValue(0.9),
  blobToEmbedding: jest.fn().mockReturnValue([0.1, 0.2, 0.3]),
}));

describe('Matching Benchmark', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should collect parents correctly and call batch update', async () => {
    let mockId = 1;
    mockDb.getFirstAsync.mockImplementation((query, args) => {
      if (query.includes('FROM topics t')) {
        return Promise.resolve({ id: mockId++ });
      }
      return Promise.resolve(null);
    });

    // Mock parent topics
    mockDb.getAllAsync.mockImplementation((query, args) => {
      if (query.includes('parent_topic_id')) {
        return Promise.resolve([
          { parent_topic_id: 100 },
          { parent_topic_id: 101 }
        ]);
      }
      // semantic matches
      return Promise.resolve([{id: 200, embedding: new Uint8Array()}]);
    });

    const topicNames = ['topic 1', 'topic 2', 'topic 3'];

    await markTopicsFromLecture(
      mockDb as any,
      topicNames,
      3,
      "Subject1",
      "Summary"
    );

    const updateCalls = (topicsDb.updateTopicsProgressBatch as jest.Mock).mock.calls;
    console.log(`[Benchmark] Optimized batch update calls: ${updateCalls.length}`);
    expect(updateCalls.length).toBe(1);

    const updatesPassed = updateCalls[0][0];
    console.log(`[Benchmark] Optimized updates list length: ${updatesPassed.length}`);
    expect(updatesPassed.length).toBeGreaterThan(1);

    // Check that we have 100 and 101 in the list of updates
    const ids = updatesPassed.map((u: any) => u.topicId);
    expect(ids).toContain(100);
    expect(ids).toContain(101);

    // Check that parents do not have noteToAppend
    const parent100 = updatesPassed.find((u: any) => u.topicId === 100);
    expect(parent100.noteToAppend).toBeUndefined();

    // Check that regular topics DO have noteToAppend
    const regularTopic = updatesPassed.find((u: any) => u.topicId !== 100 && u.topicId !== 101);
    expect(regularTopic.noteToAppend).toBe("Summary");
  });
});
