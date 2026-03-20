import React from 'react';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

type AppStateChangeHandler = (nextState: string) => void;

const addEventListenerMock = jest.fn();
const showToastMock = jest.fn();
const stopRecordingMock = jest.fn();
const hideOverlayMock = jest.fn();
const validateRecordingFileMock = jest.fn();
const copyFileToPublicBackupMock = jest.fn();
const getIncompleteExternalSessionMock = jest.fn();
const finishExternalAppSessionMock = jest.fn();
const updateSessionPipelineTelemetryMock = jest.fn();
const retryFailedTranscriptionsMock = jest.fn();
const retryPendingNoteEnhancementsMock = jest.fn();
const stopRecordingHealthCheckMock = jest.fn();
const validateRecordingWithBackoffMock = jest.fn();
const createAsyncMock = jest.fn();
const unloadAsyncMock = jest.fn();

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: addEventListenerMock,
  },
  Alert: { alert: jest.fn() },
}));

jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: createAsyncMock,
    },
  },
}));

jest.mock('../../modules/app-launcher', () => ({
  stopRecording: stopRecordingMock,
  hideOverlay: hideOverlayMock,
  validateRecordingFile: validateRecordingFileMock,
  copyFileToPublicBackup: copyFileToPublicBackupMock,
}));

jest.mock('../db/queries/externalLogs', () => ({
  getIncompleteExternalSession: getIncompleteExternalSessionMock,
  finishExternalAppSession: finishExternalAppSessionMock,
  updateSessionPipelineTelemetry: updateSessionPipelineTelemetryMock,
}));

jest.mock('../services/lectureSessionMonitor', () => ({
  retryFailedTranscriptions: retryFailedTranscriptionsMock,
  retryPendingNoteEnhancements: retryPendingNoteEnhancementsMock,
  stopRecordingHealthCheck: stopRecordingHealthCheckMock,
}));

jest.mock('../components/Toast', () => ({
  showToast: showToastMock,
}));

jest.mock('../services/recordingValidation', () => ({
  validateRecordingWithBackoff: validateRecordingWithBackoffMock,
}));

