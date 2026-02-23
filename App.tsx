import React, { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { initDatabase } from './src/db/database';
import RootNavigator from './src/navigation/RootNavigator';
import { useAppStore } from './src/store/useAppStore';
import ErrorBoundary from './src/components/ErrorBoundary';
import LoadingOrb from './src/components/LoadingOrb';
import { registerBackgroundFetch } from './src/services/backgroundTasks';


function AppContent() {
  const loadProfile = useAppStore(s => s.loadProfile);

  useEffect(() => {
    loadProfile();
  }, []);

  return (
    <NavigationContainer>
      <RootNavigator />
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
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Startup Error</Text>
        <Text style={styles.errorText}>{dbError}</Text>
      </View>
    );
  }

  if (!dbReady) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingOrb message="Guru is waking up..." />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
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
