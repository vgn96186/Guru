jest.mock('./generate', () => ({
  generateJSONWithRouting: jest.fn(),
  generateTextWithRouting: jest.fn(),
  generateTextWithRoutingStream: jest.fn(),
}));

jest.mock('./medicalSearch', () => ({
  searchLatestMedicalSources: jest.fn(),
  searchMedicalImages: jest.fn(),
  generateImageSearchQuery: jest.fn(),
  dedupeGroundingSources: jest.fn((items: unknown[]) => items),
  renderSourcesForPrompt: jest.fn(() => ''),
  clipText: jest.fn((text: string) => text),
  buildMedicalSearchQuery: jest.fn(() => 'mock query'),
}));

jest.mock('./runtimeDebug', () => ({
  logGroundingEvent: jest.fn(),
  previewText: jest.fn((text: string) => text),
}));

import { generateTextWithRouting } from './generate';
import { chatWithGuru } from './chat';

describe('chatWithGuru', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('drops a trailing restatement question when the answer was just given on the same line', async () => {
    jest.mocked(generateTextWithRouting).mockResolvedValue({
      text: 'The **superior oblique** depresses the adducted eye. What depresses the adducted eye?',
      modelUsed: 'groq/test-model',
    });

    const result = await chatWithGuru('explain', 'Extraocular muscles', []);

    expect(result.reply).toBe('The **superior oblique** depresses the adducted eye.');
  });

  it('keeps a forward-moving question when it asks for the next step instead of repeating the answer', async () => {
    jest.mocked(generateTextWithRouting).mockResolvedValue({
      text: 'The **superior oblique** depresses the adducted eye.\nQuestion: Which nerve innervates it?',
      modelUsed: 'groq/test-model',
    });

    const result = await chatWithGuru('explain', 'Extraocular muscles', []);

    expect(result.reply).toBe(
      'The **superior oblique** depresses the adducted eye.\nQuestion: Which nerve innervates it?',
    );
  });

  it('drops a repeated checkpoint when the student asked for direct teaching', async () => {
    jest.mocked(generateTextWithRouting).mockResolvedValue({
      text: 'Edema happens because low **albumin** lowers plasma oncotic pressure, so fluid shifts into tissue.\nQuestion: What causes edema in nephrotic syndrome?',
      modelUsed: 'groq/test-model',
    });

    const result = await chatWithGuru(
      "I don't know, just explain edema in nephrotic syndrome",
      'Nephrotic syndrome',
      [],
    );

    expect(result.reply).toBe(
      'Edema happens because low **albumin** lowers plasma oncotic pressure, so fluid shifts into tissue.',
    );
  });
});