describe('useLectureReturnRecovery', () => {
  let hookApi: any;
  let onRecovered: jest.Mock;
  let appStateHandler: AppStateChangeHandler | null = null;
  let renderer: any = null;

  function Harness() {
    const { useLectureReturnRecovery } = require('./useLectureReturnRecovery');
    hookApi = useLectureReturnRecovery({ onRecovered });
    return null;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    hookApi = null;
    onRecovered = jest.fn();
    appStateHandler = null;
    addEventListenerMock.mockImplementation((_event: string, handler: AppStateChangeHandler) => {
      appStateHandler = handler;
      return { remove: jest.fn() };
    });
    getIncompleteExternalSessionMock.mockResolvedValue(null);
    retryFailedTranscriptionsMock.mockResolvedValue(0);
    retryPendingNoteEnhancementsMock.mockResolvedValue(0);
    hideOverlayMock.mockResolvedValue(undefined);
    stopRecordingMock.mockResolvedValue(null);
    copyFileToPublicBackupMock.mockResolvedValue(true);
    validateRecordingWithBackoffMock.mockResolvedValue({ validated: true, attemptsUsed: 1 });
    validateRecordingFileMock.mockResolvedValue({ exists: true, size: 1024 });
    createAsyncMock.mockResolvedValue({
      sound: { unloadAsync: unloadAsyncMock },
      status: { isLoaded: true, durationMillis: 180000 },
    });
    unloadAsyncMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (renderer) {
      renderer.unmount();
      renderer = null;
    }
  });

  it('recovers returned session and finalizes with audio-header duration', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    getIncompleteExternalSessionMock.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 42,
      appName: 'Marrow',
      launchedAt: 1699999400000,
      recordingPath: 'file:///data/user/0/com.app/files/recordings/a.m4a',
    });
    stopRecordingMock.mockResolvedValue('file:///data/user/0/com.app/files/recordings/a.m4a');

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await hookApi.checkForReturnedSession(true);
    });

    expect(validateRecordingWithBackoffMock).toHaveBeenCalledWith(
      'file:///data/user/0/com.app/files/recordings/a.m4a',
      validateRecordingFileMock,
    );
    expect(updateSessionPipelineTelemetryMock).toHaveBeenCalledWith(42, {
      validationAttempts: 1,
    });
    expect(finishExternalAppSessionMock).toHaveBeenCalledWith(42, 3);
    expect(stopRecordingHealthCheckMock).toHaveBeenCalled();
    expect(hideOverlayMock).toHaveBeenCalled();
    expect(onRecovered).toHaveBeenCalledWith({
      appName: 'Marrow',
      durationMinutes: 3,
      recordingPath: 'file:///data/user/0/com.app/files/recordings/a.m4a',
      logId: 42,
    });
  });

  it('silently finishes session when no recording exists after stop', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    getIncompleteExternalSessionMock.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 77,
      appName: 'PrepLadder',
      launchedAt: 1699999700000,
      recordingPath: null,
    });
    stopRecordingMock.mockResolvedValue(null);

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await hookApi.checkForReturnedSession(true);
    });

    expect(finishExternalAppSessionMock).toHaveBeenCalledWith(77, 5, 'Finished without recording');
    expect(onRecovered).not.toHaveBeenCalled();
    expect(hideOverlayMock).toHaveBeenCalled();
  });

  it('throttles periodic recovery calls and shows combined success toast', async () => {
    let now = 1700000000000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    getIncompleteExternalSessionMock.mockResolvedValue(null);
    retryFailedTranscriptionsMock.mockResolvedValue(2);
    retryPendingNoteEnhancementsMock.mockResolvedValue(1);

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await hookApi.recoverPendingTranscriptions(false);
    });
    await act(async () => {
      await hookApi.recoverPendingTranscriptions(false);
    });
    now += 61_000;
    await act(async () => {
      await hookApi.recoverPendingTranscriptions(false);
    });

    expect(retryFailedTranscriptionsMock).toHaveBeenCalledTimes(2);
    expect(retryPendingNoteEnhancementsMock).toHaveBeenCalledTimes(2);
    expect(showToastMock).toHaveBeenCalledWith(
      '2 lectures and 1 note finished processing. Check your notes.',
      'success',
      undefined,
      4000,
    );
  });

  it('triggers checks when app returns to active state', async () => {
    getIncompleteExternalSessionMock.mockResolvedValue(null);
    retryFailedTranscriptionsMock.mockResolvedValue(0);
    retryPendingNoteEnhancementsMock.mockResolvedValue(0);

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    expect(appStateHandler).toBeTruthy();
    expect(getIncompleteExternalSessionMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      appStateHandler?.('background');
      appStateHandler?.('active');
    });

    expect(getIncompleteExternalSessionMock).toHaveBeenCalledTimes(2);
  });

  it('shows correct toast message for only lectures or only notes', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    getIncompleteExternalSessionMock.mockResolvedValue(null);

    // Only lectures
    retryFailedTranscriptionsMock.mockResolvedValueOnce(1);
    retryPendingNoteEnhancementsMock.mockResolvedValueOnce(0);
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await hookApi.recoverPendingTranscriptions(true);
    });
    expect(showToastMock).toHaveBeenCalledWith(
      '1 lecture finished processing. Check your notes.',
      'success',
      undefined,
      4000,
    );

    // Multiple lectures
    retryFailedTranscriptionsMock.mockResolvedValueOnce(2);
    retryPendingNoteEnhancementsMock.mockResolvedValueOnce(0);
    await act(async () => {
      await hookApi.recoverPendingTranscriptions(true);
    });
    expect(showToastMock).toHaveBeenCalledWith(
      '2 lectures finished processing. Check your notes.',
      'success',
      undefined,
      4000,
    );

    // Only notes
    retryFailedTranscriptionsMock.mockResolvedValueOnce(0);
    retryPendingNoteEnhancementsMock.mockResolvedValueOnce(1);
    await act(async () => {
      await hookApi.recoverPendingTranscriptions(true);
    });
    expect(showToastMock).toHaveBeenCalledWith(
      '1 note finished processing. Check your notes.',
      'success',
      undefined,
      4000,
    );

    // Multiple notes
    retryFailedTranscriptionsMock.mockResolvedValueOnce(0);
    retryPendingNoteEnhancementsMock.mockResolvedValueOnce(3);
    await act(async () => {
      await hookApi.recoverPendingTranscriptions(true);
    });
    expect(showToastMock).toHaveBeenCalledWith(
      '3 notes finished processing. Check your notes.',
      'success',
      undefined,
      4000,
    );
  });

  it('handles errors in recoverPendingTranscriptions gracefully', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    retryFailedTranscriptionsMock.mockRejectedValue(new Error('Network error'));
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await hookApi.recoverPendingTranscriptions(true);
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[Home] Failed to recover pending transcriptions:',
      expect.any(Error),
    );
    consoleWarnSpy.mockRestore();
  });

  it('finishes session silently on cold launch (showPrompt=false)', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    getIncompleteExternalSessionMock.mockResolvedValue({
      id: 88,
      appName: 'StaleApp',
      launchedAt: 1699999000000,
      recordingPath: 'some/path',
    });

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    expect(finishExternalAppSessionMock).toHaveBeenCalledWith(
      88,
      expect.any(Number),
      'Stale session cleaned on cold launch',
    );
    expect(onRecovered).not.toHaveBeenCalled();
  });

  it('handles stopRecording timeout/error and uses fallback path', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    getIncompleteExternalSessionMock.mockResolvedValue({
      id: 99,
      appName: 'TestApp',
      launchedAt: 1699999000000,
      recordingPath: 'db/path',
    });
    // Simulate timeout by never resolving, or rejecting
    stopRecordingMock.mockRejectedValue(new Error('Native error'));

    await act(async () => {
      await hookApi.checkForReturnedSession(true);
    });

    // Should still proceed with db path if available
    expect(onRecovered).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingPath: 'db/path',
      }),
    );
  });

  it('copies file to public backup if in /data/ directory', async () => {
    const dataPath = 'file:///data/user/0/com.app/files/rec.m4a';

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    getIncompleteExternalSessionMock.mockResolvedValue({
      id: 101,
      appName: 'DataApp',
      launchedAt: 1699999000000,
      recordingPath: dataPath,
    });
    stopRecordingMock.mockResolvedValue(dataPath);

    await act(async () => {
      await hookApi.checkForReturnedSession(true);
    });

    expect(copyFileToPublicBackupMock).toHaveBeenCalledWith(
      '/data/user/0/com.app/files/rec.m4a',
      expect.any(String),
    );
  });

  it('falls back to wall-clock duration if audio duration detection fails', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000); // T=0
    
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    getIncompleteExternalSessionMock.mockResolvedValue({
      id: 102,
      appName: 'DurationApp',
      launchedAt: 1700000000000 - 600000, // 10 minutes ago
      recordingPath: 'path/to/audio',
    });
    createAsyncMock.mockRejectedValue(new Error('Audio error'));

    await act(async () => {
      await hookApi.checkForReturnedSession(true);
    });

    expect(finishExternalAppSessionMock).toHaveBeenCalledWith(102, 10);
    expect(onRecovered).toHaveBeenCalledWith(
      expect.objectContaining({
        durationMinutes: 10,
      }),
    );
  });

  it('shows warning toast if recording validation fails and file is tiny/missing', async () => {
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    getIncompleteExternalSessionMock.mockResolvedValue({
      id: 103,
      appName: 'ValidationApp',
      launchedAt: Date.now() - 60000,
      recordingPath: 'missing/file',
    });
    validateRecordingWithBackoffMock.mockResolvedValue({ validated: false, attemptsUsed: 3 });
    validateRecordingFileMock.mockResolvedValue({ exists: false, size: 0 });

    await act(async () => {
      await hookApi.checkForReturnedSession(true);
    });

    expect(showToastMock).toHaveBeenCalledWith(
      "Recording file isn't ready yet — it may appear when you reopen the app.",
      'warning',
    );
    expect(updateSessionPipelineTelemetryMock).toHaveBeenCalledWith(103, {
      errorStage: 'validation',
    });
  });

  it('handles general errors in checkForReturnedSession', async () => {
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    getIncompleteExternalSessionMock.mockRejectedValue(new Error('DB failure'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    await act(async () => {
      await hookApi.checkForReturnedSession(true);
    });

    expect(showToastMock).toHaveBeenCalledWith(
      "Couldn't process your lecture recording. Try opening the app again.",
      'error',
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('avoids re-processing the same session log', async () => {
    getIncompleteExternalSessionMock.mockResolvedValue({
      id: 200,
      appName: 'SameApp',
      launchedAt: Date.now() - 60000,
    });

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    // checkForReturnedSession(false) was called on mount.
    // Call it again manually.
    await act(async () => {
      await hookApi.checkForReturnedSession(true);
    });

    // finishExternalAppSession should only have been called once (on mount)
    expect(finishExternalAppSessionMock).toHaveBeenCalledTimes(1);
  });
});
