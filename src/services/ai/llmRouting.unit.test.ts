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

  it('clears local model profile state when model file is missing/corrupt', async () => {
    const { module, updateProfileMock, chatMock } = await loadRoutingModule();

    chatMock.mockRejectedValueOnce(new Error('failed to load model: no such file'));

    await expect(
      module.attemptLocalLLM([{ role: 'user', content: 'hi' }], '/models/missing.litertlm', false),
    ).rejects.toThrow('Local model file is missing or corrupt');

    expect(updateProfileMock).toHaveBeenCalledWith({ localModelPath: null, useLocalModel: false });
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
