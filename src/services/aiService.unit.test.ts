import { z } from 'zod';

type MockProfile = {
  openrouterKey?: string;
  groqApiKey?: string;
  useLocalModel?: boolean;
  localModelPath?: string | null;
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
  (globalThis as any).__DEV__ = false;

  const profile = { ...baseProfile, ...(opts?.profile ?? {}) };
  const localUsable = opts?.localUsable ?? true;
  const localAllowed = opts?.localAllowed ?? true;
  const localCompletionText = opts?.localCompletionText ?? 'local-text';

  const generateTextMock = jest.fn(async () => ({ text: localCompletionText }));
  const releaseModelMock = jest.fn(async () => undefined);
  const loadModelMock = jest.fn(async () => ({ id: 'mock-model-id' }));

  jest.doMock('react-native', () => ({
    AppState: { addEventListener: jest.fn() },
  }));
  jest.doMock('react-native-llm-litert-mediapipe', () => ({
    loadModel: loadModelMock,
    generateText: generateTextMock,
    releaseModel: releaseModelMock,
    stopGeneration: jest.fn(),
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
  return { aiService, generateTextMock };
}

describe('aiService routing policy', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses OpenRouter after Groq models fail when both keys are available', async () => {
    const { aiService } = await loadAiService();
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
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'or-success' } }] }),
        } as any;
      });

    const result = await aiService.generateTextWithRouting([{ role: 'user', content: 'hello' }]);

    expect(result.text).toBe('or-success');
    const { OPENROUTER_FREE_MODELS } = jest.requireActual('../config/appConfig') as {
      OPENROUTER_FREE_MODELS: readonly string[];
    };
    expect(result.modelUsed.startsWith(OPENROUTER_FREE_MODELS[0])).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('uses Groq after OpenRouter fails when both keys are available', async () => {
    const { aiService } = await loadAiService();
    let groqCalls = 0;
    let openRouterCalls = 0;
    const fetchMock = jest
      .spyOn(globalThis, 'fetch' as any)
      .mockImplementation(async (...args: unknown[]) => {
        const url = String(args[0] ?? '');
        if (url.includes('api.groq.com')) {
          groqCalls += 1;
          return {
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'groq-success' } }] }),
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

  it('falls back to local only after all cloud backends fail', async () => {
    const { aiService, generateTextMock } = await loadAiService({
      localCompletionText: 'local-success',
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch' as any).mockImplementation(
      async () =>
        ({
          ok: false,
          status: 500,
          text: async () => 'cloud down',
        } as any),
    );

    const result = await aiService.generateTextWithRouting([{ role: 'user', content: 'hello' }]);

    expect(result.text).toBe('local-success');
    expect(result.modelUsed.startsWith('local-')).toBe(true);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('prioritizes explicitly requested OpenRouter model', async () => {
    const { aiService } = await loadAiService();
    const callOrder: string[] = [];
    jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async (...args: unknown[]) => {
      const url = String(args[0] ?? '');
      if (url.includes('api.groq.com')) {
        callOrder.push('groq');
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'groq-selected' } }] }),
        } as any;
      }
      if (url.includes('openrouter.ai')) {
        callOrder.push('openrouter');
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'or-selected' } }] }),
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
    const { aiService, generateTextMock } = await loadAiService({
      localCompletionText: 'local-only',
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async () => {
      throw new Error('fetch should not be called for chosen local model');
    });

    const result = await aiService.generateTextWithRouting([{ role: 'user', content: 'hello' }], {
      chosenModel: 'local',
    });

    expect(result.text).toBe('local-only');
    expect(result.modelUsed.startsWith('local-')).toBe(true);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses local when no cloud keys exist but local model file is present', async () => {
    const { aiService, generateTextMock } = await loadAiService({
      profile: {
        openrouterKey: '',
        groqApiKey: '',
        useLocalModel: false,
        localModelPath: '/models/gemma-4-E4B-it.litertlm',
      },
      localUsable: false,
      // Device must allow local so no-cloud + on-disk model can use the safety fallback path.
      localAllowed: true,
      localCompletionText: 'local-no-cloud',
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async () => {
      throw new Error('fetch should not be called when only local fallback is available');
    });

    const result = await aiService.generateTextWithRouting([{ role: 'user', content: 'hello' }]);

    expect(result.text).toBe('local-no-cloud');
    expect(result.modelUsed.startsWith('local-')).toBe(true);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the same backend order for structured JSON generation', async () => {
    const { aiService } = await loadAiService();
    const callOrder: string[] = [];
    jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async (...args: unknown[]) => {
      const url = String(args[0] ?? '');
      if (url.includes('openrouter.ai')) {
        callOrder.push('openrouter');
        return {
          ok: false,
          status: 500,
          text: async () => 'or down',
        } as any;
      }
      if (url.includes('api.groq.com')) {
        callOrder.push('groq');
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
        } as any;
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const schema = z.object({ ok: z.boolean() });
    const result = await aiService.generateJSONWithRouting(
      [{ role: 'user', content: 'return json' }],
      schema,
      'low',
    );

    expect(result.parsed.ok).toBe(true);
    expect(callOrder).toContain('groq');
  });
});
