type MockProfile = {
  openrouterKey?: string;
  groqApiKey?: string;
  useLocalModel?: boolean;
  localModelPath?: string | null;
  providerOrder?: string[];
};

const baseProfile: MockProfile = {
  openrouterKey: 'or-test-key',
  groqApiKey: 'groq-test-key',
  useLocalModel: true,
  localModelPath: '/models/gemma-4-E4B-it.litertlm',
};

async function loadAiService(opts?: {
  profile?: Partial<MockProfile>;
  localUsable?: boolean;
  localAllowed?: boolean;
  localCompletionText?: string;
}) {
  jest.resetModules();
  (globalThis as any).__DEV__ = true;

  const profile = { ...baseProfile, ...(opts?.profile ?? {}) };
  const localUsable = opts?.localUsable ?? true;
  const localAllowed = opts?.localAllowed ?? true;
  const localCompletionText = opts?.localCompletionText ?? 'local-text';

  const initializeMock = jest.fn(async () => ({ backend: 'gpu' }));
  const chatMock = jest.fn(async () => ({ text: localCompletionText, backend: 'gpu' }));
  const releaseMock = jest.fn(async () => undefined);
  const resetSessionMock = jest.fn(async () => undefined);
  const isInitializedMock = jest.fn(async () => false);

  jest.doMock('react-native', () => ({
    AppState: { addEventListener: jest.fn() },
    StyleSheet: { create: (styles: any) => styles },
  }));
  jest.doMock('local-llm', () => ({
    initialize: initializeMock,
    chat: chatMock,
    release: releaseMock,
    resetSession: resetSessionMock,
    isInitialized: isInitializedMock,
  }));
  jest.doMock('../db/repositories/profileRepository', () => ({
    profileRepository: { getProfile: jest.fn(() => Promise.resolve(profile)) },
  }));
  jest.doMock('../db/repositories', () => ({
    profileRepository: { getProfile: jest.fn(() => Promise.resolve(profile)) },
    dailyLogRepository: {},
  }));
  jest.doMock('../db/queries/aiCache', () => ({
    getCachedContent: jest.fn(),
    setCachedContent: jest.fn(),
  }));
  jest.doMock('../config/appConfig', () => {
    const actual = jest.requireActual('../config/appConfig') as Record<string, unknown>;
    return {
      ...actual,
      BUNDLED_GEMINI_KEY: '',
      BUNDLED_DEEPSEEK_KEY: '',
      BUNDLED_GITHUB_MODELS_PAT: '',
    };
  });
  jest.doMock('./deviceMemory', () => ({
    isLocalLlmUsable: jest.fn(() => localUsable),
    getLocalLlmRamWarning: jest.fn(() => 'Local model unavailable'),
    isLocalLlmAllowedOnThisDevice: jest.fn(() => localAllowed),
  }));

  const aiService = await import('./aiService');
  return { aiService, chatMock };
}

