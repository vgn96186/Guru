import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Vibration,
  Animated,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '../store/useAppStore';
import { dailyLogRepository } from '../db/repositories';
import { theme } from '../constants/theme';
import { ResponsiveContainer } from '../hooks/useResponsive';

const HARASSMENT_INTERVAL = 5 * 60 * 1000; // Every 5 minutes
const GUILT_CHECK_INTERVAL = 60 * 1000; // Check every minute

export default function PunishmentMode() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { profile } = useAppStore();
  const [isActive, setIsActive] = useState(true);
  const [minutesIdle, setMinutesIdle] = useState(0);
  const [shameLevel, setShameLevel] = useState(0);
  const [lastStudyTime, setLastStudyTime] = useState(0);
  const [showGuiltScreen, setShowGuiltScreen] = useState(true);
  const [reducedIntensity, setReducedIntensity] = useState(false);
  const [hasVibrated, setHasVibrated] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Initialize idle tracking
  useEffect(() => {
    dailyLogRepository.getDailyLog().then((dailyLog) => {
      const todayMinutes = dailyLog?.totalMinutes ?? 0;
      const goalMinutes = profile?.dailyGoalMinutes ?? 120;

      // Assume idle since start of day if no activity
      setMinutesIdle(
        Math.max(
          0,
          todayMinutes > 0
            ? 0
            : Math.floor((new Date().getHours() * 60 + new Date().getMinutes()) / 2),
        ),
      );
      setLastStudyTime(todayMinutes);

      // Calculate shame level based on goal progress
      const progress = todayMinutes / goalMinutes;
      if (progress < 0.1)
        setShameLevel(3); // < 10% = maximum shame
      else if (progress < 0.5)
        setShameLevel(2); // < 50% = high shame
      else if (progress < 0.8)
        setShameLevel(1); // < 80% = mild shame
      else setShameLevel(0); // Good progress
    });
  }, []);

  // Harassment mode - periodic vibrations
  useEffect(() => {
    if (!isActive || shameLevel === 0) return;

    const harassmentTimer = setInterval(
      () => {
        // Intense vibration pattern based on shame level
        const fullPatterns = [
          [0, 500, 200, 500], // Level 1
          [0, 1000, 300, 1000, 300, 1000], // Level 2
          [0, 1500, 500, 1500, 500, 1500, 500, 1500], // Level 3
        ];
        const reducedPatterns = [
          [0, 200], // Level 1
          [0, 300, 100, 300], // Level 2
          [0, 500, 200, 500], // Level 3
        ];

        const patterns = reducedIntensity ? reducedPatterns : fullPatterns;
        const pattern = patterns[Math.min(shameLevel - 1, patterns.length - 1)];
        Vibration.vibrate(pattern);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        setHasVibrated(true);
        // Show guilt screen again
        setShowGuiltScreen(true);
      },
      HARASSMENT_INTERVAL / Math.max(1, shameLevel),
    ); // More frequent for higher shame

    return () => clearInterval(harassmentTimer);
  }, [isActive, shameLevel, reducedIntensity]);

  // Idle time tracking
  useEffect(() => {
    if (!isActive) return;

    const idleTimer = setInterval(() => {
      setMinutesIdle((prev) => prev + 1);
    }, GUILT_CHECK_INTERVAL);

    return () => clearInterval(idleTimer);
  }, [isActive]);

  // Animations
  useEffect(() => {
    if (showGuiltScreen) {
      // Pulsing animation
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]),
      );
      pulseLoop.start();

      let shakeLoop: Animated.CompositeAnimation | undefined;
      // Shake for high shame levels
      if (shameLevel >= 2) {
        shakeLoop = Animated.loop(
          Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 5, duration: 100, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -5, duration: 100, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
          ]),
        );
        shakeLoop.start();
      }

      return () => {
        pulseLoop.stop();
        shakeLoop?.stop();
      };
    }
  }, [showGuiltScreen, shameLevel]);

  const shameMessages = [
    null, // Level 0 - no shame
    {
      title: 'Lazy Day?',
      subtitle: "You've studied {minutes}min today. Goal: {goal}min.",
      quote: 'A little effort now saves a lot of panic later.',
      color: theme.colors.warning,
    },
    {
      title: 'GET UP',
      subtitle: '{minutes}min studied. {idle}min idle. Your books are collecting dust.',
      quote: 'Your competitors are studying RIGHT NOW.',
      color: theme.colors.error,
    },
    {
      title: 'PATHETIC',
      subtitle: "Only {minutes}min today. You've been idle for {idle}min.",
      quote: "You promised yourself you'd be a doctor. Prove it.",
      color: theme.colors.error,
    },
  ];

  const currentShame = shameMessages[shameLevel];

  function handleStartStudying() {
    setIsActive(false);
    setShowGuiltScreen(false);
    navigation.navigate('Tabs', {
      screen: 'HomeTab',
      params: {
        screen: 'Session',
        params: { mood: 'stressed', mode: 'sprint', forcedMinutes: 10 },
      },
    });
  }

  function handleQuickWin() {
    setIsActive(false);
    setShowGuiltScreen(false);
    navigation.navigate('Tabs', {
      screen: 'HomeTab',
      params: {
        screen: 'Inertia',
      },
    });
  }

  function handleDisable() {
    Alert.alert('Giving Up?', 'Disable punishment mode and accept your laziness?', [
      { text: "I'll Study", style: 'cancel' },
      {
        text: 'I Accept Defeat',
        style: 'destructive',
        onPress: () => {
          setIsActive(false);
          setShowGuiltScreen(false);
          // Could track "gave up" statistic here
        },
      },
    ]);
  }

  function handleSnooze() {
    setShowGuiltScreen(false);
    // Snooze for 10 minutes
    setTimeout(() => setShowGuiltScreen(true), 10 * 60 * 1000);
  }

  if (!showGuiltScreen || !currentShame) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
        <ResponsiveContainer style={styles.minimizedContainer}>
          <Text style={styles.minimizedText}>😴 Punishment Mode Snoozed</Text>
          <TouchableOpacity style={styles.wakeBtn} onPress={() => setShowGuiltScreen(true)}>
            <Text style={styles.wakeBtnText}>Wake Me Up</Text>
          </TouchableOpacity>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ResponsiveContainer style={{ flex: 1 }}>
        <Animated.View style={[styles.container, { transform: [{ translateX: shakeAnim }] }]}>
          <Animated.View style={[styles.shameIcon, { transform: [{ scale: pulseAnim }] }]}>
            <Text style={styles.shameEmoji}>😤</Text>
          </Animated.View>

          <Text style={[styles.title, { color: currentShame.color }]}>{currentShame.title}</Text>

          <Text style={styles.subtitle}>
            {currentShame.subtitle
              .replace('{minutes}', String(lastStudyTime))
              .replace('{goal}', String(profile?.dailyGoalMinutes ?? 120))
              .replace('{idle}', String(minutesIdle))}
          </Text>

          <View style={styles.guiltBox}>
            <Text style={[styles.quote, { color: currentShame.color }]}>
              "{currentShame.quote}"
            </Text>
          </View>

          <View style={styles.progressContainer}>
            <Text style={styles.progressLabel}>Daily Goal Progress</Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, (lastStudyTime / (profile?.dailyGoalMinutes ?? 120)) * 100)}%`,
                    backgroundColor: currentShame.color,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {lastStudyTime} / {profile?.dailyGoalMinutes ?? 120} min
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.studyBtn, { backgroundColor: currentShame.color }]}
            onPress={handleStartStudying}
          >
            <Text style={styles.studyBtnText}>📚 START STUDYING NOW</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickWinBtn} onPress={handleQuickWin}>
            <Text style={styles.quickWinBtnText}>🎯 Just One Card (Easy)</Text>
          </TouchableOpacity>

          <View style={styles.bottomRow}>
            <TouchableOpacity style={styles.snoozeBtn} onPress={handleSnooze}>
              <Text style={styles.snoozeBtnText}>😴 Snooze 10min</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.disableBtn} onPress={handleDisable}>
              <Text style={styles.disableBtnText}>❌ Give Up</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerText}>
            Punishment Level {shameLevel}/3 • Idle: {minutesIdle}min
          </Text>

          {hasVibrated && !reducedIntensity && (
            <TouchableOpacity
              style={styles.reduceIntensityBtn}
              onPress={() => setReducedIntensity(true)}
            >
              <Text style={styles.reduceIntensityText}>{'🔇 Reduce vibration'}</Text>
            </TouchableOpacity>
          )}
          {reducedIntensity && (
            <Text style={styles.reduceIntensityText}>{'🔇 Vibration reduced'}</Text>
          )}
        </Animated.View>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xxl,
  },

  shameIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.errorSurface,
    borderWidth: 3,
    borderColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  shameEmoji: { fontSize: 48 },

  title: { fontSize: 36, fontWeight: '900', marginBottom: 16, textAlign: 'center' },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: theme.spacing.xl,
  },

  guiltBox: {
    backgroundColor: theme.colors.surface,
    padding: 20,
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.error,
    marginBottom: theme.spacing.xxl,
    maxWidth: '100%',
  },
  quote: { fontSize: 18, fontStyle: 'italic', textAlign: 'center', lineHeight: 26 },

  progressContainer: { width: '100%', marginBottom: theme.spacing.xxl },
  progressLabel: { color: theme.colors.textMuted, fontSize: 12, marginBottom: 8 },
  progressBar: {
    height: 12,
    backgroundColor: theme.colors.border,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: { height: '100%' },
  progressText: { color: theme.colors.textSecondary, fontSize: 14, textAlign: 'center' },

  studyBtn: {
    width: '100%',
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  studyBtnText: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: '800' },

  quickWinBtn: {
    backgroundColor: theme.colors.card,
    width: '100%',
    paddingVertical: theme.spacing.lg,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primaryTintMedium,
    marginBottom: theme.spacing.xl,
  },
  quickWinBtnText: { color: theme.colors.primary, fontSize: 16, fontWeight: '700' },

  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: theme.spacing.xxl,
  },
  snoozeBtn: { padding: theme.spacing.lg },
  snoozeBtnText: { color: theme.colors.textMuted, fontSize: 14 },
  disableBtn: { padding: theme.spacing.lg },
  disableBtnText: { color: theme.colors.error, fontSize: 14 },

  footerText: { color: theme.colors.borderLight, fontSize: 12 },
  reduceIntensityBtn: { marginTop: 12, padding: 8 },
  reduceIntensityText: { color: theme.colors.textMuted, fontSize: 13, marginTop: 4 },

  // Minimized view
  minimizedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xxl,
  },
  minimizedText: { color: theme.colors.textMuted, fontSize: 16, marginBottom: 20 },
  wakeBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.xxl,
    paddingVertical: theme.spacing.lg,
    borderRadius: 12,
  },
  wakeBtnText: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: '700' },
});
