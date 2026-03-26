import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useAppStore } from '../store/useAppStore';
import { syncExamDatesFromInternet } from '../services/examDateSyncService';
import { refreshAccountabilityNotificationsSafely } from '../services/notificationService';
import { navigationRef } from '../navigation/navigationRef';
import { dailyLogRepository, profileRepository } from '../db/repositories';
import { retryFailedTasks } from '../services/lecture/lectureSessionMonitor';
import { invalidatePlanCache } from '../services/studyPlanner';
import { BUNDLED_GROQ_KEY, BUNDLED_HF_TOKEN, BUNDLED_OPENROUTER_KEY } from '../config/appConfig';
import { maybePromptOverlayPermissionOnStartup } from '../services/appLauncher/overlayStartupPrompt';
import { useAppStateTransition } from './useAppStateTransition';
import { requestNotifications } from '../services/appPermissions';
import { warmAiContentCache } from '../services/backgroundTasks';

/**
 * Master initialization hook.
 * Orchestrates all startup side-effects in a single, predictable flow.
 */
export function useAppBootstrap(): void {
  const loadProfile = useAppStore((s) => s.loadProfile);
  const refreshProfile = useAppStore((s) => s.refreshProfile);
  const setDailyAvailability = useAppStore((s) => s.setDailyAvailability);
  const initialized = useRef(false);

  useAppStateTransition({
    onActive: () => {
      refreshProfile();
      void refreshAccountabilityNotificationsSafely((e) =>
        console.error('[Notifications] Refresh failed on foreground:', e),
      );
    },
  });

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const bootstrap = async () => {
      // 1. Load core state
      await loadProfile();
      const state = useAppStore.getState();
      const profile = state.profile;

      // 2. Auto-skip check-in for repeat Quick Start users
      if (!state.hasCheckedInToday && (profile?.quickStartStreak ?? 0) >= 3) {
        await dailyLogRepository.checkinToday('good');
        setDailyAvailability(30);
        await profileRepository.updateProfile({
          quickStartStreak: (profile?.quickStartStreak ?? 0) + 1,
        });
        invalidatePlanCache();
        await refreshProfile();
      }

      // 3. Seed bundled API keys into the profile on first run.
      //    This makes bundled defaults persist across Expo + bare RN builds without copy/paste.
      const bundledGroq = BUNDLED_GROQ_KEY.trim();
      const bundledHf = BUNDLED_HF_TOKEN.trim();
      const bundledOr = BUNDLED_OPENROUTER_KEY.trim();
      const currentProfile = useAppStore.getState().profile;
      const needsGroq = !!bundledGroq && !currentProfile?.groqApiKey;
      const needsHf = !!bundledHf && !currentProfile?.huggingFaceToken;
      const needsOr = !!bundledOr && !currentProfile?.openrouterKey;
      if (needsGroq || needsHf || needsOr) {
        await profileRepository.updateProfile({
          ...(needsGroq ? { groqApiKey: bundledGroq } : {}),
          ...(needsHf ? { huggingFaceToken: bundledHf } : {}),
          ...(needsOr ? { openrouterKey: bundledOr } : {}),
        });
        await refreshProfile();
      }

      await maybePromptOverlayPermissionOnStartup().catch((e) =>
        console.warn('[Overlay] Startup permission prompt failed:', e),
      );

      await requestNotifications().catch((e) =>
        console.warn('[Notifications] Startup permission request failed:', e),
      );

      // 3. Sync and Maintenance
      syncExamDatesFromInternet()
        .then((res) => {
          if (res.updated) refreshProfile();
        })
        .catch((e) => console.error('[Sync] Exam date sync failed:', e));
      void refreshAccountabilityNotificationsSafely((e) =>
        console.error('[Notifications] Refresh failed:', e),
      );

      // 4. Deferred Recovery (10s delay to stay out of critical path)
      const profileForRecovery = useAppStore.getState().profile;
      setTimeout(() => {
        warmAiContentCache({ topicLimit: 2, refreshNotifications: false }).catch((e) =>
          console.warn('[AIWarmup] Startup prefetch failed:', e),
        );
      }, 4000);
      if (profileForRecovery?.groqApiKey) {
        setTimeout(() => {
          retryFailedTasks(profileForRecovery.groqApiKey).catch((e) =>
            console.error('[Recovery] Transcription retry failed:', e),
          );
        }, 10000);
      }
    };

    bootstrap();

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.screen === 'WakeUp' && navigationRef.isReady()) {
        navigationRef.navigate('WakeUp');
      }
    });

    return () => {
      sub.remove();
    };
  }, []);
}
