import React, { useEffect, useRef, useState, useCallback } from 'react';
import { StyleSheet, BackHandler, TouchableOpacity, StatusBar } from 'react-native';
import LinearText from '../components/primitives/LinearText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { linearTheme as n } from '../theme/linearTheme';
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

  // Arm push notifications once on mount with the initial duration
  useEffect(() => {
    scheduleBreakEndAlarms(route.params.durationSeconds ?? 300);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Block back button
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => true);

    // Listen for Tablet resuming lecture
    let unsubscribeSync = () => {};
    if (profile?.syncCode) {
      unsubscribeSync = connectToRoom(profile.syncCode, (msg) => {
        if (msg.type === 'LECTURE_RESUMED') {
          handleReturnToLecture();
        }
      });
    }

    // Local Countdown — uses functional setTimeLeft so timeLeft is not a dep
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
  }, [profile?.syncCode, handleReturnToLecture, triggerMeltdown]);

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
        <StatusBar barStyle="light-content" backgroundColor={n.colors.error} />
        <ResponsiveContainer style={styles.container}>
          <LinearText style={styles.emoji}>🚨</LinearText>
          <LinearText style={styles.titleError}>YOUR BREAK IS OVER</LinearText>
          <LinearText style={styles.subError}>
            Drop this phone. Walk back to your tablet. Press "Resume Now".
          </LinearText>
          <LinearText style={styles.warning}>
            I will keep sending you push notifications every 15 seconds until the tablet signals
            that you are watching the lecture.
          </LinearText>

          {showFallback && (
            <TouchableOpacity style={styles.fallbackBtn} onPress={handleReturnToLecture}>
              <LinearText style={styles.fallbackBtnText}>
                Tablet isn't syncing? Resume Manually.
              </LinearText>
            </TouchableOpacity>
          )}
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer style={styles.container}>
        <LinearText style={styles.emoji}>☕</LinearText>
        <LinearText style={styles.title}>Break Time</LinearText>
        <LinearText style={styles.sub}>
          Relax. When this timer hits zero, you'll get nudged to resume your lecture.
        </LinearText>

        <LinearText style={styles.timer}>
          {mins}:{secs.toString().padStart(2, '0')}
        </LinearText>

        <LinearText style={styles.footerText}>Waiting for Tablet signal...</LinearText>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  safeError: { flex: 1, backgroundColor: n.colors.error },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emoji: { fontSize: 80, marginBottom: 24 },
  title: {
    color: n.colors.success,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 12,
    textAlign: 'center',
  },
  titleError: {
    color: n.colors.textPrimary,
    fontSize: 40,
    fontWeight: '900',
    marginBottom: 24,
    textAlign: 'center',
  },
  sub: {
    color: n.colors.textMuted,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 48,
    lineHeight: 24,
  },
  subError: {
    color: n.colors.textPrimary,
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
    color: n.colors.textPrimary,
    fontSize: 80,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    marginBottom: 24,
  },
  footerText: { color: n.colors.textMuted, fontSize: 14, fontStyle: 'italic', marginTop: 32 },
  manualResumeBtn: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4CAF5066',
  },
  manualResumeBtnText: { color: n.colors.success, fontSize: 15, fontWeight: '700' },
  fallbackBtn: {
    marginTop: 32,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffffff44',
    backgroundColor: '#ffffff11',
  },
  fallbackBtnText: {
    color: n.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
