async function loadLocalLlmInfra() {
  jest.resetModules();
  (globalThis as any).__DEV__ = false;

  const addEventListener = jest.fn();
  const initializeMock = jest.fn(async () => ({ backend: 'gpu' }));
  const chatMock = jest.fn(async () => ({
    text: 'local-text',
    toolCallsJson: null,
    finishReason: 'stop',
    backend: 'gpu',
  }));
  const releaseMock = jest.fn(async () => undefined);
  const isInitializedMock = jest.fn(async () => false);
  const resetSessionMock = jest.fn(async () => undefined);

  jest.doMock('react-native', () => ({
    AppState: { addEventListener },
  }));
  jest.doMock('../../../modules/local-llm', () => ({
    initialize: initializeMock,
    chat: chatMock,
    release: releaseMock,
    isInitialized: isInitializedMock,
    resetSession: resetSessionMock,
  }));

  const module = require('./localLlmInfra') as typeof import('./localLlmInfra');
  return {
    module,
    initializeMock,
    chatMock,
    releaseMock,
    isInitializedMock,
    resetSessionMock,
    addEventListener,
  };
}

describe('localLlmInfra', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('chatWithLocalNative initializes model and returns structured result', async () => {
    const { module, initializeMock, chatMock } = await loadLocalLlmInfra();

    const result = await module.chatWithLocalNative({
      chatMessages: [{ role: 'user', content: 'hi' }],
      modelPath: '/models/gemma-4-E4B-it.litertlm',
      systemInstruction: 'You are a medical tutor',
    });

    expect(initializeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelPath: '/models/gemma-4-E4B-it.litertlm',
      }),
    );
    expect(chatMock).toHaveBeenCalled();
    expect(result.text).toBe('local-text');
    expect(result.finishReason).toBe('stop');
  });

  it('chatWithLocalNative strips file:// prefix from model path', async () => {
    const { module, initializeMock } = await loadLocalLlmInfra();

    await module.chatWithLocalNative({
      chatMessages: [{ role: 'user', content: 'hi' }],
      modelPath: 'file:///models/gemma-4-E4B-it.litertlm',
    });

    expect(initializeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelPath: '/models/gemma-4-E4B-it.litertlm',
      }),
    );
  });

  it('chatWithLocalNative passes toolsJson to native', async () => {
    const { module, chatMock } = await loadLocalLlmInfra();
    const tools = '[{"name":"search","description":"search"}]';

    await module.chatWithLocalNative({
      chatMessages: [{ role: 'user', content: 'find something' }],
      modelPath: '/models/gemma-4-E4B-it.litertlm',
      toolsJson: tools,
    });

    expect(chatMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toolsJson: tools }),
    );
  });

  it('releaseLlamaContext does nothing when context is in use', async () => {
    const initializeMock = jest.fn(async () => ({ backend: 'gpu' }));
    const chatMock = jest.fn(async () => ({
      text: '{"ok":true}',
      toolCallsJson: null,
      finishReason: 'stop',
      backend: 'gpu',
    }));
    const releaseMock = jest.fn(async () => undefined);
    const isInitializedMock = jest.fn(async () => true);
    const resetSessionMock = jest.fn(async () => undefined);

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
      resetSession: resetSessionMock,
    }));

    const module = require('./localLlmInfra') as typeof import('./localLlmInfra');

    // Start a generation (it will be in flight)
    let resolveGenerate: (val: {
      text: string;
      toolCallsJson: null;
      finishReason: string;
      backend: string;
    }) => void;
    const generatePromise = new Promise<{
      text: string;
      toolCallsJson: null;
      finishReason: string;
      backend: string;
    }>((resolve) => {
      resolveGenerate = resolve;
    });
    chatMock.mockReturnValue(generatePromise);

    const generationPromise = module.chatWithLocalNative({
      chatMessages: [{ role: 'user', content: 'hi' }],
      modelPath: '/path',
    });

    // Need to wait a bit for model to load
    await new Promise((r) => setTimeout(r, 10));

    // Now try to release
    await module.releaseLlamaContext();
    expect(releaseMock).not.toHaveBeenCalled();

    // Finish generation
    resolveGenerate!({
      text: '{"ok":true}',
      toolCallsJson: null,
      finishReason: 'stop',
      backend: 'gpu',
    });
    await generationPromise;

    // Now release should work
    await module.releaseLlamaContext();
    expect(releaseMock).toHaveBeenCalled();
  });
});
