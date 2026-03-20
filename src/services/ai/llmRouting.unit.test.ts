type FetchResponse = {
  ok: boolean;
  status?: number;
  json?: () => Promise<any>;
  text?: () => Promise<string>;
};

function mockResponse(response: FetchResponse): any {
  return {
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: response.json ?? (async () => ({})),
    text: response.text ?? (async () => ''),
  } as any;
}

async function loadRoutingModule() {
  jest.resetModules();
  (globalThis as any).__DEV__ = false;

  const addEventListener = jest.fn();
  const releaseMock = jest.fn(async () => undefined);
  const completionMock = jest.fn(async () => ({ text: 'local-text' }));
  const initLlamaMock = jest.fn(async () => ({
    completion: completionMock,
    release: releaseMock,
  }));
  const updateProfileMock = jest.fn(async () => undefined);

  jest.doMock('react-native', () => ({
    AppState: { addEventListener },
  }));
  jest.doMock('llama.rn', () => ({
    initLlama: initLlamaMock,
  }));
  jest.doMock('../../db/repositories', () => ({
    profileRepository: { updateProfile: updateProfileMock },
    dailyLogRepository: {},
  }));
  jest.doMock('./config', () => ({
    GROQ_MODELS: ['groq-a', 'groq-b'],
    OPENROUTER_FREE_MODELS: ['or-a', 'or-b'],
  }));

  const module = await import('./llmRouting');
  return {
    module,
    initLlamaMock,
    completionMock,
    updateProfileMock,
    addEventListener,
  };
}

