import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../components/primitives/LinearText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { linearTheme as n } from '../theme/linearTheme';
import { motion } from '../motion/presets';
import LinearSurface from '../components/primitives/LinearSurface';
import { dailyLogRepository } from '../db/repositories';
import { useRefreshProfile } from '../hooks/queries/useProfile';
import { useAppStore } from '../store/useAppStore';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { RootNav } from '../navigation/typedHooks';
type WakeUpPhase = 'breathe' | 'ground' | 'fog_check' | 'done';

const PHASE_LABELS: Record<WakeUpPhase, { label: string; step: number; total: number }> = {
  breathe: { label: 'Breathe', step: 1, total: 3 },
  ground: { label: 'Ground', step: 2, total: 3 },
  fog_check: { label: 'Check', step: 3, total: 3 },
  done: { label: 'Done', step: 3, total: 3 },
};

export default function WakeUpScreen() {
  const navigation = RootNav.useNav<'WakeUp'>();
  const refreshProfile = useRefreshProfile();
  const setDailyAvailability = useAppStore((s) => s.setDailyAvailability);
  const [phase, setPhase] = useState<WakeUpPhase>('breathe');

  // Breathing
  const breatheAnim = useRef(new Animated.Value(1)).current;
  const [breatheText, setBreatheText] = useState('Breathe In');

  // Grounding
  const [groundStep, setGroundStep] = useState(0);
  const groundingPrompts = [
    'Name 3 things you can see right now.',
    'Name 2 things you can feel (blanket, bed).',
    'Name 1 thing you can hear.',
  ];

  useEffect(() => {
    if (phase !== 'breathe') return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    function runCycle(cycleNum: number) {
      if (cancelled || cycleNum >= 3) {
        if (!cancelled) setPhase('ground');
        return;
      }

      setBreatheText('Breathe In');
      motion.to(breatheAnim, { toValue: 2, duration: 4000, useNativeDriver: true }).start();

      timers.push(
        setTimeout(() => {
          if (!cancelled) setBreatheText('Hold');
        }, 4000),
      );
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setBreatheText('Breathe Out');
          motion
            .to(breatheAnim, {
              toValue: 1,
              duration: 4000,
              useNativeDriver: true,
            })
            .start();
        }, 8000),
      );
      timers.push(
        setTimeout(() => {
          if (!cancelled) setBreatheText('Hold');
        }, 12000),
      );
      timers.push(
        setTimeout(() => {
          if (!cancelled) runCycle(cycleNum + 1);
        }, 16000),
      );
    }

    runCycle(0);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [phase, breatheAnim]);

  async function handleFogCheck(level: 'clear' | 'hazy' | 'foggy') {
    if (level === 'foggy') {
      // Very foggy → auto check-in as tired, gentle session defaults
      await dailyLogRepository.checkinToday('tired');
      setDailyAvailability(20);
      await refreshProfile();
      navigation.replace('Tabs');
    } else {
      // Clear or hazy → normal check-in
      navigation.replace('CheckIn');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer style={styles.container}>
        {phase === 'breathe' && (
          <View style={styles.centerBox}>
            <View style={styles.progressRow}>
              <LinearText style={styles.progressText}>
                Step {PHASE_LABELS[phase].step} of {PHASE_LABELS[phase].total}
              </LinearText>
            </View>
            <LinearText style={styles.title}>Morning Intercept</LinearText>
            <LinearText style={styles.sub}>Before the dopamine hits, let's ground.</LinearText>

            <View style={styles.breatheBox}>
              <Animated.View
                style={[styles.breatheCircle, { transform: [{ scale: breatheAnim }] }]}
              />
              <LinearText style={styles.breatheText}>{breatheText}</LinearText>
            </View>

            <TouchableOpacity
              style={styles.skipBtn}
              onPress={() => setPhase('ground')}
              activeOpacity={0.8}
            >
              <LinearText style={styles.skipBtnText}>I'm already awake</LinearText>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'ground' && (
          <View style={styles.centerBox}>
            <View style={styles.progressRow}>
              <LinearText style={styles.progressText}>
                Step {PHASE_LABELS[phase].step} of {PHASE_LABELS[phase].total}
              </LinearText>
            </View>
            <Ionicons name="leaf-outline" size={64} color={n.colors.textMuted} />
            <LinearText style={styles.title}>Grounding</LinearText>
            <LinearText style={styles.groundText}>{groundingPrompts[groundStep]}</LinearText>

            <TouchableOpacity
              style={styles.nextBtn}
              onPress={() => {
                if (groundStep < groundingPrompts.length - 1) {
                  setGroundStep((s) => s + 1);
                } else {
                  setPhase('fog_check');
                }
              }}
            >
              <LinearText style={styles.nextBtnText}>Done</LinearText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipBtn}
              onPress={() => setPhase('fog_check')}
              activeOpacity={0.8}
            >
              <LinearText style={styles.skipBtnText}>{'Skip \u2192'}</LinearText>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'fog_check' && (
          <View style={styles.centerBox}>
            <View style={styles.progressRow}>
              <LinearText style={styles.progressText}>
                Step {PHASE_LABELS[phase].step} of {PHASE_LABELS[phase].total}
              </LinearText>
            </View>
            <Ionicons name="hardware-chip-outline" size={64} color={n.colors.textMuted} />
            <LinearText style={styles.title}>How is the brain fog today?</LinearText>

            <View style={styles.fogGrid}>
              <TouchableOpacity onPress={() => handleFogCheck('clear')}>
                <LinearSurface padded={false} style={styles.fogBtn}>
                  <Ionicons name="sunny-outline" size={32} color={n.colors.textPrimary} />
                  <LinearText style={styles.fogBtnText}>Actually Okay</LinearText>
                  <LinearText style={styles.fogBtnSub}>Ready to start</LinearText>
                </LinearSurface>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => handleFogCheck('hazy')}>
                <LinearSurface padded={false} style={styles.fogBtn}>
                  <Ionicons name="partly-sunny-outline" size={32} color={n.colors.textPrimary} />
                  <LinearText style={styles.fogBtnText}>A Bit Hazy</LinearText>
                  <LinearText style={styles.fogBtnSub}>Need a slow start</LinearText>
                </LinearSurface>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => handleFogCheck('foggy')}>
                <LinearSurface padded={false} style={styles.fogBtn}>
                  <Ionicons name="cloud-outline" size={32} color={n.colors.textPrimary} />
                  <LinearText style={styles.fogBtnText}>Very Foggy</LinearText>
                  <LinearText style={styles.fogBtnSub}>Hard to think</LinearText>
                </LinearSurface>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  centerBox: { alignItems: 'center' },
  progressRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20 },
  progressText: { color: n.colors.accent, fontSize: 14, fontWeight: '700' },
  title: {
    color: n.colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  sub: { color: n.colors.textSecondary, fontSize: 16, textAlign: 'center', marginBottom: 60 },

  breatheBox: { width: 200, height: 200, justifyContent: 'center', alignItems: 'center' },
  breatheCircle: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: n.colors.primaryTintSoft,
    borderWidth: 2,
    borderColor: n.colors.accent,
  },
  breatheText: { color: n.colors.textPrimary, fontSize: 18, fontWeight: '700', zIndex: 10 },

  skipBtn: {
    marginTop: 40,
    paddingHorizontal: 20,
    paddingVertical: 14,
    minHeight: 44,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  skipBtnText: { color: n.colors.textSecondary, fontSize: 14, fontWeight: '600' },

  groundText: {
    color: n.colors.accent,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 40,
    paddingHorizontal: 20,
    lineHeight: 30,
  },
  nextBtn: {
    backgroundColor: n.colors.surface,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  nextBtnText: { color: n.colors.textPrimary, fontSize: 16, fontWeight: '700' },

  _unusedSkipBtn: { alignSelf: 'flex-end', padding: 8, marginBottom: 8 },
  _unusedSkipBtnText: { color: n.colors.textMuted, fontSize: 13 },
  fogGrid: { width: '100%', gap: 12, marginTop: 20 },
  fogBtn: {
    padding: 20,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  fogBtnText: { color: n.colors.textPrimary, fontSize: 16, fontWeight: '700', flex: 1 },
  fogBtnSub: { color: n.colors.textMuted, fontSize: 12 },
});