describe('aiService routing policy', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses OpenRouter after Groq models fail when both keys are available', async () => {
    const { aiService } = await loadAiService({ profile: { useLocalModel: false } });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch' as any)
      .mockImplementation(async (...args: unknown[]) => {
        const url = String(args[0] ?? '');
        if (url.includes('api.groq.com')) {
          return {
            ok: false,
            status: 500,
            text: async () => 'groq down',
          } as any;
        }
        expect(url).toContain('openrouter.ai');
        const encoder = new TextEncoder();
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"or-success"}}]}\n\ndata: [DONE]\n\n',
              ),
            );
            controller.close();
          },
        });
        return {
          ok: true,
          body,
          headers: new Headers(),
        } as any;
      });

    const result = await aiService.generateTextWithRouting([{ role: 'user', content: 'hello' }]);

    expect(result.text).toBe('or-success');
    expect(result.modelUsed).toBeDefined();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('uses Groq after OpenRouter fails when both keys are available', async () => {
    const { aiService } = await loadAiService({ profile: { useLocalModel: false } });
    let groqCalls = 0;
    let openRouterCalls = 0;
    const fetchMock = jest
      .spyOn(globalThis, 'fetch' as any)
      .mockImplementation(async (...args: unknown[]) => {
        const url = String(args[0] ?? '');
        if (url.includes('api.groq.com')) {
          groqCalls += 1;
          const encoder = new TextEncoder();
          const body = new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{"content":"groq-success"}}]}\n\ndata: [DONE]\n\n',
                ),
              );
              controller.close();
            },
          });
          return {
            ok: true,
            body,
            headers: new Headers(),
          } as any;
        }
        if (url.includes('openrouter.ai')) {
          openRouterCalls += 1;
          return {
            ok: false,
            status: 500,
            text: async () => 'or down',
          } as any;
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

    const result = await aiService.generateTextWithRouting([{ role: 'user', content: 'hello' }]);

    expect(result.text).toBe('groq-success');
    expect(groqCalls).toBeGreaterThanOrEqual(1);
    expect(openRouterCalls).toBeGreaterThanOrEqual(1);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('falls back to cloud if local fails', async () => {
    const { aiService, chatMock } = await loadAiService({
      profile: { useLocalModel: true, providerOrder: ['local', 'groq', 'openrouter'] },
      localCompletionText: 'local-success',
    });
    chatMock.mockRejectedValueOnce(new Error('local down'));

    const fetchMock = jest
      .spyOn(globalThis, 'fetch' as any)
      .mockImplementation(async (...args: unknown[]) => {
        const encoder = new TextEncoder();
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"cloud-success"}}]}\n\ndata: [DONE]\n\n',
              ),
            );
            controller.close();
          },
        });
        return {
          ok: true,
          body,
          headers: new Headers(),
        } as any;
      });

    const result = await aiService.generateTextWithRouting([{ role: 'user', content: 'hello' }]);

    expect(result.text).toBe('cloud-success');
    expect(result.modelUsed).toBeDefined();
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('prioritizes explicitly requested OpenRouter model', async () => {
    const { aiService } = await loadAiService();
    const callOrder: string[] = [];
    jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async (...args: unknown[]) => {
      const url = String(args[0] ?? '');
      if (url.includes('api.groq.com')) {
        callOrder.push('groq');
        const encoder = new TextEncoder();
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"groq-selected"}}]}\n\ndata: [DONE]\n\n',
              ),
            );
            controller.close();
          },
        });
        return {
          ok: true,
          body,
          headers: new Headers(),
        } as any;
      }
      if (url.includes('openrouter.ai')) {
        callOrder.push('openrouter');
        const encoder = new TextEncoder();
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"or-selected"}}]}\n\ndata: [DONE]\n\n',
              ),
            );
            controller.close();
          },
        });
        return {
          ok: true,
          body,
          headers: new Headers(),
        } as any;
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await aiService.generateTextWithRouting([{ role: 'user', content: 'hello' }], {
      chosenModel: 'openai/gpt-oss-120b:free',
    });

    expect(result.text).toBe('or-selected');
    expect(callOrder[0]).toBe('openrouter');
  });

  it('uses local directly when local model is explicitly selected', async () => {
    const { aiService, chatMock } = await loadAiService({
      localCompletionText: 'local-only',
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async () => {
      throw new Error('fetch should not be called for chosen local model');
    });

    const result = await aiService.generateTextWithRouting([{ role: 'user', content: 'hello' }], {
      chosenModel: 'local',
    });

    expect(result.text).toBe('local-only');
    expect(result.modelUsed).toBeDefined();
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses local when no cloud keys exist but local model file is present', async () => {
    const { aiService, chatMock } = await loadAiService({
      profile: {
        openrouterKey: '',
        groqApiKey: '',
        useLocalModel: true,
        localModelPath: '/models/gemma-4-E4B-it.litertlm',
      },
      localUsable: true,
      localAllowed: true,
      localCompletionText: 'local-no-cloud',
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async () => {
      throw new Error('fetch should not be called when only local fallback is available');
    });

    const result = await aiService.generateTextWithRouting([{ role: 'user', content: 'hello' }]);

    expect(result.text).toBe('local-no-cloud');
    expect(result.modelUsed).toBeDefined();
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
