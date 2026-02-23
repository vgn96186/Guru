import { Linking, Platform, PermissionsAndroid } from 'react-native';
import { startExternalAppSession } from '../db/queries/externalLogs';
import {
    launchApp, isAppInstalled, startRecording, requestMediaProjection,
    canDrawOverlays, requestOverlayPermission, showOverlay,
} from '../../modules/app-launcher';

export type SupportedMedicalApp = 'marrow' | 'dbmci' | 'cerebellum' | 'prepladder' | 'bhatia';

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
    }
};

/**
 * Launches a 3rd-party medical app using native Android getLaunchIntentForPackage.
 * Falls back to Play Store if not installed.
 */
export async function launchMedicalApp(appKey: SupportedMedicalApp, faceTracking = false): Promise<boolean> {
    const app = MEDICAL_APP_SCHEMES[appKey];

    if (Platform.OS !== 'android') {
        if (__DEV__) console.warn('[AppLauncher] Android-only feature.');
        return false;
    }

// if (__DEV__) console.log(`[AppLauncher] Launching: ${app.name} (${app.androidStore})`);

    // Check if app is installed first
    const installed = await isAppInstalled(app.androidStore);
// if (__DEV__) console.log(`[AppLauncher] isAppInstalled: ${installed}`);

    if (installed) {
        try {
            let recordingPath: string | undefined;
            try {
                // 1. Try to get MediaProjection for internal audio capture (no mic noise)
                //    This shows a one-time system dialog: "Start recording or casting?"
                let projectionGranted = false;
                try {
                    projectionGranted = await requestMediaProjection();
// if (__DEV__) console.log(`[AppLauncher] MediaProjection granted: ${projectionGranted}`);
                } catch (e) {
                    if (__DEV__) console.warn('[AppLauncher] MediaProjection request failed:', e);
                }

                // 2. If projection denied, fall back to mic — still need mic permission
                if (!projectionGranted) {
                    const micGranted = await PermissionsAndroid.request(
                        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                        {
                            title: 'Microphone Permission',
                            message: 'Guru needs microphone access to record your lecture for automatic topic detection.',
                            buttonPositive: 'Allow',
                            buttonNegative: 'Deny',
                        },
                    );
                    if (micGranted !== PermissionsAndroid.RESULTS.GRANTED) {
                        if (__DEV__) console.warn('[AppLauncher] Mic permission denied — launching without recording');
                    }
                }

                // 3. Start recording — passes package name so internal capture
                //    filters to only that app's audio output
                recordingPath = await startRecording(
                    projectionGranted ? app.androidStore : ''
                );
            } catch (e) { if (__DEV__) console.warn('[AppLauncher] Recording start failed:', e); }

            await launchApp(app.androidStore);
// if (__DEV__) console.log('[AppLauncher] Native launch succeeded');
            startExternalAppSession(app.name, recordingPath);

            // Show floating timer bubble if overlay permission is granted
            try {
                const hasOverlay = await canDrawOverlays();
                if (hasOverlay) {
                    await showOverlay(app.name, faceTracking);
// if (__DEV__) console.log('[AppLauncher] Overlay shown');
                } else {
                    // First launch: request permission (opens settings)
                    // The overlay will work on next launch after user grants it
                    requestOverlayPermission().catch(() => {});
// if (__DEV__) console.log('[AppLauncher] Overlay permission requested');
                }
            } catch (e) {
                if (__DEV__) console.warn('[AppLauncher] Overlay failed:', e);
            }

            return true;
        } catch (err: any) {
// if (__DEV__) console.log(`[AppLauncher] Native launch error: ${err?.message || err}`);
        }
    }

    // Not installed — open Play Store
// if (__DEV__) console.log('[AppLauncher] Opening Play Store...');
    try {
        await Linking.openURL(`market://details?id=${app.androidStore}`);
    } catch {
        await Linking.openURL(`https://play.google.com/store/apps/details?id=${app.androidStore}`);
    }
    return false;
}
