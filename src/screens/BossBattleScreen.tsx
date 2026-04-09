import React, { useState, useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, StatusBar, Animated, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../components/primitives/LinearText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import { getAllCachedQuestions, type MockQuestion } from '../db/queries/aiCache';
import { getAllSubjects, getTopicsBySubject } from '../db/queries/topics';
import { fetchContent } from '../services/aiService';
import { profileRepository } from '../db/repositories';
import { useAppStore } from '../store/useAppStore';
import { MarkdownRender } from '../components/MarkdownRender';
import { linearTheme as n } from '../theme/linearTheme';
import { ResponsiveContainer } from '../hooks/useResponsive';
import type { Subject } from '../types';
import { emphasizeHighYieldMarkdown } from '../utils/highlightMarkdown';
import ScreenHeader from '../components/ScreenHeader';
import { showInfo, confirmDestructive } from '../components/dialogService';

const BOSS_HP = 100;
const PLAYER_HP = 3;
const DAMAGE_PER_HIT = 10;

type Phase = 'select' | 'loading' | 'battle' | 'answer_feedback' | 'victory' | 'defeat';

export default function BossBattleScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const refreshProfile = useAppStore((s) => s.refreshProfile);
  const profile = useAppStore((s) => s.profile);
  const [phase, setPhase] = useState<Phase>('select');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [questions, setQuestions] = useState<MockQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [lastAnswer, setLastAnswer] = useState<{ idx: number; correct: boolean } | null>(null);

  const [bossHp, setBossHp] = useState(BOSS_HP);
  const [playerHp, setPlayerHp] = useState(PLAYER_HP);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [startingBattle, setStartingBattle] = useState(false);
  const [questionCounts, setQuestionCounts] = useState<Map<string, number>>(new Map());

  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void getAllSubjects().then(setSubjects);
    void getAllCachedQuestions().then((allQs) => {
      const counts = new Map<string, number>();
      for (const q of allQs) {
        counts.set(q.subjectName, (counts.get(q.subjectName) ?? 0) + 1);
      }
      setQuestionCounts(counts);
    });
  }, []);

  async function startBattle(subjectName: string) {
    if (startingBattle) return;
    setStartingBattle(true);
    try {
      let subjectQs = (await getAllCachedQuestions()).filter((q) => q.subjectName === subjectName);

      if (subjectQs.length < 5) {
        // Generate fresh questions from studied topics
        setPhase('loading');
        const subjects = await getAllSubjects();
        const subject = subjects.find((s) => s.name === subjectName);
        if (subject) {
          const topics = (await getTopicsBySubject(subject.id))
            .filter((t) => t.progress.timesStudied > 0)
            .slice(0, 3);
          await Promise.allSettled(topics.map((t) => fetchContent(t, 'quiz')));
          subjectQs = (await getAllCachedQuestions()).filter((q) => q.subjectName === subjectName);
        }
      }

      if (subjectQs.length < 5) {
        await showInfo(
          'Not enough questions',
          `Study more ${subjectName} topics to unlock this boss! (Need 5+ questions, have ${subjectQs.length})`,
        );
        setPhase('select');
        return;
      }
      // Shuffle
      for (let i = subjectQs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [subjectQs[i], subjectQs[j]] = [subjectQs[j], subjectQs[i]];
      }
      subjectQs = subjectQs.slice(0, 15);

      setSelectedSubject(subjectName);
      setQuestions(subjectQs);
      setBossHp(BOSS_HP);
      setPlayerHp(PLAYER_HP);
      setCurrentQ(0);
      setPhase('battle');
    } finally {
      setStartingBattle(false);
    }
  }

  function handleAnswer(idx: number) {
    const q = questions[currentQ];
    if (!q) return;
    const isCorrect = idx === q.correctIndex;
    setLastAnswer({ idx, correct: isCorrect });

    if (isCorrect) {
      const newBossHp = Math.max(0, bossHp - DAMAGE_PER_HIT);
      setBossHp(newBossHp);
      if (newBossHp === 0) {
        setPhase('victory');
        profileRepository.addXp(500).then(() => refreshProfile());
      } else {
        setPhase('answer_feedback');
      }
    } else {
      shakeScreen();
      const newPlayerHp = playerHp - 1;
      setPlayerHp(newPlayerHp);
      if (newPlayerHp === 0) {
        setPhase('defeat');
      } else {
        setPhase('answer_feedback');
      }
    }
  }

  function handleContinueAfterFeedback() {
    setPhase('battle');
    nextQuestion();
  }

  async function handleRetreat() {
    const ok = await confirmDestructive('Retreat?', 'Leave this boss fight and return later.', {
      confirmLabel: 'Retreat',
      cancelLabel: 'Stay',
    });
    if (ok) {
      navigation.goBack();
    }
  }

  async function nextQuestion() {
    if (currentQ + 1 < questions.length) {
      setCurrentQ((c) => c + 1);
    } else {
      // Ran out of questions but boss still alive?
      // Stalemate / Retreat
      await showInfo(
        'Out of ammo!',
        'You ran out of questions before defeating the boss. Retreat!',
      );
      navigation.goBack();
    }
  }

  function shakeScreen() {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }

  if (phase === 'loading') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Ionicons name="shield-outline" size={64} color={n.colors.warning} />
          <LinearText style={styles.title}>Generating Questions...</LinearText>
          <LinearText style={styles.sub}>Preparing the boss fight...</LinearText>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'select') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ScreenHeader
          title="Select Boss"
          subtitle="Pick a subject and fight through five cached questions."
        />
        <ScrollView contentContainerStyle={styles.grid}>
          <ResponsiveContainer>
            {subjects.map((s) => {
              const count = questionCounts.get(s.name) ?? 0;
              const needsMore = count < 5;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[
                    styles.subjectCard,
                    { borderColor: needsMore ? n.colors.warning : s.colorHex },
                  ]}
                  onPress={() => startBattle(s.name)}
                  disabled={startingBattle}
                >
                  <LinearText style={styles.subjectEmoji}>👹</LinearText>
                  <LinearText style={[styles.subjectName, { color: s.colorHex }]}>
                    {s.name}
                  </LinearText>
                  <LinearText style={[styles.qBadge, needsMore && { color: n.colors.warning }]}>
                    {count}/5 Qs
                  </LinearText>
                  {needsMore && <LinearText style={styles.qHint}>Need {5 - count} more</LinearText>}
                </TouchableOpacity>
              );
            })}
          </ResponsiveContainer>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'victory') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Ionicons name="trophy-outline" size={64} color={n.colors.accent} />
          <LinearText style={styles.title}>BOSS DEFEATED!</LinearText>
          <LinearText style={styles.sub}>You conquered {selectedSubject}!</LinearText>
          <LinearText style={styles.xp}>+500 XP</LinearText>
          <TouchableOpacity style={styles.btn} onPress={() => navigation.goBack()}>
            <LinearText style={styles.btnText}>Victory Lap</LinearText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'defeat') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Ionicons name="skull-outline" size={64} color={n.colors.error} />
          <LinearText style={styles.title}>YOU DIED</LinearText>
          <LinearText style={styles.sub}>The {selectedSubject} boss was too strong.</LinearText>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: n.colors.error }]}
            onPress={() => setPhase('select')}
          >
            <LinearText style={styles.btnText}>Try Again</LinearText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Battle Phase or Answer Feedback
  const q = questions[currentQ];
  if (!q) return null;
  const isFeedback = phase === 'answer_feedback';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <Animated.View style={[styles.battleContainer, { transform: [{ translateX: shakeAnim }] }]}>
        {/* HUD */}
        <View style={styles.hud}>
          <View style={styles.bossBar}>
            <LinearText style={styles.bossName}>{selectedSubject} BOSS</LinearText>
            <View style={styles.hpTrack}>
              <View style={[styles.hpFill, { width: `${(bossHp / BOSS_HP) * 100}%` }]} />
            </View>
            <LinearText style={styles.hpText}>
              {bossHp}/{BOSS_HP}
            </LinearText>
          </View>

          <View style={styles.playerStats}>
            <View style={styles.heartsRow}>
              {Array.from({ length: playerHp }).map((_, i) => (
                <Ionicons key={i} name="heart" size={20} color={n.colors.error} />
              ))}
            </View>
          </View>
        </View>

        {/* Retreat button */}
        <TouchableOpacity style={styles.retreatBtn} onPress={handleRetreat}>
          <LinearText style={styles.retreatText}>↩ Retreat</LinearText>
        </TouchableOpacity>

        {/* Question or Feedback */}
        <ScrollView contentContainerStyle={styles.qContainer}>
          <ResponsiveContainer>
            {isFeedback && lastAnswer ? (
              <View style={styles.feedbackContainer}>
                <LinearText
                  style={[styles.feedbackEmoji, lastAnswer.correct && { color: n.colors.success }]}
                >
                  {lastAnswer.correct ? '✓ Correct!' : '✗ Wrong!'}
                </LinearText>
                {!lastAnswer.correct && (
                  <>
                    <LinearText style={styles.correctAnswer}>
                      Answer: {q.options[q.correctIndex]}
                    </LinearText>
                    <View style={{ marginBottom: 24, paddingHorizontal: 20 }}>
                      <MarkdownRender content={emphasizeHighYieldMarkdown(q.explanation)} compact />
                    </View>
                  </>
                )}
                <TouchableOpacity style={styles.continueBtn} onPress={handleContinueAfterFeedback}>
                  <LinearText style={styles.continueText}>Next →</LinearText>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <LinearText style={styles.qText}>{q.question}</LinearText>
                <View style={styles.options}>
                  {q.options.map((opt, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.optionBtn}
                      onPress={() => handleAnswer(i)}
                    >
                      <LinearText style={styles.optionText}>{opt}</LinearText>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </ResponsiveContainer>
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16 },
  back: { color: n.colors.textPrimary, fontSize: 24 },
  title: { color: n.colors.textPrimary, fontSize: 22, fontWeight: '900' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    paddingBottom: 40,
    gap: 12,
    justifyContent: 'center',
  },
  subjectCard: {
    width: '45%',
    backgroundColor: n.colors.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    marginBottom: 4,
  },
  subjectEmoji: { fontSize: 32, marginBottom: 8 },
  subjectName: { fontWeight: '800', fontSize: 14, textAlign: 'center' },
  qBadge: { color: n.colors.textSecondary, fontSize: 11, fontWeight: '700', marginTop: 4 },
  qHint: { color: n.colors.warning, fontSize: 10, marginTop: 2, textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  sub: { color: n.colors.textMuted, fontSize: 16, textAlign: 'center', marginBottom: 20 },
  xp: { color: n.colors.warning, fontSize: 24, fontWeight: '900', marginBottom: 40 },
  btn: {
    backgroundColor: n.colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  btnText: { color: n.colors.textPrimary, fontWeight: '800', fontSize: 16 },

  battleContainer: { flex: 1, backgroundColor: '#1A0505' },
  hud: {
    padding: 16,
    backgroundColor: n.colors.errorSurface,
    borderBottomWidth: 2,
    borderBottomColor: n.colors.error,
  },
  bossBar: { marginBottom: 12 },
  bossName: {
    color: n.colors.error,
    fontWeight: '900',
    fontSize: 16,
    marginBottom: 4,
    letterSpacing: 1,
  },
  hpTrack: {
    height: 16,
    backgroundColor: n.colors.background,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: n.colors.textMuted,
  },
  hpFill: { height: '100%', backgroundColor: n.colors.error },
  hpText: { color: n.colors.textPrimary, fontSize: 11, position: 'absolute', right: 4, top: 20 },
  playerStats: { alignItems: 'flex-end' },
  heartsRow: { flexDirection: 'row', gap: 4 },
  qContainer: { padding: 20, paddingBottom: 40 },
  qText: {
    color: n.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
    marginBottom: 30,
    textAlign: 'center',
  },
  options: { gap: 12 },
  optionBtn: {
    backgroundColor: n.colors.border,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#444',
  },
  optionText: { color: n.colors.textMuted, fontSize: 15, textAlign: 'center' },
  retreatBtn: {
    position: 'absolute',
    top: 100,
    right: 16,
    padding: 8,
    backgroundColor: n.colors.border,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    zIndex: 10,
  },
  retreatText: { color: n.colors.textMuted, fontSize: 12, fontWeight: '600' },
  feedbackContainer: { alignItems: 'center', paddingVertical: 20 },
  feedbackEmoji: { fontSize: 48, marginBottom: 16, color: n.colors.error },
  correctAnswer: { color: n.colors.success, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  explanation: {
    color: n.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  continueBtn: {
    backgroundColor: n.colors.accent,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  continueText: { color: n.colors.textPrimary, fontWeight: '800', fontSize: 16 },
});
