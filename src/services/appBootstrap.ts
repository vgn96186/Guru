/**
 * App bootstrap service — handles cold-start initialization:
 * DB, offline queue, background fetch, confidence decay, local model download.
 * Replaces the former scripts/ patching approach with a single orchestration point.
 */
import * as SplashScreen from 'expo-splash-screen';
import * as FileSystem from 'expo-file-system/legacy';
import { initDatabase, getDb, resetDbSingleton } from '../db/database';
import { registerBackgroundFetch } from './backgroundTasks';
import { bootstrapLocalModels } from './localModelBootstrap';
import { profileRepository, dailyLogRepository } from '../db/repositories';
import { registerOfflineQueueProcessors } from './offlineQueueBootstrap';
import { processQueue } from './offlineQueue';
import { enforceLocalLlmRamGuard } from './deviceMemory';
import { stripFileUri } from './fileUri';
import { cleanupStaleCheckpointDirs } from './lecture/transcription';
import { listPublicBackups, copyFileFromPublicBackup } from '../../modules/app-launcher';
import { showToast } from '../components/Toast';

export interface BootstrapResult {
  success: true;
}

export interface BootstrapError {
  success: false;
  message: string;
}

export type BootstrapOutcome = BootstrapResult | BootstrapError;

export type InitialRoute = 'Tabs' | 'CheckIn';

async function checkAndRestoreFromPublicBackup(): Promise<boolean> {
  const db = getDb();
  const count = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM lecture_notes');
  if (count && count.c > 0) return false; // Already has data

  const backups = await listPublicBackups();
  if (!backups.includes('guru_latest.db')) return false;

  // Close current DB
  db.closeSync();
  resetDbSingleton();

  // Copy backup over current DB
  const dbPath = FileSystem.documentDirectory + 'SQLite/neet_study.db';
  await copyFileFromPublicBackup('guru_latest.db', stripFileUri(dbPath));

  // Re-init and run migrations
  await initDatabase();
  showToast('Restored your lecture notes from backup', 'success', undefined, 5000);
  return true;
}

/**
 * Resolves the initial navigation route from DB (async). Keeps the UI thread responsive.
 */
export async function resolveInitialRoute(): Promise<InitialRoute> {
  const [todayLog, profile] = await Promise.all([
    dailyLogRepository.getDailyLog(),
    profileRepository.getProfile(),
  ]);
  if (todayLog?.checkedIn) return 'Tabs';
  if ((profile?.quickStartStreak ?? 0) >= 3) return 'Tabs';
  return 'CheckIn';
}

/**
 * Runs all cold-start initialization steps. Call once at app launch.
 * Shows splash screen until complete; caller must hide splash on error path.
 */
export async function runAppBootstrap(): Promise<BootstrapOutcome> {
  try {
    await SplashScreen.preventAutoHideAsync();
    await initDatabase();
    await checkAndRestoreFromPublicBackup();
    await enforceLocalLlmRamGuard();
    registerOfflineQueueProcessors();
    // Await queue processing before confidence decay — both use the same DB
    // connection and concurrent transactions cause "cannot start transaction
    // within transaction" crashes.
    await processQueue().catch((e) =>
      console.warn('[OfflineQueue] bootstrap processing failed:', e),
    );
    await registerBackgroundFetch().catch((e: unknown) => {
      if (__DEV__) console.warn('[AppBootstrap] Background task not registered:', e);
    });

    try {
      const { decayed } = await profileRepository.applyConfidenceDecay();
      if (decayed > 0 && __DEV__) console.log(`[ConfidenceDecay] ${decayed} topics decayed`);
    } catch (e) {
      console.warn('[ConfidenceDecay] Error:', e);
    }

    bootstrapLocalModels().catch((e: unknown) =>
      console.warn('[AppBootstrap] Local model bootstrap skipped:', e),
    );
    cleanupStaleCheckpointDirs().catch((e: unknown) =>
      console.warn('[AppBootstrap] Checkpoint cleanup failed:', e),
    );

    return { success: true };
  } catch (e) {
    console.error('App initialization failed:', e);
    return {
      success: false,
      message: e instanceof Error ? e.message : 'Application initialization failed',
    };
  } finally {
    await SplashScreen.hideAsync();
  }
}
