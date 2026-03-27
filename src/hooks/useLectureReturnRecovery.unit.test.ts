import React from 'react';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

type AppStateChangeHandler = (nextState: string) => void;

const mockAddEventListener = jest.fn();
const mockShowToast = jest.fn();
const mockStopRecording = jest.fn();
const mockHideOverlay = jest.fn();
const mockConsumeLectureReturnRequest = jest.fn();
const mockIsRecordingActive = jest.fn();
const mockIsOverlayActive = jest.fn();
const mockValidateRecordingFile = jest.fn();
const mockCopyFileToPublicBackup = jest.fn();
const mockGetIncompleteExternalSession = jest.fn();
const mockFinishExternalAppSession = jest.fn();
const mockUpdateSessionPipelineTelemetry = jest.fn();
const mockRetryFailedTranscriptions = jest.fn();
const mockRetryPendingNoteEnhancements = jest.fn();
const mockStopRecordingHealthCheck = jest.fn();
const mockValidateRecordingWithBackoff = jest.fn();
const mockCreateAsync = jest.fn();
const mockUnloadAsync = jest.fn();

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: mockAddEventListener,
  },
  Alert: { alert: jest.fn() },
}));

jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: mockCreateAsync,
    },
  },
}));

jest.mock('../../modules/app-launcher', () => ({
  stopRecording: mockStopRecording,
  hideOverlay: mockHideOverlay,
  consumeLectureReturnRequest: mockConsumeLectureReturnRequest,
  isRecordingActive: mockIsRecordingActive,
  isOverlayActive: mockIsOverlayActive,
  validateRecordingFile: mockValidateRecordingFile,
  copyFileToPublicBackup: mockCopyFileToPublicBackup,
}));

jest.mock('../db/queries/externalLogs', () => ({
  getIncompleteExternalSession: mockGetIncompleteExternalSession,
  finishExternalAppSession: mockFinishExternalAppSession,
  updateSessionPipelineTelemetry: mockUpdateSessionPipelineTelemetry,
}));

jest.mock('../services/lecture/lectureSessionMonitor', () => ({
  retryFailedTranscriptions: mockRetryFailedTranscriptions,
  retryPendingNoteEnhancements: mockRetryPendingNoteEnhancements,
  stopRecordingHealthCheck: mockStopRecordingHealthCheck,
}));

jest.mock('../components/Toast', () => ({
  showToast: mockShowToast,
}));

