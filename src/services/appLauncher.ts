import { Linking, Platform, PermissionsAndroid } from 'react-native';
import { startExternalAppSession } from '../db/queries/externalLogs';
import { startRecordingHealthCheck, stopRecordingHealthCheck } from './lectureSessionMonitor';
import {
    launchApp, isAppInstalled, startRecording, requestMediaProjection,
    canDrawOverlays, requestOverlayPermission, showOverlay,
} from '../../modules/app-launcher';

export type SupportedMedicalApp = 'marrow' | 'dbmci' | 'cerebellum' | 'prepladder' | 'bhatia' | 'youtube';

const YOUTUBE_PREFERRED_PACKAGES = ['org.schabi.newpipe', 'com.google.android.youtube'] as const;

export const MEDICAL_APP_SCHEMES: Record<SupportedMedicalApp, { androidStore: string, name: string, scheme: string }> = {
    marrow: {
        androidStore: 'com.marrow',
        name: 'Marrow',
        scheme: 'marrow://'
    },
    dbmci: {
        androidStore: 'one.dbmci',
        name: 'DBMCI One',
        scheme: 'dbmci://'
    },
    cerebellum: {
        androidStore: 'com.cerebellummobileapp',
        name: 'Cerebellum',
        scheme: 'cerebellum://'
    },
    prepladder: {
        androidStore: 'com.prepladder.learningapp',
        name: 'Prepladder',
        scheme: 'prepladder://'
    },
    bhatia: {
        androidStore: 'com.dbmci.bhatia',
        name: 'Dr. Bhatia',
        scheme: 'dbmci://'
    },
    youtube: {
        androidStore: 'com.google.android.youtube',
        name: 'YouTube',
        scheme: 'vnd.youtube://'
    }
};

/**
 * Launches a 3rd-party medical app using native Android getLaunchIntentForPackage.
 * Falls back to Play Store if not installed.
 */
let _launchInProgress = false;
export async function launchMedicalApp(appKey: SupportedMedicalApp, faceTracking = false): Promise<boolean> {
    // Debounce: prevent double-tap launching two recordings/overlays
    if (_launchInProgress) return false;
    _launchInProgress = true;
    try {
      return await _launchMedicalAppInner(appKey, faceTracking);
    } finally {
      _launchInProgress = false;
    }
}

async function _launchMedicalAppInner(appKey: SupportedMedicalApp, faceTracking: boolean): Promise<boolean> {
    const app = MEDICAL_APP_SCHEMES[appKey];

    if (Platform.OS !== 'android') {
        if (__DEV__) console.warn('[AppLauncher] Android-only feature.');
        return false;
    }

console.log(`[AppLauncher] Launching: ${app.name} (${app.androidStore})`);

    // Check if app is installed first
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

    // All apps get overlay + mic recording now (mic captures speaker audio for transcription)
console.log(`[AppLauncher] isAppInstalled: ${installed}`);

    if (installed) {
        try {
            // ── Setup permissions & recording BEFORE launching the app ──
            // MediaProjection dialog needs our activity in foreground
            let recordingPath: string | undefined;
            let useInternal = false;
            const forceMicMode = appKey === 'youtube' || targetPackage === 'com.google.android.youtube' || targetPackage === 'org.schabi.newpipe';

            if (true) { // All apps get recording + overlay
                let micGranted = await PermissionsAndroid.check(
                    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                );
                if (!micGranted) {
                    const result = await PermissionsAndroid.request(
                        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                    );
                    micGranted = result === PermissionsAndroid.RESULTS.GRANTED;
                }

                // 2. Try internal audio capture (shows system dialog while we're still in foreground)
                if (micGranted && !forceMicMode) {
                    try {
                        useInternal = await requestMediaProjection();
                        console.log(`[AppLauncher] MediaProjection granted: ${useInternal}`);
                    } catch (e) {
                        console.log('[AppLauncher] MediaProjection failed, will use mic');
                    }
                } else if (forceMicMode) {
                    console.log('[AppLauncher] Forcing microphone capture for YouTube/NewPipe');
                }

                // 3. Start recording before launching (so we capture from the start)
                if (micGranted) {
                    try {
                        recordingPath = await startRecording(useInternal ? targetPackage : '');
                        console.log(`[AppLauncher] Recording started (${useInternal ? 'internal' : 'mic'}), path: ${recordingPath}`);
                        if (recordingPath) {
                            startRecordingHealthCheck(recordingPath, app.name);
                        }
                    } catch (e) {
                        console.warn('[AppLauncher] Recording start failed:', e);
                    }
                } else {
                    console.warn('[AppLauncher] Mic permission NOT granted — cannot record');
                }
            }

            // ── Show overlay ──
            {
                try {
                    const hasOverlay = await canDrawOverlays();
                    if (hasOverlay) {
                        await showOverlay(app.name, faceTracking);
                        console.log('[AppLauncher] Overlay shown');
                    } else {
                        requestOverlayPermission().catch(() => {});
                        console.log('[AppLauncher] Overlay permission requested');
                    }
                } catch (e) {
                    console.warn('[AppLauncher] Overlay failed:', e);
                }
            }

            // ── Launch the external app ──
            await launchApp(targetPackage);
            console.log('[AppLauncher] Native launch succeeded');

            startExternalAppSession(app.name, recordingPath);
            return true;
        } catch (err: any) {
            console.log(`[AppLauncher] Native launch error: ${err?.message || err}`);
            // Stop both the health check and the native recording service
            stopRecordingHealthCheck();
            try {
                const { stopRecording: nativeStopRecording } = require('../../modules/app-launcher');
                await nativeStopRecording();
            } catch {}
        }
    }

    // Not installed — open Play Store
console.log('[AppLauncher] Opening Play Store...');
    try {
        await Linking.openURL(`market://details?id=${app.androidStore}`);
    } catch {
        await Linking.openURL(`https://play.google.com/store/apps/details?id=${app.androidStore}`);
    }
    return false;
}
