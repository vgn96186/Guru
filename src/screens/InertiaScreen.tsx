import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Animated,
  Easing,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import * as Haptics from 'expo-haptics';
import { fetchContent } from '../services/aiService';
import { fetchWikipediaImage } from '../services/imageService';
import { getAllTopicsWithProgress } from '../db/queries/topics';
import LoadingOrb from '../components/LoadingOrb';
import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';
import LinearButton from '../components/primitives/LinearButton';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { MarkdownRender } from '../components/MarkdownRender';
import { linearTheme as n } from '../theme/linearTheme';
import type { DetectiveContent, TopicWithProgress } from '../types';

function TopicImage({ topicName }: { topicName: string }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchWikipediaImage(topicName).then(setImageUrl);
  }, [topicName]);

  if (!imageUrl) return null;

  return <Image source={{ uri: imageUrl }} style={styles.topicImage} resizeMode="contain" />;
}

type Phase = 'breathe' | 'sit_up_prompt' | 'fetching' | 'micro_win_bed' | 'micro_win' | 'pivot';

export default function InertiaScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [phase, setPhase] = useState<Phase>('breathe');
  const [breatheText, setBreatheText] = useState('Breathe in...');
  const [content, setContent] = useState<DetectiveContent | null>(null);
  const [topic, setTopic] = useState<TopicWithProgress | null>(null);
  const [revealStep, setRevealStep] = useState(1);
  const [isSolved, setIsSolved] = useState(false);
  const [showSkip, setShowSkip] = useState(true);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const fadeIn = useCallback(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  }, [fadeAnim]);

  async function fetchMicroWin() {
    try {
      const topics = await getAllTopicsWithProgress();
      const pool = topics
        .filter(
          (t) =>
            t.progress.status === 'reviewed' ||
            t.progress.status === 'mastered' ||
            t.inicetPriority >= 8,
        )
        .slice(0, 50);
      const selected = pool[Math.floor(Math.random() * pool.length)] || topics[0];
      if (!selected) {
        setPhase('sit_up_prompt');
        return;
      }
      setTopic(selected);

      const res = await fetchContent(selected, 'detective');
      if (res.type === 'detective') {
        setContent(res);
        if (phase === 'fetching') {
          setPhase('micro_win');
          fadeIn();
        }
      }
    } catch (e) {
      console.error('Failed to fetch mystery', e);
    }
  }

  useEffect(() => {
    void fetchMicroWin();
    // Skip button visible immediately (was 8s delay — bad for ADHD users who need help NOW)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap; fetchMicroWin closes over initial phase
  }, []);

  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    let t1: NodeJS.Timeout, t2: NodeJS.Timeout, t3: NodeJS.Timeout, t4: NodeJS.Timeout;

    if (phase === 'fetching' || phase === 'micro_win') {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.4,
            duration: 4000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 4000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      anim.start();

      t1 = setTimeout(() => setBreatheText('Hold...'), 4000);
      t2 = setTimeout(() => setBreatheText('Breathe out...'), 6000);
      t3 = setTimeout(() => setBreatheText('One more time. In...'), 10000);

      t4 = setTimeout(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPhase('sit_up_prompt');
        fadeIn();
      }, 14000);
    }

    return () => {
      if (anim) anim.stop();
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [phase, fadeIn, pulseAnim]);

  function handlePositionConfirm() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase(content ? 'micro_win' : 'fetching');
    fadeIn();
  }

  function handleNextClue() {
    if (!content) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (revealStep < content.clues.length) {
      setRevealStep((prev) => prev + 1);
    } else {
      setIsSolved(true);
    }
  }

  function handleWinComplete() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPhase('pivot');
    fadeIn();
  }

  function handleStartSprint() {
    navigation.navigate('Session', { mood: 'distracted', mode: 'sprint', forcedMinutes: 5 });
  }

  function handleClose() {
    navigation.goBack();
  }

  const DetectiveDisplay = ({
    content,
    revealStep,
    isSolved,
  }: {
    content: DetectiveContent;
    revealStep: number;
    isSolved: boolean;
  }) => (
    <LinearSurface padded={false} style={styles.card}>
      <LinearText style={styles.cardHeader}>CLINICAL MYSTERY</LinearText>

      {content.clues.slice(0, revealStep).map((clue, i) => (
        <LinearSurface
          key={i}
          padded={false}
          borderColor={n.colors.cardHover}
          style={[styles.clueBox, i === revealStep - 1 && styles.newClue]}
        >
          <LinearText style={styles.clueLabel}>Visual / Sign {i + 1}</LinearText>
          <LinearText style={styles.clueText}>{clue}</LinearText>
        </LinearSurface>
      ))}

      {isSolved && (
        <Animated.View style={[styles.solutionBox, { opacity: revealStep > 0 ? 1 : 0 }]}>
          <LinearText style={styles.solutionLabel}>Diagnosis:</LinearText>
          <LinearText style={styles.solutionValue}>{content.answer}</LinearText>
          <View style={styles.divider} />
          <MarkdownRender content={content.explanation} compact />
        </Animated.View>
      )}
    </LinearSurface>
  );

  if (phase === 'breathe') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer style={styles.center}>
          <LinearText variant="display" style={styles.breatheTitle}>
            Brain Fog?
          </LinearText>
          <LinearText variant="body" tone="secondary" style={styles.breatheSub}>
            Let&apos;s reset. Breathe with the circle.
          </LinearText>
          <View style={styles.circleContainer}>
            <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]} />
            <LinearText variant="title" style={styles.breatheText}>
              {breatheText}
            </LinearText>
          </View>
          {showSkip && (
            <TouchableOpacity style={styles.skipBtn} onPress={() => setPhase('sit_up_prompt')}>
              <LinearText variant="caption" tone="muted" style={styles.skipBtnText}>
                Skip breathing →
              </LinearText>
            </TouchableOpacity>
          )}
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  if (phase === 'fetching') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <LoadingOrb message="Constructing a diagnostic puzzle..." />
      </SafeAreaView>
    );
  }

  if (phase === 'sit_up_prompt') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer style={{ flex: 1 }}>
          <Animated.View style={[styles.center, { opacity: fadeAnim }]}>
            <Ionicons name="search-outline" size={64} color={n.colors.textMuted} />
            <LinearText variant="display" centered style={styles.sitUpTitle}>
              One Minute Mystery
            </LinearText>
            <LinearText variant="body" tone="secondary" centered style={styles.sitUpSub}>
              Don&apos;t study yet. Just solve this one 3-clue clinical case.
            </LinearText>
            <View style={styles.choiceBox}>
              <LinearButton
                label="I'm Ready (Sit Up)"
                variant="primary"
                style={styles.sitUpBtn}
                onPress={handlePositionConfirm}
                leftIcon={
                  <Ionicons name="phone-portrait-outline" size={18} color={n.colors.textPrimary} />
                }
              />
              <LinearText variant="caption" tone="muted" style={styles.orText}>
                or
              </LinearText>
              <LinearButton
                label="Play from Bed (Lazy Mode)"
                variant="secondary"
                style={styles.bedBtn}
                onPress={() => setPhase('micro_win_bed')}
                leftIcon={<Ionicons name="bed-outline" size={18} color={n.colors.textSecondary} />}
              />
            </View>
          </Animated.View>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  if ((phase === 'micro_win' || phase === 'micro_win_bed') && content) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer style={{ flex: 1 }}>
          <Animated.View style={[styles.center, { opacity: fadeAnim }]}>
            <LinearText variant="label" tone="accent" style={styles.winTitle}>
              Solve the Mystery
            </LinearText>
            <LinearText variant="title" centered style={styles.winTopic}>
              {content.topicName}
            </LinearText>

            <TopicImage topicName={content.topicName} />

            <DetectiveDisplay content={content} revealStep={revealStep} isSolved={isSolved} />

            {!isSolved ? (
              <View style={{ width: '100%', gap: 12, marginTop: 20 }}>
                <LinearButton
                  label={
                    revealStep < content.clues.length ? 'Next Clue →' : 'I know the Diagnosis →'
                  }
                  variant="primary"
                  style={styles.doneBtn}
                  onPress={handleNextClue}
                />
                {revealStep >= 2 && (
                  <TouchableOpacity style={styles.giveUpBtn} onPress={() => setIsSolved(true)}>
                    <LinearText variant="caption" tone="muted" style={styles.giveUpText}>
                      Just show me the answer
                    </LinearText>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <LinearButton
                label="Boom. I'm moving. →"
                variant="primary"
                style={[
                  styles.doneBtn,
                  {
                    backgroundColor: n.colors.success,
                    borderColor: n.colors.success,
                    marginTop: 20,
                  },
                ]}
                onPress={handleWinComplete}
              />
            )}
          </Animated.View>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  if (phase === 'pivot') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer style={{ flex: 1 }}>
          <Animated.View style={[styles.center, { opacity: fadeAnim }]}>
            <Ionicons name="flame" size={64} color={n.colors.warning} />
            <LinearText variant="title" style={styles.pivotTitle}>
              Brain Sparked!
            </LinearText>
            <LinearText variant="body" tone="secondary" centered style={styles.pivotSub}>
              You just diagnosed a case. The hardest part is over.
            </LinearText>
            <LinearSurface style={styles.offerBox}>
              <LinearText variant="body" tone="accent" centered style={styles.offerText}>
                Keep this momentum for just 5 minutes?
              </LinearText>
            </LinearSurface>
            <LinearButton
              label="Start 5-Min Sprint"
              variant="primary"
              style={styles.sprintBtn}
              onPress={handleStartSprint}
              leftIcon={<Ionicons name="rocket-outline" size={18} color={n.colors.textPrimary} />}
            />
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <LinearText variant="bodySmall" tone="muted" style={styles.closeBtnText}>
                I&apos;ll stop here for now.
              </LinearText>
            </TouchableOpacity>
          </Animated.View>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topicImage: {
    width: '100%',
    height: 160,
    borderRadius: 16,
    marginBottom: 20,
    backgroundColor: n.colors.surface,
  },

  breatheTitle: {
    color: n.colors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },
  breatheSub: {
    color: n.colors.textSecondary,
    fontSize: 16,
    marginBottom: 60,
    textAlign: 'center',
  },
  circleContainer: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
  pulseCircle: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: n.colors.primaryTintSoft,
    borderWidth: 2,
    borderColor: n.colors.accent,
    shadowColor: n.colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  breatheText: {
    color: n.colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  skipBtn: {
    marginTop: 40,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  skipBtnText: { color: n.colors.textMuted, fontSize: 14, fontWeight: '600' },

  winTitle: {
    color: n.colors.accent,
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
  },
  winTopic: {
    color: n.colors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 24,
    textAlign: 'center',
  },

  card: {
    padding: 20,
    borderRadius: 24,
    width: '100%',
  },
  cardHeader: {
    color: n.colors.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  clueBox: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  newClue: { borderColor: n.colors.accent, backgroundColor: n.colors.primaryTintSoft },
  clueLabel: { color: n.colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  clueText: { color: n.colors.textPrimary, fontSize: 16, lineHeight: 22 },

  solutionBox: {
    marginTop: 8,
    padding: 16,
    backgroundColor: n.colors.successSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: n.colors.success + '44',
  },
  solutionLabel: { color: n.colors.success, fontSize: 11, fontWeight: '800', marginBottom: 4 },
  solutionValue: {
    color: n.colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 12,
  },
  divider: { height: 1, backgroundColor: n.colors.success + '44', marginVertical: 12 },

  doneBtn: {
    backgroundColor: n.colors.accent,
    width: '100%',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    ...((c: string) => ({
      shadowColor: c,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 12,
      elevation: 8,
    }))(n.colors.accent),
  },
  doneBtnText: { color: n.colors.textPrimary, fontSize: 18, fontWeight: '900' },
  giveUpBtn: { padding: 16, alignItems: 'center' },
  giveUpText: { color: n.colors.textMuted, fontSize: 14, textDecorationLine: 'underline' },

  pivotTitle: {
    color: n.colors.textPrimary,
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 12,
    textAlign: 'center',
  },
  pivotSub: {
    color: n.colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  offerBox: {
    backgroundColor: n.colors.primaryTintSoft,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: n.colors.primaryTintSoft,
    marginBottom: 32,
  },
  offerText: {
    color: n.colors.accent,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
  },

  sprintBtn: {
    backgroundColor: n.colors.accent,
    width: '100%',
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  sprintBtnText: { color: n.colors.textPrimary, fontSize: 18, fontWeight: '900' },
  closeBtn: { padding: 16 },
  closeBtnText: { color: n.colors.textMuted, fontSize: 16, fontWeight: '600' },

  sitUpTitle: {
    color: n.colors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 12,
    textAlign: 'center',
  },
  sitUpSub: {
    color: n.colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
  },
  choiceBox: { alignItems: 'center', width: '100%' },
  sitUpBtn: {
    backgroundColor: n.colors.success,
    width: '100%',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  sitUpBtnText: { color: n.colors.textPrimary, fontSize: 18, fontWeight: '900' },
  orText: { color: n.colors.textMuted, fontSize: 14, marginVertical: 12 },
  bedBtn: {
    backgroundColor: n.colors.surface,
    width: '100%',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  bedBtnText: { color: n.colors.textSecondary, fontSize: 16, fontWeight: '700' },
});
