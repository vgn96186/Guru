import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Animated,
  Vibration,
  Alert,
  ActivityIndicator,
} from 'react-native';
import LinearText from '../components/primitives/LinearText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import * as Haptics from 'expo-haptics';
import { linearTheme as n } from '../theme/linearTheme';
import { ResponsiveContainer } from '../hooks/useResponsive';

const POSITION_CHECK_INTERVAL = 1000; // Check every second
const STANDING_THRESHOLD = 0.7; // Z-axis value when standing (phone upright)
const LYING_THRESHOLD = 0.3; // Z-axis value when lying down (phone flat)

export default function BedLockScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [phase, setPhase] = useState<'detecting' | 'lying' | 'situp' | 'stand' | 'unlocked'>(
    'detecting',
  );
  const [positionZ, setPositionZ] = useState(0);
  const [progress, setProgress] = useState(0);
  const [shameCount, setShameCount] = useState(0);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Mock accelerometer data (in real app, use expo-sensors)
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (phase === 'detecting' || phase === 'lying') {
      interval = setInterval(() => {
        // Simulate accelerometer readings
        // In real implementation: Accelerometer.addListener(data => setPositionZ(data.z))
        const mockZ = phase === 'lying' ? 0.1 : Math.random() * 0.5; // Simulate lying flat
        setPositionZ(mockZ);

        if (mockZ < LYING_THRESHOLD && phase === 'detecting') {
          setPhase('lying');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      }, POSITION_CHECK_INTERVAL);
    } else if (phase === 'situp' || phase === 'stand') {
      interval = setInterval(() => {
        // Simulate sitting up
        const mockZ = 0.5 + Math.random() * 0.3; // Simulate upright position
        setPositionZ(mockZ);

        setProgress((prev) => {
          const newProgress = mockZ > STANDING_THRESHOLD ? prev + 20 : Math.max(0, prev - 10);
          if (newProgress >= 100) {
            setPhase('unlocked');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          return Math.min(100, newProgress);
        });
      }, 500);
    }

    return () => clearInterval(interval);
  }, [phase]);

  // Pulsing animation for lying phase
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    let shameInterval: NodeJS.Timeout | null = null;

    if (phase === 'lying') {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ]),
      );
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
  }, [phase]);

  // Shake animation for encouragement
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;

    if (phase === 'situp' || phase === 'stand') {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(shakeAnim, { toValue: 5, duration: 100, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -5, duration: 100, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
        ]),
      );
      anim.start();
    }

    return () => {
      if (anim) anim.stop();
    };
  }, [phase]);

  function handleForceUnlock() {
    Alert.alert('Cheating?', "You're still lying down. Your future patients deserve better.", [
      { text: "I'll Sit Up", style: 'cancel' },
      { text: 'I Give Up', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
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
          <ActivityIndicator size="large" color="#6C63FF" />
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
          <LinearText style={styles.shameEmoji}>😴</LinearText>
          <LinearText style={styles.shameTitle}>You're Lying Down</LinearText>
          <LinearText style={styles.shameSub}>
            {shameCount > 3
              ? `Still in bed after ${shameCount} nudges. Your NEET exam doesn't care about your comfort.`
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
            <LinearText style={styles.situpBtnText}>📱 I'm Sitting Up Now</LinearText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cheatBtn} onPress={handleForceUnlock}>
            <LinearText style={styles.cheatBtnText}>Unlock Anyway (Cheating)</LinearText>
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
            <LinearText style={styles.progressEmoji}>💪</LinearText>
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
          <LinearText style={styles.unlockedEmoji}>🎉</LinearText>
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

  shameEmoji: { fontSize: 80, marginBottom: 20 },
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
  },
  situpBtnText: { color: n.colors.textPrimary, fontSize: 18, fontWeight: '800' },

  cheatBtn: { padding: 16 },
  cheatBtnText: { color: n.colors.textMuted, fontSize: 14, textDecorationLine: 'underline' },

  progressEmoji: { fontSize: 56, marginBottom: 16 },
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

  unlockedEmoji: { fontSize: 72, marginBottom: 20 },
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
