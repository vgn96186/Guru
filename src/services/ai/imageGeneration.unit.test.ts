const getProfileMock: any = jest.fn();
const makeDirectoryAsyncMock: any = jest.fn();
const writeAsStringAsyncMock: any = jest.fn();
const downloadAsyncMock: any = jest.fn();

async function loadModule(configOverrides?: {
  bundledGeminiKey?: string;
  bundledCfAccountId?: string;
  bundledCfApiToken?: string;
}) {
  jest.resetModules();
  (globalThis as any).__DEV__ = false;

  jest.doMock('../../db/repositories/profileRepository', () => ({
    profileRepository: {
      getProfile: () => getProfileMock(),
    },
  }));

  jest.doMock('expo-file-system/legacy', () => ({
    __esModule: true,
    documentDirectory: 'file:///test-docs/',
    makeDirectoryAsync: (...args: unknown[]) => makeDirectoryAsyncMock(...args),
    writeAsStringAsync: (...args: unknown[]) => writeAsStringAsyncMock(...args),
    downloadAsync: (...args: unknown[]) => downloadAsyncMock(...args),
    EncodingType: {
      Base64: 'base64',
    },
  }));

  jest.doMock('./google/geminiImage', () => ({
    geminiInteractionImageSdk: jest.fn().mockResolvedValue(null),
  }));

  jest.doMock('./config', () => ({
    FAL_IMAGE_MODELS: [
      'fal-ai/nano-banana-2',
      'fal-ai/flux-pro/kontext/max/text-to-image',
      'fal-ai/qwen-image-2/pro/text-to-image',
      'fal-ai/gpt-image-1.5',
    ],
    CLOUDFLARE_IMAGE_MODELS: [
      '@cf/black-forest-labs/flux-2-dev',
      '@cf/black-forest-labs/flux-1-schnell',
    ],
    GEMINI_IMAGE_MODELS: [
      'gemini-2.5-flash-image',
      'gemini-3.1-flash-image-preview',
      'gemini-3-pro-image-preview',
    ],
    getApiKeys: (profile?: {
      geminiKey?: string;
      cloudflareAccountId?: string;
      cloudflareApiToken?: string;
      falApiKey?: string;
      openrouterKey?: string;
      imageGenerationModel?: string;
    }) => ({
      geminiKey: profile?.geminiKey?.trim() || configOverrides?.bundledGeminiKey || undefined,
      cfAccountId:
        profile?.cloudflareAccountId?.trim() || configOverrides?.bundledCfAccountId || undefined,
      cfApiToken:
        profile?.cloudflareApiToken?.trim() || configOverrides?.bundledCfApiToken || undefined,
      falKey: profile?.falApiKey?.trim() || undefined,
      orKey: profile?.openrouterKey?.trim() || undefined,
    }),
  }));

  return import('./imageGeneration');
}

