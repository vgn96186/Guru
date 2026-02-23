import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar, Animated, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import { useAppStore } from '../store/useAppStore';
import { getTopicsDueForReview, getWeakestTopics, updateTopicProgress } from '../db/queries/topics';
import { createSession, endSession } from '../db/queries/sessions';
import { updateStreak } from '../db/queries/progress';
import { fetchContent } from '../services/aiService';
import type { QuizContent, TopicWithProgress } from '../types';

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
  const profile = useAppStore(s => s.profile);
  const refreshProfile = useAppStore(s => s.refreshProfile);
  const apiKey = profile?.openrouterApiKey ?? '';
  const orKey = profile?.openrouterKey || undefined;

  const [questions, setQuestions] = useState<ChallengeQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Picking your weakest topics...');
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
  }, [currentIdx, questions.length]);

  async function loadQuestions() {
    setLoading(true);
    const due = getTopicsDueForReview(3);
    const weak = getWeakestTopics(5);
    const seen = new Set(due.map(t => t.id));
    const combined: TopicWithProgress[] = [...due, ...weak.filter(t => !seen.has(t.id))].slice(0, QUESTION_COUNT);

    if (combined.length === 0) {
      setLoading(false);
      setDone(true);
      return;
    }

    setLoadingMsg(`Generating ${combined.length} questions...`);
    const qs: ChallengeQuestion[] = [];
    for (let i = 0; i < combined.length; i++) {
      const topic = combined[i];
      setLoadingMsg(`Generating Question ${i + 1} of ${combined.length}...`);
      try {
        const content = await fetchContent(topic, 'quiz', apiKey, orKey);
        const q = (content as QuizContent).questions[0];
        if (q) {
          qs.push({
            topicId: topic.id,
            topicName: topic.name,
            question: q.question,
            options: q.options,
            correctIndex: q.correctIndex,
            explanation: q.explanation,
          });
        }
      } catch {
        // skip topic if generation fails
      }
    }

    setQuestions(qs);
    setLoading(false);
  }

  function handleSelect(idx: number) {
    if (selected !== null) return;
    setSelected(idx);
    const q = questions[currentIdx];
    const correct = idx === q.correctIndex;
    const newScore = correct ? score + 1 : score;
    const newCorrectTopics = correct ? [...correctTopics, q.topicId] : correctTopics;
    const newWrongTopics = correct ? wrongTopics : [...wrongTopics, q.topicId];
    if (correct) {
      setScore(s => s + 1);
      setCorrectTopics(prev => [...prev, q.topicId]);
    } else {
      setWrongTopics(prev => [...prev, q.topicId]);
    }

    Animated.sequence([
      Animated.timing(feedbackOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(feedbackOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      if (currentIdx + 1 >= questions.length) {
        finishChallenge(newScore, newCorrectTopics, newWrongTopics);
      } else {
        setCurrentIdx(i => i + 1);
        setSelected(null);
      }
    });
  }

  async function finishChallenge(finalScore: number, finalCorrect: number[], finalWrong: number[]) {
    const totalXp = finalScore * XP_PER_CORRECT;
    const sessionId = createSession([], 'good', 'normal');
    endSession(sessionId, finalCorrect, totalXp, Math.ceil(questions.length * 1.5));
    updateStreak(true);

    // Update SRS for each answered topic
    for (const topicId of finalCorrect) {
      updateTopicProgress(topicId, 'reviewed', 4, XP_PER_CORRECT);
    }
    for (const topicId of finalWrong) {
      updateTopicProgress(topicId, 'seen', 2, 10);
    }

    await refreshProfile();
    setDone(true);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6C63FF" />
          <Text style={styles.loadingText}>{loadingMsg}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (done) {
    const totalXp = score * XP_PER_CORRECT;
    const pct = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
    const grade = pct >= 80 ? '🔥 Excellent!' : pct >= 60 ? '👍 Good job!' : pct >= 40 ? '😐 Keep grinding' : '💪 Try again';

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <View style={styles.doneContainer}>
          <Text style={styles.doneEmoji}>{pct >= 80 ? '🏆' : pct >= 60 ? '⭐' : '📚'}</Text>
          <Text style={styles.doneGrade}>{grade}</Text>
          <Text style={styles.doneScore}>{score} / {questions.length} correct</Text>
          <View style={styles.xpBadge}>
            <Text style={styles.xpText}>+{totalXp} XP earned</Text>
          </View>
          {wrongTopics.length > 0 && (
            <Text style={styles.doneSub}>
              {wrongTopics.length} topic{wrongTopics.length > 1 ? 's' : ''} added to review queue
            </Text>
          )}
          <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Text style={styles.doneBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (questions.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>No topics due for review yet.{'\n'}Keep studying to unlock challenges!</Text>
          <TouchableOpacity style={[styles.doneBtn, { marginTop: 24 }]} onPress={() => navigation.goBack()}>
            <Text style={styles.doneBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const q = questions[currentIdx];
  const isCorrect = selected === q.correctIndex;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>⚡ Daily Challenge</Text>
        <Text style={styles.headerScore}>{score}/{currentIdx + 1}</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View
          style={[styles.progressFill, {
            width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
          }]}
        />
      </View>
      <Text style={styles.questionCount}>{currentIdx + 1} of {questions.length}</Text>

      {/* Topic label */}
      <View style={styles.topicBadge}>
        <Text style={styles.topicText}>{q.topicName}</Text>
      </View>

      {/* Question */}
      <Text style={styles.questionText}>{q.question}</Text>

      {/* Options */}
      <View style={styles.optionsContainer}>
        {q.options.map((opt, idx) => {
          let bg = '#1A1A24';
          let border = '#2A2A38';
          if (selected !== null) {
            if (idx === q.correctIndex) { bg = '#1A2A1A'; border = '#4CAF50'; }
            else if (idx === selected) { bg = '#2A0A0A'; border = '#F44336'; }
          }
          return (
            <TouchableOpacity
              key={idx}
              style={[styles.option, { backgroundColor: bg, borderColor: border }]}
              onPress={() => handleSelect(idx)}
              activeOpacity={0.8}
              disabled={selected !== null}
            >
              <Text style={styles.optionLetter}>{String.fromCharCode(65 + idx)}</Text>
              <Text style={styles.optionText}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Feedback toast */}
      {selected !== null && (
        <Animated.View style={[styles.feedback, isCorrect ? styles.feedbackCorrect : styles.feedbackWrong, { opacity: feedbackOpacity }]}>
          <Text style={styles.feedbackLabel}>{isCorrect ? '✅ Correct!' : '❌ Wrong'}</Text>
          <Text style={styles.feedbackExpl}>{q.explanation}</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { color: '#9E9E9E', fontSize: 15, marginTop: 16, textAlign: 'center', lineHeight: 22 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#555', fontSize: 16 },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  headerScore: { color: '#6C63FF', fontWeight: '700', fontSize: 15, minWidth: 36, textAlign: 'right' },
  progressTrack: { height: 4, backgroundColor: '#1A1A24', marginHorizontal: 16, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#6C63FF', borderRadius: 2 },
  questionCount: { color: '#555', fontSize: 11, textAlign: 'right', marginRight: 16, marginTop: 4, marginBottom: 16 },
  topicBadge: { alignSelf: 'flex-start', backgroundColor: '#1A1A2E', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: '#6C63FF44' },
  topicText: { color: '#6C63FF', fontSize: 11, fontWeight: '700' },
  questionText: { color: '#fff', fontSize: 17, fontWeight: '700', lineHeight: 26, paddingHorizontal: 16, marginBottom: 20 },
  optionsContainer: { paddingHorizontal: 16, gap: 10 },
  option: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 14, borderWidth: 1.5 },
  optionLetter: { color: '#6C63FF', fontWeight: '800', fontSize: 14, width: 22 },
  optionText: { color: '#E0E0E0', fontSize: 14, flex: 1, lineHeight: 20 },
  feedback: { position: 'absolute', bottom: 20, left: 16, right: 16, borderRadius: 14, padding: 14, borderWidth: 1 },
  feedbackCorrect: { backgroundColor: '#0D2010', borderColor: '#4CAF50' },
  feedbackWrong: { backgroundColor: '#200D0D', borderColor: '#F44336' },
  feedbackLabel: { color: '#fff', fontWeight: '800', fontSize: 14, marginBottom: 4 },
  feedbackExpl: { color: '#9E9E9E', fontSize: 13, lineHeight: 18 },
  doneContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  doneEmoji: { fontSize: 72, marginBottom: 16 },
  doneGrade: { color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 8 },
  doneScore: { color: '#9E9E9E', fontSize: 18, marginBottom: 24 },
  xpBadge: { backgroundColor: '#1A1A2E', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, borderWidth: 1, borderColor: '#6C63FF', marginBottom: 12 },
  xpText: { color: '#6C63FF', fontWeight: '900', fontSize: 20 },
  doneSub: { color: '#9E9E9E', fontSize: 13, marginBottom: 32, textAlign: 'center' },
  doneBtn: { backgroundColor: '#6C63FF', borderRadius: 14, paddingHorizontal: 40, paddingVertical: 16 },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
