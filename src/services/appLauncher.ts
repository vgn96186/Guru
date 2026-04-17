/**
 * Lecture app launcher: records from the device microphone. Lecture apps typically block
 * in-app audio capture (like screenshots), so we default to mic + speaker — user keeps
 * device speaker on so the mic can capture the lecture.
 */
import { Linking, Platform, Alert } from 'react-native';
import {
  finishExternalAppSession,
  startExternalAppSession,
  updateSessionRecordingPath,
  updateSessionTranscriptionStatus,
} from '../db/queries/externalLogs';
import {
  startRecordingHealthCheck,
  stopRecordingHealthCheck,
} from './lecture/lectureSessionMonitor';
import { queryClient } from './queryClient';
import { PROFILE_QUERY_KEY } from '../hooks/queries/useProfile';
import type { UserProfile } from '../types';
import {
  MOCK_EXTERNAL_LECTURE_AUDIO_ENABLED,
  MOCK_EXTERNAL_LECTURE_AUDIO_URL,
} from '../config/appConfig';
import {
  launchApp,
  isAppInstalled,
  startRecording,
  showOverlay,
  hideOverlay,
  stopRecording as nativeStopRecording,
} from '../../modules/app-launcher';
import { requestRecordingPermissions } from './appLauncher/permissions';
import { ensureOverlayPermission } from './appLauncher/overlay';

/** Time for OverlayService to call startForeground() before we switch away (Android 12+ requirement). */
const OVERLAY_START_DELAY_MS = 900;

export type SupportedMedicalApp =
  | 'marrow'
  | 'dbmci'
  | 'cerebellum'
  | 'prepladder'
  | 'bhatia'
  | 'youtube';

const YOUTUBE_PREFERRED_PACKAGES = ['org.schabi.newpipe', 'com.google.android.youtube'] as const;

export const MEDICAL_APP_SCHEMES: Record<
  SupportedMedicalApp,
  { androidStore: string; name: string; scheme: string }
> = {
  marrow: { androidStore: 'com.marrow', name: 'Marrow', scheme: 'marrow://' },
  dbmci: { androidStore: 'one.dbmci', name: 'DBMCI One', scheme: 'dbmci://' },
  cerebellum: {
    androidStore: 'com.cerebellummobileapp',
    name: 'Cerebellum',
    scheme: 'cerebellum://',
  },
  prepladder: {
    androidStore: 'com.prepladder.learningapp',
    name: 'Prepladder',
    scheme: 'prepladder://',
  },
  bhatia: { androidStore: 'com.dbmci.bhatia', name: 'Dr. Bhatia', scheme: 'dbmci://' },
  youtube: {
    androidStore: 'com.google.android.youtube',
    name: 'YouTube',
    scheme: 'vnd.youtube://',
  },
};

let _launchInProgress = false;

export interface LaunchMedicalAppOptions {
  /** Called when starting recording (we always use microphone). Use to show "keep speaker on" hint. */
  onMicUsed?: () => void;
  /** If set, an early transcription check runs ~45s after start and notifies if capture + API work. */
  groqKey?: string;
  /** If set, native recording streams PCM to Deepgram and writes a live transcript sidecar. */
  deepgramKey?: string;
  /** If set, used for the early transcription check when Groq is not available. */
  huggingFaceToken?: string;
  huggingFaceModel?: string;
  /** If set, used for the early transcription check when Groq is not available. */
  localWhisperPath?: string;
}

function alertRecordingStartFailed(): void {
  Alert.alert('Recording Failed', 'Could not start background recording. Please try again.');
}

async function startExternalRecordingWithFallback(
  deepgramKey?: string,
  groqKey?: string,
): Promise<string | null> {
  const trimmedDeepgramKey = deepgramKey?.trim();
  const trimmedGroqKey = groqKey?.trim();

  // Keep saved audio recording as the source of truth. The Deepgram/Groq sidecar is
  // strictly best-effort and exists only to prepare pomodoro-break quiz payloads.
  if (trimmedDeepgramKey && trimmedGroqKey) {
    try {
      console.log('[AppLauncher] Starting recording with live quiz sidecar enabled', {
        hasDeepgramKey: true,
        hasGroqKey: true,
      });
      return await startRecording('', trimmedDeepgramKey, trimmedGroqKey);
    } catch (error) {
      console.warn(
        '[AppLauncher] Live quiz sidecar startup failed; falling back to audio-only recording',
        error,
      );
    }
  }

  if (trimmedDeepgramKey || trimmedGroqKey) {
    console.log('[AppLauncher] External launch is using audio-only recording', {
      hasDeepgramKey: !!trimmedDeepgramKey,
      hasGroqKey: !!trimmedGroqKey,
    });
  }
  return startRecording('');
}

