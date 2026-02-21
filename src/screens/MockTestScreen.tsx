import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  StatusBar, BackHandler, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import { getAllCachedQuestions, type MockQuestion } from '../db/queries/aiCache';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'MockTest'>;

const MAX_QUESTIONS = 20;
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

  useEffect(() => {
    const all = getAllCachedQuestions();
    setQuestions(all); // Store ALL initially
    setAvailableCount(all.length);
    // Auto-select max available if default 20 > available
    setSelectedCount(all.length >= 20 ? 20 : all.length);
    setPhase('setup');
  }, []);

  function startTest(count: number) {
    const subset = questions.slice(0, count);
    setQuestions(subset);
    setAnswers(new Array(subset.length).fill(null));
    setCurrent(0);
    setPhase('test');
  }

  function handleOptionSelect(idx: number) {
    if (revealed) return;
    setSelected(idx);
  }

  function handleConfirm() {
    if (!revealed) {
      if (selected === null) {
        skipQuestion();
      } else {
        setRevealed(true);
      }
    } else {
      const newAnswers = [...answers];
      newAnswers[current] = selected;
      setAnswers(newAnswers);

      if (current + 1 < questions.length) {
        setCurrent(current + 1);
        setSelected(null);
        setRevealed(false);
      } else {
        setPhase('results');
      }
    }
  }

  function skipQuestion() {
    const newAnswers = [...answers];
    newAnswers[current] = -1; // -1 for skipped
    setAnswers(newAnswers);

    if (current + 1 < questions.length) {
      setCurrent(current + 1);
      setSelected(null);
      setRevealed(false);
    } else {
      setPhase('results');
    }
  }

  // ── Setup Phase ────────────────────────────────────────────────
  if (phase === 'setup') {
    if (availableCount === 0) {
      return (
        <SafeAreaView style={styles.safe}>
          <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🧪</Text>
            <Text style={styles.emptyTitle}>No Questions Yet</Text>
            <Text style={styles.emptyMsg}>
              Guru generates quiz questions during your study sessions. Complete a few sessions to build up your question bank!
            </Text>
            <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.doneBtnText}>Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <View style={styles.setupContainer}>
          <Text style={styles.setupEmoji}>📝</Text>
          <Text style={styles.setupTitle}>Mock Test</Text>
          <Text style={styles.setupSub}>
            {availableCount} questions available in your bank.
          </Text>

          <Text style={styles.setupLabel}>How many questions?</Text>
          <View style={styles.countGrid}>
            {[10, 20, 50, 100].map(c => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.countBtn, 
                  selectedCount === c && styles.countBtnActive,
                  c > availableCount && styles.countBtnDisabled
                ]}
                disabled={c > availableCount}
                onPress={() => setSelectedCount(c > availableCount ? availableCount : c)}
              >
                <Text style={[
                  styles.countBtnText, 
                  selectedCount === c && styles.countBtnTextActive,
                  c > availableCount && styles.countBtnTextDisabled
                ]}>
                  {c > availableCount ? availableCount : c}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.countBtn, selectedCount === availableCount && styles.countBtnActive]}
              onPress={() => setSelectedCount(availableCount)}
            >
              <Text style={[styles.countBtnText, selectedCount === availableCount && styles.countBtnTextActive]}>
                Max ({availableCount})
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.startBtn} onPress={() => startTest(selectedCount)}>
            <Text style={styles.startBtnText}>Start Test</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Results ────────────────────────────────────────────────────
  if (phase === 'results') {
    let correct = 0; let wrong = 0; let skipped = 0;
    answers.forEach((a, i) => {
      if (a === null || a === -1) { skipped++; }
      else if (a === questions[i].correctIndex) { correct++; }
      else { wrong++; }
    });
    const score = correct * CORRECT_MARKS + wrong * WRONG_MARKS;
    const maxScore = questions.length * CORRECT_MARKS;
    const pct = Math.round((score / maxScore) * 100);

    const scoreColor = pct >= 60 ? '#4CAF50' : pct >= 40 ? '#FF9800' : '#F44336';

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <ScrollView contentContainerStyle={styles.resultsContent}>
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

          <Text style={styles.markingNote}>NEET Marking: +4 correct · -1 wrong · 0 skipped</Text>

          {/* Question review */}
          <Text style={styles.reviewTitle}>Review</Text>
          {questions.map((q, i) => {
            const ans = answers[i];
            const isCorrect = ans === q.correctIndex;
            const isSkipped = ans === null || ans === -1;
            const borderColor = isSkipped ? '#555' : isCorrect ? '#4CAF50' : '#F44336';
            return (
              <View key={i} style={[styles.reviewRow, { borderLeftColor: borderColor }]}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.reviewNum}>Q{i + 1}</Text>
                  <Text style={[styles.reviewStatus, { color: borderColor }]}>
                    {isSkipped ? 'Skipped' : isCorrect ? `+${CORRECT_MARKS}` : `${WRONG_MARKS}`}
                  </Text>
                </View>
                <Text style={styles.reviewQ}>{q.question}</Text>
                <Text style={styles.reviewTopic}>{q.subjectName} · {q.topicName}</Text>
                {!isSkipped && (
                  <Text style={[styles.reviewAns, { color: isCorrect ? '#4CAF50' : '#F44336' }]}>
                    Your answer: {q.options[ans as number]}
                  </Text>
                )}
                <Text style={styles.reviewCorrect}>Correct: {q.options[q.correctIndex]}</Text>
                <Text style={styles.reviewExplain}>{q.explanation}</Text>
              </View>
            );
          })}

          <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Test phase ─────────────────────────────────────────────────
  if (phase === 'loading' || questions.length === 0) return null;

  const q = questions[current];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerNum}>Q {current + 1} / {questions.length}</Text>
        <Text style={styles.headerTopic}>{q.subjectName} · {q.topicName}</Text>
        <TouchableOpacity onPress={skipQuestion} style={styles.skipBtn}>
          <Text style={styles.skipBtnText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((current) / questions.length) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.testContent}>
        <Text style={styles.question}>{q.question}</Text>

        {q.options.map((opt, idx) => {
          let bg = '#1A1A24';
          let border = '#2A2A38';
          let textColor = '#fff';
          if (!revealed) {
            if (idx === selected) { bg = '#1A1A3A'; border = '#6C63FF'; }
          } else {
            if (idx === q.correctIndex) { bg = '#1A2A1A'; border = '#4CAF50'; textColor = '#4CAF50'; }
            else if (idx === selected && selected !== q.correctIndex) { bg = '#2A1A1A'; border = '#F44336'; textColor = '#F44336'; }
          }
          return (
            <TouchableOpacity
              key={idx}
              style={[styles.option, { backgroundColor: bg, borderColor: border }]}
              onPress={() => handleOptionSelect(idx)}
              activeOpacity={revealed ? 1 : 0.8}
            >
              <Text style={styles.optionLetter}>{['A', 'B', 'C', 'D'][idx]}</Text>
              <Text style={[styles.optionText, { color: textColor }]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}

        {revealed && (
          <View style={styles.explanation}>
            <Text style={styles.explanationTitle}>Explanation</Text>
            <Text style={styles.explanationText}>{q.explanation}</Text>
          </View>
        )}

        <View style={styles.markingBadge}>
          <Text style={styles.markingText}>+{CORRECT_MARKS} correct · {WRONG_MARKS} wrong · 0 skip</Text>
        </View>

        <TouchableOpacity
          style={[styles.confirmBtn, !revealed && selected === null && styles.confirmBtnSkip]}
          onPress={handleConfirm}
          activeOpacity={0.8}
        >
          <Text style={styles.confirmBtnText}>
            {!revealed ? (selected !== null ? 'Confirm Answer' : 'Skip Question') : (current + 1 < questions.length ? 'Next Question →' : 'See Results')}
          </Text>
        </TouchableOpacity>
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
  headerTopic: { flex: 1, color: '#9E9E9E', fontSize: 11 },
  skipBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#2A2A38', borderRadius: 8 },
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
  optionLetter: { color: '#9E9E9E', fontWeight: '800', fontSize: 14, marginRight: 10, width: 16 },
  optionText: { flex: 1, fontSize: 14, lineHeight: 20 },
  explanation: { backgroundColor: '#1A1A2E', borderRadius: 12, padding: 14, marginTop: 12, marginBottom: 8, borderWidth: 1, borderColor: '#6C63FF44' },
  explanationTitle: { color: '#6C63FF', fontWeight: '700', fontSize: 13, marginBottom: 6 },
  explanationText: { color: '#ccc', fontSize: 13, lineHeight: 20 },
  markingBadge: { alignItems: 'center', marginVertical: 10 },
  markingText: { color: '#555', fontSize: 11 },
  confirmBtn: { backgroundColor: '#6C63FF', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  confirmBtnSkip: { backgroundColor: '#2A2A38' },
  confirmBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  // Results
  resultsContent: { padding: 16, paddingBottom: 60 },
  resultsTitle: { color: '#fff', fontSize: 26, fontWeight: '900', textAlign: 'center', marginBottom: 20, marginTop: 8 },
  scoreCircle: { alignItems: 'center', backgroundColor: '#1A1A24', borderRadius: 24, padding: 24, marginBottom: 16 },
  scoreNum: { fontSize: 56, fontWeight: '900' },
  scoreMax: { color: '#9E9E9E', fontSize: 16 },
  scorePct: { fontSize: 22, fontWeight: '700', marginTop: 4 },
  scoreBreakdown: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  scoreCell: { flex: 1, backgroundColor: '#1A1A24', borderRadius: 12, padding: 14, alignItems: 'center' },
  scoreCellNum: { fontSize: 26, fontWeight: '900' },
  scoreCellLabel: { color: '#9E9E9E', fontSize: 11, marginTop: 4, textAlign: 'center' },
  markingNote: { color: '#555', fontSize: 11, textAlign: 'center', marginBottom: 20 },
  reviewTitle: { color: '#9E9E9E', fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  reviewRow: { backgroundColor: '#1A1A24', borderRadius: 12, padding: 14, marginBottom: 10, borderLeftWidth: 4 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  reviewNum: { color: '#9E9E9E', fontWeight: '700', fontSize: 12 },
  reviewStatus: { fontWeight: '800', fontSize: 14 },
  reviewQ: { color: '#fff', fontSize: 14, lineHeight: 20, marginBottom: 6 },
  reviewTopic: { color: '#6C63FF', fontSize: 11, marginBottom: 6 },
  reviewAns: { fontSize: 12, marginBottom: 2 },
  reviewCorrect: { color: '#4CAF50', fontSize: 12, marginBottom: 4 },
  reviewExplain: { color: '#9E9E9E', fontSize: 12, lineHeight: 18 },
  doneBtn: { backgroundColor: '#6C63FF', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 16 },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  // Empty state
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  emptyMsg: { color: '#9E9E9E', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  setupContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  setupEmoji: { fontSize: 56, marginBottom: 16 },
  setupTitle: { color: '#fff', fontSize: 28, fontWeight: '900', marginBottom: 8 },
  setupSub: { color: '#9E9E9E', fontSize: 15, marginBottom: 40, textAlign: 'center' },
  setupLabel: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  countGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 40 },
  countBtn: { backgroundColor: '#1A1A24', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, borderWidth: 2, borderColor: '#2A2A38', minWidth: 70, alignItems: 'center' },
  countBtnActive: { borderColor: '#6C63FF', backgroundColor: '#1A1A3A' },
  countBtnDisabled: { opacity: 0.3 },
  countBtnText: { color: '#9E9E9E', fontWeight: '700', fontSize: 15 },
  countBtnTextActive: { color: '#fff' },
  countBtnTextDisabled: { color: '#555' },
  startBtn: { backgroundColor: '#6C63FF', borderRadius: 16, paddingHorizontal: 48, paddingVertical: 18, elevation: 4 },
  startBtnText: { color: '#fff', fontWeight: '800', fontSize: 18, letterSpacing: 0.5 },
});
