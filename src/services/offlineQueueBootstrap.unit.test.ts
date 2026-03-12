const registerProcessorMock = jest.fn();

jest.mock('./offlineQueue', () => ({
  registerProcessor: (...args: any[]) => registerProcessorMock(...args),
}));

describe('offlineQueueBootstrap', () => {
  beforeEach(() => {
    registerProcessorMock.mockClear();
    jest.resetModules();
  });

  it('registers processors that fail safely for legacy queued work', async () => {
    const { registerOfflineQueueProcessors } = await import('./offlineQueueBootstrap');
    registerOfflineQueueProcessors();

    const processors = Object.fromEntries(
      registerProcessorMock.mock.calls.map(([requestType, processor]) => [requestType, processor]),
    ) as Record<string, (item: any) => Promise<void>>;

    await expect(processors.generate_text({
      payload: { messages: [{ role: 'user', content: 'hello' }] },
    })).rejects.toThrow('cannot be replayed safely');

    await expect(processors.generate_json({
      payload: { messages: [{ role: 'user', content: 'hello' }] },
    })).rejects.toThrow('cannot be replayed safely');

    await expect(processors.transcribe({
      payload: { audioFilePath: '/tmp/audio.m4a' },
    })).rejects.toThrow('cannot be replayed safely');
  });
});
