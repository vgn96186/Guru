const getProfileMock: any = jest.fn();
const makeDirectoryAsyncMock: any = jest.fn();
const writeAsStringAsyncMock: any = jest.fn();

async function loadModule(configOverrides?: {
  bundledGeminiKey?: string;
  bundledCfAccountId?: string;
  bundledCfApiToken?: string;
}) {
  jest.resetModules();
  (globalThis as any).__DEV__ = false;

  jest.doMock('../../db/repositories', () => ({
    profileRepository: {
      getProfile: () => getProfileMock(),
    },
  }));

  jest.doMock('expo-file-system/legacy', () => ({
    __esModule: true,
    documentDirectory: 'file:///test-docs/',
    makeDirectoryAsync: (...args: unknown[]) => makeDirectoryAsyncMock(...args),
    writeAsStringAsync: (...args: unknown[]) => writeAsStringAsyncMock(...args),
    EncodingType: {
      Base64: 'base64',
    },
  }));

  jest.doMock('./google/geminiImage', () => ({
    geminiInteractionImageSdk: jest.fn().mockResolvedValue(null),
  }));

  jest.doMock('./config', () => ({
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
      imageGenerationModel?: string;
    }) => ({
      geminiKey: profile?.geminiKey?.trim() || configOverrides?.bundledGeminiKey || undefined,
      cfAccountId:
        profile?.cloudflareAccountId?.trim() || configOverrides?.bundledCfAccountId || undefined,
      cfApiToken:
        profile?.cloudflareApiToken?.trim() || configOverrides?.bundledCfApiToken || undefined,
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

    await expect(generateImage('draw RAAS')).rejects.toThrow('No image generation backend available');
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
});
