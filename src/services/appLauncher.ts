/**
 * Lecture app launcher: records from the device microphone. Lecture apps typically block
 * in-app audio capture (like screenshots), so we default to mic + speaker — user keeps
 * device speaker on so the mic can capture the lecture.
 */
import { Linking, Platform } from 'react-native';
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
  canDrawOverlays,
  requestOverlayPermission,
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
  // #region agent log
  fetch('http://127.0.0.1:7577/ingest/cf45e1bf-3934-4bc4-b4d9-3a9c3a75ee92', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '03c55c' },
    body: JSON.stringify({
      sessionId: '03c55c',
      location: 'appLauncher.ts:launchMedicalApp',
      message: 'entry',
      data: { appKey, faceTracking, platform: Platform.OS },
      timestamp: Date.now(),
      hypothesisId: 'H1',
    }),
  }).catch(() => {});
  // #endregion
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
  // #region agent log
  fetch('http://127.0.0.1:7577/ingest/cf45e1bf-3934-4bc4-b4d9-3a9c3a75ee92', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '03c55c' },
    body: JSON.stringify({
      sessionId: '03c55c',
      location: 'appLauncher.ts:after isAppInstalled',
      message: 'install check',
      data: { appKey, targetPackage, installed },
      timestamp: Date.now(),
      hypothesisId: 'H1',
    }),
  }).catch(() => {});
  // #endregion
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
      if (micGranted) {
        options?.onMicUsed?.();
        try {
          // #region agent log
          fetch('http://127.0.0.1:7577/ingest/cf45e1bf-3934-4bc4-b4d9-3a9c3a75ee92', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '03c55c' },
            body: JSON.stringify({
              sessionId: '03c55c',
              location: 'appLauncher.ts:before startRecording',
              message: 'before native startRecording',
              data: { targetPackage, useInternal: false },
              timestamp: Date.now(),
              hypothesisId: 'H2',
            }),
          }).catch(() => {});
          // #endregion
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
        }
      }

      // #region agent log
      fetch('http://127.0.0.1:7577/ingest/cf45e1bf-3934-4bc4-b4d9-3a9c3a75ee92', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '03c55c' },
        body: JSON.stringify({
          sessionId: '03c55c',
          location: 'appLauncher.ts:before ensureOverlay',
          message: 'before overlay',
          data: { appName: app.name },
          timestamp: Date.now(),
          hypothesisId: 'H3',
        }),
      }).catch(() => {});
      // #endregion
      const hasOverlay = await ensureOverlayPermission();
      if (hasOverlay) {
        await showOverlay(app.name, faceTracking);
      }

      // #region agent log
      fetch('http://127.0.0.1:7577/ingest/cf45e1bf-3934-4bc4-b4d9-3a9c3a75ee92', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '03c55c' },
        body: JSON.stringify({
          sessionId: '03c55c',
          location: 'appLauncher.ts:before launchApp',
          message: 'before native launchApp',
          data: { targetPackage },
          timestamp: Date.now(),
          hypothesisId: 'H2',
        }),
      }).catch(() => {});
      // #endregion
      await launchApp(targetPackage);
      // #region agent log
      fetch('http://127.0.0.1:7577/ingest/cf45e1bf-3934-4bc4-b4d9-3a9c3a75ee92', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '03c55c' },
        body: JSON.stringify({
          sessionId: '03c55c',
          location: 'appLauncher.ts:before startExternalAppSession',
          message: 'before DB insert',
          data: { appName: app.name },
          timestamp: Date.now(),
          hypothesisId: 'H4',
        }),
      }).catch(() => {});
      // #endregion
      await startExternalAppSession(app.name, recordingPath);
      return true;
    } catch (err: any) {
      // #region agent log
      fetch('http://127.0.0.1:7577/ingest/cf45e1bf-3934-4bc4-b4d9-3a9c3a75ee92', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '03c55c' },
        body: JSON.stringify({
          sessionId: '03c55c',
          location: 'appLauncher.ts:catch',
          message: 'installed path error',
          data: { errMessage: String(err?.message), errName: String(err?.name) },
          timestamp: Date.now(),
          hypothesisId: 'H5',
        }),
      }).catch(() => {});
      // #endregion
      stopRecordingHealthCheck();
      try {
        await nativeStopRecording();
      } catch {}
    }
  }

  try {
    await Linking.openURL(`market://details?id=${app.androidStore}`);
  } catch {
    await Linking.openURL(`https://play.google.com/store/apps/details?id=${app.androidStore}`);
  }
  return false;
}
