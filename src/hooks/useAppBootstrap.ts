import { useEffect, useRef } from 'react';
import { Alert, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRefreshProfile, PROFILE_QUERY_KEY } from './queries/useProfile';
import { useQueryClient } from '@tanstack/react-query';
import { syncExamDatesIfStale } from '../services/examDateSyncService';
import { refreshAccountabilityNotificationsSafely } from '../services/notificationService';
import { navigationRef } from '../navigation/navigationRef';
import { profileRepository } from '../db/repositories';
import { BUNDLED_GROQ_KEY, BUNDLED_HF_TOKEN, BUNDLED_OPENROUTER_KEY } from '../config/appConfig';
import { maybePromptOverlayPermissionOnStartup } from '../services/appLauncher/overlayStartupPrompt';
import { maybeHandleStorageAccessOnStartup } from '../services/appLauncher/storageStartupPrompt';
import { useAppStateTransition } from './useAppStateTransition';
import { requestNotifications } from '../services/appPermissions';
import { warmAiContentCache } from '../services/backgroundTasks';
import { tryCompleteGitLabDuoOAuth } from '../services/ai/gitlab';
import { validateAiProvidersOnBoot } from '../services/ai/bootProviderValidation';
import { shouldRunAutoBackup, runAutoBackup } from '../services/unifiedBackupService';
import { reportStartupHealth } from '../services/startupHealth';
import { maybePromptSamsungBattery } from '../services/samsungBatteryPrompt';
import * as samsungPerf from '../services/samsungPerf';
import '../services/fgsBlockedListener';

/**
 * Master initialization hook.
 * Orchestrates all startup side-effects in a single, predictable flow.
 */
export function useAppBootstrap(onFatalError?: (message: string) => void): void {
  const refreshProfile = useRefreshProfile();
  const queryClient = useQueryClient();
  const initialized = useRef(false);
  const backupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warmCacheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const validateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      void tryCompleteGitLabDuoOAuth(url).then((handled) => {
        if (handled) void refreshProfile();
      });
    };
    void Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', (e) => handleUrl(e.url));
    return () => sub.remove();
  }, [refreshProfile]);

  useAppStateTransition({
    onActive: () => {
      refreshProfile();
      void maybeHandleStorageAccessOnStartup().catch((e) =>
        console.warn('[Storage] Startup access check failed on foreground:', e),
      );
      syncExamDatesIfStale(24)
        .then((res) => {
          if (res?.updated) refreshProfile();
        })
        .catch((e) => console.error('[Sync] Exam date sync failed on foreground:', e));
      void refreshAccountabilityNotificationsSafely((e) =>
        console.error('[Notifications] Refresh failed on foreground:', e),
      );

      // Check for newer GDrive backup from another device
      void checkForNewerGDriveBackup(queryClient).catch((e) =>
        console.warn('[GDrive] Foreground sync check failed:', e),
      );
    },
  });

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const bootstrap = async () => {
      // 1. Seed bundled API keys into the profile on first run.
      //    This makes bundled defaults persist across Expo + bare RN builds without copy/paste.
      const bundledGroq = BUNDLED_GROQ_KEY.trim();
      const bundledHf = BUNDLED_HF_TOKEN.trim();
      const bundledOr = BUNDLED_OPENROUTER_KEY.trim();
      const currentProfile = await profileRepository.getProfile();
      const needsGroq = !!bundledGroq && !currentProfile?.groqApiKey;
      const needsHf = !!bundledHf && !currentProfile?.huggingFaceToken;
      const needsOr = !!bundledOr && !currentProfile?.openrouterKey;
      const autoBackupFrequency = currentProfile?.autoBackupFrequency;
      // Also default auto-backup to daily on first run
      const needsAutoBackup =
        !autoBackupFrequency || (autoBackupFrequency === 'off' && currentProfile?.totalXp === 0);
      if (needsGroq || needsHf || needsOr || needsAutoBackup) {
        await profileRepository.updateProfile({
          ...(needsGroq ? { groqApiKey: bundledGroq } : {}),
          ...(needsHf ? { huggingFaceToken: bundledHf } : {}),
          ...(needsOr ? { openrouterKey: bundledOr } : {}),
          ...(needsAutoBackup ? { autoBackupFrequency: 'daily' } : {}),
        });
        await refreshProfile();
      }

      await maybePromptOverlayPermissionOnStartup().catch((e) =>
        console.warn('[Overlay] Startup permission prompt failed:', e),
      );
      await maybeHandleStorageAccessOnStartup().catch((e) =>
        console.warn('[Storage] Startup access check failed:', e),
      );

      await requestNotifications().catch((e) =>
        console.warn('[Notifications] Startup permission request failed:', e),
      );

      // 3. Sync and Maintenance
      syncExamDatesIfStale(24)
        .then((res) => {
          if (res?.updated) refreshProfile();
        })
        .catch((e) => console.error('[Sync] Exam date sync failed:', e));
      void refreshAccountabilityNotificationsSafely((e) =>
        console.error('[Notifications] Refresh failed:', e),
      );

      maybePromptSamsungBattery(() => {
        if (navigationRef.isReady()) {
          navigationRef.navigate('SamsungBatterySheet');
        }
      }).catch((e) => console.warn('[SamsungPrompt] failed:', e));

      try {
        const ok = await samsungPerf.init();
        if (ok) {
          // Hold a brief CPU boost during cold boot (service init, profile load,
          // DB warmup). SDK auto-releases after WORKLOAD_PRESET.app_boot duration.
          void samsungPerf.acquire('app_boot').then(() => samsungPerf.release('app_boot'));
        }
      } catch (e) {
        console.warn('[samsungPerf] init failed', e);
      }

      // 4. Auto-backup check (deferred, non-blocking)
      backupTimerRef.current = setTimeout(() => {
        shouldRunAutoBackup()
          .then((shouldRun) => {
            if (shouldRun) {
              console.log('[AutoBackup] Running scheduled auto-backup...');
              return runAutoBackup();
            }
            return false;
          })
          .then((didRun) => {
            if (didRun) console.log('[AutoBackup] Auto-backup completed successfully.');
          })
          .catch((e) => console.warn('[AutoBackup] Auto-backup failed:', e));
      }, 6000);

      // 5. Deferred Recovery (10s delay to stay out of critical path)
      warmCacheTimerRef.current = setTimeout(() => {
        warmAiContentCache({ topicLimit: 2, refreshNotifications: false }).catch((e) =>
          console.warn('[AIWarmup] Startup prefetch failed:', e),
        );
      }, 4000);

      // 6. Background provider validation (non-blocking)
      validateTimerRef.current = setTimeout(() => {
        validateAiProvidersOnBoot().catch((e) =>
          console.warn('[AI_BOOT] Provider validation failed:', e instanceof Error ? e.message : e),
        );
      }, 2500);
      // Auto-retry disabled — users process recordings manually via Recording Vault.
      // if (profileForRecovery?.groqApiKey) {
      //   setTimeout(() => {
      //     retryFailedTasks(profileForRecovery.groqApiKey).catch((e) =>
      //       console.error('[Recovery] Transcription retry failed:', e),
      //     );
      //   }, 10000);
      // }
    };

    void bootstrap().catch((e) => {
      console.error('[AppBootstrap] Fatal startup error stack:', e instanceof Error ? e.stack : e);
      console.error('[AppBootstrap] Fatal startup error:', e);
      reportStartupHealth('runtime_error', e instanceof Error ? e.message : 'App startup failed');
      initialized.current = false; // Allow retry on next mount
      onFatalError?.(e instanceof Error ? e.message : 'App startup failed');
    });

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.screen === 'WakeUp' && navigationRef.isReady()) {
        navigationRef.navigate('WakeUp');
      }
    });

    return () => {
      sub.remove();
      if (backupTimerRef.current) clearTimeout(backupTimerRef.current);
      if (warmCacheTimerRef.current) clearTimeout(warmCacheTimerRef.current);
      if (validateTimerRef.current) clearTimeout(validateTimerRef.current);
    };
  }, [onFatalError, refreshProfile]);
}