jest.mock('../services/recordingValidation', () => ({
  validateRecordingWithBackoff: mockValidateRecordingWithBackoff,
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
    mockAddEventListener.mockImplementation((_event: string, handler: AppStateChangeHandler) => {
      appStateHandler = handler;
      return { remove: jest.fn() };
    });
    mockGetIncompleteExternalSession.mockResolvedValue(null);
    mockRetryFailedTranscriptions.mockResolvedValue(0);
    mockRetryPendingNoteEnhancements.mockResolvedValue(0);
    mockHideOverlay.mockResolvedValue(undefined);
    mockStopRecording.mockResolvedValue(null);
    mockConsumeLectureReturnRequest.mockResolvedValue(false);
    mockIsRecordingActive.mockResolvedValue(false);
    mockIsOverlayActive.mockResolvedValue(false);
    mockCopyFileToPublicBackup.mockResolvedValue(true);
    mockValidateRecordingWithBackoff.mockResolvedValue({ validated: true, attemptsUsed: 1 });
    mockValidateRecordingFile.mockResolvedValue({ exists: true, size: 1024 });
    mockCreateAsync.mockResolvedValue({
      sound: { unloadAsync: mockUnloadAsync },
      status: { isLoaded: true, durationMillis: 180000 },
    });
    mockUnloadAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (renderer) {
      renderer.unmount();
      renderer = null;
    }
  });

  it('recovers returned session and finalizes with audio-header duration', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    mockConsumeLectureReturnRequest.mockResolvedValue(true);
    mockGetIncompleteExternalSession.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 42,
      appName: 'Marrow',
      launchedAt: 1699999400000,
      recordingPath: 'file:///data/user/0/com.app/files/recordings/a.m4a',
    });
    mockStopRecording.mockResolvedValue('file:///data/user/0/com.app/files/recordings/a.m4a');

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await hookApi.checkForReturnedSession(true);
    });

    expect(mockValidateRecordingWithBackoff).toHaveBeenCalledWith(
      'file:///data/user/0/com.app/files/recordings/a.m4a',
      mockValidateRecordingFile,
    );
    expect(mockUpdateSessionPipelineTelemetry).toHaveBeenCalledWith(42, {
      validationAttempts: 1,
    });
    expect(mockFinishExternalAppSession).toHaveBeenCalledWith(42, 3);
    expect(mockStopRecordingHealthCheck).toHaveBeenCalled();
    expect(mockHideOverlay).toHaveBeenCalled();
    expect(onRecovered).toHaveBeenCalledWith({
      appName: 'Marrow',
      durationMinutes: 3,
      recordingPath: 'file:///data/user/0/com.app/files/recordings/a.m4a',
      logId: 42,
    });
  });

  it('silently finishes session when no recording exists after stop', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    mockConsumeLectureReturnRequest.mockResolvedValue(true);
    mockGetIncompleteExternalSession.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 77,
      appName: 'PrepLadder',
      launchedAt: 1699999700000,
      recordingPath: null,
    });
    mockStopRecording.mockResolvedValue(null);

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await hookApi.checkForReturnedSession(true);
    });

    expect(mockFinishExternalAppSession).toHaveBeenCalledWith(77, 5, 'Finished without recording');
    expect(onRecovered).not.toHaveBeenCalled();
    expect(mockHideOverlay).toHaveBeenCalled();
  });

  it('throttles periodic note-recovery calls and shows success toast', async () => {
    let now = 1700000000000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    mockGetIncompleteExternalSession.mockResolvedValue(null);
    mockRetryPendingNoteEnhancements.mockResolvedValue(1);

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    mockRetryFailedTranscriptions.mockClear();
    mockRetryPendingNoteEnhancements.mockClear();
    mockShowToast.mockClear();

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

    expect(mockRetryFailedTranscriptions).not.toHaveBeenCalled();
    expect(mockRetryPendingNoteEnhancements).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(
      '1 note finished processing. Check your notes.',
      'success',
      undefined,
      4000,
    );
  });

  it('triggers checks when app returns to active state', async () => {
    mockGetIncompleteExternalSession.mockResolvedValue(null);
    mockRetryFailedTranscriptions.mockResolvedValue(0);
    mockRetryPendingNoteEnhancements.mockResolvedValue(0);

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    expect(appStateHandler).toBeTruthy();
    expect(mockGetIncompleteExternalSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      appStateHandler?.('background');
      appStateHandler?.('active');
    });

    expect(mockGetIncompleteExternalSession).toHaveBeenCalledTimes(2);
  });

  it('does not finalize an active lecture just because the app returned to foreground', async () => {
    mockGetIncompleteExternalSession.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 88,
      appName: 'Marrow',
      launchedAt: 1699999400000,
      recordingPath: 'file:///recordings/live.m4a',
    });
    mockConsumeLectureReturnRequest.mockResolvedValue(false);
    mockIsRecordingActive.mockResolvedValue(true);
    mockIsOverlayActive.mockResolvedValue(true);

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await hookApi.checkForReturnedSession(true);
    });

    expect(mockStopRecording).not.toHaveBeenCalled();
    expect(mockFinishExternalAppSession).not.toHaveBeenCalled();
    expect(onRecovered).not.toHaveBeenCalled();
  });

  it('shows correct toast message for only notes', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    mockGetIncompleteExternalSession.mockResolvedValue(null);

    mockRetryPendingNoteEnhancements.mockResolvedValueOnce(0);
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    mockShowToast.mockClear();

    mockRetryPendingNoteEnhancements.mockResolvedValueOnce(1);
    await act(async () => {
      await hookApi.recoverPendingTranscriptions(true);
    });
    expect(mockShowToast).toHaveBeenCalledWith(
      '1 note finished processing. Check your notes.',
      'success',
      undefined,
      4000,
    );

    // Multiple notes
    mockRetryPendingNoteEnhancements.mockResolvedValueOnce(3);
    await act(async () => {
      await hookApi.recoverPendingTranscriptions(true);
    });
    expect(mockShowToast).toHaveBeenCalledWith(
      '3 notes finished processing. Check your notes.',
      'success',
      undefined,
      4000,
    );
  });

  it('handles errors in recoverPendingTranscriptions gracefully', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    mockRetryPendingNoteEnhancements.mockRejectedValue(new Error('Network error'));
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
    mockGetIncompleteExternalSession.mockResolvedValue({
      id: 88,
      appName: 'StaleApp',
      launchedAt: 1699999000000,
      recordingPath: 'some/path',
    });

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    expect(mockFinishExternalAppSession).toHaveBeenCalledWith(
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

    mockGetIncompleteExternalSession.mockResolvedValue({
      id: 99,
      appName: 'TestApp',
      launchedAt: 1699999000000,
      recordingPath: 'db/path',
    });
    // Simulate timeout by never resolving, or rejecting
    mockStopRecording.mockRejectedValue(new Error('Native error'));

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

    mockGetIncompleteExternalSession.mockResolvedValue({
      id: 101,
      appName: 'DataApp',
      launchedAt: 1699999000000,
      recordingPath: dataPath,
    });
    mockStopRecording.mockResolvedValue(dataPath);

    await act(async () => {
      await hookApi.checkForReturnedSession(true);
    });

    expect(mockCopyFileToPublicBackup).toHaveBeenCalledWith(
      '/data/user/0/com.app/files/rec.m4a',
      expect.any(String),
    );
  });

  it('falls back to wall-clock duration if audio duration detection fails', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000); // T=0

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    mockGetIncompleteExternalSession.mockResolvedValue({
      id: 102,
      appName: 'DurationApp',
      launchedAt: 1700000000000 - 600000, // 10 minutes ago
      recordingPath: 'path/to/audio',
    });
    mockCreateAsync.mockRejectedValue(new Error('Audio error'));

    await act(async () => {
      await hookApi.checkForReturnedSession(true);
    });

    expect(mockFinishExternalAppSession).toHaveBeenCalledWith(102, 10);
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

    mockGetIncompleteExternalSession.mockResolvedValue({
      id: 103,
      appName: 'ValidationApp',
      launchedAt: Date.now() - 60000,
      recordingPath: 'missing/file',
    });
    mockValidateRecordingWithBackoff.mockResolvedValue({ validated: false, attemptsUsed: 3 });
    mockValidateRecordingFile.mockResolvedValue({ exists: false, size: 0 });

    await act(async () => {
      await hookApi.checkForReturnedSession(true);
    });

    expect(mockShowToast).toHaveBeenCalledWith(
      "Recording file isn't ready yet — it may appear when you reopen the app.",
      'warning',
    );
    expect(mockUpdateSessionPipelineTelemetry).toHaveBeenCalledWith(103, {
      errorStage: 'validation',
    });
  });

  it('handles general errors in checkForReturnedSession', async () => {
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    mockGetIncompleteExternalSession.mockRejectedValue(new Error('DB failure'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    await act(async () => {
      await hookApi.checkForReturnedSession(true);
    });

    expect(mockShowToast).toHaveBeenCalledWith(
      "Couldn't process your lecture recording. Try opening the app again.",
      'error',
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('avoids re-processing the same session log', async () => {
    mockGetIncompleteExternalSession.mockResolvedValue({
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
    expect(mockFinishExternalAppSession).toHaveBeenCalledTimes(1);
  });
});
