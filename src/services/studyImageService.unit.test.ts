import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetProfile: any = jest.fn();
const mockSaveGeneratedStudyImage: any = jest.fn();
const mockGenerateImage: any = jest.fn();

jest.mock('../db/repositories', () => ({
  profileRepository: {
    getProfile: () => mockGetProfile(),
  },
}));

jest.mock('./ai/imageGeneration', () => ({
  generateImage: (...args: unknown[]) => mockGenerateImage(...args),
}));

jest.mock('../db/queries/generatedStudyImages', () => ({
  saveGeneratedStudyImage: (...args: unknown[]) => mockSaveGeneratedStudyImage(...args),
}));

describe('studyImageService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    (globalThis as any).__DEV__ = false;
    mockGetProfile.mockResolvedValue({
      geminiKey: 'gemini-key',
      cloudflareAccountId: 'cf-account',
      cloudflareApiToken: 'cf-token',
    });
    mockGenerateImage.mockResolvedValue({
      uri: 'file:///test-docs/generated-study-images/example.png',
      modelUsed: '@cf/black-forest-labs/flux-2-dev',
      prompt: 'provider prompt',
      provider: 'cloudflare',
      mimeType: 'image/png',
    });
    mockSaveGeneratedStudyImage.mockImplementation(async (input: any) => ({
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
    expect(prompt.toLowerCase()).toContain('medical education illustration');
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

    expect(mockGenerateImage).toHaveBeenCalledWith(
      expect.stringContaining(
        'NEET-PG / INICET study diagram (chart style) for topic: Renal Physiology.',
      ),
      { steps: 28 },
    );
    expect(mockSaveGeneratedStudyImage).toHaveBeenCalledWith(
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
    mockGenerateImage.mockResolvedValueOnce({
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

    expect(mockSaveGeneratedStudyImage).toHaveBeenCalledWith(
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
