jest.mock('./genaiClient', () => ({
  getGoogleGenAI: jest.fn(),
}));

import { getGoogleGenAI } from './genaiClient';
import { geminiGenerateStructuredJsonSdk } from './geminiStructured';
import { z } from 'zod';

const sampleKeypoints = {
  type: 'keypoints' as const,
  topicName: 'Test topic',
  points: ['A', 'B'],
  memoryHook: 'hook',
};

describe('geminiGenerateStructuredJsonSdk', () => {
  beforeEach(() => {
    jest.mocked(getGoogleGenAI).mockReset();
  });

  it('parses JSON response and validates with Zod', async () => {
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify(sampleKeypoints),
    });
    jest.mocked(getGoogleGenAI).mockReturnValue({
      models: { generateContent },
    } as any);

    const schema = z.object({
      type: z.literal('keypoints'),
      topicName: z.string(),
      points: z.array(z.string()),
      memoryHook: z.string(),
    });

    const out = await geminiGenerateStructuredJsonSdk(
      [{ role: 'user', content: 'hi' }],
      schema,
      'test-api-key',
      'low',
    );

    expect(out.parsed).toEqual(sampleKeypoints);
    expect(out.modelUsed).toBe('gemini/gemini-3.1-flash-lite');
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-3.1-flash-lite',
        config: expect.objectContaining({ maxOutputTokens: 4096 }),
      }),
    );
  });

  it('uses the high-tier structured model for taskComplexity high', async () => {
    const generateContent = jest.fn().mockResolvedValue({
      text: JSON.stringify({ a: 1 }),
    });
    jest.mocked(getGoogleGenAI).mockReturnValue({
      models: { generateContent },
    } as any);

    const schema = z.object({ a: z.number() });
    await geminiGenerateStructuredJsonSdk([{ role: 'user', content: 'x' }], schema, 'k', 'high');

    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-3.0-flash-preview',
        config: expect.objectContaining({ maxOutputTokens: 8192 }),
      }),
    );
  });

  it('throws when response is not valid JSON', async () => {
    jest.mocked(getGoogleGenAI).mockReturnValue({
      models: {
        generateContent: jest.fn().mockResolvedValue({
          text: 'not json',
        }),
      },
    } as any);

    const schema = z.object({ a: z.number() });
    await expect(
      geminiGenerateStructuredJsonSdk([{ role: 'user', content: 'x' }], schema, 'k', 'low'),
    ).rejects.toThrow(/JSON/);
  });

  it('rethrows RateLimitError on 429-like SDK errors', async () => {
    jest.mocked(getGoogleGenAI).mockReturnValue({
      models: {
        generateContent: jest.fn().mockRejectedValue({ status: 429 }),
      },
    } as any);

    const schema = z.object({ a: z.number() });
    const { RateLimitError } = await import('../schemas');
    await expect(
      geminiGenerateStructuredJsonSdk([{ role: 'user', content: 'x' }], schema, 'k', 'low'),
    ).rejects.toBeInstanceOf(RateLimitError);
  });
});