async function cleanupAbortedLaunch(
  logId: number | undefined,
  statusMessage: string,
  transcriptionMessage: string,
  stopRecordingWarnPrefix: string,
  finalizeWarnPrefix: string,
  overlayWarnPrefix: string,
): Promise<void> {
  stopRecordingHealthCheck();

  let finalRecordingPath: string | null = null;
  try {
    finalRecordingPath = await nativeStopRecording();
  } catch (stopErr) {
    console.warn(stopRecordingWarnPrefix, stopErr);
  }

  try {
    if (typeof logId === 'number') {
      if (finalRecordingPath) {
        await updateSessionRecordingPath(logId, finalRecordingPath);
      }
      await finishExternalAppSession(logId, 0, statusMessage);
      await updateSessionTranscriptionStatus(logId, 'no_audio', transcriptionMessage);
    }
  } catch (sessionErr) {
    console.warn(finalizeWarnPrefix, sessionErr);
  }

  try {
    await hideOverlay();
  } catch (overlayStopErr) {
    console.warn(overlayWarnPrefix, overlayStopErr);
  }
}

export async function launchMedicalApp(
  appKey: SupportedMedicalApp,
  faceTracking = false,
  options?: LaunchMedicalAppOptions,
): Promise<boolean> {
  if (_launchInProgress) return false;
  _launchInProgress = true;
  try {
    return await _launchMedicalAppInner(appKey, faceTracking, options);
  } finally {
    _launchInProgress = false;
  }
}

async function _launchMedicalAppInner(
  appKey: SupportedMedicalApp,
  faceTracking: boolean,
  options?: LaunchMedicalAppOptions,
): Promise<boolean> {
  const app = MEDICAL_APP_SCHEMES[appKey];
  if (Platform.OS !== 'android') return false;

  if (MOCK_EXTERNAL_LECTURE_AUDIO_ENABLED) {
    return launchMockLectureAudio(app.name, faceTracking, options);
  }

  let targetPackage = app.androidStore;
  let installed = await isAppInstalled(targetPackage);

  if (appKey === 'youtube') {
    installed = false;
    for (const pkg of YOUTUBE_PREFERRED_PACKAGES) {
      if (await isAppInstalled(pkg)) {
        targetPackage = pkg;
        installed = true;
        break;
      }
    }
  }

  let logId: number | undefined;

  if (installed) {
    try {
      let recordingPath: string | null = null;

      const micGranted = await requestRecordingPermissions();
      if (!micGranted) {
        Alert.alert(
          'Microphone Required',
          'Guru needs microphone access to capture the lecture audio while you use another app.',
        );
        return false;
      }

      const hasOverlay = await ensureOverlayPermission();
      if (!hasOverlay) {
        // user was likely already alerted by ensureOverlayPermission
        return false;
      }

      options?.onMicUsed?.();
      try {
        const deepgramKey = options?.deepgramKey?.trim();
        const groqKey = options?.groqKey?.trim();
        recordingPath = await startExternalRecordingWithFallback(
          deepgramKey || undefined,
          groqKey || undefined,
        );
        if (!recordingPath) {
          alertRecordingStartFailed();
          return false;
        }
        const huggingFaceToken = options?.huggingFaceToken?.trim();
        const localWhisperPath = options?.localWhisperPath?.trim();
        startRecordingHealthCheck(
          recordingPath,
          app.name,
          groqKey || huggingFaceToken || localWhisperPath
            ? {
                groqKey: groqKey || undefined,
                huggingFaceToken: huggingFaceToken || undefined,
                huggingFaceModel: options?.huggingFaceModel,
                localWhisperPath: localWhisperPath || undefined,
              }
            : undefined,
        );
        logId = await startExternalAppSession(app.name, recordingPath);
      } catch (e) {
        if (recordingPath) {
          try {
            await nativeStopRecording();
          } catch {
            /* ignore cleanup errors */
          }
        }
        console.warn('[AppLauncher] Recording start failed:', e);
        alertRecordingStartFailed();
        return false;
      }

      try {
        const profile = queryClient.getQueryData<UserProfile>(PROFILE_QUERY_KEY);
        const overlayTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Overlay start timed out')), 5000),
        );
        await Promise.race([
          showOverlay(
            app.name,
            faceTracking,
            profile?.pomodoroEnabled ?? true,
            profile?.pomodoroIntervalMinutes ?? 20,
          ),
          overlayTimeout,
        ]);
        await new Promise((r) => setTimeout(r, OVERLAY_START_DELAY_MS));
      } catch (overlayErr: unknown) {
        console.error('[AppLauncher] Overlay failed:', overlayErr);
        const msg = overlayErr instanceof Error ? overlayErr.message : 'Unknown overlay error';
        throw new Error(`Overlay failed: ${msg}`, { cause: overlayErr });
      }

      const opened = await launchApp(targetPackage);
      if (opened) {
        return true;
      } else {
        throw new Error(`Could not launch ${app.name}.`);
      }
    } catch (err: any) {
      console.error('[AppLauncher] Launch sequence failed:', err);
      Alert.alert('Launch Error', `Failed to open ${app.name}: ${err?.message || 'Unknown error'}`);
      await cleanupAbortedLaunch(
        logId,
        'Launch failed before lecture app opened',
        err?.message || 'Launch failed before lecture app opened',
        '[AppLauncher] Failed to stop recording after launch error:',
        '[AppLauncher] Failed to finalize aborted session:',
        '[AppLauncher] Failed to hide overlay after launch error:',
      );
      return false;
    }
  }

  try {
    await Linking.openURL(`market://details?id=${app.androidStore}`);
  } catch (marketErr) {
    console.warn('[AppLauncher] Market link failed, trying browser:', marketErr);
    try {
      await Linking.openURL(`https://play.google.com/store/apps/details?id=${app.androidStore}`);
    } catch (browserErr) {
      console.error('[AppLauncher] Browser link also failed:', browserErr);
      Alert.alert('Error', 'Could not open Play Store to install the app.');
    }
  }
  return false;
}

