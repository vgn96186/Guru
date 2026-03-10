import React, { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { View, Text, StyleSheet, AppState } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { initDatabase } from './src/db/database';
import RootNavigator from './src/navigation/RootNavigator';
import { useAppStore } from './src/store/useAppStore';
import ErrorBoundary from './src/components/ErrorBoundary';
import LoadingOrb from './src/components/LoadingOrb';
import { ToastContainer } from './src/components/Toast';
import { registerBackgroundFetch } from './src/services/backgroundTasks';
import { bootstrapLocalModels } from './src/services/localModelBootstrap';
import { syncExamDatesFromInternet } from './src/services/examDateSyncService';
import { applyConfidenceDecay } from './src/db/queries/progress';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export const navigationRef = createNavigationContainerRef<any>();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});


function AppContent() {
  const loadProfile = useAppStore(s => s.loadProfile);
  const refreshProfile = useAppStore(s => s.refreshProfile);

  useEffect(() => {
    let isMounted = true;
    loadProfile();

    const runExamDateSync = async () => {
      try {
        const res = await syncExamDatesFromInternet();
        if (res.updated && isMounted) {
          refreshProfile();
        }
      } catch (err) {
        if (__DEV__) {
          console.warn('[ExamDateSync] Background sync failed:', (err as Error).message);
        }
      }
    };

    runExamDateSync();
    
    // Listen for alarm notification taps to route to WakeUp
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data?.screen === 'WakeUp' && navigationRef.isReady()) {
        navigationRef.navigate('WakeUp');
      }
    });

    const appStateSub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        runExamDateSync();
      }
    });
    
    return () => {
      isMounted = false;
      sub.remove();
      appStateSub.remove();
    };
  }, [loadProfile, refreshProfile]);

  return (
    <NavigationContainer ref={navigationRef}>
      <RootNavigator />
      <ToastContainer />
    </NavigationContainer>
  );
}

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    async function initializeApp() {
      try {
        await SplashScreen.preventAutoHideAsync();
        await initDatabase();
        await registerBackgroundFetch().catch((e: unknown) => console.log('Background task not registered:', e));

        // Apply confidence decay for overdue topics
        try {
          const { decayed } = applyConfidenceDecay();
          if (decayed > 0) console.log(`[ConfidenceDecay] ${decayed} topics decayed`);
        } catch (e) { console.warn('[ConfidenceDecay] Error:', e); }

        // Auto-download local AI models in background (non-blocking)
        bootstrapLocalModels().catch((e: unknown) => console.log('Local model bootstrap skipped:', e));

        setDbReady(true);
      } catch (e) {
        console.error('App initialization failed:', e);
        setDbError(e instanceof Error ? e.message : 'Application initialization failed');
      } finally {
        await SplashScreen.hideAsync();
      }
    }
    
    initializeApp();
  }, []);

  if (dbError) {
    return (
      <SafeAreaProvider>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Startup Error</Text>
          <Text style={styles.errorText}>{dbError}</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (!dbReady) {
    return (
      <SafeAreaProvider>
        <View style={styles.loadingContainer}>
          <LoadingOrb message="Guru is waking up..." />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0F0F14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#0F0F14',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorTitle: { color: '#F44336', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  errorText: { color: '#9E9E9E', fontSize: 14, textAlign: 'center' },
});
