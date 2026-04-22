import { requireNativeModule } from 'expo-modules-core';

export const GuruAppLauncher = requireNativeModule('GuruAppLauncher');

/** Wraps a native promise with a timeout to prevent indefinite hangs. */
function withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Native call '${name}' timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * Launch an external app by Android package name using an Intent.
 * @param packageName - e.g. `"com.marrowmed.marrow"` or `"com.prepladder.app"`
 * @returns `true` if the launch intent was fired, `false` if the app is not installed.
 */
export async function launchApp(packageName: string): Promise<boolean> {
  return withTimeout(GuruAppLauncher.launchApp(packageName), 10_000, 'launchApp');
}

/**
 * Check whether an app is installed on the device.
 * @param packageName - Android package name to check.
 * @returns `true` if installed and accessible via PackageManager.
 */
export async function isAppInstalled(packageName: string): Promise<boolean> {
  return withTimeout(GuruAppLauncher.isAppInstalled(packageName), 5_000, 'isAppInstalled');
}

/** Returns the Linux UID of an installed app, or -1 if not found. */
export async function getAppUid(packageName: string): Promise<number> {
  return GuruAppLauncher.getAppUid(packageName);
}

/**
 * Requests MediaProjection permission (system dialog) for internal audio capture.
 * Must be called before `startRecording()` when you want to capture audio from another app.
 * @returns `true` if user granted, `false` if denied or unavailable (< Android 10 / API 29).
 * @note On Android < 10 this always returns `false` — fall back to microphone recording.
 */
export async function requestMediaProjection(): Promise<boolean> {
  return GuruAppLauncher.requestMediaProjection();
}

/**
 * Starts background audio recording.
 * - **Android 10+ with MediaProjection granted**: captures internal audio from `targetPackage`.
 * - **Otherwise**: captures from the device microphone.
 *
 * The recording runs in `RecordingService` (a foreground service) so it survives app switching.
 * Call `stopRecording()` to flush and retrieve the file path.
 *
 * @param targetPackage - Package name of the lecture app to capture audio from.
 *   Pass `''` to always use the microphone regardless of MediaProjection status.
 * @returns A promise that resolves when the service has started (does not wait for recording to finish).
 */
