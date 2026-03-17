import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Text, StyleSheet, BackHandler, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { theme } from '../constants/theme';
import * as Haptics from 'expo-haptics';
import { connectToRoom } from '../services/deviceSyncService';
import { scheduleBreakEndAlarms, cancelAllNotifications } from '../services/notificationService';
import { useAppStore } from '../store/useAppStore';
import { ResponsiveContainer } from '../hooks/useResponsive';

export default function BreakEnforcerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'BreakEnforcer'>>();
  const [timeLeft, setTimeLeft] = useState(route.params.durationSeconds ?? 300);
  const profile = useAppStore((s) => s.profile);
  const [isOver, setIsOver] = useState(false);
  const vibIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const triggerMeltdown = useCallback(() => {
    setIsOver(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    vibIntervalRef.current = setInterval(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }, 2000);
  }, []);

  const handleReturnToLecture = useCallback(() => {
    cancelAllNotifications();
    navigation.navigate('Tabs');
  }, [navigation]);

  useEffect(() => {
    // 1. Arm the push notifications in case they background the app
    scheduleBreakEndAlarms(timeLeft);

    // 2. Block back button
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => true);

    // 3. Listen for Tablet resuming lecture
    let unsubscribeSync = () => {};
    if (profile?.syncCode) {
      unsubscribeSync = connectToRoom(profile.syncCode, (msg) => {
        if (msg.type === 'LECTURE_RESUMED') {
          handleReturnToLecture();
        }
      });
    }

    // 4. Local Countdown
    const timer = setInterval(() => {
      setTimeLeft((prev: number) => {
        if (prev <= 1) {
          clearInterval(timer);
          triggerMeltdown();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      backHandler.remove();
      clearInterval(timer);
      unsubscribeSync();
      if (vibIntervalRef.current) clearInterval(vibIntervalRef.current);
    };
  }, [profile?.syncCode, handleReturnToLecture, triggerMeltdown, timeLeft]);

  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    if (isOver) {
      // Show fallback manual resume button after 3 minutes of meltdown
      const fallbackTimer = setTimeout(() => setShowFallback(true), 180000);
      return () => clearTimeout(fallbackTimer);
    }
  }, [isOver]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;

  if (isOver) {
    return (
      <SafeAreaView style={styles.safeError}>
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.error} />
        <ResponsiveContainer style={styles.container}>
          <Text style={styles.emoji}>🚨</Text>
          <Text style={styles.titleError}>YOUR BREAK IS OVER</Text>
          <Text style={styles.subError}>
            Drop this phone. Walk back to your tablet. Press "Resume Now".
          </Text>
          <Text style={styles.warning}>
            I will keep sending you push notifications every 15 seconds until the tablet signals
            that you are watching the lecture.
          </Text>

          {showFallback && (
            <TouchableOpacity style={styles.fallbackBtn} onPress={handleReturnToLecture}>
              <Text style={styles.fallbackBtnText}>Tablet isn't syncing? Resume Manually.</Text>
            </TouchableOpacity>
          )}
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ResponsiveContainer style={styles.container}>
        <Text style={styles.emoji}>☕</Text>
        <Text style={styles.title}>Break Mode Active</Text>
        <Text style={styles.sub}>
          You are free to close this app and use Instagram. However, when this timer hits zero, I
          will aggressively hijack your notifications until you resume the lecture on your tablet.
        </Text>

        <Text style={styles.timer}>
          {mins}:{secs.toString().padStart(2, '0')}
        </Text>

        <Text style={styles.footerText}>Waiting for Tablet signal...</Text>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  safeError: { flex: 1, backgroundColor: '#FF0000' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emoji: { fontSize: 80, marginBottom: 24 },
  title: {
    color: '#4CAF50',
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 12,
    textAlign: 'center',
  },
  titleError: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '900',
    marginBottom: 24,
    textAlign: 'center',
  },
  sub: { color: '#9E9E9E', fontSize: 16, textAlign: 'center', marginBottom: 48, lineHeight: 24 },
  subError: {
    color: '#fff',
    fontSize: 24,
    textAlign: 'center',
    fontWeight: '800',
    marginBottom: 48,
    lineHeight: 32,
  },
  warning: {
    color: '#FFCDD2',
    fontSize: 16,
    textAlign: 'center',
    fontStyle: 'italic',
    fontWeight: '600',
  },
  timer: {
    color: '#fff',
    fontSize: 80,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    marginBottom: 24,
  },
  footerText: { color: '#666', fontSize: 14, fontStyle: 'italic', marginTop: 32 },
  fallbackBtn: {
    marginTop: 40,
    padding: 16,
    backgroundColor: '#990000',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  fallbackBtnText: { color: '#FFCDD2', fontSize: 14, fontWeight: '700' },
});
