describe('ai service compat exports', () => {
  it('exports the legacy runtime listener helper', async () => {
    jest.resetModules();
    jest.doMock('./ai', () => ({}));
    jest.doMock('./ai/v2/compat', () => ({
      generateTextV2: jest.fn(),
    }));

    const mod = await import('./aiService');

    expect(typeof mod.addLlmStateListener).toBe('function');
  });
});