describe('llmRouting', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('tries preferred Groq model first, then falls back to default Groq list', async () => {
    const { module } = await loadRoutingModule();
    const calledModels: string[] = [];

    jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async (_url: unknown, init: any) => {
      const body = JSON.parse(init.body);
      calledModels.push(body.model);
      if (body.model === 'preferred-groq') {
        return mockResponse({ ok: false, status: 500, text: async () => 'preferred failed' });
      }
      return mockResponse({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'groq-success' } }] }),
      });
    });

    const result = await module.attemptCloudLLM(
      [{ role: 'user', content: 'hi' }],
      'or-key',
      false,
      'groq-key',
      'groq/preferred-groq',
    );

    expect(result.text).toBe('groq-success');
    expect(result.modelUsed).toBe('groq/groq-a');
    expect(calledModels.slice(0, 2)).toEqual(['preferred-groq', 'groq-a']);
  });

  it('retries next Groq model on rate limit before OpenRouter fallback', async () => {
    const { module } = await loadRoutingModule();
    const callOrder: string[] = [];

    jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async (url: unknown, init: any) => {
      const requestUrl = String(url);
      const body = JSON.parse(init.body);
      if (requestUrl.includes('api.groq.com')) {
        callOrder.push(`groq:${body.model}`);
        if (body.model === 'groq-a') {
          return mockResponse({ ok: false, status: 429, text: async () => 'rate limited' });
        }
        return mockResponse({
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'groq-b-success' } }] }),
        });
      }
      callOrder.push(`or:${body.model}`);
      return mockResponse({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'or-success' } }] }),
      });
    });

    const result = await module.attemptCloudLLM(
      [{ role: 'user', content: 'hi' }],
      'or-key',
      true,
      'groq-key',
    );

    expect(result.text).toBe('groq-b-success');
    expect(result.modelUsed).toBe('groq/groq-b');
    expect(callOrder).toEqual(['groq:groq-a', 'groq:groq-b']);
  });

  it('throws clear error when no cloud keys are available', async () => {
    const { module } = await loadRoutingModule();

    await expect(
      module.attemptCloudLLM([{ role: 'user', content: 'hi' }], undefined, false),
    ).rejects.toThrow(
      'No AI backend available. Download a local model or add an API key in Settings.',
    );
  });

  it('clears local model profile state when model file is missing/corrupt', async () => {
    const { module, updateProfileMock, completionMock } = await loadRoutingModule();

    completionMock.mockRejectedValueOnce(new Error('failed to load model: no such file'));

    await expect(
      module.attemptLocalLLM([{ role: 'user', content: 'hi' }], '/models/missing.gguf', false),
    ).rejects.toThrow('Local model file is missing or corrupt');

    expect(updateProfileMock).toHaveBeenCalledWith({ localModelPath: null, useLocalModel: false });
  });

  it('falls back to OpenRouter when all Groq models fail', async () => {
    const { module } = await loadRoutingModule();
    const callOrder: string[] = [];

    jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async (url: unknown, init: any) => {
      const requestUrl = String(url);
      const body = JSON.parse(init.body);
      if (requestUrl.includes('api.groq.com')) {
        callOrder.push(`groq:${body.model}`);
        return mockResponse({ ok: false, status: 500, text: async () => 'groq failed' });
      }
      if (requestUrl.includes('openrouter.ai')) {
        callOrder.push(`or:${body.model}`);
        return mockResponse({
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'or-success' } }] }),
        });
      }
      return mockResponse({ ok: false });
    });

    const result = await module.attemptCloudLLM(
      [{ role: 'user', content: 'hi' }],
      'or-key',
      false,
      'groq-key',
    );

    expect(result.text).toBe('or-success');
    expect(result.modelUsed).toBe('or-a');
    expect(callOrder).toEqual(['groq:groq-a', 'groq:groq-b', 'or:or-a']);
  });

  it('tries next OpenRouter model on error', async () => {
    const { module } = await loadRoutingModule();
    const callOrder: string[] = [];

    jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async (url: unknown, init: any) => {
      const requestUrl = String(url);
      const body = JSON.parse(init.body);
      if (requestUrl.includes('openrouter.ai')) {
        callOrder.push(`or:${body.model}`);
        if (body.model === 'or-a') {
          return mockResponse({ ok: false, status: 500, text: async () => 'or-a failed' });
        }
        return mockResponse({
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'or-b-success' } }] }),
        });
      }
      return mockResponse({ ok: false });
    });

    const result = await module.attemptCloudLLM(
      [{ role: 'user', content: 'hi' }],
      'or-key',
      false,
      undefined, // No Groq key
    );

    expect(result.text).toBe('or-b-success');
    expect(result.modelUsed).toBe('or-b');
    expect(callOrder).toEqual(['or:or-a', 'or:or-b']);
  });

  it('throws error when local model returns empty response', async () => {
    const { module, completionMock } = await loadRoutingModule();
    // In textMode=true, empty completion remains empty
    completionMock.mockResolvedValueOnce({ text: '' });

    await expect(
      module.attemptLocalLLM([{ role: 'user', content: 'hi' }], '/path/to/model', true),
    ).rejects.toThrow('Local model returned an empty response');
  });

  it('releaseLlamaContext does nothing when context is in use', async () => {
    const releaseMock = jest.fn(async () => undefined);
    const { module, initLlamaMock, completionMock } = await loadRoutingModule();
    
    // Make initLlama return a stable object so we can spy on it
    const stableCtx = {
      completion: completionMock,
      release: releaseMock,
    };
    initLlamaMock.mockResolvedValue(stableCtx);

    // Start a generation (it will be in flight)
    let resolveCompletion: (val: { text: string }) => void;
    const completionPromise = new Promise<{ text: string }>(resolve => { resolveCompletion = resolve; });
    completionMock.mockReturnValue(completionPromise);

    const generationPromise = module.attemptLocalLLM([{ role: 'user', content: 'hi' }], '/path', false);
    
    // Need to wait a bit for getLlamaContext to finish and set llamaContext
    await new Promise(r => setTimeout(r, 10));

    // Now try to release
    await module.releaseLlamaContext();
    expect(releaseMock).not.toHaveBeenCalled();

    // Finish generation
    resolveCompletion!({ text: '{"ok":true}' });
    await generationPromise;

    // Now release should work
    await module.releaseLlamaContext();
    expect(releaseMock).toHaveBeenCalled();
  });
});
