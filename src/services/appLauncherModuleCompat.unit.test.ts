const requireNativeModuleMock = jest.fn();

jest.mock('expo-modules-core', () => ({
  requireNativeModule: (...args: unknown[]) => requireNativeModuleMock(...args),
}));

describe('app launcher module compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('retries the legacy native startRecording signature when the extended call fails', async () => {
    const startRecordingMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('Expected 1 arguments, got 3'))
      .mockResolvedValueOnce('/mock/legacy-recording.m4a');
    requireNativeModuleMock.mockReturnValue({
      startRecording: startRecordingMock,
    });
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const module = await import('../../modules/app-launcher');
    const result = await module.startRecording('', 'deepgram-key', 'groq-key');

    expect(result).toBe('/mock/legacy-recording.m4a');
    expect(startRecordingMock).toHaveBeenNthCalledWith(1, '', 'deepgram-key', 'groq-key');
    expect(startRecordingMock).toHaveBeenNthCalledWith(2, '');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[GuruAppLauncher] startRecording with live extras failed, retrying legacy signature',
      expect.any(Error),
    );

    consoleWarnSpy.mockRestore();
  });

  it('retries the legacy native startRecording signature even without live keys when the bridge only exposes the old signature', async () => {
    const startRecordingMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('Received 2 arguments, but 1 was expected'))
      .mockResolvedValueOnce('/mock/legacy-recording.m4a');
    requireNativeModuleMock.mockReturnValue({
      startRecording: startRecordingMock,
    });
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const module = await import('../../modules/app-launcher');
    const result = await module.startRecording('');

    expect(result).toBe('/mock/legacy-recording.m4a');
    expect(startRecordingMock).toHaveBeenNthCalledWith(1, '', null, null);
    expect(startRecordingMock).toHaveBeenNthCalledWith(2, '');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[GuruAppLauncher] startRecording with live extras failed, retrying legacy signature',
      expect.any(Error),
    );

    consoleWarnSpy.mockRestore();
  });
});
