import { requireNativeModule } from 'expo-modules-core';

const GuruAppLauncher = requireNativeModule('GuruAppLauncher');

export async function launchApp(packageName: string): Promise<boolean> {
    return GuruAppLauncher.launchApp(packageName);
}

export async function isAppInstalled(packageName: string): Promise<boolean> {
    return GuruAppLauncher.isAppInstalled(packageName);
}

/** Returns the Linux UID of an installed app, or -1 if not found. */
export async function getAppUid(packageName: string): Promise<number> {
    return GuruAppLauncher.getAppUid(packageName);
}

/**
 * Requests MediaProjection permission (system dialog) for internal audio capture.
 * Returns true if user granted, false if denied or unavailable (< Android 10).
 */
export async function requestMediaProjection(): Promise<boolean> {
    return GuruAppLauncher.requestMediaProjection();
}

/**
 * Starts audio recording.
 * @param targetPackage — package name of the app to capture audio from.
 *   If MediaProjection was granted and API 29+, captures only that app's audio.
 *   Otherwise falls back to microphone recording.
 *   Pass empty string '' to always use microphone.
 */
export async function startRecording(targetPackage: string = ''): Promise<string> {
    return GuruAppLauncher.startRecording(targetPackage);
}

/** Stops recording. Returns the saved .m4a file path (or null if none was active). */
export async function stopRecording(): Promise<string | null> {
    return GuruAppLauncher.stopRecording();
}

/** Deletes the recording file after transcription to reclaim space. */
export async function deleteRecording(path: string): Promise<boolean> {
    return GuruAppLauncher.deleteRecording(path);
}

// ── Floating overlay ──────────────────────────────────────────────

/** Checks if the app has "draw over other apps" permission. */
export async function canDrawOverlays(): Promise<boolean> {
    return GuruAppLauncher.canDrawOverlays();
}

/** Opens system settings to grant overlay permission. */
export async function requestOverlayPermission(): Promise<boolean> {
    return GuruAppLauncher.requestOverlayPermission();
}

/** Shows a floating timer bubble on screen while user is in another app. */
export async function showOverlay(appName: string): Promise<boolean> {
    return GuruAppLauncher.showOverlay(appName);
}

/** Hides the floating timer bubble. */
export async function hideOverlay(): Promise<boolean> {
    return GuruAppLauncher.hideOverlay();
}
