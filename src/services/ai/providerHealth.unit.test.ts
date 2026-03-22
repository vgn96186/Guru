import {
  testGroqConnection,
  testHuggingFaceConnection,
  testOpenRouterConnection,
  testGeminiConnection,
  testCloudflareConnection,
} from './providerHealth';

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: jest.fn().mockResolvedValue({
        text: 'ok',
      }),
    },
  })),
}));

describe('providerHealth', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    const { GoogleGenAI } = jest.requireMock<typeof import('@google/genai')>('@google/genai');
    (GoogleGenAI as jest.Mock).mockImplementation(() => ({
      models: {
        generateContent: jest.fn().mockResolvedValue({ text: 'ok' }),
      },
    }));
  });

  it('returns ok for Groq when the probe request succeeds', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'ok',
    } as Response);

    await expect(testGroqConnection('gsk_test')).resolves.toEqual({ ok: true, status: 200 });
  });

  it('returns fail for OpenRouter when the probe request is rejected', async () => {
    jest.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('network down'));

    await expect(testOpenRouterConnection('or_test')).resolves.toEqual({
      ok: false,
      status: 0,
      message: 'network down',
    });
  });

  it('uses Hugging Face whoami endpoint to validate token', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    } as Response);

    await expect(testHuggingFaceConnection('hf_test')).resolves.toEqual({
      ok: false,
      status: 401,
      message: 'unauthorized',
    });

    expect(fetchSpy).toHaveBeenCalledWith('https://huggingface.co/api/whoami-v2', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer hf_test',
      },
    });
  });

  it('returns fail for Gemini when key is empty', async () => {
    await expect(testGeminiConnection('   ')).resolves.toEqual({
      ok: false,
      status: 0,
      message: 'empty key',
    });
  });

  it('returns ok for Gemini when the SDK probe succeeds', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    } as Response);

    await expect(testGeminiConnection('AIza_test')).resolves.toEqual({ ok: true, status: 200 });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns fail for Gemini when the SDK probe is empty and REST fetch throws', async () => {
    const { GoogleGenAI } = jest.requireMock<typeof import('@google/genai')>('@google/genai');
    (GoogleGenAI as jest.Mock).mockImplementationOnce(() => ({
      models: {
        generateContent: jest.fn().mockResolvedValue({ text: '' }),
      },
    }));
    jest.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('econnreset'));

    await expect(testGeminiConnection('AIza_x')).resolves.toEqual({
      ok: false,
      status: 0,
      message: 'econnreset',
    });
  });

  it('returns fail for Cloudflare when account ID or token is missing', async () => {
    await expect(testCloudflareConnection('', 'tok')).resolves.toEqual({
      ok: false,
      status: 0,
      message: 'Account ID and API token required',
    });
    await expect(testCloudflareConnection('acct', '  ')).resolves.toEqual({
      ok: false,
      status: 0,
      message: 'Account ID and API token required',
    });
  });

  it('returns ok for Cloudflare when the probe succeeds', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    } as Response);

    await expect(testCloudflareConnection('acct_id', 'cf_token')).resolves.toEqual({
      ok: true,
      status: 200,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/acct_id/ai/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer cf_token',
        }),
      }),
    );
  });

  it('returns fail for Cloudflare when fetch throws', async () => {
    jest.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('timeout'));

    await expect(testCloudflareConnection('a', 'b')).resolves.toEqual({
      ok: false,
      status: 0,
      message: 'timeout',
    });
  });
});
