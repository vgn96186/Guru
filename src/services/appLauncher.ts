import { Linking, Platform, PermissionsAndroid } from 'react-native';
import { startExternalAppSession } from '../db/queries/externalLogs';
import { launchApp, isAppInstalled, startRecording } from '../../modules/app-launcher';

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
export async function launchMedicalApp(appKey: SupportedMedicalApp): Promise<boolean> {
    const app = MEDICAL_APP_SCHEMES[appKey];

    if (Platform.OS !== 'android') {
        console.warn('[AppLauncher] Android-only feature.');
        return false;
    }

    console.log(`[AppLauncher] Launching: ${app.name} (${app.androidStore})`);

    // Check if app is installed first
    const installed = await isAppInstalled(app.androidStore);
    console.log(`[AppLauncher] isAppInstalled: ${installed}`);

    if (installed) {
        try {
            // Request mic permission before recording (required on Android 6+)
            let recordingPath: string | undefined;
            try {
                const micGranted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                    {
                        title: 'Microphone Permission',
                        message: 'Guru needs microphone access to record your lecture for automatic topic detection.',
                        buttonPositive: 'Allow',
                        buttonNegative: 'Deny',
                    },
                );
                if (micGranted === PermissionsAndroid.RESULTS.GRANTED) {
                    recordingPath = await startRecording();
                } else {
                    console.warn('[AppLauncher] Mic permission denied — launching without recording');
                }
            } catch (e) { console.warn('[AppLauncher] Recording start failed:', e); }

            await launchApp(app.androidStore);
            console.log('[AppLauncher] ✅ Native launch succeeded');
            startExternalAppSession(app.name, recordingPath);
            return true;
        } catch (err: any) {
            console.log(`[AppLauncher] Native launch error: ${err?.message || err}`);
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
