import { act, renderHook } from '@testing-library/react-native';
import { useGuruChat } from './useGuruChat';
import type { UIMessage } from '../services/ai/useChat';
import type { GeneratedStudyImageRecord } from '../db/queries/generatedStudyImages';

const generatedImageFixture: GeneratedStudyImageRecord = {
  id: 7,
  contextType: 'chat',
  contextKey: 'chat:shock:123456',
  topicId: null,
  topicName: 'Shock',
  lectureNoteId: null,
  style: 'chart',
  prompt: 'diagram',
  provider: 'fal',
  modelUsed: 'fal/test',
  mimeType: 'image/png',
  localUri: 'file://image.png',
  remoteUrl: null,
  width: 512,
  height: 512,
  createdAt: 123456,
};

const mockUseChat = jest.fn();
const mockSaveChatMessage = jest.fn();
const mockMarkTopicDiscussedInChat = jest.fn();
const mockGetSessionMemoryRow = jest.fn();
const mockMaybeSummarizeGuruSession = jest.fn();
const mockSetUIMessages = jest.fn();
const mockSendUIMessage = jest.fn();

jest.mock('../services/ai/useChat', () => ({
  useChat: (...args: unknown[]) => mockUseChat(...args),
}));

jest.mock('../db/queries/aiCache', () => ({
  saveChatMessage: (...args: unknown[]) => mockSaveChatMessage(...args),
}));

jest.mock('../db/queries/topics', () => ({
  markTopicDiscussedInChat: (...args: unknown[]) => mockMarkTopicDiscussedInChat(...args),
}));

jest.mock('../db/queries/guruChatMemory', () => ({
  getSessionMemoryRow: (...args: unknown[]) => mockGetSessionMemoryRow(...args),
}));

jest.mock('../services/guruChatSessionSummary', () => ({
  maybeSummarizeGuruSession: (...args: unknown[]) => mockMaybeSummarizeGuruSession(...args),
}));

