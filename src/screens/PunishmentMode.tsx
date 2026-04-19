import React, { useState, useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, StatusBar, Vibration, Animated } from 'react-native';
import { confirmDestructive } from '../components/dialogService';
import LinearText from '../components/primitives/LinearText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import * as Haptics from 'expo-haptics';
import { useProfileQuery } from '../hooks/queries/useProfile';
import { dailyLogRepository } from '../db/repositories';
import { linearTheme as n } from '../theme/linearTheme';
import { motion, useReducedMotion } from '../motion';
import { ResponsiveContainer } from '../hooks/useResponsive';
import LinearButton from '../components/primitives/LinearButton';
import LinearSurface from '../components/primitives/LinearSurface';
import { Ionicons } from '@expo/vector-icons';

const HARASSMENT_INTERVAL = 5 * 60 * 1000; // Every 5 minutes
const GUILT_CHECK_INTERVAL = 60 * 1000; // Check every minute

export default function PunishmentMode() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data: profile } = useProfileQuery();
  const [isActive, setIsActive] = useState(true);
  const [minutesIdle, setMinutesIdle] = useState(0);
  const [urgencyLevel, setUrgencyLevel] = useState(0);
  const [lastStudyTime, setLastStudyTime] = useState(0);
  const [showGuiltScreen, setShowGuiltScreen] = useState(true);
  const [reducedIntensity, setReducedIntensity] = useState(false);
  const [hasVibrated, setHasVibrated] = useState(false);
  const reducedMotion = useReducedMotion();

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const snoozeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vibrationPendingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current);
    };
  }, []);

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

      // Calculate urgency level based on goal progress
      const progress = todayMinutes / goalMinutes;
      if (progress < 0.1)
        setUrgencyLevel(3); // < 10% = highest urgency
      else if (progress < 0.5)
        setUrgencyLevel(2); // < 50% = high urgency
      else if (progress < 0.8)
        setUrgencyLevel(1); // < 80% = mild urgency
      else setUrgencyLevel(0); // Good progress
    });
  }, [profile]);

  // Nudge mode - periodic vibrations
  useEffect(() => {
    if (!isActive || urgencyLevel === 0) return;

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
    const pattern = patterns[Math.min(urgencyLevel - 1, patterns.length - 1)];
    // Sum the pattern durations to know when vibration finishes
    const patternDurationMs = pattern.reduce((sum, ms) => sum + ms, 0);

    const nudgeTimer = setInterval(
      () => {
        // Guard: skip if a previous vibration pattern is still playing
        if (vibrationPendingRef.current) return;

        vibrationPendingRef.current = true;
        Vibration.vibrate(pattern);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        // Clear the guard after the pattern finishes
        setTimeout(() => {
          vibrationPendingRef.current = false;
        }, patternDurationMs);

        setHasVibrated(true);
        // Show nudge screen again
        setShowGuiltScreen(true);
      },
      HARASSMENT_INTERVAL / Math.max(1, urgencyLevel),
    ); // More frequent for higher urgency

    return () => {
      clearInterval(nudgeTimer);
      vibrationPendingRef.current = false;
    };
  }, [isActive, urgencyLevel, reducedIntensity]);

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
      const pulseLoop = motion.pulseScale(pulseAnim, { to: 1.1, duration: 500, reducedMotion });
      pulseLoop.start();

      let shakeLoop: Animated.CompositeAnimation | undefined;
      if (urgencyLevel >= 2) {
        shakeLoop = motion.shake(shakeAnim, { amplitude: 5, reducedMotion });
        shakeLoop.start();
      }

      return () => {
        pulseLoop.stop();
        shakeLoop?.stop();
      };
    }
  }, [showGuiltScreen, urgencyLevel, pulseAnim, shakeAnim, reducedMotion]);

  const accountabilityMessages = [
    null, // Level 0 - no nudge
    {
      title: 'Gentle Nudge',
      subtitle: "You've studied {minutes}min today. Goal: {goal}min.",
      quote: 'A little effort now saves a lot of panic later.',
      color: n.colors.warning,
    },
    {
      title: "Let's Go",
      subtitle: '{minutes}min studied. {idle}min idle. Your books are collecting dust.',
      quote: 'Your competitors are studying RIGHT NOW.',
      color: n.colors.error,
    },
    {
      title: 'Time to Reset',
      subtitle: "Only {minutes}min today. You've been idle for {idle}min.",
      quote: 'You chose this path for a reason. One card at a time.',
      color: n.colors.error,
    },
  ];

  const currentMessage = accountabilityMessages[urgencyLevel];

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

  async function handleDisable() {
    const ok = await confirmDestructive('Reduce Intensity?', 'Switch to a gentler reminder mode?');
    if (ok) {
      setIsActive(false);
      setShowGuiltScreen(false);
    }
  }

  function handleSnooze() {
    setShowGuiltScreen(false);
    // Snooze for 10 minutes
    if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current);
    snoozeTimerRef.current = setTimeout(() => setShowGuiltScreen(true), 10 * 60 * 1000);
  }

  if (!showGuiltScreen || !currentMessage) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer style={styles.minimizedContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Ionicons name="moon-outline" size={20} color={n.colors.textMuted} />
            <LinearText style={styles.minimizedText}>Punishment Mode Snoozed</LinearText>
          </View>
          <TouchableOpacity style={styles.wakeBtn} onPress={() => setShowGuiltScreen(true)}>
            <LinearText style={styles.wakeBtnText}>Wake Me Up</LinearText>
          </TouchableOpacity>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer style={{ flex: 1 }}>
        <Animated.View style={[styles.container, { transform: [{ translateX: shakeAnim }] }]}>
          <Animated.View style={[styles.shameIcon, { transform: [{ scale: pulseAnim }] }]}>
            <LinearText style={styles.shameEmoji}>😤</LinearText>
          </Animated.View>

          <LinearText style={[styles.title, { color: currentMessage.color }]}>
            {currentMessage.title}
          </LinearText>

          <LinearText style={styles.subtitle}>
            {currentMessage.subtitle
              .replace('{minutes}', String(lastStudyTime))
              .replace('{goal}', String(profile?.dailyGoalMinutes ?? 120))
              .replace('{idle}', String(minutesIdle))}
          </LinearText>

          <LinearSurface padded={false} borderColor={currentMessage.color} style={styles.guiltBox}>
            <LinearText style={[styles.quote, { color: currentMessage.color }]}>
              "{currentMessage.quote}"
            </LinearText>
          </LinearSurface>

          <View style={styles.progressContainer}>
            <LinearText style={styles.progressLabel}>Daily Goal Progress</LinearText>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, (lastStudyTime / (profile?.dailyGoalMinutes ?? 120)) * 100)}%`,
                    backgroundColor: currentMessage.color,
                  },
                ]}
              />
            </View>
            <LinearText style={styles.progressText}>
              {lastStudyTime} / {profile?.dailyGoalMinutes ?? 120} min
            </LinearText>
          </View>

          <LinearButton
            variant="secondary"
            style={styles.studyBtn}
            onPress={handleStartStudying}
            label="START STUDYING NOW"
            textStyle={{ color: currentMessage.color }}
            leftIcon={<Ionicons name="book-outline" size={18} color={currentMessage.color} />}
          />

          <LinearButton
            variant="secondary"
            style={styles.quickWinBtn}
            onPress={handleQuickWin}
            label="Just One Card (Easy)"
            leftIcon={<Ionicons name="flag-outline" size={18} color={n.colors.accent} />}
          />

          <View style={styles.bottomRow}>
            <TouchableOpacity style={styles.snoozeBtn} onPress={handleSnooze}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="moon-outline" size={16} color={n.colors.textMuted} />
                <LinearText style={styles.snoozeBtnText}>Snooze 10min</LinearText>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.disableBtn} onPress={handleDisable}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="close-outline" size={16} color={n.colors.error} />
                <LinearText style={styles.disableBtnText}>Reduce Intensity</LinearText>
              </View>
            </TouchableOpacity>
          </View>

          <LinearText style={styles.footerText}>
            Nudge Level {urgencyLevel}/3 • Idle: {minutesIdle}min
          </LinearText>

          {hasVibrated && !reducedIntensity && (
            <TouchableOpacity
              style={styles.reduceIntensityBtn}
              onPress={() => setReducedIntensity(true)}
            >
              <LinearText style={styles.reduceIntensityText}>{'🔇 Reduce vibration'}</LinearText>
            </TouchableOpacity>
          )}
          {reducedIntensity && (
            <LinearText style={styles.reduceIntensityText}>{'🔇 Vibration reduced'}</LinearText>
          )}
        </Animated.View>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: n.spacing.xl,
  },

  shameIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: n.colors.errorSurface,
    borderWidth: 3,
    borderColor: n.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  shameEmoji: { fontSize: 48 },

  title: { fontSize: 36, fontWeight: '900', marginBottom: 16, textAlign: 'center' },
  subtitle: {
    color: n.colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: n.spacing.xl,
  },

  guiltBox: {
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: n.colors.error,
    marginBottom: n.spacing.xl,
    maxWidth: '100%',
  },
  quote: { fontSize: 18, fontStyle: 'italic', textAlign: 'center', lineHeight: 26 },

  progressContainer: { width: '100%', marginBottom: n.spacing.xl },
  progressLabel: { color: n.colors.textMuted, fontSize: 12, marginBottom: 8 },
  progressBar: {
    height: 12,
    backgroundColor: n.colors.border,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: { height: '100%' },
  progressText: { color: n.colors.textSecondary, fontSize: 14, textAlign: 'center' },

  studyBtn: {
    width: '100%',
    minHeight: 64,
    marginBottom: n.spacing.lg,
  },

  quickWinBtn: {
    width: '100%',
    minHeight: 56,
    marginBottom: n.spacing.xl,
  },

  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: n.spacing.xl,
  },
  snoozeBtn: { padding: n.spacing.lg },
  snoozeBtnText: { color: n.colors.textMuted, fontSize: 14 },
  disableBtn: { padding: n.spacing.lg },
  disableBtnText: { color: n.colors.error, fontSize: 14 },

  footerText: { color: n.colors.borderLight, fontSize: 12 },
  reduceIntensityBtn: { marginTop: 12, padding: 8 },
  reduceIntensityText: { color: n.colors.textMuted, fontSize: 13, marginTop: 4 },

  // Minimized view
  minimizedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: n.spacing.xl,
  },
  minimizedText: { color: n.colors.textMuted, fontSize: 16 },
  wakeBtn: {
    backgroundColor: n.colors.accent,
    paddingHorizontal: n.spacing.xl,
    paddingVertical: n.spacing.lg,
    borderRadius: 12,
  },
  wakeBtnText: { color: n.colors.textPrimary, fontSize: 16, fontWeight: '700' },
});
