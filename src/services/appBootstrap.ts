/**
 * App bootstrap service — handles cold-start initialization:
 * DB, offline queue, background fetch, confidence decay, local model download.
 * Replaces the former scripts/ patching approach with a single orchestration point.
 */
import * as SplashScreen from 'expo-splash-screen';
import * as FileSystem from 'expo-file-system/legacy';
import {
  initDatabase,
  getDb,
  resetDbSingleton,
  walCheckpoint,
  closeDbGracefully,
} from '../db/database';
import { startMissingTopicEmbeddingSeed } from './ai/embeddingService';
import { registerBackgroundFetch } from './backgroundTasks';
import { bootstrapLocalModels } from './localModelBootstrap';
import { profileRepository, dailyLogRepository } from '../db/repositories';
import { registerOfflineQueueProcessors } from './offlineQueueBootstrap';
import { processQueue } from './offlineQueue';
import { enforceLocalLlmRamGuard, isBackgroundRecoveryAllowed } from './deviceMemory';
import { stripFileUri } from './fileUri';
import { cleanupStaleCheckpointDirs } from './lecture/transcription';
import {
  autoRepairLegacyNotes,
  scanAndRecoverOrphanedRecordings,
  scanAndRecoverOrphanedTranscripts,
} from './lecture/lectureSessionMonitor';
import {
  configureGoogleSignIn,
  downloadLatestFromGDrive,
  isGDriveConnected,
} from './gdriveBackupService';
import { listPublicBackups, copyFileFromPublicBackup } from '../../modules/app-launcher';
import { showToast } from '../components/Toast';
import { unzip } from 'react-native-zip-archive';
import { validateBackupFile } from './unifiedBackupService';
import { GOOGLE_WEB_CLIENT_ID } from '../config/appConfig';
import { reportStartupHealth } from './startupHealth';
import { isSkippableOptionalStartupError } from './appBootstrapErrors';

export interface BootstrapResult {
  success: true;
}

export interface BootstrapError {
  success: false;
  message: string;
}

export type BootstrapOutcome = BootstrapResult | BootstrapError;

export type InitialRoute = 'Tabs' | 'CheckIn';

/**
 * Checks if this is a fresh install (no meaningful user data).
 * More robust than checking a single table count.
 */
async function isFreshInstall(): Promise<boolean> {
  const db = getDb();
  try {
    const profile = await db.getFirstAsync<{ total_xp: number }>(
      'SELECT total_xp FROM user_profile WHERE id = 1',
    );
    if (profile && profile.total_xp > 0) return false;

    const progress = await db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM topic_progress WHERE status != 'unseen'",
    );
    if (progress && progress.c > 0) return false;

    return true;
  } catch {
    return true; // If we can't even query, treat as fresh
  }
}

const DB_PATH = FileSystem.documentDirectory + 'SQLite/neet_study.db';
const TEMP_RESTORE_DIR = `${FileSystem.cacheDirectory}guru_boot_restore/`;

/**
 * On fresh install, check for an existing backup to restore from:
 * 1. GDrive (if cached session exists) — newest cross-device backup
 * 2. Public storage guru_latest.guru (survives uninstall)
 * 3. Legacy guru_latest.db fallback
 */
async function checkAndRestoreFromPublicBackup(): Promise<boolean> {
  if (!(await isFreshInstall())) return false;

  // Try GDrive first
  try {
    if (await isGDriveConnected()) {
      const gdriveBackupPath = await downloadLatestFromGDrive();
      if (gdriveBackupPath) {
        const restored = await restoreGuruBackup(gdriveBackupPath, 'Google Drive');
        if (restored) return true;
      }
    }
  } catch {
    // GDrive not available — continue to local fallback
  }

  // Check public storage for .guru format backup
  const backups = await listPublicBackups();

  if (backups.includes('guru_latest.guru')) {
    const tempGuruPath = `${FileSystem.cacheDirectory}guru_boot_latest.guru`;
    const copied = await copyFileFromPublicBackup('guru_latest.guru', stripFileUri(tempGuruPath));
    if (copied) {
      const restored = await restoreGuruBackup(tempGuruPath, 'local backup');
      await FileSystem.deleteAsync(tempGuruPath, { idempotent: true });
      if (restored) return true;
    }
  }

  // Legacy fallback: plain .db file
  if (backups.includes('guru_latest.db')) {
    try {
      await walCheckpoint();
    } catch {
      /* may not have active DB */
    }
    try {
      await closeDbGracefully();
    } catch {
      /* ignore */
    }
    resetDbSingleton();

    await copyFileFromPublicBackup('guru_latest.db', stripFileUri(DB_PATH));
    await initDatabase();
    showToast('Restored your progress from backup', 'success', undefined, 5000);
    return true;
  }

  return false;
}

