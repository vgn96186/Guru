import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Animated,
  Vibration,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Accelerometer } from 'expo-sensors';
import LinearText from '../components/primitives/LinearText';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { linearTheme as n } from '../theme/linearTheme';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { motion, useReducedMotion } from '../motion';
import { confirmDestructive } from '../components/dialogService';

import { RootNav } from '../navigation/typedHooks';
const POSITION_CHECK_INTERVAL = 1000; // Check every second
const STANDING_THRESHOLD = 0.7; // Z-axis value when standing (phone upright)
const LYING_THRESHOLD = 0.3; // Z-axis value when lying down (phone flat)

export default function BedLockScreen() {
  const navigation = RootNav.useNav();
  const [phase, setPhase] = useState<'detecting' | 'lying' | 'situp' | 'stand' | 'unlocked'>(
    'detecting',
  );
  const [positionZ, setPositionZ] = useState(0);
  const [progress, setProgress] = useState(0);
  const [shameCount, setShameCount] = useState(0);
  const reducedMotion = useReducedMotion();

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Real accelerometer data from expo-sensors
  useEffect(() => {
    let subscription: any;

    if (phase === 'detecting') {
      // Start listening to accelerometer
      Accelerometer.setUpdateInterval(POSITION_CHECK_INTERVAL);
      subscription = Accelerometer.addListener((data) => {
        setPositionZ(data.z);

        if (data.z < LYING_THRESHOLD) {
          setPhase('lying');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      });
    }

    return () => {
      if (subscription) subscription.remove();
    };
  }, [phase]);

  // Sit-up / stand phase: track sustained upright position
  useEffect(() => {
    let subscription: any;

    if (phase === 'situp' || phase === 'stand') {
      Accelerometer.setUpdateInterval(500);
      subscription = Accelerometer.addListener((data) => {
        setPositionZ(data.z);

        setProgress((prev) => {
          const newProgress = data.z > STANDING_THRESHOLD ? prev + 20 : Math.max(0, prev - 10);
          if (newProgress >= 100) {
            setPhase('unlocked');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          return Math.min(100, newProgress);
        });
      });
    }

    return () => {
      if (subscription) subscription.remove();
    };
  }, [phase]);

  // Stop accelerometer when unlocked or idle
  useEffect(() => {
    if (phase === 'unlocked' || phase === 'detecting') {
      Accelerometer.removeAllListeners();
    }
  }, [phase]);

  // Pulsing animation for lying phase
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    let shameInterval: NodeJS.Timeout | null = null;

    if (phase === 'lying') {
      anim = motion.pulseScale(pulseAnim, { to: 1.2, duration: 1000, reducedMotion });
      anim.start();

      // Vibration pattern for shame
      shameInterval = setInterval(() => {
        Vibration.vibrate([0, 500, 200, 500]);
        setShameCount((c) => c + 1);
      }, 5000);
    }

    return () => {
      if (anim) anim.stop();
      if (shameInterval) clearInterval(shameInterval);
    };
  }, [phase, pulseAnim, reducedMotion]);

  // Shake animation for encouragement
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;

    if (phase === 'situp' || phase === 'stand') {
      anim = motion.shake(shakeAnim, { amplitude: 5, reducedMotion });
      anim.start();
    }

    return () => {
      if (anim) anim.stop();
    };
  }, [phase, shakeAnim, reducedMotion]);

  async function handleForceUnlock() {
    const ok = await confirmDestructive(
      'Need a Break?',
      "You're still lying down. Consider resting properly and coming back fresh.",
      { confirmLabel: 'Exit', cancelLabel: "I'll Sit Up" },
    );
    if (ok) navigation.goBack();
  }

  function handleStartSitUp() {
    setPhase('situp');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  if (phase === 'detecting') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer style={styles.center}>
          <ActivityIndicator size="large" color={n.colors.accent} />
          <LinearText style={styles.detectingText}>Detecting position...</LinearText>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  if (phase === 'lying') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer style={styles.center}>
          <Ionicons name="moon-outline" size={64} color={n.colors.textMuted} />
          <LinearText style={styles.shameTitle}>You're Lying Down</LinearText>
          <LinearText style={styles.shameSub}>
            {shameCount > 3
              ? `Still resting after ${shameCount} nudges. A fresh mind studies better — but if you're ready, let's go.`
              : 'Phone detected horizontal position. Time to get up, Doctor.'}
          </LinearText>

          <Animated.View style={[styles.lockCircle, { transform: [{ scale: pulseAnim }] }]}>
            <LinearText style={styles.lockEmoji}>🔒</LinearText>
            <LinearText style={styles.lockText}>LOCKED</LinearText>
          </Animated.View>

          <LinearText style={styles.positionText}>
            Z-Axis: {positionZ.toFixed(2)} (need &gt; 0.7)
          </LinearText>

          <TouchableOpacity style={styles.situpBtn} onPress={handleStartSitUp}>
            <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
            <LinearText style={styles.situpBtnText}>I'm Sitting Up Now</LinearText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cheatBtn} onPress={handleForceUnlock}>
            <LinearText style={styles.cheatBtnText}>Exit Anyway</LinearText>
          </TouchableOpacity>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  if (phase === 'situp' || phase === 'stand') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer style={{ flex: 1 }}>
          <Animated.View style={[styles.center, { transform: [{ translateX: shakeAnim }] }]}>
            <Ionicons name="fitness-outline" size={64} color={n.colors.accent} />
            <LinearText style={styles.progressTitle}>Keep Sitting Up!</LinearText>
            <LinearText style={styles.progressSub}>Hold phone upright to unlock</LinearText>

            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>

            <LinearText style={styles.progressPercent}>{progress}%</LinearText>
            <LinearText style={styles.positionText}>Current: {positionZ.toFixed(2)}</LinearText>

            {progress > 50 && (
              <LinearText style={styles.encouragement}>Almost there! Stay upright!</LinearText>
            )}
          </Animated.View>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  if (phase === 'unlocked') {
    return (
      <SafeAreaView style={styles.safe}>
        <ResponsiveContainer style={styles.center}>
          <Ionicons name="sparkles-outline" size={64} color={n.colors.accent} />
          <LinearText style={styles.unlockedTitle}>You're Upright!</LinearText>
          <LinearText style={styles.unlockedSub}>
            The hardest part is done. Now let's study.
          </LinearText>

          <TouchableOpacity
            style={styles.startBtn}
            onPress={() =>
              navigation.navigate('Tabs', {
                screen: 'HomeTab',
                params: {
                  screen: 'Inertia',
                },
              })
            }
          >
            <LinearText style={styles.startBtnText}>Start with 1 Easy Card →</LinearText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sprintBtn}
            onPress={() =>
              navigation.navigate('Tabs', {
                screen: 'HomeTab',
                params: {
                  screen: 'Session',
                  params: { mood: 'distracted', mode: 'sprint', forcedMinutes: 5 },
                },
              })
            }
          >
            <LinearText style={styles.sprintBtnText}>⚡ 5-Min Sprint</LinearText>
          </TouchableOpacity>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  detectingText: { color: n.colors.textMuted, fontSize: 16, marginTop: 20 },
  shameTitle: {
    color: n.colors.error,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 12,
    textAlign: 'center',
  },
  shameSub: {
    color: n.colors.textMuted,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
    paddingHorizontal: 20,
  },

  lockCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: n.colors.errorSurface,
    borderWidth: 3,
    borderColor: n.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  lockEmoji: { fontSize: 48 },
  lockText: { color: n.colors.error, fontSize: 14, fontWeight: '700', marginTop: 4 },

  positionText: { color: n.colors.textMuted, fontSize: 12, marginBottom: 30 },

  situpBtn: {
    backgroundColor: n.colors.accent,
    paddingHorizontal: 40,
    paddingVertical: 18,
    borderRadius: 16,
    marginBottom: 16,
    minWidth: 250,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  situpBtnText: { color: n.colors.textPrimary, fontSize: 18, fontWeight: '800' },

  cheatBtn: { padding: 16 },
  cheatBtnText: { color: n.colors.textMuted, fontSize: 14, textDecorationLine: 'underline' },

  progressTitle: { color: n.colors.textPrimary, fontSize: 24, fontWeight: '800', marginBottom: 8 },
  progressSub: { color: n.colors.textMuted, fontSize: 14, marginBottom: 40 },

  progressBar: {
    width: 250,
    height: 20,
    backgroundColor: n.colors.border,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: n.colors.accent,
    borderRadius: 10,
  },
  progressPercent: { color: n.colors.accent, fontSize: 20, fontWeight: '800', marginBottom: 8 },

  encouragement: { color: n.colors.success, fontSize: 16, fontWeight: '600', marginTop: 20 },

  unlockedTitle: { color: n.colors.success, fontSize: 32, fontWeight: '900', marginBottom: 12 },
  unlockedSub: {
    color: n.colors.textMuted,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
  },

  startBtn: {
    backgroundColor: n.colors.success,
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: 16,
    marginBottom: 16,
    minWidth: 280,
    alignItems: 'center',
  },
  startBtnText: { color: n.colors.textPrimary, fontSize: 18, fontWeight: '800' },

  sprintBtn: {
    backgroundColor: n.colors.accent,
    paddingHorizontal: 40,
    paddingVertical: 18,
    borderRadius: 16,
    minWidth: 280,
    alignItems: 'center',
  },
  sprintBtnText: { color: n.colors.textPrimary, fontSize: 18, fontWeight: '800' },
});