/**
 * Check GDrive for a newer backup from a different device.
 * Shows a prompt if found — user taps "Restore" or "Skip".
 */
async function checkForNewerGDriveBackup(queryClient: any): Promise<void> {
  try {
    const { isGDriveConnected, listGDriveBackups, downloadBackupFromGDrive } =
      await import('../services/gdriveBackupService');
    if (!(await isGDriveConnected())) return;

    const profile = await profileRepository.getProfile();
    const localLastBackup = profile.lastAutoBackupAt ?? null;

    const remoteBackups = await listGDriveBackups();
    if (remoteBackups.length === 0) return;

    // Find newest backup from a different device
    const deviceName =
      require('react-native').Platform.OS === 'android' ? 'Android Device' : 'iOS Device';
    const newerRemote = remoteBackups.find((b) => {
      if (b.deviceName === deviceName && b.deviceId === profile.lastBackupDeviceId) {
        return false; // Same device
      }
      if (!localLastBackup) return true; // No local backup — any remote is newer
      return new Date(b.exportedAt).getTime() > new Date(localLastBackup).getTime();
    });

    if (!newerRemote) return;

    const timeDiff = Date.now() - new Date(newerRemote.exportedAt).getTime();
    const timeAgo = formatTimeAgo(timeDiff);

    Alert.alert(
      'Newer progress found',
      `Your ${newerRemote.deviceName} has newer data (${timeAgo}).\n\nRestore it to this device?`,
      [
        { text: 'Skip', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            try {
              const localPath = await downloadBackupFromGDrive(newerRemote.fileId);
              if (!localPath) {
                Alert.alert('Download failed', 'Could not download the backup from Google Drive.');
                return;
              }
              // Use the existing import flow
              const { importUnifiedBackupFromPath } =
                await import('../services/unifiedBackupService');
              const result = await importUnifiedBackupFromPath(localPath);
              if (result.ok) {
                queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
              } else {
                Alert.alert('Restore failed', result.message);
              }
            } catch (e: unknown) {
              Alert.alert('Restore failed', e instanceof Error ? e.message : 'Unknown error');
            }
          },
        },
      ],
    );
  } catch (e) {
    // GDrive not available — silently skip
    console.warn('[GDrive] Sync check unavailable:', e);
  }
}

function formatTimeAgo(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
