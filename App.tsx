import React, { useEffect, useState, useRef } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { AppState, AppStateStatus } from 'react-native';
import { initDatabase } from './src/db/database';
import RootNavigator from './src/navigation/RootNavigator';
import linking from './src/navigation/linking';
import { useAppStore } from './src/store/useAppStore';
import LoadingOrb from './src/components/LoadingOrb';
import { getIncompleteExternalSession, finishExternalAppSession } from './src/db/queries/externalLogs';
import { addXp, getUserProfile } from './src/db/queries/progress';
import { stopRecording, hideOverlay } from './modules/app-launcher';
import LectureReturnSheet from './src/components/LectureReturnSheet';

interface ReturnSession {
  appName: string;
  durationMinutes: number;
  recordingPath: string | null;
}

function AppContent() {
  const loadProfile = useAppStore(s => s.loadProfile);
  const [returnSession, setReturnSession] = useState<ReturnSession | null>(null);

  useEffect(() => {
    loadProfile();

    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // Hide the floating timer bubble immediately
        try { await hideOverlay(); } catch (_) {}

        const session = getIncompleteExternalSession();
        if (!session) return;

        const now = Date.now();
        const durationMins = Math.floor((now - session.launchedAt) / 60000);

        // Stop the background recorder and get the final file path
        let recordingPath = session.recordingPath ?? null;
        try {
          const stoppedPath = await stopRecording();
          if (stoppedPath) recordingPath = stoppedPath;
        } catch (e) {
          console.warn('[App] stopRecording error:', e);
        }

        if (durationMins > 0) {
          finishExternalAppSession(session.id!, durationMins);
          addXp(durationMins * 5); // Base time XP (5/min)
          loadProfile();
          console.log(`[App] Logged ${durationMins}min in ${session.appName}, recording: ${recordingPath}`);

          // Show return sheet if session was meaningful (>1 min)
          if (durationMins >= 1) {
            setReturnSession({ appName: session.appName, durationMinutes: durationMins, recordingPath });
          }
        } else {
          finishExternalAppSession(session.id!, 0, 'Cancelled - duration too short');
          // Still try to stop recording
          try { await stopRecording(); } catch (_) {}
        }
      }
    });

    return () => { subscription.remove(); };
  }, []);

  // Get profile for transcription config
  const profile = (() => { try { return getUserProfile(); } catch { return null; } })();

  return (
    <NavigationContainer linking={linking}>
      <RootNavigator />
      {returnSession && profile && (
        <LectureReturnSheet
          visible={!!returnSession}
          appName={returnSession.appName}
          durationMinutes={returnSession.durationMinutes}
          recordingPath={returnSession.recordingPath}
          geminiKey={profile.openrouterApiKey.split('|')[0]}
          openaiKey={profile.openaiKey}
          transcriptionEngine={profile.transcriptionEngine}
          onDone={() => { setReturnSession(null); loadProfile(); }}
        />
      )}
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
        // Load profile BEFORE AppContent mounts so hasCheckedInToday is correct
        // when RootNavigator evaluates its initialRouteName. Without this, the
        // Zustand store starts with hasCheckedInToday=false (stale on hot-reloads)
        // and the navigator can skip CheckIn incorrectly.
        useAppStore.getState().loadProfile();
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

  return <AppContent />;
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