/**
 * Restore from a .guru ZIP backup file. Handles extraction, validation,
 * DB replacement, and asset recovery.
 */
async function restoreGuruBackup(guruFilePath: string, source: string): Promise<boolean> {
  try {
    const validation = await validateBackupFile(guruFilePath);
    if (!validation.valid) {
      console.warn(`[Bootstrap] Invalid ${source} backup:`, validation.error);
      return false;
    }

    const tempDir = `${TEMP_RESTORE_DIR}${Date.now()}/`;
    await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });
    await unzip(guruFilePath, tempDir);

    const extractedDbPath = `${tempDir}neet_study.db`;
    const dbInfo = await FileSystem.getInfoAsync(extractedDbPath);
    if (!dbInfo.exists) {
      await FileSystem.deleteAsync(tempDir, { idempotent: true });
      return false;
    }

    // Close current DB and replace
    try {
      await walCheckpoint();
    } catch {
      /* may not have active DB */
    }
    try {
      await closeDbGracefully();
    } catch {
      /* ignore */
    }
    resetDbSingleton();

    await FileSystem.copyAsync({ from: extractedDbPath, to: DB_PATH });

    // Restore assets if present
    const assetDirs = [
      { src: `${tempDir}assets/transcripts/`, dest: `${FileSystem.documentDirectory}transcripts/` },
      { src: `${tempDir}assets/images/`, dest: `${FileSystem.documentDirectory}generated_images/` },
      { src: `${tempDir}assets/recordings/`, dest: `${FileSystem.documentDirectory}recordings/` },
    ];
    for (const { src, dest } of assetDirs) {
      const srcInfo = await FileSystem.getInfoAsync(src);
      if (!srcInfo.exists) continue;
      await FileSystem.makeDirectoryAsync(dest, { intermediates: true });
      const files = await FileSystem.readDirectoryAsync(src);
      for (const file of files) {
        try {
          await FileSystem.copyAsync({ from: `${src}${file}`, to: `${dest}${file}` });
        } catch (e) {
          console.warn(`[Bootstrap] Failed to restore asset ${file}:`, e);
        }
      }
    }

    await FileSystem.deleteAsync(tempDir, { idempotent: true });

    // Re-init DB with migrations + column verification
    await initDatabase();
    showToast(`Restored your progress from ${source}`, 'success', undefined, 5000);
    return true;
  } catch (e) {
    console.error(`[Bootstrap] Failed to restore from ${source}:`, e);
    return false;
  }
}

/**
 * Resolves the initial navigation route from DB (async). Keeps the UI thread responsive.
 */
export async function resolveInitialRoute(): Promise<InitialRoute> {
  const todayLog = await dailyLogRepository.getDailyLog();
  if (todayLog?.checkedIn) return 'Tabs';
  return 'CheckIn';
}

async function runOptionalStartupStep(
  label: string,
  fn: () => Promise<void> | void,
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (isSkippableOptionalStartupError(e)) {
      console.warn(`[AppBootstrap] Skipping ${label}:`, e);
      return;
    }
    throw e;
  }
}

/**
 * Runs all cold-start initialization steps. Call once at app launch.
 * Shows splash screen until complete; caller must hide splash on error path.
 */
