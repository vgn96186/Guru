import { maybeSummarizeGuruSession, GURU_SESSION_SUMMARY_INTERVAL } from './guruChatSessionSummary';
import { generateTextWithRouting } from './ai/generate';
import { getChatHistory, getChatMessageCount } from '../db/queries/aiCache';
import { getSessionMemoryRow, upsertSessionMemory } from '../db/queries/guruChatMemory';

jest.mock('./ai/generate', () => ({
  generateTextWithRouting: jest.fn(),
}));

jest.mock('../db/queries/aiCache', () => ({
  getChatMessageCount: jest.fn(),
  getChatHistory: jest.fn(),
}));

jest.mock('../db/queries/guruChatMemory', () => ({
  getSessionMemoryRow: jest.fn(),
  upsertSessionMemory: jest.fn(),
}));

const mockGenerate = generateTextWithRouting as jest.MockedFunction<typeof generateTextWithRouting>;
const mockCount = getChatMessageCount as jest.MockedFunction<typeof getChatMessageCount>;
const mockHistory = getChatHistory as jest.MockedFunction<typeof getChatHistory>;
const mockRow = getSessionMemoryRow as jest.MockedFunction<typeof getSessionMemoryRow>;
const mockUpsert = upsertSessionMemory as jest.MockedFunction<typeof upsertSessionMemory>;

describe('guruChatSessionSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerate.mockResolvedValue({ text: '- Point one', modelUsed: 'm' });
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
      updatedAt: 0,
      messagesAtLastSummary: 0,
    });

    await maybeSummarizeGuruSession(7, 'x');

    expect(mockGenerate).toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledWith(7, 'x', '- Point one', 8);
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
      updatedAt: 0,
      messagesAtLastSummary: 0,
    });
    mockGenerate.mockResolvedValue({ text: '   ', modelUsed: 'm' });

    await maybeSummarizeGuruSession(7, 'x');

    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
