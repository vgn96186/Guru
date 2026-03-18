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
  updateTopicProgressInTx: jest.fn(),
}));

jest.mock('../ai/embeddingService', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  cosineSimilarity: jest.fn().mockReturnValue(0.9),
  blobToEmbedding: jest.fn().mockReturnValue([0.1, 0.2, 0.3]),
}));

describe('Matching Benchmark', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (topicsDb.updateTopicProgressInTx as jest.Mock).mockResolvedValue(undefined);
  });

  it('should collect parents correctly and update direct and parent topics', async () => {
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
        return Promise.resolve([{ parent_topic_id: 100 }, { parent_topic_id: 101 }]);
      }
      // semantic matches
      return Promise.resolve([{ id: 200, embedding: new Uint8Array() }]);
    });

    const topicNames = ['topic 1', 'topic 2', 'topic 3'];

    await markTopicsFromLecture(mockDb as any, topicNames, 3, 'Subject1', 'Summary');

    const updateCalls = (topicsDb.updateTopicProgressInTx as jest.Mock).mock.calls;
    expect(updateCalls.length).toBeGreaterThan(1);

    const updatedTopicIds = updateCalls.map((call) => call[1]);
    expect(updatedTopicIds).toContain(100);
    expect(updatedTopicIds).toContain(101);
    expect(updatedTopicIds).toContain(1);
    expect(updatedTopicIds).toContain(2);
    expect(updatedTopicIds).toContain(3);

    const parent100Call = updateCalls.find((call) => call[1] === 100);
    expect(parent100Call).toBeDefined();
    expect(parent100Call?.[2]).toBe('seen');
    expect(parent100Call?.[3]).toBe(3);
    expect(parent100Call?.[4]).toBe(0);
    expect(parent100Call?.[5]).toBeUndefined();

    const directTopicCall = updateCalls.find((call) => call[1] === 1);
    expect(directTopicCall).toBeDefined();
    expect(directTopicCall?.[2]).toBe('seen');
    expect(directTopicCall?.[3]).toBe(3);
    expect(directTopicCall?.[4]).toBe(0);
    expect(directTopicCall?.[5]).toBe('Summary');
  });
});