export async function runAppBootstrap(): Promise<BootstrapOutcome> {
  try {
    reportStartupHealth('bootstrap_started');
    await SplashScreen.preventAutoHideAsync();

    // Configure Google Sign-In early (non-blocking, no-op if client ID not set)
    if (GOOGLE_WEB_CLIENT_ID) {
      await runOptionalStartupStep('Google Sign-In configuration', () => {
        configureGoogleSignIn(GOOGLE_WEB_CLIENT_ID);
      });
    }

    await initDatabase();
    await runOptionalStartupStep('backup restore check', async () => {
      await checkAndRestoreFromPublicBackup();
    });
    await runOptionalStartupStep('local LLM RAM guard', async () => {
      await enforceLocalLlmRamGuard();
    });
    await runOptionalStartupStep('offline queue processor registration', async () => {
      registerOfflineQueueProcessors();
    });
    // Await queue processing before confidence decay — both use the same DB
    // connection and concurrent transactions cause "cannot start transaction
    // within transaction" crashes.
    await runOptionalStartupStep('offline queue processing', async () => {
      await processQueue();
    }).catch((e) => console.warn('[OfflineQueue] bootstrap processing failed:', e));
    await registerBackgroundFetch().catch((e: unknown) => {
      if (__DEV__) console.warn('[AppBootstrap] Background task not registered:', e);
    });

    try {
      const { decayed } = await profileRepository.applyConfidenceDecay();
      if (decayed > 0 && __DEV__) console.log(`[ConfidenceDecay] ${decayed} topics decayed`);
    } catch (e) {
      console.warn('[ConfidenceDecay] Error:', e);
    }

    // Dispatch maintenance tasks without awaiting to keep startup snappy.
    void (async () => {
      await runOptionalStartupStep('orphan cleanup', async () => {
        const db = getDb();
        await db.runAsync(
          `UPDATE external_app_logs SET transcription_status = 'dismissed'
           WHERE transcription_status IN ('pending', 'failed', 'recording', 'transcribing')
              OR (transcription_status = 'completed' AND lecture_note_id IS NULL)`,
        );
      }).catch((e) => console.warn('[AppBootstrap] Orphan cleanup failed:', e));
    })();

    // Heavy background tasks: only on devices with >= 3 GB RAM
    if (isBackgroundRecoveryAllowed()) {
      startMissingTopicEmbeddingSeed(); // Non-blocking async queue
      void bootstrapLocalModels().catch((e: unknown) =>
        console.warn('[AppBootstrap] Local model bootstrap skipped:', e),
      );
      // Warm up Gemini Nano (AICore) on supported devices — no model file needed
      void (async () => {
        try {
          const { ensureNanoReady } = await import('./ai/llmRouting');
          const result = await ensureNanoReady();
          if (result.status === 'AVAILABLE') {
            console.log('[AppBootstrap] Gemini Nano warmed up');
          } else if (__DEV__) {
            console.log(`[AppBootstrap] Gemini Nano status: ${result.status}`);
          }
        } catch {
          // Not available on this device — fine
        }
      })();
      void cleanupStaleCheckpointDirs().catch((e: unknown) =>
        console.warn('[AppBootstrap] Checkpoint cleanup failed:', e),
      );

      // Lecture maintenance tasks based on user settings
      void (async () => {
        try {
          const profile = await profileRepository.getProfile();
          if (profile.autoRepairLegacyNotesEnabled) {
            console.log('[AppBootstrap] Running auto-repair legacy notes...');
            const repaired = await autoRepairLegacyNotes();
            console.log(`[AppBootstrap] Auto-repaired ${repaired} legacy notes`);
          }
          if (profile.scanOrphanedTranscriptsEnabled) {
            console.log('[AppBootstrap] Scanning for orphaned transcripts...');
            const recovered = await scanAndRecoverOrphanedTranscripts();
            console.log(`[AppBootstrap] Recovered ${recovered} orphaned transcripts`);
          }
        } catch (e) {
          console.warn('[AppBootstrap] Lecture maintenance failed:', e);
        }
      })();
    } else if (__DEV__) {
      console.log('[AppBootstrap] Skipping heavy background tasks — low RAM device.');
    }

    reportStartupHealth('bootstrap_succeeded');
    return { success: true };
  } catch (e) {
    console.error('App initialization failed:', e);
    reportStartupHealth(
      'bootstrap_failed',
      e instanceof Error ? e.message : 'Application initialization failed',
    );
    return {
      success: false,
      message: e instanceof Error ? e.message : 'Application initialization failed',
    };
  } finally {
    await SplashScreen.hideAsync();
  }
}
