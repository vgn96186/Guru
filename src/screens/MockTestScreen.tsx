import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  StatusBar,
  BackHandler,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import { getCachedQuestionCount, getMockQuestions, type MockQuestion } from '../db/queries/aiCache';
import { saveBulkQuestions } from '../db/queries/questionBank';
import { MarkdownRender } from '../components/MarkdownRender';
import { theme } from '../constants/theme';
import { ResponsiveContainer } from '../hooks/useResponsive';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { emphasizeHighYieldMarkdown } from '../utils/highlightMarkdown';

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
  const [revealed, setRevealed] = useState(false);
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
    setRevealed(false);
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
      Alert.alert(
        'Leave Test?',
        unanswered > 0
          ? `You have ${unanswered} unanswered questions. Your progress will be lost.`
          : 'Are you sure you want to leave?',
        [
          { text: 'Continue Test', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: () => navigation.goBack() },
        ],
      );
      return true;
    });
    return () => handler.remove();
  }, [phase, answers]);

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

  const renderReviewItem = useCallback(
    ({ item, index }: { item: MockQuestion; index: number }) => {
      const ans = answers[index];
      const isCorrect = ans === item.correctIndex;
      const isSkipped = ans === null || ans === -1;
      const borderColor = isSkipped ? '#555' : isCorrect ? '#4CAF50' : '#F44336';

      return (
        <View style={[styles.reviewRow, { borderLeftColor: borderColor }]}>
          <View style={styles.reviewHeader}>
            <Text style={styles.reviewNum}>Q{index + 1}</Text>
            <Text style={[styles.reviewStatus, { color: borderColor }]}>
              {isSkipped ? 'Skipped' : isCorrect ? `+${CORRECT_MARKS}` : `${WRONG_MARKS}`}
            </Text>
          </View>
          <Text style={styles.reviewQ}>{item.question}</Text>
          <Text style={styles.reviewTopic}>
            {item.subjectName} · {item.topicName}
          </Text>
          {!isSkipped && ans !== null && ans >= 0 && ans < item.options.length && (
            <Text style={[styles.reviewAns, { color: isCorrect ? '#4CAF50' : '#F44336' }]}>
              Your answer: {item.options[ans]}
            </Text>
          )}
          <Text style={styles.reviewCorrect}>
            Correct: {item.options[item.correctIndex] ?? '—'}
          </Text>
          <View style={styles.reviewExplainWrap}>
            <MarkdownRender content={emphasizeHighYieldMarkdown(item.explanation)} compact />
          </View>
        </View>
      );
    },
    [answers],
  );

  // ── Setup Phase ────────────────────────────────────────────────
  if (phase === 'setup') {
    if (availableCount === 0) {
      return (
        <SafeAreaView style={styles.safe}>
          <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
          <ResponsiveContainer style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🧪</Text>
            <Text style={styles.emptyTitle}>No Questions Yet</Text>
            <Text style={styles.emptyMsg}>
              Guru generates quiz questions during your study sessions. Complete a few sessions to
              build up your question bank!
            </Text>
            <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.doneBtnText}>Back</Text>
            </TouchableOpacity>
          </ResponsiveContainer>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
        <ResponsiveContainer style={styles.setupContainer}>
          <Text style={styles.setupEmoji}>📝</Text>
          <Text style={styles.setupTitle}>Mock Test</Text>
          <Text style={styles.setupSub}>{availableCount} questions available in your bank.</Text>

          <Text style={styles.setupLabel}>How many questions?</Text>
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
                  <Text
                    style={[
                      styles.countBtnText,
                      selectedCount === c && styles.countBtnTextActive,
                      !isUnlocked && styles.countBtnTextLocked,
                    ]}
                  >
                    {c}
                  </Text>
                  {!isUnlocked && <Text style={styles.lockHint}>+{needsMore} more</Text>}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.countBtn, selectedCount === availableCount && styles.countBtnActive]}
              onPress={() => setSelectedCount(availableCount)}
            >
              <Text
                style={[
                  styles.countBtnText,
                  selectedCount === availableCount && styles.countBtnTextActive,
                ]}
              >
                Max ({availableCount})
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.startBtn} onPress={() => startTest(selectedCount)}>
            <Text style={styles.startBtnText}>Start Test</Text>
          </TouchableOpacity>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  // ── Results ────────────────────────────────────────────────────
  if (phase === 'results') {
    const { correct, wrong, skipped, score, maxScore, pct } = resultSummary;
    const scoreColor = pct >= 60 ? '#4CAF50' : pct >= 40 ? '#FF9800' : '#F44336';

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
        <FlatList
          data={[...questions].sort((a, b) => {
            const aIdx = questions.indexOf(a);
            const bIdx = questions.indexOf(b);
            const aAns = answers[aIdx];
            const bAns = answers[bIdx];
            const aCorrect = aAns === a.correctIndex;
            const bCorrect = bAns === b.correctIndex;
            const aSkipped = aAns === null || aAns === -1;
            const bSkipped = bAns === null || bAns === -1;
            // Wrong first, then skipped, then correct
            if (!aCorrect && !aSkipped && (bCorrect || bSkipped)) return -1;
            if (!bCorrect && !bSkipped && (aCorrect || aSkipped)) return 1;
            if (aSkipped && bCorrect) return -1;
            if (bSkipped && aCorrect) return 1;
            return aIdx - bIdx;
          })}
          keyExtractor={(item) => `review-${questions.indexOf(item)}`}
          renderItem={({ item }) => renderReviewItem({ item, index: questions.indexOf(item) })}
          contentContainerStyle={styles.resultsContent}
          initialNumToRender={8}
          windowSize={8}
          maxToRenderPerBatch={10}
          removeClippedSubviews
          ListHeaderComponent={
            <ResponsiveContainer>
              <Text style={styles.resultsTitle}>Test Complete</Text>
              <View style={styles.scoreCircle}>
                <Text style={[styles.scoreNum, { color: scoreColor }]}>{score}</Text>
                <Text style={styles.scoreMax}>/ {maxScore}</Text>
                <Text style={[styles.scorePct, { color: scoreColor }]}>{pct}%</Text>
              </View>

              <View style={styles.scoreBreakdown}>
                <View style={styles.scoreCell}>
                  <Text style={[styles.scoreCellNum, { color: '#4CAF50' }]}>{correct}</Text>
                  <Text style={styles.scoreCellLabel}>Correct +{correct * CORRECT_MARKS}</Text>
                </View>
                <View style={styles.scoreCell}>
                  <Text style={[styles.scoreCellNum, { color: '#F44336' }]}>{wrong}</Text>
                  <Text style={styles.scoreCellLabel}>Wrong {wrong * WRONG_MARKS}</Text>
                </View>
                <View style={styles.scoreCell}>
                  <Text style={[styles.scoreCellNum, { color: '#9E9E9E' }]}>{skipped}</Text>
                  <Text style={styles.scoreCellLabel}>Skipped +0</Text>
                </View>
              </View>

              <Text style={styles.markingNote}>
                NEET Marking: +4 correct · -1 wrong · 0 skipped
              </Text>

              {elapsedSeconds > 0 && (
                <Text style={styles.markingNote}>
                  Total time: {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s · Avg{' '}
                  {Math.round(elapsedSeconds / Math.max(1, questions.length))}s per question
                </Text>
              )}

              {/* Question review — wrong answers shown first */}
              <Text style={styles.reviewTitle}>Review</Text>
            </ResponsiveContainer>
          }
          ListFooterComponent={
            <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          }
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
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />

      <View style={styles.header}>
        <Text style={styles.headerNum}>
          Q {current + 1} / {questions.length}
        </Text>
        <Text style={styles.headerTopic}>
          {q.subjectName} · {q.topicName}
        </Text>
        <Text style={styles.timerText}>
          ⏱ {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, '0')}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(current / questions.length) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.testContent}>
        <ResponsiveContainer>
          <Text style={styles.question}>{q.question}</Text>

          {q.options.map((opt, idx) => {
            const isSelected = idx === selected;
            const bg = isSelected ? '#1A1A3A' : '#1A1A24';
            const border = isSelected ? '#6C63FF' : '#2A2A38';

            return (
              <TouchableOpacity
                key={idx}
                style={[styles.option, { backgroundColor: bg, borderColor: border }]}
                onPress={() => handleOptionSelect(idx)}
                activeOpacity={0.8}
              >
                <Text style={styles.optionLetter}>{['A', 'B', 'C', 'D'][idx]}</Text>
                <Text style={styles.optionText}>{opt}</Text>
              </TouchableOpacity>
            );
          })}

          <View style={styles.markingBadge}>
            <Text style={styles.markingText}>
              +{CORRECT_MARKS} correct · {WRONG_MARKS} wrong · 0 skip
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.confirmBtn, selected === null && styles.confirmBtnSkip]}
            onPress={handleNext}
            activeOpacity={0.8}
          >
            <Text style={styles.confirmBtnText}>
              {selected !== null
                ? current + 1 < questions.length
                  ? 'Next Question →'
                  : 'See Results'
                : 'Skip Question'}
            </Text>
          </TouchableOpacity>
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1A1A24',
    gap: 8,
  },
  headerNum: { color: '#6C63FF', fontWeight: '800', fontSize: 16 },
  headerTopic: { flex: 1, color: '#9E9E9E', fontSize: 13 },
  timerText: { color: '#FF9800', fontWeight: '800', fontSize: 14 },
  skipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#2A2A38',
    borderRadius: 8,
  },
  skipBtnText: { color: '#9E9E9E', fontSize: 13, fontWeight: '600' },
  progressTrack: { height: 3, backgroundColor: '#2A2A38' },
  progressFill: { height: '100%', backgroundColor: '#6C63FF' },
  testContent: { padding: 16, paddingBottom: 40 },
  question: { color: '#fff', fontSize: 16, fontWeight: '600', lineHeight: 24, marginBottom: 20 },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  optionLetter: { color: '#9E9E9E', fontWeight: '800', fontSize: 15, marginRight: 10, width: 16 },
  optionText: { flex: 1, fontSize: 15, lineHeight: 22 },
  explanation: {
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#6C63FF44',
  },
  explanationTitle: { color: '#6C63FF', fontWeight: '700', fontSize: 14, marginBottom: 6 },
  explanationText: { color: '#ccc', fontSize: 14, lineHeight: 20 },
  markingBadge: { alignItems: 'center', marginVertical: 10 },
  markingText: { color: '#555', fontSize: 13 },
  confirmBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  confirmBtnSkip: { backgroundColor: '#2A2A38' },
  confirmBtnText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  // Results
  resultsContent: { padding: 16, paddingBottom: 60 },
  resultsTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  scoreCircle: {
    alignItems: 'center',
    backgroundColor: '#1A1A24',
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
  },
  scoreNum: { fontSize: 56, fontWeight: '900' },
  scoreMax: { color: '#9E9E9E', fontSize: 16 },
  scorePct: { fontSize: 22, fontWeight: '700', marginTop: 4 },
  scoreBreakdown: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  scoreCell: {
    flex: 1,
    backgroundColor: '#1A1A24',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  scoreCellNum: { fontSize: 26, fontWeight: '900' },
  scoreCellLabel: { color: '#9E9E9E', fontSize: 12, marginTop: 4, textAlign: 'center' },
  markingNote: { color: '#555', fontSize: 12, textAlign: 'center', marginBottom: 20 },
  reviewTitle: {
    color: '#9E9E9E',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  reviewRow: {
    backgroundColor: '#1A1A24',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  reviewNum: { color: '#9E9E9E', fontWeight: '700', fontSize: 12 },
  reviewStatus: { fontWeight: '800', fontSize: 14 },
  reviewQ: { color: '#fff', fontSize: 14, lineHeight: 20, marginBottom: 6 },
  reviewTopic: { color: '#6C63FF', fontSize: 12, marginBottom: 6 },
  reviewAns: { fontSize: 12, marginBottom: 2 },
  reviewCorrect: { color: '#4CAF50', fontSize: 12, marginBottom: 4 },
  reviewExplainWrap: { marginTop: 6 },
  doneBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  // Empty state
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  emptyMsg: {
    color: '#9E9E9E',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  setupContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  setupEmoji: { fontSize: 56, marginBottom: 16 },
  setupTitle: { color: '#fff', fontSize: 28, fontWeight: '900', marginBottom: 8 },
  setupSub: { color: '#9E9E9E', fontSize: 15, marginBottom: 40, textAlign: 'center' },
  setupLabel: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  countGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 40,
  },
  countBtn: {
    backgroundColor: '#1A1A24',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: '#2A2A38',
    minWidth: 70,
    alignItems: 'center',
  },
  countBtnActive: { borderColor: '#6C63FF', backgroundColor: '#1A1A3A' },
  countBtnLocked: { borderColor: '#333', backgroundColor: '#0F0F14', opacity: 0.7 },
  countBtnText: { color: '#9E9E9E', fontWeight: '700', fontSize: 15 },
  countBtnTextActive: { color: '#fff' },
  countBtnTextLocked: { color: '#555' },
  lockHint: { color: '#6C63FF', fontSize: 11, marginTop: 4 },
  startBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 16,
    paddingHorizontal: 48,
    paddingVertical: 18,
    elevation: 4,
  },
  startBtnText: { color: '#fff', fontWeight: '800', fontSize: 18, letterSpacing: 0.5 },
});
