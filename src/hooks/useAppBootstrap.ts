import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAppStore } from '../store/useAppStore';
import { syncExamDatesFromInternet } from '../services/examDateSyncService';
import { refreshAccountabilityNotifications } from '../services/notificationService';
import { navigationRef } from '../navigation/navigationRef';
import { dailyLogRepository, profileRepository } from '../db/repositories';
import { retryFailedTasks } from '../services/lectureSessionMonitor';
import { invalidatePlanCache } from '../services/studyPlanner';

/**
 * Master initialization hook. 
 * Orchestrates all startup side-effects in a single, predictable flow.
 */
export function useAppBootstrap(): void {
  const loadProfile = useAppStore((s) => s.loadProfile);
  const refreshProfile = useAppStore((s) => s.refreshProfile);
  const setDailyAvailability = useAppStore((s) => s.setDailyAvailability);
  const initialized = useRef(false);

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
        await profileRepository.updateProfile({ quickStartStreak: (profile?.quickStartStreak ?? 0) + 1 });
        invalidatePlanCache();
        await refreshProfile();
      }

      // 3. Sync and Maintenance
      syncExamDatesFromInternet().then(res => { if (res.updated) refreshProfile(); }).catch(() => {});
      refreshAccountabilityNotifications().catch(() => {});
      
      // 4. Recovery
      if (profile?.groqApiKey) {
        retryFailedTasks(profile.groqApiKey).catch(() => {});
      }
    };

    bootstrap();

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.screen === 'WakeUp' && navigationRef.isReady()) {
        navigationRef.navigate('WakeUp');
      }
    });

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshProfile();
        refreshAccountabilityNotifications().catch(() => {});
      }
    });

    return () => {
      sub.remove();
      appStateSub.remove();
    };
  }, []);
}