describe('ai/imageGeneration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getProfileMock.mockResolvedValue({
      geminiKey: 'gemini-key',
      cloudflareAccountId: 'cf-account',
      cloudflareApiToken: 'cf-token',
    });
    makeDirectoryAsyncMock.mockResolvedValue(undefined);
    writeAsStringAsyncMock.mockResolvedValue(undefined);
    downloadAsyncMock.mockResolvedValue({
      uri: 'file:///test-docs/generated_images/guru_img_123.png',
    });
  });

  it('uses Gemini first and saves the generated image locally', async () => {
    jest.spyOn(globalThis, 'fetch' as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        outputs: [{ type: 'image', mime_type: 'image/png', data: 'R0VNSU5JLUlNQUdF' }],
      }),
    } as any);

    const { generateImage } = await loadModule();
    const result = await generateImage('draw RAAS');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
    );
    expect(makeDirectoryAsyncMock).toHaveBeenCalledWith('file:///test-docs/generated_images/', {
      intermediates: true,
    });
    expect(writeAsStringAsyncMock).toHaveBeenCalledWith(
      expect.stringContaining('file:///test-docs/generated_images/guru_img_'),
      'R0VNSU5JLUlNQUdF',
      { encoding: 'base64' },
    );
    expect(result.provider).toBe('google');
    expect(result.modelUsed).toBe('gemini-2.5-flash-image');
  });

  it('falls back to Cloudflare when Gemini fails', async () => {
    jest
      .spyOn(globalThis, 'fetch' as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'gemini failed',
      } as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'gemini failed',
      } as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'gemini failed',
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            image: 'Q0xPVURGTEFSRS1JTUFHRQ==',
          },
        }),
      } as any);

    const { generateImage } = await loadModule();
    const result = await generateImage('draw pericardial tamponade');

    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    for (let i = 0; i < 3; i++) {
      expect((globalThis.fetch as jest.Mock).mock.calls[i][0]).toBe(
        'https://generativelanguage.googleapis.com/v1beta/interactions',
      );
    }
    expect((globalThis.fetch as jest.Mock).mock.calls[3][0]).toContain(
      '/ai/run/@cf/black-forest-labs/flux-2-dev',
    );
    expect(result.provider).toBe('cloudflare');
    expect(result.modelUsed).toBe('@cf/black-forest-labs/flux-2-dev');
  });

  it('uses only Cloudflare when imageGenerationModel is a CF model id', async () => {
    getProfileMock.mockResolvedValue({
      geminiKey: 'gemini-key',
      cloudflareAccountId: 'cf-account',
      cloudflareApiToken: 'cf-token',
      imageGenerationModel: '@cf/black-forest-labs/flux-1-schnell',
    });

    jest.spyOn(globalThis, 'fetch' as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          image: 'Q0xPVURGTEFSRS1JTUFHRQ==',
        },
      }),
    } as any);

    const { generateImage } = await loadModule();
    const result = await generateImage('draw RAAS');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toContain(
      '/ai/run/@cf/black-forest-labs/flux-1-schnell',
    );
    expect(result.provider).toBe('cloudflare');
    expect(result.modelUsed).toBe('@cf/black-forest-labs/flux-1-schnell');
  });

  it('does not fall back to Cloudflare when Gemini-only and Gemini fails', async () => {
    getProfileMock.mockResolvedValue({
      geminiKey: 'gemini-key',
      cloudflareAccountId: 'cf-account',
      cloudflareApiToken: 'cf-token',
      imageGenerationModel: 'gemini-3-pro-image-preview',
    });

    jest.spyOn(globalThis, 'fetch' as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'gemini failed',
    } as any);

    const { generateImage } = await loadModule();

    await expect(generateImage('draw RAAS')).rejects.toThrow(
      'No image generation backend available',
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('uses Cloudflare when Gemini key is missing', async () => {
    getProfileMock.mockResolvedValue({
      geminiKey: '',
      cloudflareAccountId: 'cf-account',
      cloudflareApiToken: 'cf-token',
    });

    jest.spyOn(globalThis, 'fetch' as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          image: 'Q0xPVURGTEFSRS1JTUFHRQ==',
        },
      }),
    } as any);

    const { generateImage } = await loadModule();
    const result = await generateImage('draw RAAS');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toContain(
      '/ai/run/@cf/black-forest-labs/flux-2-dev',
    );
    expect(result.provider).toBe('cloudflare');
  });

  it('throws a clear error when no image backend credentials are available', async () => {
    getProfileMock.mockResolvedValue({
      geminiKey: '',
      cloudflareAccountId: '',
      cloudflareApiToken: '',
    });

    const { generateImage } = await loadModule();

    await expect(generateImage('simple chart')).rejects.toThrow(
      'No image generation backend available',
    );
  });

  it('uses fal when imageGenerationModel is a fal image model id', async () => {
    getProfileMock.mockResolvedValue({
      geminiKey: '',
      cloudflareAccountId: '',
      cloudflareApiToken: '',
      falApiKey: 'fal-key',
      imageGenerationModel: 'fal-ai/gpt-image-1.5',
    });

    jest.spyOn(globalThis, 'fetch' as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        images: [
          {
            url: 'https://fal.media/example.png',
            content_type: 'image/png',
          },
        ],
      }),
    } as any);
    const { generateImage } = await loadModule();
    const result = await generateImage('draw nephron');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://fal.run/fal-ai/gpt-image-1.5',
    );
    expect((globalThis.fetch as jest.Mock).mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Key fal-key',
        'Content-Type': 'application/json',
      }),
    });
    const body = JSON.parse((globalThis.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.prompt).toBe('draw nephron');
    expect(body.output_format).toBe('png');
    expect(result.provider).toBe('fal');
    expect(result.modelUsed).toBe('fal-ai/gpt-image-1.5');
  });

  it('uses the newer fal text-to-image payload for Nano Banana 2', async () => {
    getProfileMock.mockResolvedValue({
      geminiKey: '',
      cloudflareAccountId: '',
      cloudflareApiToken: '',
      falApiKey: 'fal-key',
      imageGenerationModel: 'fal-ai/nano-banana-2',
    });

    jest.spyOn(globalThis, 'fetch' as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        images: [
          {
            url: 'https://fal.media/nano-banana.png',
            content_type: 'image/png',
          },
        ],
      }),
    } as any);

    const { generateImage } = await loadModule();
    const result = await generateImage('draw a nephron as a clean study diagram');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://fal.run/fal-ai/nano-banana-2',
    );
    const body = JSON.parse((globalThis.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toMatchObject({
      prompt: 'draw a nephron as a clean study diagram',
      aspect_ratio: '1:1',
      output_format: 'png',
      num_images: 1,
    });
    expect(body.image_size).toBeUndefined();
    expect(body.quality).toBeUndefined();
    expect(result.modelUsed).toBe('fal-ai/nano-banana-2');
  });

  it('reports image generation as available when fal key is present', async () => {
    const { isImageGenerationAvailable } = await loadModule();
    expect(isImageGenerationAvailable({ falApiKey: 'fal-key' })).toBe(true);
  });
});
