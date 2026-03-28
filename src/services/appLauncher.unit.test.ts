import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const openURLMock = jest.fn();
const alertMock = jest.fn();
const startExternalAppSessionMock = jest.fn();
const finishExternalAppSessionMock = jest.fn();
const updateSessionRecordingPathMock = jest.fn();
const updateSessionTranscriptionStatusMock = jest.fn();
const startRecordingHealthCheckMock = jest.fn();
const stopRecordingHealthCheckMock = jest.fn();
const startRecordingMock = jest.fn();
const showOverlayMock = jest.fn();
const hideOverlayMock = jest.fn();
const nativeStopRecordingMock = jest.fn();
const requestRecordingPermissionsMock = jest.fn();
const ensureOverlayPermissionMock = jest.fn();
const launchAppMock = jest.fn();
const isAppInstalledMock = jest.fn();

async function loadAppLauncher({
  mockEnabled,
  mockUrl = 'https://example.com/mock.mp3',
}: {
  mockEnabled: boolean;
  mockUrl?: string;
}) {
  jest.resetModules();

  jest.doMock('react-native', () => ({
    Linking: { openURL: openURLMock },
    Platform: { OS: 'android' },
    Alert: { alert: alertMock },
  }));

  jest.doMock('../config/appConfig', () => ({
    MOCK_EXTERNAL_LECTURE_AUDIO_ENABLED: mockEnabled,
    MOCK_EXTERNAL_LECTURE_AUDIO_URL: mockUrl,
  }));

  jest.doMock('../db/queries/externalLogs', () => ({
    startExternalAppSession: startExternalAppSessionMock,
    finishExternalAppSession: finishExternalAppSessionMock,
    updateSessionRecordingPath: updateSessionRecordingPathMock,
    updateSessionTranscriptionStatus: updateSessionTranscriptionStatusMock,
  }));

  jest.doMock('./lecture/lectureSessionMonitor', () => ({
    startRecordingHealthCheck: startRecordingHealthCheckMock,
    stopRecordingHealthCheck: stopRecordingHealthCheckMock,
  }));

  jest.doMock('../store/useAppStore', () => ({
    useAppStore: {
      getState: () => ({
        profile: { pomodoroEnabled: true, pomodoroIntervalMinutes: 20 },
      }),
    },
  }));

  jest.doMock('../../modules/app-launcher', () => ({
    launchApp: launchAppMock,
    isAppInstalled: isAppInstalledMock,
    startRecording: startRecordingMock,
    showOverlay: showOverlayMock,
    hideOverlay: hideOverlayMock,
    stopRecording: nativeStopRecordingMock,
  }));

  jest.doMock('./appLauncher/permissions', () => ({
    requestRecordingPermissions: requestRecordingPermissionsMock,
  }));

  jest.doMock('./appLauncher/overlay', () => ({
    ensureOverlayPermission: ensureOverlayPermissionMock,
  }));

  return import('./appLauncher');
}

describe('appLauncher mock external lecture flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requestRecordingPermissionsMock as any).mockResolvedValue(true);
    (ensureOverlayPermissionMock as any).mockResolvedValue(true);
    (startRecordingMock as any).mockResolvedValue('file:///tmp/mock-recording.m4a');
    (startExternalAppSessionMock as any).mockResolvedValue(123);
    (showOverlayMock as any).mockResolvedValue(undefined);
    (openURLMock as any).mockResolvedValue(undefined);
    (isAppInstalledMock as any).mockResolvedValue(true);
    (launchAppMock as any).mockResolvedValue(true);
  });

  it('uses mock audio URL launch path when mock mode is enabled', async () => {
    const appLauncher = await loadAppLauncher({
      mockEnabled: true,
      mockUrl: 'https://example.com/lecture.mp3',
    });
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const ok = await appLauncher.launchMedicalApp('marrow', false, {
      groqKey: 'gk',
      deepgramKey: 'dgk',
    });

    expect(ok).toBe(true);
    expect(startRecordingMock).toHaveBeenCalledWith('', 'dgk', 'gk');
    expect(startExternalAppSessionMock).toHaveBeenCalledWith(
      'Marrow (Mock Audio)',
      'file:///tmp/mock-recording.m4a',
    );
    expect(startRecordingHealthCheckMock).toHaveBeenCalled();
    expect(showOverlayMock).toHaveBeenCalledWith('Marrow Mock', false, true, 20);
    expect(openURLMock).toHaveBeenCalledWith('https://example.com/lecture.mp3');
    expect(launchAppMock).not.toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('falls back safely when mock URL launch fails', async () => {
    const appLauncher = await loadAppLauncher({ mockEnabled: true });
    (openURLMock as any).mockRejectedValueOnce(new Error('browser blocked'));
    (nativeStopRecordingMock as any).mockResolvedValue('file:///tmp/final-recording.m4a');

    const ok = await appLauncher.launchMedicalApp('marrow');

    expect(ok).toBe(false);
    expect(stopRecordingHealthCheckMock).toHaveBeenCalled();
    expect(updateSessionRecordingPathMock).toHaveBeenCalledWith(
      123,
      'file:///tmp/final-recording.m4a',
    );
    expect(finishExternalAppSessionMock).toHaveBeenCalledWith(123, 0, 'Mock lecture launch failed');
    expect(updateSessionTranscriptionStatusMock).toHaveBeenCalledWith(
      123,
      'no_audio',
      'browser blocked',
    );
    expect(hideOverlayMock).toHaveBeenCalled();
  });

  it('keeps normal installed-app launch path when mock mode is disabled', async () => {
    const appLauncher = await loadAppLauncher({ mockEnabled: false });

    const ok = await appLauncher.launchMedicalApp('marrow');

    expect(ok).toBe(true);
    expect(startRecordingMock).toHaveBeenCalledWith('');
    expect(isAppInstalledMock).toHaveBeenCalledWith('com.marrow');
    expect(launchAppMock).toHaveBeenCalledWith('com.marrow');
    expect(openURLMock).not.toHaveBeenCalled();
  });

  it('enables the live quiz sidecar for installed-app launch when both deepgram and groq keys exist', async () => {
    const appLauncher = await loadAppLauncher({ mockEnabled: false });

    const ok = await appLauncher.launchMedicalApp('marrow', false, {
      groqKey: 'gk',
      deepgramKey: 'dgk',
    });

    expect(ok).toBe(true);
    expect(startRecordingMock).toHaveBeenCalledTimes(1);
    expect(startRecordingMock).toHaveBeenCalledWith('', 'dgk', 'gk');
    expect(startExternalAppSessionMock).toHaveBeenCalledWith(
      'Marrow',
      'file:///tmp/mock-recording.m4a',
    );
    expect(launchAppMock).toHaveBeenCalledWith('com.marrow');
  });

  it('falls back to audio-only recording when live quiz sidecar startup fails', async () => {
    const appLauncher = await loadAppLauncher({ mockEnabled: false });
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (startRecordingMock as any)
      .mockRejectedValueOnce(new Error('sidecar startup failed'))
      .mockResolvedValueOnce('file:///tmp/mock-recording.m4a');

    const ok = await appLauncher.launchMedicalApp('marrow', false, {
      groqKey: 'gk',
      deepgramKey: 'dgk',
    });

    expect(ok).toBe(true);
    expect(startRecordingMock).toHaveBeenNthCalledWith(1, '', 'dgk', 'gk');
    expect(startRecordingMock).toHaveBeenNthCalledWith(2, '');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[AppLauncher] Live quiz sidecar startup failed; falling back to audio-only recording',
      expect.any(Error),
    );
    consoleWarnSpy.mockRestore();
  });
});