export async function startRecording(
  targetPackage: string = '',
  liveTranscriptionKey?: string,
  insightGenerationKey?: string,
): Promise<string> {
  try {
    return await withTimeout(
      GuruAppLauncher.startRecording(
        targetPackage,
        liveTranscriptionKey || null,
        insightGenerationKey || null,
      ),
      15_000,
      'startRecording',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isArgumentMismatch =
      /received \d+ arguments?,? but \d+ (?:was|were) expected/i.test(message) ||
      /expected \d+ arguments?,? got \d+/i.test(message) ||
      /invalid args number/i.test(message);
    if (!isArgumentMismatch) {
      throw error;
    }
    console.warn(
      '[GuruAppLauncher] startRecording with live extras failed, retrying legacy signature',
      error,
    );
    return withTimeout(GuruAppLauncher.startRecording(targetPackage), 15_000, 'startRecording');
  }
}

/**
 * Stops the active recording and flushes the audio buffer to disk.
 * @returns Absolute path to the `.m4a` recording file in the app's internal storage,
 *   or `null` if no recording was active.
 * @note For long recordings (60+ min) the file may take 1–3 seconds to be fully written.
 *   Use `validateRecordingFile()` with retry logic after calling this.
 */
export async function stopRecording(): Promise<string | null> {
  return withTimeout(GuruAppLauncher.stopRecording(), 30_000, 'stopRecording');
}

/**
 * Deletes a recording file to reclaim storage space after transcription.
 * @param path - Absolute path returned by `stopRecording()` or `convertToWav()`.
 * @returns `true` if deleted successfully, `false` if file was not found.
 */
export async function deleteRecording(path: string): Promise<boolean> {
  return GuruAppLauncher.deleteRecording(path);
}

/**
 * Validates a recording file using the native Java `File` API.
 * More reliable than `expo-file-system` for paths in the app's internal storage.
 * @param path - Absolute file path to check.
 * @returns `{ exists: boolean; size: number }` — size is 0 if file does not exist.
 */
export async function validateRecordingFile(
  path: string,
): Promise<{ exists: boolean; size: number }> {
  return GuruAppLauncher.validateRecordingFile(path);
}

export async function isRecordingActive(): Promise<boolean> {
  return GuruAppLauncher.isRecordingActive();
}

export async function getRecordingElapsedSeconds(): Promise<number> {
  return withTimeout(
    GuruAppLauncher.getRecordingElapsedSeconds(),
    5_000,
    'getRecordingElapsedSeconds',
  );
}

export async function isOverlayActive(): Promise<boolean> {
  return GuruAppLauncher.isOverlayActive();
}

export async function consumeLectureReturnRequest(): Promise<boolean> {
  return GuruAppLauncher.consumeLectureReturnRequest();
}

export async function consumePomodoroBreakRequest(): Promise<boolean> {
  return GuruAppLauncher.consumePomodoroBreakRequest();
}

export async function readLiveTranscript(recordingPath: string): Promise<string | null> {
  return GuruAppLauncher.readLiveTranscript(recordingPath);
}

export async function readLectureInsights(recordingPath: string): Promise<string | null> {
  return GuruAppLauncher.readLectureInsights(recordingPath);
}

/**
 * Converts an M4A/AAC file to 16 kHz mono 16-bit PCM WAV format.
 * Required because `whisper.rn` only accepts WAV input.
 * @param m4aPath - Absolute path to the source `.m4a` file.
 * @returns Absolute path to the output `.wav` file, or `null` if conversion failed.
 */
export async function convertToWav(m4aPath: string): Promise<string | null> {
  return withTimeout(GuruAppLauncher.convertToWav(m4aPath), 60_000, 'convertToWav');
}

export interface NativeWavChunk {
  path: string;
  startSec: number;
  durationSec: number;
}

/**
 * Splits a WAV file into chunk WAV files using native byte-level I/O.
 * Avoids loading large base64 blobs in JS memory.
 */
export async function splitWavIntoChunks(
  wavPath: string,
  chunkDataBytes: number,
  stepBytes: number,
  minChunkBytes: number = 32_000,
): Promise<NativeWavChunk[]> {
  return GuruAppLauncher.splitWavIntoChunks(wavPath, chunkDataBytes, stepBytes, minChunkBytes);
}

/**
 * Pause an active recording (e.g. while the user leaves the lecture app briefly).
 * @returns `true` if the recording was paused successfully.
 */
export async function pauseRecording(): Promise<boolean> {
  return GuruAppLauncher.pauseRecording();
}

/**
 * Resume a paused recording.
 * @returns `true` if the recording was resumed successfully.
 */
export async function resumeRecording(): Promise<boolean> {
  return GuruAppLauncher.resumeRecording();
}

// ── Floating overlay ──────────────────────────────────────────────

/** Checks if the app has the `SYSTEM_ALERT_WINDOW` ("draw over other apps") permission. */
export async function canDrawOverlays(): Promise<boolean> {
  return GuruAppLauncher.canDrawOverlays();
}

/**
 * Opens Android system settings so the user can grant overlay permission.
 * @returns Resolves after the settings intent is sent (does not wait for user action).
 */
export async function requestOverlayPermission(): Promise<boolean> {
  return GuruAppLauncher.requestOverlayPermission();
}

/**
 * Shows a floating timer bubble on screen while user is in another app.
 *
 * Bubble ring colors:
 * - 🟣 Purple: timer only (no face tracking)
 * - 🟢 Green: face detected, focused
 * - 🟠 Orange: drowsy or looking away (`headEulerAngleY/X > 35°` or eyes < 30% open)
 * - 🔴 Red: face absent > 5 s (sends push notification after 15 s)
 *
 * @param appName - Display name shown in the overlay (e.g. `"Marrow"`).
 * @param faceTracking - If `true`, opens the front camera and runs ML Kit face detection.
 *   Requires camera permission. Gracefully degrades to purple (neutral) if camera unavailable.
 * @param pomodoroEnabled - If `true`, automatically suggests breaks based on interval.
 * @param pomodoroIntervalMinutes - Frequency of pomodoro suggestions in minutes.
 */
export async function showOverlay(
  appName: string,
  faceTracking = false,
  pomodoroEnabled = true,
  pomodoroIntervalMinutes = 20,
): Promise<boolean> {
  return withTimeout(
    GuruAppLauncher.showOverlay(appName, faceTracking, pomodoroEnabled, pomodoroIntervalMinutes),
    10_000,
    'showOverlay',
  );
}

/** Hides the floating timer bubble and stops `OverlayService`. */
export async function hideOverlay(): Promise<boolean> {
  return withTimeout(GuruAppLauncher.hideOverlay(), 5_000, 'hideOverlay');
}

export async function copyFileToPublicBackup(
  sourcePath: string,
  destFilename: string,
): Promise<boolean> {
  return GuruAppLauncher.copyFileToPublicBackup(sourcePath, destFilename);
}

export async function copyFileFromPublicBackup(
  filename: string,
  destPath: string,
): Promise<boolean> {
  return GuruAppLauncher.copyFileFromPublicBackup(filename, destPath);
}

export async function listPublicBackups(): Promise<string[]> {
  return GuruAppLauncher.listPublicBackups();
}

export async function getPublicBackupDir(): Promise<string> {
  return GuruAppLauncher.getPublicBackupDir();
}

export async function listPublicRecordings(): Promise<string[]> {
  return GuruAppLauncher.listPublicRecordings();
}

export async function getPublicRecordingsDir(): Promise<string> {
  return GuruAppLauncher.getPublicRecordingsDir();
}

export interface NativeRecordingEntry {
  name: string;
  path: string;
  size: number;
}

export interface NativeModelFileEntry {
  name: string;
  path: string;
  size: number;
  modifiedAt: number;
}

/**
 * Recursively finds all .m4a files under Documents/Guru/ (Recordings, Backups, etc.).
 * Returns entries with absolute path and size so no further validation is needed.
 */
/** Whether the app has MANAGE_EXTERNAL_STORAGE (full file access) on Android 11+. */
export async function hasAllFilesAccess(): Promise<boolean> {
  return GuruAppLauncher.hasAllFilesAccess();
}

/** Opens Android settings to grant MANAGE_EXTERNAL_STORAGE. Returns false if not needed. */
export async function requestAllFilesAccess(): Promise<boolean> {
  return GuruAppLauncher.requestAllFilesAccess();
}

export async function findAllRecordings(): Promise<NativeRecordingEntry[]> {
  return GuruAppLauncher.findAllRecordings();
}

/**
 * Scans an arbitrary absolute directory path for .m4a files recursively.
 * Returns empty array if path doesn't exist or isn't a directory.
 */
export async function scanPathForRecordings(absolutePath: string): Promise<NativeRecordingEntry[]> {
  return GuruAppLauncher.scanPathForRecordings(absolutePath);
}

export interface FolderPickResult {
  treeUri: string;
  label: string;
  entries: NativeRecordingEntry[];
}

/**
 * Opens the Android folder picker (SAF), scans the selected folder for .m4a files,
 * and persists read permission. Returns { treeUri, label, entries } or empty object if cancelled.
 */
export async function pickFolderAndScan(): Promise<FolderPickResult | null> {
  const result: Record<string, unknown> = await withTimeout(
    GuruAppLauncher.pickFolderAndScan(),
    120_000,
    'pickFolderAndScan',
  );
  if (!result || !result.treeUri) return null;
  return result as unknown as FolderPickResult;
}

/**
 * Re-scans a previously picked SAF tree URI for .m4a files.
 * Works with content:// URIs persisted via takePersistableUriPermission.
 */
export async function scanSafUri(uriString: string): Promise<NativeRecordingEntry[]> {
  return GuruAppLauncher.scanSafUri(uriString);
}

/**
 * Broadly scans common external-storage roots for LiteRT/LiteLLM model files.
 * Returns absolute paths with size and last-modified time for JS-side validation.
 */
export async function findLocalModelFiles(): Promise<NativeModelFileEntry[]> {
  return GuruAppLauncher.findLocalModelFiles();
}

/**
 * Concatenates multiple files into a single output file using streaming I/O.
 * Used by parallel chunk downloads to merge parts without loading them into memory.
 * @param inputPaths - Absolute paths to chunk files, in order.
 * @param outputPath - Absolute path for the merged output file.
 * @returns `true` if all chunks were concatenated successfully.
 */
export async function concatenateFiles(inputPaths: string[], outputPath: string): Promise<boolean> {
  return GuruAppLauncher.concatenateFiles(inputPaths, outputPath);
}

export async function isSamsungDevice(): Promise<boolean> {
  return GuruAppLauncher.isSamsungDevice();
}

export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  return GuruAppLauncher.isIgnoringBatteryOptimizations();
}

