import {
  testGroqConnection,
  testHuggingFaceConnection,
  testOpenRouterConnection,
} from './providerHealth';

describe('providerHealth', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
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
});
