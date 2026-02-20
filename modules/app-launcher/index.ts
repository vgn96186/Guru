import { requireNativeModule } from 'expo-modules-core';

const GuruAppLauncher = requireNativeModule('GuruAppLauncher');

export async function launchApp(packageName: string): Promise<boolean> {
    return GuruAppLauncher.launchApp(packageName);
}

export async function isAppInstalled(packageName: string): Promise<boolean> {
    return GuruAppLauncher.isAppInstalled(packageName);
}

/** Starts background mic recording. Returns the output file path. */
export async function startRecording(): Promise<string> {
    return GuruAppLauncher.startRecording();
}

/** Stops recording. Returns the saved .m4a file path (or null if none was active). */
export async function stopRecording(): Promise<string | null> {
    return GuruAppLauncher.stopRecording();
}

/** Deletes the recording file after transcription to reclaim space. */
export async function deleteRecording(path: string): Promise<boolean> {
    return GuruAppLauncher.deleteRecording(path);
}