describe('useGuruChat full cutover', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendUIMessage.mockResolvedValue({
      id: 'assistant-1',
      role: 'assistant',
      text: 'Tutor reply',
      createdAt: 123456,
      sources: [
        {
          id: 's1',
          title: 'Source',
          source: 'PubMed',
          url: 'https://x.test',
          snippet: 'Shock summary',
        },
      ],
      referenceImages: [],
      images: [],
      modelUsed: 'groq/llama',
      searchQuery: 'shock',
    } satisfies UIMessage);
    mockUseChat.mockReturnValue({
      messages: [],
      status: 'idle',
      error: null,
      sendMessage: mockSendUIMessage,
      stop: jest.fn(),
      regenerate: jest.fn(async () => null),
      setMessages: mockSetUIMessages,
    });
    mockSaveChatMessage.mockResolvedValue(undefined);
    mockMarkTopicDiscussedInChat.mockResolvedValue(undefined);
    mockMaybeSummarizeGuruSession.mockResolvedValue(undefined);
    mockGetSessionMemoryRow.mockResolvedValue({
      summaryText: '- updated summary',
      stateJson: '{"focus":"shock"}',
    });
  });

  it('persists user and assistant turns, refreshes threads, marks topic progress, and refreshes session memory', async () => {
    const onRefreshThreads = jest.fn(async () => undefined);
    const onSessionMemoryUpdated = jest.fn();

    const { result } = renderHook(() =>
      useGuruChat({
        model: { provider: 'fallback', modelId: 'test', specificationVersion: 'v2' } as any,
        threadId: 42,
        topicName: 'Shock',
        syllabusTopicId: 9,
        onRefreshThreads,
        onSessionMemoryUpdated,
        context: { sessionSummary: 'old summary' },
      }),
    );

    await act(async () => {
      await result.current.sendMessage(' Explain shock ');
    });

    expect(mockSaveChatMessage).toHaveBeenNthCalledWith(
      1,
      42,
      'Shock',
      'user',
      'Explain shock',
      expect.any(Number),
    );
    const sendCall = mockSendUIMessage.mock.calls[0];
    expect(sendCall[0]).toBe('Explain shock');
    expect(sendCall[1]).toMatchObject({ assistantCreatedAt: expect.any(Number) });
    expect(sendCall[1].systemOverride).toContain('Session summary: old summary');
    expect(sendCall[1].systemOverride).toContain('==double equals==');
    expect(mockSaveChatMessage).toHaveBeenNthCalledWith(
      2,
      42,
      'Shock',
      'guru',
      'Tutor reply',
      123456,
      JSON.stringify([
        {
          id: 's1',
          title: 'Source',
          source: 'PubMed',
          url: 'https://x.test',
          snippet: 'Shock summary',
        },
      ]),
      'groq/llama',
    );
    expect(onRefreshThreads).toHaveBeenCalledTimes(2);
    expect(mockMarkTopicDiscussedInChat).toHaveBeenCalledWith(9);
    expect(mockMaybeSummarizeGuruSession).toHaveBeenCalledWith(42, 'Shock');
    expect(mockGetSessionMemoryRow).toHaveBeenCalledWith(42);
    expect(onSessionMemoryUpdated).toHaveBeenCalledWith({
      summaryText: '- updated summary',
      stateJson: '{"focus":"shock"}',
    });
  });

  it('applies finalizeAssistantMessage before persisting the assistant turn', async () => {
    const finalizeAssistantMessage = jest.fn(async () => ({
      text: 'Tutor reply with image',
      images: [generatedImageFixture],
    }));

    const { result } = renderHook(() =>
      useGuruChat({
        model: { provider: 'fallback', modelId: 'test', specificationVersion: 'v2' } as any,
        threadId: 42,
        topicName: 'Shock',
        finalizeAssistantMessage,
      }),
    );

    await act(async () => {
      await result.current.sendMessage('Explain shock');
    });

    expect(finalizeAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'assistant-1', text: 'Tutor reply' }),
    );
    expect(mockSetUIMessages).toHaveBeenCalledWith(expect.any(Function));
    expect(mockSaveChatMessage).toHaveBeenNthCalledWith(
      2,
      42,
      'Shock',
      'guru',
      'Tutor reply with image',
      123456,
      JSON.stringify([
        {
          id: 's1',
          title: 'Source',
          source: 'PubMed',
          url: 'https://x.test',
          snippet: 'Shock summary',
        },
      ]),
      'groq/llama',
    );
  });

  it('skips persistence side effects when no thread exists yet', async () => {
    const { result } = renderHook(() =>
      useGuruChat({
        model: { provider: 'fallback', modelId: 'test', specificationVersion: 'v2' } as any,
        threadId: null,
        topicName: 'Shock',
        syllabusTopicId: 9,
      }),
    );

    await act(async () => {
      await result.current.sendMessage('Explain shock');
    });

    expect(mockSaveChatMessage).not.toHaveBeenCalled();
    expect(mockMarkTopicDiscussedInChat).not.toHaveBeenCalled();
    expect(mockMaybeSummarizeGuruSession).not.toHaveBeenCalled();
    expect(mockGetSessionMemoryRow).not.toHaveBeenCalled();
  });

  it('persists using persistThreadId when hook threadId is still null', async () => {
    const { result } = renderHook(() =>
      useGuruChat({
        model: { provider: 'fallback', modelId: 'test', specificationVersion: 'v2' } as any,
        threadId: null,
        topicName: 'Shock',
        syllabusTopicId: 9,
      }),
    );

    await act(async () => {
      await result.current.sendMessage('Explain shock', undefined, { persistThreadId: 77 });
    });

    expect(mockSaveChatMessage).toHaveBeenNthCalledWith(
      1,
      77,
      'Shock',
      'user',
      'Explain shock',
      expect.any(Number),
    );
    expect(mockMaybeSummarizeGuruSession).toHaveBeenCalledWith(77, 'Shock');
    expect(mockGetSessionMemoryRow).toHaveBeenCalledWith(77);
  });
});
