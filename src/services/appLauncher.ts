/**
 * Lecture app launcher: records from the device microphone. Lecture apps typically block
 * in-app audio capture (like screenshots), so we default to mic + speaker — user keeps
 * device speaker on so the mic can capture the lecture.
 */
import { Linking, Platform, Alert } from 'react-native';
import { startExternalAppSession } from '../db/queries/externalLogs';
import { startRecordingHealthCheck, stopRecordingHealthCheck } from './lectureSessionMonitor';
import {
  launchApp,
  isAppInstalled,
  startRecording,
  showOverlay,
  stopRecording as nativeStopRecording,
} from '../../modules/app-launcher';
import { requestRecordingPermissions } from './appLauncher/permissions';
import {
  ensureOverlayPermission,
} from './appLauncher/overlay';

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
  /** If set, used for the early transcription check when Groq is not available. */
  localWhisperPath?: string;
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

  if (installed) {
    try {
      let recordingPath: string | undefined;

      const micGranted = await requestRecordingPermissions();
      if (!micGranted) {
        Alert.alert('Microphone Required', 'Guru needs microphone access to capture the lecture audio while you use another app.');
        return false;
      }

      const hasOverlay = await ensureOverlayPermission();
      if (!hasOverlay) {
        // user was likely already alerted by ensureOverlayPermission
        return false;
      }

      options?.onMicUsed?.();
      try {
        recordingPath = await startRecording('');
        if (recordingPath) {
          const groqKey = options?.groqKey?.trim();
          const localWhisperPath = options?.localWhisperPath?.trim();
          startRecordingHealthCheck(
            recordingPath,
            app.name,
            groqKey || localWhisperPath ? { groqKey, localWhisperPath } : undefined,
          );
        }
      } catch (e) {
        console.warn('[AppLauncher] Recording start failed:', e);
        Alert.alert('Recording Failed', 'Could not start background recording. Audio will not be captured.');
      }

      try {
        await showOverlay(app.name, faceTracking);
      } catch (overlayErr) {
        console.error('[AppLauncher] Overlay failed:', overlayErr);
      }

      const opened = await launchApp(targetPackage);
      if (opened) {
        await startExternalAppSession(app.name, recordingPath);
        return true;
      } else {
        throw new Error(`Could not launch ${app.name}.`);
      }
    } catch (err: any) {
      console.error('[AppLauncher] Launch sequence failed:', err);
      Alert.alert('Launch Error', `Failed to open ${app.name}: ${err?.message || 'Unknown error'}`);
      
      stopRecordingHealthCheck();
      try {
        await nativeStopRecording();
      } catch (stopErr) {
        console.warn('[AppLauncher] Failed to stop recording after launch error:', stopErr);
      }
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
