import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar, Animated,
  Dimensions, Vibration, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { addXp } from '../db/queries/progress';
import { useAppStore } from '../store/useAppStore';
import { launchMedicalApp, SupportedMedicalApp } from '../services/appLauncher';
import { EXTERNAL_APPS } from '../constants/externalApps';

const { width } = Dimensions.get('window');

// ─── Step definitions ───────────────────────────────────────────
interface RitualStep {
  emoji: string;
  title: string;
  subtitle: string;
  action: string;        // Button label
  durationSec?: number;  // Auto-advance after N seconds (for breathing)
  xp: number;
}

const STEPS: RitualStep[] = [
  {
    emoji: '🪑',
    title: 'Clear your space',
    subtitle: 'Put your phone on the table.\nPush away clutter. Just the phone & a glass of water.',
    action: 'Done ✓',
    xp: 5,
  },
  {
    emoji: '🧍',
    title: 'Move your body',
    subtitle: 'Stand up. Stretch your arms above your head.\nRoll your shoulders back 3 times.',
    action: 'Done ✓',
    xp: 5,
  },
  {
    emoji: '📖',
    title: 'Open your tools',
    subtitle: 'Open your notebook or a blank page.\nGet a pen ready. You\'re almost there.',
    action: 'Done ✓',
    xp: 5,
  },
  {
    emoji: '🌬️',
    title: 'Box Breathing',
    subtitle: 'Follow the circle.\nBreathe in 4s → Hold 4s → Out 4s → Hold 4s',
    action: '',
    durationSec: 48, // 3 full box-breath cycles (4 phases × 4s × 3)
    xp: 10,
  },
  {
    emoji: '🚀',
    title: 'You\'re set up.',
    subtitle: 'The hardest part is literally over.\nYou just have to press one button.',
    action: '',
    xp: 0,
  },
];

const BREATH_PHASES = ['Breathe in', 'Hold', 'Breathe out', 'Hold'] as const;
const BREATH_PHASE_SEC = 4;

