import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const getProfileMock: any = jest.fn();
const saveGeneratedStudyImageMock: any = jest.fn();
const generateImageMock: any = jest.fn();

jest.mock('../db/repositories', () => ({
  profileRepository: {
    getProfile: () => getProfileMock(),
  },
}));

jest.mock('./ai/imageGeneration', () => ({
  generateImage: (...args: unknown[]) => generateImageMock(...args),
}));

jest.mock('../db/queries/generatedStudyImages', () => ({
  saveGeneratedStudyImage: (...args: unknown[]) => saveGeneratedStudyImageMock(...args),
}));

describe('studyImageService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    (globalThis as any).__DEV__ = false;
    getProfileMock.mockResolvedValue({
      geminiKey: 'gemini-key',
      cloudflareAccountId: 'cf-account',
      cloudflareApiToken: 'cf-token',
    });
    generateImageMock.mockResolvedValue({
      uri: 'file:///test-docs/generated-study-images/example.png',
      modelUsed: '@cf/black-forest-labs/flux-2-dev',
      prompt: 'provider prompt',
      provider: 'cloudflare',
      mimeType: 'image/png',
    });
    saveGeneratedStudyImageMock.mockImplementation(async (input: any) => ({
      id: 42,
      createdAt: 1234567890,
      ...input,
    }));
  });

  it('builds an illustration prompt with the topic and source text', async () => {
    const { buildStudyImagePrompt } = await import('./studyImageService');

    const prompt = buildStudyImagePrompt({
      topicName: 'Renin Angiotensin Aldosterone System',
      sourceText: 'Renin converts angiotensinogen to angiotensin I, then ACE forms angiotensin II.',
      style: 'illustration',
    });

    expect(prompt).toContain('Renin Angiotensin Aldosterone System');
    expect(prompt.toLowerCase()).toContain('medical illustration');
    expect(prompt).toContain('angiotensin II');
    expect(prompt.toLowerCase()).toContain('neet-pg');
  });

  it('persists generated image metadata for chat context', async () => {
    const { generateStudyImage } = await import('./studyImageService');
    const result = await generateStudyImage({
      contextType: 'chat',
      contextKey: 'General Medicine:100',
      topicName: 'Renal Physiology',
      sourceText: 'Explain RAAS with a simple pathway.',
      style: 'chart',
    });

    expect(generateImageMock).toHaveBeenCalledWith(
      expect.stringContaining('Create a clean NEET-PG study chart for Renal Physiology.'),
      { steps: 6 },
    );
    expect(saveGeneratedStudyImageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contextType: 'chat',
        contextKey: 'General Medicine:100',
        provider: 'cloudflare',
        modelUsed: '@cf/black-forest-labs/flux-2-dev',
        style: 'chart',
        mimeType: 'image/png',
        localUri: 'file:///test-docs/generated-study-images/example.png',
      }),
    );
    expect(result.provider).toBe('cloudflare');
  });

  it('persists Google-generated images for topic notes', async () => {
    generateImageMock.mockResolvedValueOnce({
      uri: 'file:///test-docs/generated-study-images/google.png',
      modelUsed: 'gemini-3-pro-image-preview',
      prompt: 'provider prompt',
      provider: 'google',
      mimeType: 'image/png',
    });

    const { generateStudyImage } = await import('./studyImageService');
    const result = await generateStudyImage({
      contextType: 'topic_note',
      contextKey: 'topic:77',
      topicId: 77,
      topicName: 'Pericardial tamponade',
      sourceText: 'Beck triad and pulsus paradoxus.',
      style: 'illustration',
    });

    expect(saveGeneratedStudyImageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contextType: 'topic_note',
        topicId: 77,
        provider: 'google',
        modelUsed: 'gemini-3-pro-image-preview',
        style: 'illustration',
        localUri: 'file:///test-docs/generated-study-images/google.png',
      }),
    );
    expect(result.provider).toBe('google');
  });
});
