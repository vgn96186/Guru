import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Vibration,
  Animated,
  Dimensions,
} from 'react-native';
import LinearText from '../components/primitives/LinearText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { dailyLogRepository } from '../db/repositories';
import * as Haptics from 'expo-haptics';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { useAppStateTransition } from '../hooks/useAppStateTransition';
import { linearTheme as n } from '../theme/linearTheme';
import { confirmDestructive } from '../components/dialogService';

const MAX_OPENS_BEFORE_SHAME = 3;
const DELAY_SECONDS = 30;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function DoomscrollInterceptor() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'DoomscrollInterceptor'>>();
  const [doomscrollAttempts, setDoomscrollAttempts] = useState(0);
  const [isBlocking, setIsBlocking] = useState(false);
  const [blockAppName, setBlockAppName] = useState('');
  const [delayRemaining, setDelayRemaining] = useState(0);
  const [shameLevel, setShameLevel] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);

  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;
  const delayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (delayTimerRef.current) clearInterval(delayTimerRef.current);
    };
  }, []);

  useEffect(() => {
    dailyLogRepository.getDailyLog().then((log) => setSessionCount(log?.sessionCount ?? 0));
  }, []);

  const checkForDoomscrollAttempt = useRef(() => {
    const params = route.params as { appName?: string } | undefined;
    const detectedApp = params?.appName || 'social media';

    setDoomscrollAttempts((prev) => {
      const newCount = prev + 1;

      if (newCount >= MAX_OPENS_BEFORE_SHAME) {
        setIsBlocking(true);
        setBlockAppName(detectedApp);
        setDelayRemaining(DELAY_SECONDS);
        setShameLevel(Math.min(3, Math.floor(newCount / 3)));

        // Heavy vibration for punishment
        Vibration.vibrate([0, 1000, 500, 1000, 500, 1000]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        startDelayTimer();
      }

      return newCount;
    });
  }).current;

  useAppStateTransition({
    onForeground: () => {
      checkForDoomscrollAttempt();
    },
  });

  function startDelayTimer() {
    let remaining = DELAY_SECONDS;
    if (delayTimerRef.current) clearInterval(delayTimerRef.current);
    delayTimerRef.current = setInterval(() => {
      remaining -= 1;
      setDelayRemaining(remaining);

      if (remaining <= 0) {
        if (delayTimerRef.current) clearInterval(delayTimerRef.current);
        delayTimerRef.current = null;
      }
    }, 1000);
  }

  // Animations
  useEffect(() => {
    if (isBlocking) {
      // Fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Pulsing lock animation
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ]),
      );
      pulseLoop.start();

      // Shake animation for shame
      const shakeLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(shakeAnim, { toValue: 8, duration: 100, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -8, duration: 100, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
        ]),
      );
      shakeLoop.start();

      return () => {
        pulseLoop.stop();
        shakeLoop.stop();
      };
    } else {
      // Fade out
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isBlocking, fadeAnim, pulseAnim, shakeAnim]);

  // Progress bar animation
  useEffect(() => {
    if (isBlocking && delayRemaining > 0) {
      const total = DELAY_SECONDS;
      const progress = delayRemaining / total;
      progressAnim.setValue(progress);
    }
  }, [delayRemaining, isBlocking, progressAnim]);

  const accountabilityMessages = [
    {
      title: 'Pause for a Moment',
      subtitle: "You've opened {app} {count} times today without studying.",
      quote: 'Your future patients are counting on this, Vishnu.',
      color: n.colors.accent,
    },
    {
      title: "Let's Refocus",
      subtitle: "{count} attempts to avoid studying. You're better than this.",
      quote: 'The algorithm is winning. Fight back.',
      color: n.colors.error,
    },
    {
      title: 'One More Scroll...',
      subtitle: '{count} times. A doctor needs discipline, not dopamine.',
      quote: "Pixels won't get you through NEET. You will.",
      color: '#FF5722',
    },
  ];

  const currentMessage =
    accountabilityMessages[Math.min(shameLevel, accountabilityMessages.length - 1)];

  function handleGoBackToStudy() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsBlocking(false);
    setDoomscrollAttempts(0);
    navigation.navigate('Tabs', {
      screen: 'HomeTab',
      params: {
        screen: 'Inertia',
      } as any,
    } as any);
  }

  async function handleForceProceed() {
    const ok = await confirmDestructive(
      "You're Giving Up?",
      `Opening ${blockAppName} means losing 50 XP and breaking your streak momentum.`,
      { confirmLabel: 'Take the Penalty', cancelLabel: "I'll Study Instead" },
    );
    if (ok) {
      // In real implementation: deduct XP and update profile
      setIsBlocking(false);
      navigation.goBack();
    }
  }

  if (!isBlocking) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer>
          <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
            <View style={styles.standbyIconContainer}>
              <LinearText style={styles.standbyEmoji}>🛡️</LinearText>
            </View>

            <LinearText style={styles.standbyTitle}>App Hijack Standby</LinearText>
            <LinearText style={styles.standbySubtitle}>
              Live app detection is not active yet on this device. Use App Hijack Setup to enable
              the guardrails, or go back to study now.
            </LinearText>

            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={() =>
                navigation.navigate('Tabs', {
                  screen: 'HomeTab',
                  params: {
                    screen: 'Inertia',
                  } as any,
                } as any)
              }
            >
              <LinearText style={styles.primaryButtonText}>📚 GO BACK TO STUDYING</LinearText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={() => navigation.goBack()}
            >
              <LinearText style={styles.secondaryButtonText}>Close</LinearText>
            </TouchableOpacity>

            <View style={styles.statsRow}>
              <LinearText style={styles.statsText}>
                Doomscroll attempts today: {doomscrollAttempts}
              </LinearText>
              <LinearText style={styles.statsSub}>Study sessions: {sessionCount}</LinearText>
            </View>
          </Animated.View>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: n.colors.surface }]}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer>
        <Animated.View
          style={[
            styles.container,
            {
              opacity: fadeAnim,
              transform: [{ translateX: shakeAnim }, { scale: pulseAnim }],
            },
          ]}
        >
          {/* Lock Icon with Pulse Ring */}
          <View style={styles.lockIconContainer}>
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  transform: [
                    {
                      scale: pulseAnim.interpolate({
                        inputRange: [1, 1.1],
                        outputRange: [1, 1.3],
                      }),
                    },
                  ],
                  opacity: pulseAnim.interpolate({
                    inputRange: [1, 1.1],
                    outputRange: [0.6, 0],
                  }),
                },
              ]}
            />
            <View style={[styles.lockIcon, { borderColor: currentMessage.color }]}>
              <LinearText style={styles.lockEmoji}>🚫</LinearText>
            </View>
          </View>

          {/* Accountability Message */}
          <LinearText style={[styles.shameTitle, { color: currentMessage.color }]}>
            {currentMessage.title}
          </LinearText>
          <LinearText style={styles.shameSubtitle}>
            {currentMessage.subtitle
              .replace('{app}', blockAppName)
              .replace('{count}', String(doomscrollAttempts))}
          </LinearText>

          {/* Quote Box */}
          <View style={[styles.quoteBox, { borderLeftColor: currentMessage.color }]}>
            <LinearText style={styles.quoteText}>"{currentMessage.quote}"</LinearText>
          </View>

          {/* Countdown or Unlocked State */}
          {delayRemaining > 0 ? (
            <View style={styles.countdownContainer}>
              <LinearText style={styles.countdownLabel}>⏳ Cool Down</LinearText>
              <View style={styles.countdownCircle}>
                <LinearText style={[styles.countdownNumber, { color: currentMessage.color }]}>
                  {delayRemaining}
                </LinearText>
                <LinearText style={styles.countdownUnit}>sec</LinearText>
              </View>

              {/* Progress Bar */}
              <View style={styles.progressBarContainer}>
                <Animated.View
                  style={[
                    styles.progressBarFill,
                    {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                      backgroundColor: currentMessage.color,
                    },
                  ]}
                />
              </View>

              <LinearText style={styles.countdownHint}>
                Think about your goals while you wait.
              </LinearText>
            </View>
          ) : (
            <View style={styles.unlockedContainer}>
              <LinearText style={styles.unlockedIcon}>🔓</LinearText>
              <LinearText style={styles.unlockedText}>You can proceed now...</LinearText>
              <LinearText style={styles.unlockedSubtext}>But should you?</LinearText>
            </View>
          )}

          {/* Action Buttons */}
          <TouchableOpacity
            style={[
              styles.button,
              styles.primaryButton,
              delayRemaining > 0 && styles.disabledButton,
            ]}
            onPress={handleGoBackToStudy}
            disabled={delayRemaining > 0}
          >
            <LinearText
              style={[styles.primaryButtonText, delayRemaining > 0 && styles.disabledButtonText]}
            >
              {delayRemaining > 0 ? `⏳ Wait ${delayRemaining}s...` : '📚 GO BACK TO STUDYING'}
            </LinearText>
          </TouchableOpacity>

          {delayRemaining === 0 && (
            <TouchableOpacity
              style={[styles.button, styles.dangerButton]}
              onPress={async () => {
                await handleForceProceed();
              }}
            >
              <LinearText style={styles.dangerButtonText}>
                Open {blockAppName} Anyway (-50 XP)
              </LinearText>
            </TouchableOpacity>
          )}

          {/* Stats */}
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <LinearText style={styles.statValue}>{doomscrollAttempts}</LinearText>
              <LinearText style={styles.statLabel}>Doomscroll Attempts</LinearText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <LinearText style={styles.statValue}>{sessionCount}</LinearText>
              <LinearText style={styles.statLabel}>Study Sessions</LinearText>
            </View>
          </View>
        </Animated.View>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: n.colors.surface,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  // Standby State
  standbyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    borderWidth: 2,
    borderColor: n.colors.accent,
  },
  standbyEmoji: {
    fontSize: 48,
  },
  standbyTitle: {
    color: n.colors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 16,
    textAlign: 'center',
  },
  standbySubtitle: {
    color: n.colors.textMuted,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
    paddingHorizontal: 16,
  },

  // Blocking State
  lockIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(244, 67, 54, 0.3)',
  },
  lockIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: n.colors.errorSurface,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  lockEmoji: {
    fontSize: 40,
  },

  shameTitle: {
    fontSize: 36,
    fontWeight: '900',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 1,
  },
  shameSubtitle: {
    color: n.colors.textMuted,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
    paddingHorizontal: 16,
  },

  quoteBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 20,
    borderRadius: 16,
    borderLeftWidth: 4,
    marginBottom: 32,
    maxWidth: '100%',
  },
  quoteText: {
    color: n.colors.textSecondary,
    fontSize: 18,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 26,
  },

  // Countdown
  countdownContainer: {
    alignItems: 'center',
    marginBottom: 32,
    width: '100%',
  },
  countdownLabel: {
    color: n.colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  countdownCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 3,
    borderColor: n.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  countdownNumber: {
    fontSize: 48,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  countdownUnit: {
    color: n.colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    position: 'absolute',
    bottom: 20,
  },

  progressBarContainer: {
    width: SCREEN_WIDTH * 0.6,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  countdownHint: {
    color: n.colors.textSecondary,
    fontSize: 13,
    fontStyle: 'italic',
  },

  // Unlocked State
  unlockedContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  unlockedIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  unlockedText: {
    color: n.colors.accent,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  unlockedSubtext: {
    color: n.colors.textMuted,
    fontSize: 14,
    fontStyle: 'italic',
  },

  // Buttons
  button: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
  },
  primaryButton: {
    backgroundColor: n.colors.accent,
    borderColor: n.colors.accent,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderColor: n.colors.border,
  },
  dangerButton: {
    backgroundColor: n.colors.error,
    borderColor: n.colors.error,
  },
  disabledButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  primaryButtonText: {
    color: n.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  secondaryButtonText: {
    color: n.colors.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
  dangerButtonText: {
    color: n.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  disabledButtonText: {
    color: n.colors.textMuted,
  },

  // Stats
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    width: '100%',
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  statValue: {
    color: n.colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 4,
  },
  statLabel: {
    color: n.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 12,
  },
  statsText: {
    color: n.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  statsSub: {
    color: n.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
});
