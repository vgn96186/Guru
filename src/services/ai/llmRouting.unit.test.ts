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
  const initializeMock = jest.fn(async () => ({ backend: 'gpu' }));
  const chatMock = jest.fn(async () => ({ text: 'local-text', backend: 'gpu' }));
  const releaseMock = jest.fn(async () => undefined);
  const isInitializedMock = jest.fn(async () => false);
  const updateProfileMock = jest.fn(async () => undefined);

  jest.doMock('react-native', () => ({
    AppState: { addEventListener },
  }));
  jest.doMock('../../../modules/local-llm', () => ({
    initialize: initializeMock,
    chat: chatMock,
    release: releaseMock,
    isInitialized: isInitializedMock,
  }));
  jest.doMock('../../db/repositories', () => ({
    profileRepository: { updateProfile: updateProfileMock },
    dailyLogRepository: {},
  }));
  jest.doMock('./config', () => ({
    GROQ_MODELS: ['groq-a', 'groq-b'],
    OPENROUTER_FREE_MODELS: ['or-a', 'or-b'],
  }));

  jest.doMock('./google/geminiChat', () => ({
    geminiGenerateContentSdk: jest
      .fn()
      .mockRejectedValue(new Error('Gemini SDK disabled in llmRouting unit test')),
    geminiGenerateContentStreamSdk: jest
      .fn()
      .mockRejectedValue(new Error('Gemini SDK disabled in llmRouting unit test')),
  }));

  const module = await import('./llmRouting');
  return {
    module,
    initializeMock,
    chatMock,
    releaseMock,
    isInitializedMock,
    updateProfileMock,
    addEventListener,
  };
}