// ─── Component ──────────────────────────────────────────────────
export default function InertiaScreen() {
  const navigation = useNavigation();
  const loadProfile = useAppStore(s => s.loadProfile);
  const faceTrackingEnabled = useAppStore(s => s.profile?.faceTrackingEnabled ?? false);
  const [step, setStep] = useState(0);
  const [totalXp, setTotalXp] = useState(0);
  const [launching, setLaunching] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  // Breathing state
  const [breathPhase, setBreathPhase] = useState(0);
  const [breathTimer, setBreathTimer] = useState(BREATH_PHASE_SEC);
  const [breathDone, setBreathDone] = useState(false);
  const breathCircle = useRef(new Animated.Value(0.5)).current;

  // ── Animate step transitions ─────────────────────
  useEffect(() => {
    fadeAnim.setValue(0);
    scaleAnim.setValue(0.9);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, useNativeDriver: true }),
    ]).start();
  }, [step]);

  // ── Breathing animation ──────────────────────────
  useEffect(() => {
    if (step !== 3) return;
    setBreathPhase(0);
    setBreathTimer(BREATH_PHASE_SEC);
    setBreathDone(false);
    breathCircle.setValue(0.5);
  }, [step]);

  useEffect(() => {
    if (step !== 3 || breathDone) return;

    const interval = setInterval(() => {
      setBreathTimer(prev => {
        if (prev <= 1) {
          // Advance to next phase
          setBreathPhase(prevPhase => {
            const next = prevPhase + 1;
            if (next >= BREATH_PHASES.length * 3) { // 3 full cycles
              setBreathDone(true);
              Vibration.vibrate(100);
              return prevPhase;
            }
            // Pulse vibration at each phase change
            Vibration.vibrate(30);
            return next;
          });
          return BREATH_PHASE_SEC;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [step, breathDone]);

  // Animate breathing circle size
  useEffect(() => {
    if (step !== 3) return;
    const phase = breathPhase % BREATH_PHASES.length;
    const toValue = phase === 0 ? 1.0 : phase === 2 ? 0.5 : phase === 1 ? 1.0 : 0.5;
    Animated.timing(breathCircle, {
      toValue,
      duration: BREATH_PHASE_SEC * 1000,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [breathPhase, step]);

  // ── Handlers ─────────────────────────────────────
  const handleStepComplete = useCallback(() => {
    const current = STEPS[step];
    if (current.xp > 0) {
      addXp(current.xp);
      setTotalXp(t => t + current.xp);
    }
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    }
  }, [step]);

  const handleSurpriseMe = useCallback(async () => {
    // Zero cognitive load: pick a random installed app and launch directly
    setLaunching(true);
    const appKeys: SupportedMedicalApp[] = ['cerebellum', 'marrow', 'dbmci', 'prepladder'];
    // Shuffle and try each
    const shuffled = appKeys.sort(() => Math.random() - 0.5);
    for (const key of shuffled) {
      try {
        const launched = await launchMedicalApp(key, faceTrackingEnabled);
        if (launched) {
          // Award all remaining XP
          const remaining = STEPS.reduce((sum, s) => sum + s.xp, 0) - totalXp;
          if (remaining > 0) addXp(remaining);
          loadProfile();
          navigation.goBack();
          return;
        }
      } catch (_) {}
    }
    // If nothing installed, navigate to session
    addXp(10);
    loadProfile();
    (navigation as any).navigate('Session', { mood: 'determined', mode: 'surprise' });
  }, [totalXp, navigation, loadProfile]);

  const handleLaunchApp = useCallback(async (appKey: SupportedMedicalApp) => {
    setLaunching(true);
    try {
      await launchMedicalApp(appKey, faceTrackingEnabled);
      loadProfile();
      navigation.goBack();
    } catch (e) {
      console.warn('[Inertia] Launch failed:', e);
      setLaunching(false);
    }
  }, [navigation, loadProfile]);

  const handleSkipToLaunch = () => {
    // Award any un-earned XP up to current step
    const earned = STEPS.slice(0, step).reduce((sum, s) => sum + s.xp, 0);
    const diff = earned - totalXp;
    if (diff > 0) { addXp(diff); setTotalXp(t => t + diff); }
    setStep(STEPS.length - 1);
  };

  // ── Render ───────────────────────────────────────
  const current = STEPS[step];
  const progress = (step + 1) / STEPS.length;
  const isBreathing = step === 3;
  const isFinal = step === STEPS.length - 1;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <Animated.View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
      </View>

      {/* XP badge */}
      {totalXp > 0 && (
        <View style={styles.xpBadge}>
          <Text style={styles.xpText}>+{totalXp} XP</Text>
        </View>
      )}

      {/* Skip link */}
      {!isFinal && (
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkipToLaunch}>
          <Text style={styles.skipText}>Skip to launch →</Text>
        </TouchableOpacity>
      )}

      {/* Main content */}
      <Animated.View style={[styles.contentContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <Text style={styles.emoji}>{current.emoji}</Text>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.subtitle}>{current.subtitle}</Text>

        {/* Breathing circle (step 3 only) */}
        {isBreathing && (
          <View style={styles.breathContainer}>
            <Animated.View style={[styles.breathCircle, { transform: [{ scale: breathCircle }] }]}>
              <Text style={styles.breathPhaseText}>
                {breathDone ? '✓ Done' : BREATH_PHASES[breathPhase % BREATH_PHASES.length]}
              </Text>
              {!breathDone && (
                <Text style={styles.breathTimerText}>{breathTimer}</Text>
              )}
            </Animated.View>
          </View>
        )}

        {/* Action button for non-breathing steps */}
        {!isBreathing && !isFinal && (
          <TouchableOpacity style={styles.actionBtn} onPress={handleStepComplete} activeOpacity={0.8}>
            <Text style={styles.actionBtnText}>{current.action}</Text>
          </TouchableOpacity>
        )}

        {/* Breathing done → advance */}
        {isBreathing && breathDone && (
          <TouchableOpacity style={styles.actionBtn} onPress={handleStepComplete} activeOpacity={0.8}>
            <Text style={styles.actionBtnText}>I feel calmer ✓</Text>
          </TouchableOpacity>
        )}

        {/* Final step: app launch buttons */}
        {isFinal && (
          <View style={styles.launchContainer}>
            <Text style={styles.launchTitle}>Launch your study app</Text>
            
            {/* Surprise Me — zero cognitive load */}
            <TouchableOpacity
              style={[styles.surpriseBtn, launching && styles.disabled]}
              onPress={handleSurpriseMe}
              disabled={launching}
              activeOpacity={0.8}
            >
              <Text style={styles.surpriseBtnText}>
                {launching ? 'Launching...' : '🎲 Surprise Me — Just start'}
              </Text>
            </TouchableOpacity>

            {/* Individual app buttons */}
            <View style={styles.appGrid}>
              {EXTERNAL_APPS.slice(0, 4).map(app => (
                <TouchableOpacity
                  key={app.id}
                  style={[styles.appBtn, { borderColor: app.color }, launching && styles.disabled]}
                  onPress={() => handleLaunchApp(app.id as SupportedMedicalApp)}
                  disabled={launching}
                  activeOpacity={0.8}
                >
                  <Text style={styles.appEmoji}>{app.iconEmoji}</Text>
                  <Text style={styles.appName}>{app.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.stayBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.stayText}>I'll study in-app instead</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>

      {/* Step counter */}
      <Text style={styles.stepCounter}>
        {step + 1} / {STEPS.length}
      </Text>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },

  progressContainer: { height: 4, backgroundColor: '#1A1A24', width: '100%' },
  progressBar: { height: '100%', backgroundColor: '#6C63FF', borderRadius: 2 },

  xpBadge: {
    position: 'absolute', top: 56, right: 16, backgroundColor: '#2E7D32',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, zIndex: 10,
  },
  xpText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  skipBtn: { position: 'absolute', top: 56, left: 16, zIndex: 10 },
  skipText: { color: '#555', fontSize: 13, fontWeight: '600' },

  contentContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32,
  },

  emoji: { fontSize: 56, marginBottom: 16 },
  title: { color: '#fff', fontSize: 28, fontWeight: '900', textAlign: 'center', marginBottom: 12 },
  subtitle: { color: '#999', fontSize: 16, lineHeight: 24, textAlign: 'center', marginBottom: 32 },

  // Breathing
  breathContainer: { alignItems: 'center', justifyContent: 'center', marginVertical: 24 },
  breathCircle: {
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: '#1A1A3E', borderWidth: 3, borderColor: '#6C63FF',
    alignItems: 'center', justifyContent: 'center',
  },
  breathPhaseText: { color: '#B8B0FF', fontSize: 18, fontWeight: '700' },
  breathTimerText: { color: '#6C63FF', fontSize: 36, fontWeight: '900', marginTop: 4 },

  // Action
  actionBtn: {
    backgroundColor: '#6C63FF', paddingHorizontal: 40, paddingVertical: 18,
    borderRadius: 16, width: '100%', alignItems: 'center',
  },
  actionBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },

  // Final launch
  launchContainer: { width: '100%', alignItems: 'center' },
  launchTitle: { color: '#666', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 },

  surpriseBtn: {
    backgroundColor: '#6C63FF', paddingVertical: 18, borderRadius: 16,
    width: '100%', alignItems: 'center', marginBottom: 16,
  },
  surpriseBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },

  appGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: '100%', marginBottom: 16 },
  appBtn: {
    flex: 1, minWidth: (width - 74) / 2, backgroundColor: '#1A1A24',
    padding: 16, borderRadius: 14, alignItems: 'center',
    borderWidth: 1.5,
  },
  appEmoji: { fontSize: 28, marginBottom: 4 },
  appName: { color: '#ccc', fontSize: 13, fontWeight: '700' },

  stayBtn: { padding: 12, marginTop: 4 },
  stayText: { color: '#555', fontWeight: '600', fontSize: 14 },

  disabled: { opacity: 0.5 },

  stepCounter: {
    color: '#333', textAlign: 'center', paddingBottom: 12, fontSize: 13, fontWeight: '600',
  },
});
