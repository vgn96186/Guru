const registerProcessorMock = jest.fn();
const markCompletedMock = jest.fn();
const runFullTranscriptionPipelineMock = jest.fn();

jest.mock('./offlineQueue', () => ({
  registerProcessor: (...args: any[]) => registerProcessorMock(...args),
  markCompleted: (...args: any[]) => markCompletedMock(...args),
}));

jest.mock('./lectureSessionMonitor', () => ({
  runFullTranscriptionPipeline: (...args: any[]) => runFullTranscriptionPipelineMock(...args),
}));

jest.mock('../db/repositories', () => ({
  profileRepository: {
    getProfile: jest.fn(async () => ({
      groqApiKey: '',
      useLocalWhisper: true,
      localWhisperPath: '/models/local.bin',
    })),
  },
}));

describe('offlineQueueBootstrap', () => {
  beforeEach(() => {
    registerProcessorMock.mockClear();
    markCompletedMock.mockClear();
    runFullTranscriptionPipelineMock.mockReset();
    jest.resetModules();
  });

  it('registers processors that fail safely for legacy queued work', async () => {
    const { registerOfflineQueueProcessors } = await import('./offlineQueueBootstrap');
    registerOfflineQueueProcessors();

    const processors = Object.fromEntries(
      registerProcessorMock.mock.calls.map(([requestType, processor]) => [requestType, processor]),
    ) as Record<string, (item: any) => Promise<void>>;

    await expect(
      processors.generate_text({
        payload: { messages: [{ role: 'user', content: 'hello' }] },
      }),
    ).rejects.toThrow('cannot be replayed safely');

    await expect(
      processors.generate_json({
        payload: { messages: [{ role: 'user', content: 'hello' }] },
      }),
    ).rejects.toThrow('cannot be replayed safely');
  });

  it('retries queued transcription work and marks it complete on success', async () => {
    runFullTranscriptionPipelineMock.mockResolvedValue({ success: true });
    const { registerOfflineQueueProcessors } = await import('./offlineQueueBootstrap');
    registerOfflineQueueProcessors();

    const processors = Object.fromEntries(
      registerProcessorMock.mock.calls.map(([requestType, processor]) => [requestType, processor]),
    ) as Record<string, (item: any) => Promise<void>>;

    await processors.transcribe({
      id: 42,
      payload: { audioFilePath: '/tmp/audio.m4a', logId: 7 },
    });

    expect(runFullTranscriptionPipelineMock).toHaveBeenCalledTimes(1);
    expect(markCompletedMock).toHaveBeenCalledWith(42);
  });

  it('surfaces transcription retry failures', async () => {
    runFullTranscriptionPipelineMock.mockResolvedValue({
      success: false,
      error: 'pipeline failed',
    });
    const { registerOfflineQueueProcessors } = await import('./offlineQueueBootstrap');
    registerOfflineQueueProcessors();

    const processors = Object.fromEntries(
      registerProcessorMock.mock.calls.map(([requestType, processor]) => [requestType, processor]),
    ) as Record<string, (item: any) => Promise<void>>;

    await expect(
      processors.transcribe({
        id: 42,
        payload: { audioFilePath: '/tmp/audio.m4a', logId: 7 },
      }),
    ).rejects.toThrow('pipeline failed');
  });
});