describe('llmRouting', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses explicitly requested Groq model even if OpenRouter key is present', async () => {
    const { module } = await loadRoutingModule();
    const calledModels: string[] = [];

    jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async (_url: unknown, init: any) => {
      const body = JSON.parse(init.body);
      calledModels.push(body.model);
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
    expect(result.modelUsed).toBe('groq/preferred-groq');
    expect(calledModels).toEqual(['preferred-groq']);
  });

  it('uses Groq before OpenRouter when both keys are present', async () => {
    const { module } = await loadRoutingModule();
    const callOrder: string[] = [];

    jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async (url: unknown, init: any) => {
      const requestUrl = String(url);
      const body = JSON.parse(init.body);
      if (requestUrl.includes('openrouter.ai')) {
        callOrder.push(`or:${body.model}`);
        return mockResponse({
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'or-success' } }] }),
        });
      }
      if (requestUrl.includes('api.groq.com')) {
        callOrder.push(`groq:${body.model}`);
        return mockResponse({
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'groq-success' } }] }),
        });
      }
      return mockResponse({ ok: false });
    });

    const result = await module.attemptCloudLLM(
      [{ role: 'user', content: 'hi' }],
      'or-key',
      false,
      'groq-key',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ['groq', 'openrouter'],
    );

    expect(result.text).toBe('groq-success');
    expect(result.modelUsed).toBe('groq/groq-a');
    expect(callOrder).toEqual(['groq:groq-a']);
  });

  it('falls back to OpenRouter when all Groq models fail', async () => {
    const { module } = await loadRoutingModule();
    const callOrder: string[] = [];

    jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async (url: unknown, init: any) => {
      const requestUrl = String(url);
      const body = JSON.parse(init.body);
      if (requestUrl.includes('openrouter.ai')) {
        callOrder.push(`or:${body.model}`);
        return mockResponse({
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'or-success' } }] }),
        });
      }
      if (requestUrl.includes('api.groq.com')) {
        callOrder.push(`groq:${body.model}`);
        return mockResponse({ ok: false, status: 500 });
      }
      return mockResponse({ ok: false });
    });

    const result = await module.attemptCloudLLM(
      [{ role: 'user', content: 'hi' }],
      'or-key',
      false,
      'groq-key',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ['groq', 'openrouter'],
    );

    expect(result.text).toBe('or-success');
    expect(result.modelUsed).toBe('or-a');
    expect(callOrder).toEqual(['groq:groq-a', 'groq:groq-b', 'or:or-a']);
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
    const { module, updateProfileMock, chatMock } = await loadRoutingModule();

    chatMock.mockRejectedValueOnce(new Error('failed to load model: no such file'));

    await expect(
      module.attemptLocalLLM([{ role: 'user', content: 'hi' }], '/models/missing.litertlm', false),
    ).rejects.toThrow('Local model file is missing or corrupt');

    expect(updateProfileMock).toHaveBeenCalledWith({ localModelPath: null, useLocalModel: false });
  });

  it('uses Groq first when both Groq and OpenRouter keys are present', async () => {
    const { module } = await loadRoutingModule();
    const callOrder: string[] = [];

    jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async (url: unknown, init: any) => {
      const requestUrl = String(url);
      const body = JSON.parse(init.body);
      if (requestUrl.includes('openrouter.ai')) {
        callOrder.push(`or:${body.model}`);
        return mockResponse({ ok: false, status: 500, text: async () => 'or failed' });
      }
      if (requestUrl.includes('api.groq.com')) {
        callOrder.push(`groq:${body.model}`);
        return mockResponse({
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'groq-success' } }] }),
        });
      }
      return mockResponse({ ok: false });
    });

    const result = await module.attemptCloudLLM(
      [{ role: 'user', content: 'hi' }],
      'or-key',
      false,
      'groq-key',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ['groq', 'openrouter'],
    );

    expect(result.text).toBe('groq-success');
    expect(result.modelUsed).toBe('groq/groq-a');
    expect(callOrder).toEqual(['groq:groq-a']);
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
    const { module, chatMock } = await loadRoutingModule();
    // In textMode=true, empty completion remains empty
    chatMock.mockResolvedValueOnce({ text: '', backend: 'gpu' });

    await expect(
      module.attemptLocalLLM([{ role: 'user', content: 'hi' }], '/path/to/model', true),
    ).rejects.toThrow('Local model returned an empty response');
  });

  it('reports the correct local Gemma variant for E2B files', async () => {
    const { module } = await loadRoutingModule();

    const result = await module.attemptLocalLLM(
      [{ role: 'user', content: 'hi' }],
      '/models/gemma-4-E2B-it.litertlm',
      true,
    );

    expect(result.modelUsed).toBe('local-gemma-4-e2b');
  });

  it('loads Gemma 4 without overriding the native token budget', async () => {
    const { module, initializeMock } = await loadRoutingModule();

    await module.attemptLocalLLM(
      [{ role: 'user', content: 'hi' }],
      '/models/gemma-4-E4B-it.litertlm',
      true,
    );

    expect(initializeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelPath: '/models/gemma-4-E4B-it.litertlm',
      }),
    );
  });

  it('releaseLlamaContext does nothing when context is in use', async () => {
    const initializeMock = jest.fn(async () => ({ backend: 'gpu' }));
    const chatMock = jest.fn(async () => ({ text: '{"ok":true}', backend: 'gpu' }));
    const releaseMock = jest.fn(async () => undefined);
    const isInitializedMock = jest.fn(async () => true);

    jest.resetModules();
    (globalThis as any).__DEV__ = false;

    jest.doMock('react-native', () => ({
      AppState: { addEventListener: jest.fn() },
    }));
    jest.doMock('../../../modules/local-llm', () => ({
      initialize: initializeMock,
      chat: chatMock,
      release: releaseMock,
      isInitialized: isInitializedMock,
    }));
    jest.doMock('../../db/repositories', () => ({
      profileRepository: { updateProfile: jest.fn(async () => undefined) },
      dailyLogRepository: {},
    }));
    jest.doMock('./config', () => ({
      GROQ_MODELS: ['groq-a', 'groq-b'],
      OPENROUTER_FREE_MODELS: ['or-a', 'or-b'],
    }));
    jest.doMock('./google/geminiChat', () => ({
      geminiGenerateContentSdk: jest.fn().mockRejectedValue(new Error('Gemini SDK disabled')),
      geminiGenerateContentStreamSdk: jest.fn().mockRejectedValue(new Error('Gemini SDK disabled')),
    }));

    const module = await import('./llmRouting');

    // Start a generation (it will be in flight)
    let resolveGenerate: (val: { text: string; backend: string }) => void;
    const generatePromise = new Promise<{ text: string; backend: string }>((resolve) => {
      resolveGenerate = resolve;
    });
    chatMock.mockReturnValue(generatePromise);

    const generationPromise = module.attemptLocalLLM(
      [{ role: 'user', content: 'hi' }],
      '/path',
      false,
    );

    // Need to wait a bit for model to load
    await new Promise((r) => setTimeout(r, 10));

    // Now try to release
    await module.releaseLlamaContext();
    expect(releaseMock).not.toHaveBeenCalled();

    // Finish generation
    resolveGenerate!({ text: '{"ok":true}', backend: 'gpu' });
    await generationPromise;

    // Now release should work
    await module.releaseLlamaContext();
    expect(releaseMock).toHaveBeenCalled();
  });
});
