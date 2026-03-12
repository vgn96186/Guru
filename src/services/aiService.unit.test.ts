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
  localModelPath: '/models/qwen.gguf',
};

async function loadAiService(opts?: {
  profile?: Partial<MockProfile>;
  localUsable?: boolean;
  localCompletionText?: string;
}) {
  jest.resetModules();
  (globalThis as any).__DEV__ = false;

  const profile = { ...baseProfile, ...(opts?.profile ?? {}) };
  const localUsable = opts?.localUsable ?? true;
  const localCompletionText = opts?.localCompletionText ?? 'local-text';

  const completionMock = jest.fn(async () => ({ text: localCompletionText }));
  const releaseMock = jest.fn(async () => undefined);
  const initLlamaMock = jest.fn(async () => ({
    completion: completionMock,
    release: releaseMock,
  }));

  jest.doMock('react-native', () => ({
    AppState: { addEventListener: jest.fn() },
  }));
  jest.doMock('llama.rn', () => ({
    initLlama: initLlamaMock,
  }));
  jest.doMock('../db/repositories', () => ({
    profileRepository: { getProfile: jest.fn(() => Promise.resolve(profile)) },
    dailyLogRepository: {},
  }));
  jest.doMock('../db/queries/aiCache', () => ({
    getCachedContent: jest.fn(),
    setCachedContent: jest.fn(),
  }));
  jest.doMock('./deviceMemory', () => ({
    isLocalLlmUsable: jest.fn(() => localUsable),
    getLocalLlmRamWarning: jest.fn(() => 'Local model unavailable'),
  }));

  const aiService = await import('./aiService');
  return { aiService, initLlamaMock, completionMock };
}

describe('aiService routing policy', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses Groq first when Groq is available', async () => {
    const { aiService } = await loadAiService();
    const fetchMock = jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async (...args: unknown[]) => {
      const url = String(args[0] ?? '');
      expect(url).toContain('api.groq.com');
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'groq-success' } }] }),
      } as any;
    });

    const result = await aiService.generateTextWithRouting([{ role: 'user', content: 'hello' }]);

    expect(result.text).toBe('groq-success');
    expect(result.modelUsed.startsWith('groq/')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to OpenRouter after Groq failures', async () => {
    const { aiService } = await loadAiService();
    let groqCalls = 0;
    let openRouterCalls = 0;
    const fetchMock = jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async (...args: unknown[]) => {
      const url = String(args[0] ?? '');
      if (url.includes('api.groq.com')) {
        groqCalls += 1;
        return {
          ok: false,
          status: 500,
          text: async () => 'groq down',
        } as any;
      }
      if (url.includes('openrouter.ai')) {
        openRouterCalls += 1;
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'openrouter-success' } }] }),
        } as any;
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await aiService.generateTextWithRouting([{ role: 'user', content: 'hello' }]);

    expect(result.text).toBe('openrouter-success');
    expect(groqCalls).toBeGreaterThanOrEqual(2);
    expect(openRouterCalls).toBe(1);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('falls back to local only after all cloud backends fail', async () => {
    const { aiService, initLlamaMock, completionMock } = await loadAiService({
      localCompletionText: 'local-success',
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async () => ({
      ok: false,
      status: 500,
      text: async () => 'cloud down',
    }) as any);

    const result = await aiService.generateTextWithRouting([{ role: 'user', content: 'hello' }]);

    expect(result.text).toBe('local-success');
    expect(result.modelUsed.startsWith('local-')).toBe(true);
    expect(initLlamaMock).toHaveBeenCalledTimes(1);
    expect(completionMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('keeps Groq-first ordering even when an OpenRouter model is selected', async () => {
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

    const result = await aiService.generateTextWithRouting(
      [{ role: 'user', content: 'hello' }],
      { chosenModel: 'meta-llama/llama-3.3-70b-instruct:free' },
    );

    expect(result.text).toBe('groq-selected');
    expect(callOrder[0]).toBe('groq');
  });

  it('uses local directly when local model is explicitly selected', async () => {
    const { aiService, initLlamaMock } = await loadAiService({
      localCompletionText: 'local-only',
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async () => {
      throw new Error('fetch should not be called for chosen local model');
    });

    const result = await aiService.generateTextWithRouting(
      [{ role: 'user', content: 'hello' }],
      { chosenModel: 'local' },
    );

    expect(result.text).toBe('local-only');
    expect(result.modelUsed.startsWith('local-')).toBe(true);
    expect(initLlamaMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the same backend order for structured JSON generation', async () => {
    const { aiService } = await loadAiService();
    const callOrder: string[] = [];
    jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async (...args: unknown[]) => {
      const url = String(args[0] ?? '');
      if (url.includes('api.groq.com')) {
        callOrder.push('groq');
        return {
          ok: false,
          status: 500,
          text: async () => 'groq down',
        } as any;
      }
      if (url.includes('openrouter.ai')) {
        callOrder.push('openrouter');
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
    // Groq models are tried first (may retry across multiple models), then OpenRouter
    expect(callOrder).toContain('openrouter');
    expect(callOrder.filter(c => c === 'groq').length).toBeGreaterThanOrEqual(1);
  });
});
