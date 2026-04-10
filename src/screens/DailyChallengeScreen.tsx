import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, StatusBar, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import { useAppStore } from '../store/useAppStore';
import { getTopicsDueForReview, getWeakestTopics, updateTopicProgress } from '../db/queries/topics';
import { createSession, endSession } from '../db/queries/sessions';
import { profileRepository } from '../db/repositories';
import { fetchContent } from '../services/aiService';
import type { QuizContent, TopicWithProgress } from '../types';
import { MarkdownRender } from '../components/MarkdownRender';
import { linearTheme as n } from '../theme/linearTheme';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { emphasizeHighYieldMarkdown } from '../utils/highlightMarkdown';
import LinearButton from '../components/primitives/LinearButton';
import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';
import { EmptyState } from '../components/primitives';
import LoadingOrb from '../components/LoadingOrb';
import ScreenHeader from '../components/ScreenHeader';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'DailyChallenge'>;

interface ChallengeQuestion {
  topicId: number;
  topicName: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

const QUESTION_COUNT = 5;
const XP_PER_CORRECT = 60;

export default function DailyChallengeScreen() {
  const navigation = useNavigation<Nav>();
  const refreshProfile = useAppStore((s) => s.refreshProfile);
  const [questions, setQuestions] = useState<ChallengeQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Picking your weakest topics...');
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [correctTopics, setCorrectTopics] = useState<number[]>([]);
  const [wrongTopics, setWrongTopics] = useState<number[]>([]);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const feedbackOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadQuestions();
  }, []);

  useEffect(() => {
    if (questions.length > 0) {
      Animated.timing(progressAnim, {
        toValue: (currentIdx / questions.length) * 100,
        duration: 400,
        useNativeDriver: false,
      }).start();
    }
  }, [currentIdx, questions.length, progressAnim]);

  async function loadQuestions() {
    setLoading(true);
    const [due, weak] = await Promise.all([getTopicsDueForReview(3), getWeakestTopics(5)]);
    const seen = new Set(due.map((t) => t.id));
    const combined: TopicWithProgress[] = [...due, ...weak.filter((t) => !seen.has(t.id))].slice(
      0,
      QUESTION_COUNT,
    );

    if (combined.length === 0) {
      setLoading(false);
      setDone(true);
      return;
    }

    setLoadingProgress({ current: 0, total: combined.length });
    setLoadingMsg(`Generating Q1/${combined.length}...`);

    const qs: ChallengeQuestion[] = [];
    for (let i = 0; i < combined.length; i++) {
      setLoadingProgress({ current: i + 1, total: combined.length });
      setLoadingMsg(`Generating Q${i + 1}/${combined.length}...`);

      try {
        const content = await fetchContent(combined[i], 'quiz');
        if (!content || typeof content !== 'object') continue;
        const quiz = content as QuizContent;
        if (!quiz.questions || !Array.isArray(quiz.questions) || quiz.questions.length === 0)
          continue;
        const q = quiz.questions[0];
        if (
          q &&
          q.question &&
          Array.isArray(q.options) &&
          q.options.length > 0 &&
          typeof q.correctIndex === 'number' &&
          q.correctIndex < q.options.length
        ) {
          qs.push({
            topicId: combined[i].id,
            topicName: combined[i].name,
            question: q.question,
            options: q.options,
            correctIndex: q.correctIndex,
            explanation: q.explanation ?? '',
          });
        }
      } catch {
        // Skip failed AI call
      }
    }

    if (qs.length === 0) {
      setLoading(false);
      setDone(true);
      return;
    }
    setQuestions(qs);
    setLoading(false);
  }

  function handleSelect(idx: number) {
    if (selected !== null) return;
    const q = questions[currentIdx];
    if (!q) return;
    setSelected(idx);
    const correct = idx === q.correctIndex;
    if (correct) {
      setScore((s) => s + 1);
      setCorrectTopics((prev) => [...prev, q.topicId]);
    } else {
      setWrongTopics((prev) => [...prev, q.topicId]);
    }

    Animated.timing(feedbackOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }

  function handleNextQuestion() {
    Animated.timing(feedbackOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(
      () => {
        if (currentIdx + 1 >= questions.length) {
          finishChallenge(score, correctTopics, wrongTopics);
        } else {
          setCurrentIdx((i) => i + 1);
          setSelected(null);
        }
      },
    );
  }

  async function finishChallenge(finalScore: number, finalCorrect: number[], finalWrong: number[]) {
    try {
      const totalXp = finalScore * XP_PER_CORRECT;
      const sessionId = await createSession([], 'good', 'normal');
      await endSession(sessionId, finalCorrect, totalXp, Math.ceil(questions.length * 1.5));
      await profileRepository.updateStreak(true);

      // Update SRS for each answered topic
      for (const topicId of finalCorrect) {
        await updateTopicProgress(topicId, 'reviewed', 3, XP_PER_CORRECT);
      }
      for (const topicId of finalWrong) {
        await updateTopicProgress(topicId, 'seen', 2, 10);
      }

      await refreshProfile();
    } catch (e) {
      console.warn('[DailyChallenge] finishChallenge error:', e);
    }
    setDone(true);
  }

  if (loading) {
    const progressPct =
      loadingProgress.total > 0 ? (loadingProgress.current / loadingProgress.total) * 100 : 0;
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer>
          <View style={styles.loadingContainer}>
            <LoadingOrb message={loadingMsg} size={120} />

            {loadingProgress.total > 0 && (
              <View style={styles.loadingProgressContainer}>
                <View style={styles.loadingProgressBg}>
                  <View style={[styles.loadingProgressFill, { width: `${progressPct}%` }]} />
                </View>
              </View>
            )}
          </View>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  if (done) {
    const totalXp = score * XP_PER_CORRECT;
    const pct = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
    const grade =
      pct >= 80
        ? '🔥 Excellent!'
        : pct >= 60
          ? '👍 Good job!'
          : pct >= 40
            ? '😐 Keep grinding'
            : '💪 Try again';

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer>
          <View style={styles.doneContainer}>
            <Ionicons
              name={pct >= 80 ? 'trophy-outline' : pct >= 60 ? 'star-outline' : 'book-outline'}
              size={72}
              color={n.colors.textMuted}
            />
            <LinearText variant="title" centered style={styles.doneGrade}>
              {grade}
            </LinearText>
            <LinearText variant="body" tone="secondary" centered style={styles.doneScore}>
              {score} / {questions.length} correct
            </LinearText>
            <LinearSurface padded={false} style={styles.xpBadge}>
              <LinearText variant="sectionTitle" tone="accent" centered style={styles.xpText}>
                +{totalXp} XP earned
              </LinearText>
            </LinearSurface>
            {wrongTopics.length > 0 && (
              <LinearText variant="bodySmall" tone="secondary" centered style={styles.doneSub}>
                {wrongTopics.length} topic{wrongTopics.length > 1 ? 's' : ''} added to review queue
              </LinearText>
            )}
            <LinearButton
              label="Back to Home"
              variant="primary"
              style={styles.doneBtn}
              onPress={() => navigation.goBack()}
            />
          </View>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  if (questions.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <ResponsiveContainer>
          <EmptyState
            icon="time-outline"
            title="No topics due for review yet"
            subtitle="Keep studying to unlock challenges!"
            action={{ label: 'Go Back', onPress: () => navigation.goBack() }}
          />
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  const q = questions[currentIdx];
  if (!q) {
    // Safety guard — should not happen, but prevents crash
    return (
      <SafeAreaView style={styles.safe}>
        <ResponsiveContainer>
          <View style={styles.loadingContainer}>
            <LinearText variant="body" tone="secondary" centered style={styles.loadingText}>
              Something went wrong loading the challenge.
            </LinearText>
            <LinearButton
              label="Go Back"
              variant="primary"
              style={[styles.doneBtn, { marginTop: 24 }]}
              onPress={() => navigation.goBack()}
            />
          </View>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }
  const isCorrect = selected === q.correctIndex;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer>
        <ScreenHeader
          title="Daily Challenge"
          subtitle="Five quick questions from your weakest and due topics."
          rightElement={
            <LinearText variant="label" tone="accent" style={styles.headerScore}>
              {score}/{currentIdx + 1}
            </LinearText>
          }
        />

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
        <LinearText variant="meta" tone="muted" style={styles.questionCount}>
          {currentIdx + 1} of {questions.length}
        </LinearText>

        {/* Topic label */}
        <LinearSurface padded={false} style={styles.topicBadge}>
          <LinearText variant="badge" tone="accent" style={styles.topicText}>
            {q.topicName}
          </LinearText>
        </LinearSurface>

        {/* Question */}
        <LinearText variant="sectionTitle" style={styles.questionText}>
          {q.question}
        </LinearText>

        {/* Options */}
        <View style={styles.optionsContainer}>
          {q.options.map((opt, idx) => {
            let bg: string = n.colors.surface;
            let border: string = n.colors.border;
            if (selected !== null) {
              if (idx === q.correctIndex) {
                bg = `${n.colors.success}18`;
                border = n.colors.success;
              } else if (idx === selected) {
                bg = `${n.colors.error}18`;
                border = n.colors.error;
              }
            }
            return (
              <TouchableOpacity
                key={idx}
                onPress={() => handleSelect(idx)}
                activeOpacity={0.8}
                disabled={selected !== null}
              >
                <LinearSurface
                  padded={false}
                  style={[styles.option, { backgroundColor: bg, borderColor: border }]}
                >
                  <LinearText variant="label" tone="accent" style={styles.optionLetter}>
                    {String.fromCharCode(65 + idx)}
                  </LinearText>
                  <LinearText variant="bodySmall" style={styles.optionText}>
                    {opt}
                  </LinearText>
                </LinearSurface>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Feedback toast */}
        {selected !== null && (
          <Animated.View
            style={[
              styles.feedback,
              isCorrect ? styles.feedbackCorrect : styles.feedbackWrong,
              { opacity: feedbackOpacity },
            ]}
          >
            <LinearSurface padded={false} style={styles.feedbackCard}>
              <TouchableOpacity onPress={handleNextQuestion} activeOpacity={0.8}>
                <LinearText variant="bodySmall" style={styles.feedbackLabel}>
                  {isCorrect ? (
                    <Ionicons name="checkmark-circle" size={14} color={n.colors.success} />
                  ) : (
                    <Ionicons name="close-circle" size={14} color={n.colors.error} />
                  )}{' '}
                  {isCorrect ? 'Correct!' : 'Wrong'}{' '}
                  <LinearText variant="caption" tone="muted" style={{ fontWeight: '500' }}>
                    Tap to continue ➔
                  </LinearText>
                </LinearText>
                <View style={{ marginTop: 8 }}>
                  <MarkdownRender content={emphasizeHighYieldMarkdown(q.explanation)} compact />
                </View>
              </TouchableOpacity>
            </LinearSurface>
          </Animated.View>
        )}
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { marginTop: 16, lineHeight: 22 },
  loadingProgressContainer: { width: '80%', marginTop: 20 },
  loadingProgressBg: {
    height: 6,
    backgroundColor: n.colors.surface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  loadingProgressFill: { height: '100%', backgroundColor: n.colors.accent, borderRadius: 3 },
  headerScore: { minWidth: 36, textAlign: 'right' },
  progressTrack: {
    height: 4,
    backgroundColor: n.colors.surface,
    marginHorizontal: 16,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: n.colors.accent, borderRadius: 2 },
  questionCount: { textAlign: 'right', marginRight: 16, marginTop: 4, marginBottom: 16 },
  topicBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  topicText: {},
  questionText: { lineHeight: 26, paddingHorizontal: 16, marginBottom: 20 },
  optionsContainer: { paddingHorizontal: 16, gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
  },
  optionLetter: { width: 22 },
  optionText: { flex: 1, lineHeight: 20 },
  feedback: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
  },
  feedbackCard: { borderRadius: 14, padding: 14 },
  feedbackCorrect: {},
  feedbackWrong: {},
  feedbackLabel: { marginBottom: 4 },
  doneContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  doneGrade: { marginBottom: 8 },
  doneScore: { marginBottom: 24 },
  xpBadge: {
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginBottom: 12,
  },
  xpText: {},
  doneSub: { marginBottom: 32 },
  doneBtn: { minWidth: 220 },
});