async function launchMockLectureAudio(
  appName: string,
  faceTracking: boolean,
  options?: LaunchMedicalAppOptions,
): Promise<boolean> {
  let logId: number | undefined;
  try {
    const micGranted = await requestRecordingPermissions();
    if (!micGranted) {
      Alert.alert(
        'Microphone Required',
        'Guru needs microphone access to capture the mock lecture audio.',
      );
      return false;
    }

    const hasOverlay = await ensureOverlayPermission();
    if (!hasOverlay) return false;

    options?.onMicUsed?.();
    const deepgramKey = options?.deepgramKey?.trim();
    const groqKey = options?.groqKey?.trim();
    const recordingPath = await startExternalRecordingWithFallback(
      deepgramKey || undefined,
      groqKey || undefined,
    );
    if (!recordingPath) {
      alertRecordingStartFailed();
      return false;
    }

    const huggingFaceToken = options?.huggingFaceToken?.trim();
    const localWhisperPath = options?.localWhisperPath?.trim();
    startRecordingHealthCheck(
      recordingPath,
      `${appName} (Mock Audio)`,
      groqKey || huggingFaceToken || localWhisperPath
        ? {
            groqKey: groqKey || undefined,
            huggingFaceToken: huggingFaceToken || undefined,
            huggingFaceModel: options?.huggingFaceModel,
            localWhisperPath: localWhisperPath || undefined,
          }
        : undefined,
    );
    logId = await startExternalAppSession(`${appName} (Mock Audio)`, recordingPath);

    const profile = queryClient.getQueryData<UserProfile>(PROFILE_QUERY_KEY);
    await showOverlay(
      `${appName} Mock`,
      faceTracking,
      profile?.pomodoroEnabled ?? true,
      profile?.pomodoroIntervalMinutes ?? 20,
    );
    await new Promise((r) => setTimeout(r, 600));

    await Linking.openURL(MOCK_EXTERNAL_LECTURE_AUDIO_URL);
    return true;
  } catch (err: any) {
    console.error('[AppLauncher] Mock lecture launch failed:', err);
    Alert.alert(
      'Mock Lecture Launch Error',
      `Failed to open mock lecture audio: ${err?.message || 'Unknown error'}`,
    );
    await cleanupAbortedLaunch(
      logId,
      'Mock lecture launch failed',
      err?.message || 'Mock lecture launch failed',
      '[AppLauncher] Failed to stop recording after mock launch error:',
      '[AppLauncher] Failed to finalize mock session:',
      '[AppLauncher] Failed to hide overlay after mock launch error:',
    );
    return false;
  }
}
