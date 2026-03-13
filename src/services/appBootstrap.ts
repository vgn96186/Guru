/**
 * App bootstrap service — handles cold-start initialization:
 * DB, offline queue, background fetch, confidence decay, local model download.
 * Replaces the former scripts/ patching approach with a single orchestration point.
 */
import * as SplashScreen from 'expo-splash-screen';
import { initDatabase } from '../db/database';
import { registerBackgroundFetch } from './backgroundTasks';
import { bootstrapLocalModels } from './localModelBootstrap';
import { profileRepository, dailyLogRepository } from '../db/repositories';
import { registerOfflineQueueProcessors } from './offlineQueueBootstrap';
import { processQueue } from './offlineQueue';
import { enforceLocalLlmRamGuard } from './deviceMemory';
import { retryFailedTasks } from './lectureSessionMonitor';

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
    await enforceLocalLlmRamGuard();
    registerOfflineQueueProcessors();
    processQueue().catch((e) => console.warn('[OfflineQueue] bootstrap processing failed:', e));
    retryFailedTasks().catch((e) => console.warn('[AppBootstrap] Transcription retry failed:', e));
    await registerBackgroundFetch().catch((e: unknown) =>
      console.log('Background task not registered:', e),
    );

    try {
      const { decayed } = await profileRepository.applyConfidenceDecay();
      if (decayed > 0) console.log(`[ConfidenceDecay] ${decayed} topics decayed`);
    } catch (e) {
      console.warn('[ConfidenceDecay] Error:', e);
    }

    bootstrapLocalModels().catch((e: unknown) => console.log('Local model bootstrap skipped:', e));

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
