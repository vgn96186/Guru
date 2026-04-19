import LinearSurface from '../components/primitives/LinearSurface';
import LinearButton from '../components/primitives/LinearButton';
import LinearBadge from '../components/primitives/LinearBadge';
import LinearText from '../components/primitives/LinearText';
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  StatusBar,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import { getCachedQuestionCount, getMockQuestions, type MockQuestion } from '../db/queries/aiCache';
import { saveBulkQuestions } from '../db/queries/questionBank';
import { MarkdownRender } from '../components/MarkdownRender';
import { linearTheme as n } from '../theme/linearTheme';
import { ResponsiveContainer } from '../hooks/useResponsive';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { emphasizeHighYieldMarkdown } from '../utils/highlightMarkdown';
import { confirmDestructive } from '../components/dialogService';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'MockTest'>;

const CORRECT_MARKS = 4;
const WRONG_MARKS = -1;

type Answer = number | null; // -1 = skipped

export default function MockTestScreen() {
  const navigation = useNavigation<Nav>();
  const [questions, setQuestions] = useState<MockQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [phase, setPhase] = useState<'loading' | 'setup' | 'test' | 'results'>('loading');
  const [availableCount, setAvailableCount] = useState(0);
  const [selectedCount, setSelectedCount] = useState(20);
  const [selected, setSelected] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void getCachedQuestionCount().then((count) => {
      setAvailableCount(count);
      setSelectedCount(count >= 20 ? 20 : count);
      setPhase('setup');
    });
  }, []);

  async function startTest(count: number) {
    setPhase('loading');
    const subset = await getMockQuestions(count);
    // Auto-save to Question Bank
    saveBulkQuestions(
      subset.map((q) => ({
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        topicName: q.topicName,
        subjectName: q.subjectName,
        source: 'mock_test' as const,
      })),
    ).catch((err) => {
      if (__DEV__) console.warn('[QuestionBank] Auto-save from mock test failed:', err);
    });
    setQuestions(subset);
    setAnswers(new Array(subset.length).fill(null));
    setCurrent(0);
    setSelected(null);
    setElapsedSeconds(0);
    setPhase('test');
  }

  // Timer for test phase
  useEffect(() => {
    if (phase === 'test') {
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [phase]);

  // Back handler during test
  useEffect(() => {
    if (phase !== 'test') return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      const unanswered = answers.filter((a) => a === null).length;
      confirmDestructive(
        'Leave Test?',
        unanswered > 0
          ? `You have ${unanswered} unanswered questions. Your progress will be lost.`
          : 'Are you sure you want to leave?',
        { confirmLabel: 'Leave', cancelLabel: 'Continue Test' },
      ).then((ok) => {
        if (ok) navigation.goBack();
      });
      return true;
    });
    return () => handler.remove();
  }, [phase, answers, navigation]);

  function handleOptionSelect(idx: number) {
    setSelected(idx);
  }

  function handleNext() {
    const newAnswers = [...answers];
    newAnswers[current] = selected; // stores idx or null
    setAnswers(newAnswers);

    if (current + 1 < questions.length) {
      setCurrent(current + 1);
      setSelected(null);
    } else {
      setPhase('results');
    }
  }

  const resultSummary = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    let skipped = 0;

    answers.forEach((a, i) => {
      const q = questions[i];
      if (!q || a === null || a === -1) {
        skipped++;
      } else if (a === q.correctIndex) {
        correct++;
      } else {
        wrong++;
      }
    });

    const score = correct * CORRECT_MARKS + wrong * WRONG_MARKS;
    const maxScore = questions.length * CORRECT_MARKS;
    const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

    return { correct, wrong, skipped, score, maxScore, pct };
  }, [answers, questions]);

  // Pre-sorted review entries with original indices — avoids O(n) indexOf per FlatList item
  const sortedReviewEntries = useMemo(() => {
    const indexed = questions.map((q, i) => ({ q, origIdx: i }));
    indexed.sort((a, b) => {
      const aAns = answers[a.origIdx];
      const bAns = answers[b.origIdx];
      const aCorrect = aAns === a.q.correctIndex;
      const bCorrect = bAns === b.q.correctIndex;
      const aSkipped = aAns === null || aAns === -1;
      const bSkipped = bAns === null || bAns === -1;
      // Wrong first, then skipped, then correct
      if (!aCorrect && !aSkipped && (bCorrect || bSkipped)) return -1;
      if (!bCorrect && !bSkipped && (aCorrect || aSkipped)) return 1;
      if (aSkipped && bCorrect) return -1;
      if (bSkipped && aCorrect) return 1;
      return a.origIdx - b.origIdx;
    });
    return indexed;
  }, [questions, answers]);

  const renderReviewItem = useCallback(
    ({ item, index }: { item: MockQuestion; index: number }) => {
      const ans = answers[index];
      const isCorrect = ans === item.correctIndex;
      const isSkipped = ans === null || ans === -1;
      const borderColor = isSkipped
        ? n.colors.borderHighlight
        : isCorrect
        ? n.colors.success
        : n.colors.error;

      return (
        <LinearSurface
          compact
          padded={false}
          style={[styles.reviewRow, { borderLeftColor: borderColor }]}
        >
          <View style={styles.reviewHeader}>
            <LinearText variant="caption" tone="secondary">
              Q{index + 1}
            </LinearText>
            <LinearText variant="label" style={[styles.reviewStatus, { color: borderColor }]}>
              {isSkipped ? 'Skipped' : isCorrect ? `+${CORRECT_MARKS}` : `${WRONG_MARKS}`}
            </LinearText>
          </View>
          <LinearText variant="bodySmall" style={styles.reviewQ}>
            {item.question}
          </LinearText>
          <LinearText variant="caption" tone="accent" style={styles.reviewTopic}>
            {item.subjectName} · {item.topicName}
          </LinearText>
          {!isSkipped && ans !== null && ans >= 0 && ans < item.options.length && (
            <LinearText
              variant="caption"
              style={[styles.reviewAns, { color: isCorrect ? n.colors.success : n.colors.error }]}
            >
              Your answer: {item.options[ans]}
            </LinearText>
          )}
          <LinearText variant="caption" tone="success" style={styles.reviewCorrect}>
            Correct: {item.options[item.correctIndex] ?? '—'}
          </LinearText>
          <View style={styles.reviewExplainWrap}>
            <MarkdownRender content={emphasizeHighYieldMarkdown(item.explanation)} compact />
          </View>
        </LinearSurface>
      );
    },
    [answers],
  );

  // ── Setup Phase ────────────────────────────────────────────────
  if (phase === 'setup') {
    if (availableCount === 0) {
      return (
        <SafeAreaView style={styles.safe}>
          <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
          <ResponsiveContainer style={styles.emptyContainer}>
            <LinearText style={styles.emptyEmoji}>🧪</LinearText>
            <LinearText variant="title" centered style={styles.emptyTitle}>
              No Questions Yet
            </LinearText>
            <LinearText variant="body" tone="secondary" centered style={styles.emptyMsg}>
              Guru generates quiz questions during your study sessions. Complete a few sessions to
              build up your question bank!
            </LinearText>
            <LinearButton label="Back" variant="secondary" onPress={() => navigation.goBack()} />
          </ResponsiveContainer>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer style={styles.setupContainer}>
          <Ionicons name="document-text-outline" size={64} color={n.colors.textMuted} />
          <LinearText variant="title" centered style={styles.setupTitle}>
            Mock Test
          </LinearText>
          <LinearText variant="body" tone="secondary" centered style={styles.setupSub}>
            {availableCount} questions available in your bank.
          </LinearText>

          <LinearText variant="sectionTitle" centered style={styles.setupLabel}>
            How many questions?
          </LinearText>
          <View style={styles.countGrid}>
            {[10, 20, 50, 100].map((c) => {
              const isUnlocked = c <= availableCount;
              const needsMore = c - availableCount;
              return (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.countBtn,
                    selectedCount === c && styles.countBtnActive,
                    !isUnlocked && styles.countBtnLocked,
                  ]}
                  disabled={!isUnlocked}
                  onPress={() => setSelectedCount(c)}
                >
                  <LinearText
                    style={[
                      styles.countBtnText,
                      selectedCount === c && styles.countBtnTextActive,
                      !isUnlocked && styles.countBtnTextLocked,
                    ]}
                  >
                    {c}
                  </LinearText>
                  {!isUnlocked && (
                    <LinearText variant="caption" tone="accent" style={styles.lockHint}>
                      +{needsMore} more
                    </LinearText>
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.countBtn, selectedCount === availableCount && styles.countBtnActive]}
              onPress={() => setSelectedCount(availableCount)}
            >
              <LinearText
                style={[
                  styles.countBtnText,
                  selectedCount === availableCount && styles.countBtnTextActive,
                ]}
              >
                Max ({availableCount})
              </LinearText>
            </TouchableOpacity>
          </View>

          <LinearButton label="Start Test" onPress={() => startTest(selectedCount)} />
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  // ── Results ────────────────────────────────────────────────────
  if (phase === 'results') {
    const { correct, wrong, skipped, score, maxScore, pct } = resultSummary;
    const scoreColor = pct >= 60 ? n.colors.success : pct >= 40 ? n.colors.warning : n.colors.error;

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <FlatList
          data={sortedReviewEntries}
          keyExtractor={(entry) => `review-${entry.origIdx}`}
          renderItem={({ item: entry }) =>
            renderReviewItem({ item: entry.q, index: entry.origIdx })
          }
          contentContainerStyle={styles.resultsContent}
          initialNumToRender={8}
          windowSize={8}
          maxToRenderPerBatch={10}
          removeClippedSubviews
          ListHeaderComponent={
            <ResponsiveContainer>
              <LinearText variant="title" centered style={styles.resultsTitle}>
                Test Complete
              </LinearText>
              <LinearSurface style={styles.scoreCircle}>
                <LinearText
                  variant="display"
                  centered
                  style={[styles.scoreNum, { color: scoreColor }]}
                >
                  {score}
                </LinearText>
                <LinearText variant="bodySmall" tone="secondary" centered style={styles.scoreMax}>
                  / {maxScore}
                </LinearText>
                <LinearText
                  variant="sectionTitle"
                  centered
                  style={[styles.scorePct, { color: scoreColor }]}
                >
                  {pct}%
                </LinearText>
              </LinearSurface>

              <View style={styles.scoreBreakdown}>
                <LinearSurface compact style={styles.scoreCell}>
                  <LinearText variant="title" centered tone="success" style={styles.scoreCellNum}>
                    {correct}
                  </LinearText>
                  <LinearText
                    variant="caption"
                    tone="secondary"
                    centered
                    style={styles.scoreCellLabel}
                  >
                    Correct +{correct * CORRECT_MARKS}
                  </LinearText>
                </LinearSurface>
                <LinearSurface compact style={styles.scoreCell}>
                  <LinearText variant="title" centered tone="error" style={styles.scoreCellNum}>
                    {wrong}
                  </LinearText>
                  <LinearText
                    variant="caption"
                    tone="secondary"
                    centered
                    style={styles.scoreCellLabel}
                  >
                    Wrong {wrong * WRONG_MARKS}
                  </LinearText>
                </LinearSurface>
                <LinearSurface compact style={styles.scoreCell}>
                  <LinearText variant="title" centered tone="secondary" style={styles.scoreCellNum}>
                    {skipped}
                  </LinearText>
                  <LinearText
                    variant="caption"
                    tone="secondary"
                    centered
                    style={styles.scoreCellLabel}
                  >
                    Skipped +0
                  </LinearText>
                </LinearSurface>
              </View>

              <LinearText variant="caption" tone="muted" centered style={styles.markingNote}>
                NEET Marking: +4 correct · -1 wrong · 0 skipped
              </LinearText>

              {elapsedSeconds > 0 && (
                <LinearText variant="caption" tone="muted" centered style={styles.markingNote}>
                  Total time: {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s · Avg{' '}
                  {Math.round(elapsedSeconds / Math.max(1, questions.length))}s per question
                </LinearText>
              )}

              {/* Question review — wrong answers shown first */}
              <LinearText variant="caption" tone="muted" style={styles.reviewTitle}>
                Review
              </LinearText>
            </ResponsiveContainer>
          }
          ListFooterComponent={<LinearButton label="Done" onPress={() => navigation.goBack()} />}
        />
      </SafeAreaView>
    );
  }

  // ── Test phase ─────────────────────────────────────────────────
  if (phase === 'loading' || questions.length === 0) return null;

  const q = questions[current];
  if (!q) return null;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />

      <LinearSurface compact padded={false} style={styles.header}>
        <LinearText variant="label" tone="accent" style={styles.headerNum}>
          Q {current + 1} / {questions.length}
        </LinearText>
        <LinearText variant="caption" tone="secondary" style={styles.headerTopic}>
          {q.subjectName} · {q.topicName}
        </LinearText>
        <LinearText variant="label" tone="warning" style={styles.timerText}>
          ⏱ {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, '0')}
        </LinearText>
      </LinearSurface>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(current / questions.length) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.testContent}>
        <ResponsiveContainer>
          <LinearText variant="sectionTitle" style={styles.question}>
            {q.question}
          </LinearText>

          {q.options.map((opt, idx) => {
            const isSelected = idx === selected;
            const bg = isSelected ? n.colors.primaryTintSoft : n.colors.card;
            const border = isSelected ? `${n.colors.accent}66` : n.colors.border;

            return (
              <TouchableOpacity
                key={idx}
                style={[styles.option, { backgroundColor: bg, borderColor: border }]}
                onPress={() => handleOptionSelect(idx)}
                activeOpacity={0.8}
              >
                <LinearText variant="label" tone="secondary" style={styles.optionLetter}>
                  {['A', 'B', 'C', 'D'][idx]}
                </LinearText>
                <LinearText variant="body" style={styles.optionText}>
                  {opt}
                </LinearText>
              </TouchableOpacity>
            );
          })}

          <View style={styles.markingBadge}>
            <LinearBadge
              label={`+${CORRECT_MARKS} correct · ${WRONG_MARKS} wrong · 0 skip`}
              variant="default"
            />
          </View>

          <LinearButton
            label={
              selected !== null
                ? current + 1 < questions.length
                  ? 'Next Question'
                  : 'See Results'
                : 'Skip Question'
            }
            variant={selected !== null ? 'primary' : 'secondary'}
            onPress={handleNext}
            rightIcon={selected !== null ? null : undefined}
            style={styles.confirmBtn}
          />
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
  },
  headerNum: { fontWeight: '800' },
  headerTopic: { flex: 1 },
  timerText: { fontWeight: '800' },
  progressTrack: {
    height: 3,
    backgroundColor: n.colors.border,
    marginHorizontal: 16,
    marginTop: 10,
  },
  progressFill: { height: '100%', backgroundColor: n.colors.accent },
  testContent: { padding: 16, paddingBottom: 40 },
  question: { marginBottom: 20 },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: n.radius.md,
    borderWidth: 1,
    marginBottom: 10,
  },
  optionLetter: { marginRight: 10, width: 16 },
  optionText: { flex: 1 },
  markingBadge: { alignItems: 'center', marginVertical: 10 },
  confirmBtn: { marginTop: 8 },
  // Results
  resultsContent: { padding: 16, paddingBottom: 60 },
  resultsTitle: {
    marginBottom: 20,
    marginTop: 8,
  },
  scoreCircle: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 16,
  },
  scoreNum: {},
  scoreMax: {},
  scorePct: { marginTop: 4 },
  scoreBreakdown: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  scoreCell: {
    flex: 1,
    alignItems: 'center',
  },
  scoreCellNum: {},
  scoreCellLabel: { marginTop: 4 },
  markingNote: { marginBottom: 20 },
  reviewTitle: {
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  reviewRow: {
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  reviewStatus: {},
  reviewQ: { marginBottom: 6 },
  reviewTopic: { marginBottom: 6 },
  reviewAns: { marginBottom: 2 },
  reviewCorrect: { marginBottom: 4 },
  reviewExplainWrap: { marginTop: 6 },
  // Empty state
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { marginBottom: 8 },
  emptyMsg: {
    marginBottom: 32,
  },
  setupContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  setupTitle: { marginBottom: 8 },
  setupSub: { marginBottom: 40 },
  setupLabel: { marginBottom: 16 },
  countGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 40,
  },
  countBtn: {
    backgroundColor: n.colors.card,
    borderRadius: n.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: n.colors.border,
    minWidth: 70,
    alignItems: 'center',
  },
  countBtnActive: {
    borderColor: `${n.colors.accent}66`,
    backgroundColor: n.colors.primaryTintSoft,
  },
  countBtnLocked: { borderColor: n.colors.border, backgroundColor: n.colors.surface, opacity: 0.7 },
  countBtnText: { color: n.colors.textSecondary, fontWeight: '700', fontSize: 15 },
  countBtnTextActive: { color: n.colors.textPrimary },
  countBtnTextLocked: { color: n.colors.textMuted },
  lockHint: { marginTop: 4 },
});
