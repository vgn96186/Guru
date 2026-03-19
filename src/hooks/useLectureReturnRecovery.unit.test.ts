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
});
