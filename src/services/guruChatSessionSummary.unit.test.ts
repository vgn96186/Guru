import { maybeSummarizeGuruSession, GURU_SESSION_SUMMARY_INTERVAL } from './guruChatSessionSummary';
import { generateObject } from './ai/v2/generateObject';
import { createGuruFallbackModel } from './ai/v2/providers/guruFallback';
import { profileRepository } from '../db/repositories/profileRepository';
import { getChatHistory, getChatMessageCount } from '../db/queries/aiCache';
import { getSessionMemoryRow, upsertSessionMemory } from '../db/queries/guruChatMemory';

jest.mock('./ai/v2/generateObject', () => ({
  generateObject: jest.fn(),
}));

jest.mock('./ai/v2/providers/guruFallback', () => ({
  createGuruFallbackModel: jest.fn(),
}));

jest.mock('../db/repositories/profileRepository', () => ({
  profileRepository: { getProfile: jest.fn() },
}));

jest.mock('../db/queries/aiCache', () => ({
  getChatMessageCount: jest.fn(),
  getChatHistory: jest.fn(),
}));

jest.mock('../db/queries/guruChatMemory', () => ({
  getSessionMemoryRow: jest.fn(),
  upsertSessionMemory: jest.fn(),
}));

const mockGenerate = generateObject as jest.MockedFunction<typeof generateObject>;
const mockCreateModel = createGuruFallbackModel as jest.MockedFunction<typeof createGuruFallbackModel>;
const mockGetProfile = profileRepository.getProfile as jest.MockedFunction<
  typeof profileRepository.getProfile
>;
const mockCount = getChatMessageCount as jest.MockedFunction<typeof getChatMessageCount>;
const mockHistory = getChatHistory as jest.MockedFunction<typeof getChatHistory>;
const mockRow = getSessionMemoryRow as jest.MockedFunction<typeof getSessionMemoryRow>;
const mockUpsert = upsertSessionMemory as jest.MockedFunction<typeof upsertSessionMemory>;

const structuredSummary = {
  object: {
    summaryBullets: ['Point one'],
    state: {
      version: 1,
      currentTopicFocus: 'x',
      currentSubtopic: '',
      activeMode: 'diagnose',
      lastStudentIntent: 'clarify_doubt',
      openDoubts: [],
      resolvedDoubts: [],
      misconceptions: [],
      prerequisitesExplained: [],
      factsConfirmed: [],
      questionConceptsAlreadyAsked: [],
      avoidReaskingConcepts: [],
      nextMicroGoal: '',
      tangentParkingLot: [],
    },
  },
  finishReason: 'stop' as const,
  usage: {},
} as const;

describe('guruChatSessionSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerate.mockResolvedValue(structuredSummary as any);
    mockCreateModel.mockReturnValue({} as any);
    mockGetProfile.mockResolvedValue({} as any);
    mockHistory.mockResolvedValue([
      { id: 1, threadId: 7, topicName: 't', role: 'user', message: 'hi', timestamp: 1 },
      { id: 2, threadId: 7, topicName: 't', role: 'guru', message: 'hello', timestamp: 2 },
    ]);
  });

  it('skips when not enough new messages since last summary', async () => {
    mockCount.mockResolvedValue(5);
    mockRow.mockResolvedValue({
      threadId: 7,
      topicName: 'x',
      summaryText: '',
      stateJson: '{}',
      updatedAt: 0,
      messagesAtLastSummary: 0,
    });

    await maybeSummarizeGuruSession(7, 'x');

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('summarizes and upserts when threshold reached', async () => {
    mockCount.mockResolvedValue(8);
    mockRow.mockResolvedValue({
      threadId: 7,
      topicName: 'x',
      summaryText: '',
      stateJson: '{}',
      updatedAt: 0,
      messagesAtLastSummary: 0,
    });

    await maybeSummarizeGuruSession(7, 'x');

    expect(mockGenerate).toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledWith(7, 'x', '- Point one', 8, expect.any(String));
  });

  it('GURU_SESSION_SUMMARY_INTERVAL is positive', () => {
    expect(GURU_SESSION_SUMMARY_INTERVAL).toBeGreaterThan(0);
  });

  it('does not upsert when generation fails', async () => {
    mockCount.mockResolvedValue(10);
    mockRow.mockResolvedValue({
      threadId: 7,
      topicName: 'x',
      summaryText: '',
      stateJson: '{}',
      updatedAt: 0,
      messagesAtLastSummary: 0,
    });
    mockGenerate.mockRejectedValue(new Error('fail'));

    await expect(maybeSummarizeGuruSession(7, 'x')).resolves.toBeUndefined();

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('returns when history is empty', async () => {
    mockCount.mockResolvedValue(10);
    mockRow.mockResolvedValue({
      threadId: 7,
      topicName: 'x',
      summaryText: '',
      stateJson: '{}',
      updatedAt: 0,
      messagesAtLastSummary: 0,
    });
    mockHistory.mockResolvedValue([]);

    await maybeSummarizeGuruSession(7, 'x');

    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('does not upsert when model returns whitespace only', async () => {
    mockCount.mockResolvedValue(10);
    mockRow.mockResolvedValue({
      threadId: 7,
      topicName: 'x',
      summaryText: '',
      stateJson: '{}',
      updatedAt: 0,
      messagesAtLastSummary: 0,
    });
    mockGenerate.mockResolvedValue({
      ...structuredSummary,
      object: { ...structuredSummary.object, summaryBullets: ['   '] },
    } as any);

    await maybeSummarizeGuruSession(7, 'x');

    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
