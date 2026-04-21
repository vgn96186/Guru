// Block the DB-heavy transitive chain: guruChatSessionSummary → aiCache → database → expo-file-system
jest.mock('../guruChatSessionSummary', () => ({
  parseGuruTutorState: jest.fn(() => ({ stateBlock: '', blockedConcepts: [] })),
}));

jest.mock('./v2/generateText', () => ({
  generateText: jest.fn(),
}));

jest.mock('./v2/streamText', () => ({
  streamText: jest.fn(),
}));

jest.mock('./v2/generateObject', () => ({
  generateObject: jest.fn(),
}));

jest.mock('./v2/providers/guruFallback', () => ({
  createGuruFallbackModel: jest.fn(() => ({ provider: 'test', modelId: 'test-model' })),
}));

jest.mock('../../db/repositories/profileRepository', () => ({
  profileRepository: {
    getProfile: jest.fn().mockResolvedValue({ providerOrder: [], disabledProviders: [] }),
  },
}));

jest.mock('./medicalSearch', () => ({
  searchLatestMedicalSources: jest.fn(),
  searchMedicalImages: jest.fn(),
  generateImageSearchQuery: jest.fn(),
  generateVisualSearchQueries: jest.fn().mockResolvedValue([]),
  dedupeGroundingSources: jest.fn((items: unknown[]) => items),
  renderSourcesForPrompt: jest.fn(() => ''),
  clipText: jest.fn((text: string) => text),
  buildMedicalSearchQuery: jest.fn(() => 'mock query'),
}));

jest.mock('./runtimeDebug', () => ({
  logGroundingEvent: jest.fn(),
  previewText: jest.fn((text: string) => text),
}));

import { generateText } from './v2/generateText';
import { chatWithGuru } from './chat';

const mockGenerateText = jest.mocked(generateText);

function makeTextResult(text: string) {
  return {
    text,
    toolCalls: [],
    toolResults: [],
    finishReason: 'stop' as const,
    usage: { inputTokens: 0, outputTokens: 0 },
    responseMessages: [],
  };
}

describe('chatWithGuru', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('drops a trailing restatement question when the answer was just given on the same line', async () => {
    mockGenerateText.mockResolvedValue(
      makeTextResult(
        'The **superior oblique** depresses the adducted eye. What depresses the adducted eye?',
      ),
    );

    const result = await chatWithGuru('explain', 'Extraocular muscles', []);

    expect(result.reply).toBe('The **superior oblique** depresses the adducted eye.');
  });

  it('keeps a forward-moving question when it asks for the next step instead of repeating the answer', async () => {
    mockGenerateText.mockResolvedValue(
      makeTextResult(
        'The **superior oblique** depresses the adducted eye.\nQuestion: Which nerve innervates it?',
      ),
    );

    const result = await chatWithGuru('explain', 'Extraocular muscles', []);

    expect(result.reply).toBe(
      'The **superior oblique** depresses the adducted eye.\nQuestion: Which nerve innervates it?',
    );
  });

  it('drops a repeated checkpoint when the student asked for direct teaching', async () => {
    mockGenerateText.mockResolvedValue(
      makeTextResult(
        'Edema happens because low **albumin** lowers plasma oncotic pressure, so fluid shifts into tissue.\nQuestion: What causes edema in nephrotic syndrome?',
      ),
    );

    const result = await chatWithGuru(
      "I don't know, just explain edema in nephrotic syndrome",
      'Nephrotic syndrome',
      [],
    );

    expect(result.reply).toBe(
      'Edema happens because low **albumin** lowers plasma oncotic pressure, so fluid shifts into tissue.',
    );
  });

  it('requests a continuation when the first reply looks token-truncated (study session overlay path)', async () => {
    const truncatedBody = `${'x'.repeat(330)}`;
    mockGenerateText
      .mockResolvedValueOnce(makeTextResult(truncatedBody))
      .mockResolvedValueOnce(
        makeTextResult(' Because the mechanism continues with counter-transport.'),
      );

    const result = await chatWithGuru('explain the concept', 'Test topic', []);

    expect(generateText).toHaveBeenCalledTimes(2);
    expect(result.reply).toContain('counter-transport');
    expect(result.reply.length).toBeGreaterThan(truncatedBody.length);
  });

  it('injects explicit highlight marker instructions into the study-session chat prompt', async () => {
    mockGenerateText.mockResolvedValue(makeTextResult('Use ==Acute Inflammation== and !!C5a!!'));

    await chatWithGuru('explain', 'Inflammation', []);

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('Wrap important topic names in ==double equals=='),
          }),
        ]),
      }),
    );
  });
});