export async function requestIgnoreBatteryOptimizations(): Promise<boolean> {
  return GuruAppLauncher.requestIgnoreBatteryOptimizations();
}

export async function openSamsungDeviceCare(): Promise<boolean> {
  return GuruAppLauncher.openSamsungDeviceCare();
}

export async function isSPenSupported(): Promise<boolean> {
  return GuruAppLauncher.isSPenSupported();
}
export async function startSPenListening(): Promise<boolean> {
  return GuruAppLauncher.startSPenListening();
}
export async function stopSPenListening(): Promise<boolean> {
  return GuruAppLauncher.stopSPenListening();
}

// ---------------------------------------------------------------------------
// Samsung Performance SDK bridge (perfsdk-v1.0.0)
// ---------------------------------------------------------------------------

/** Mirrors `com.samsung.sdk.sperf.PerformanceManager` preset constants. */
export const SamsungPerfPreset = {
  CPU: 0,
  GPU: 1,
  BUS: 2,
} as const;
export type SamsungPerfPresetType = (typeof SamsungPerfPreset)[keyof typeof SamsungPerfPreset];

/** Mirrors `com.samsung.sdk.sperf.CustomParams` TYPE_* constants. */
export const SamsungPerfCustomType = {
  CPU_MIN: 0,
  CPU_MAX: 1,
  GPU_MIN: 2,
  GPU_MAX: 3,
  BUS_MIN: 4,
  BUS_MAX: 5,
  CPU_CORE_NUM_MIN: 6,
  CPU_CORE_NUM_MAX: 7,
  CPU_AWAKE: 8,
  TASK_PRIORITY: 9,
  TASK_AFFINITY: 10,
} as const;

export type SamsungPerfCustomTriple = [type: number, value: number, durationMs: number];

export const samsungPerf = {
  /** Initialise SPerf. Returns true only on Samsung devices where init succeeded. */
  init(): Promise<boolean> {
    return withTimeout(GuruAppLauncher.samsungPerfInit(), 3_000, 'samsungPerfInit');
  },
  isSamsung(): Promise<boolean> {
    return GuruAppLauncher.samsungPerfIsSamsung();
  },
  /** Returns a boostId (>=0) or -1 on failure. */
  startPreset(preset: SamsungPerfPresetType, durationMs: number): Promise<number> {
    return GuruAppLauncher.samsungPerfStartPreset(preset, durationMs);
  },
  /** Returns 0 on success, negative on failure. */
  startCustom(params: SamsungPerfCustomTriple[]): Promise<number> {
    return GuruAppLauncher.samsungPerfStartCustom(params);
  },
  stop(boostId: number): Promise<number> {
    return GuruAppLauncher.samsungPerfStop(boostId);
  },
  stopAll(): Promise<number> {
    return GuruAppLauncher.samsungPerfStopAll();
  },
  shutdown(): Promise<boolean> {
    return GuruAppLauncher.samsungPerfShutdown();
  },
};
