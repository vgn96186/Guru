import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { getTopicsDueForReview, getWeakestTopics } from '../db/queries/topics';
import { fetchContent } from '../services/aiService';
import type { QuizContent, TopicWithProgress } from '../types';
import { MarkdownRender } from '../components/MarkdownRender';
import { linearTheme as n } from '../theme/linearTheme';
import LinearSurface from '../components/primitives/LinearSurface';
import { emphasizeHighYieldMarkdown } from '../utils/highlightMarkdown';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PomodoroQuiz'>;
type QuizRoute = RouteProp<RootStackParamList, 'PomodoroQuiz'>;

export default function PomodoroQuizScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<QuizRoute>();
  const breakPayload = route.params?.breakPayload;
  const precomputedQuestions = breakPayload?.questions ?? [];
  const [questions, setQuestions] = useState<QuizContent['questions']>([]);
  const [topic, setTopic] = useState<TopicWithProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [noQuizAvailable, setNoQuizAvailable] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);

  const question = questions[currentQuestionIndex] ?? null;
  const isExternalLectureMode = breakPayload?.source === 'external_lecture';

  useEffect(() => {
    let isActive = true;
    void loadQuestion(isActive);
    return () => {
      isActive = false;
    };
  }, []);

  async function loadQuestion(isActive: boolean) {
    setLoading(true);
    try {
      if (precomputedQuestions.length > 0) {
        if (!isActive) return;
        setQuestions(precomputedQuestions as QuizContent['questions']);
        setLoading(false);
        return;
      }

      const [due, weak] = await Promise.all([getTopicsDueForReview(1), getWeakestTopics(1)]);
      const target = due[0] || weak[0];
      if (!target) {
        if (isActive) setNoQuizAvailable(true);
        if (isActive) setLoading(false);
        return;
      }
      if (isActive) setTopic(target);
      const content = await fetchContent(target, 'quiz');
      if (content && typeof content === 'object') {
        const quiz = content as QuizContent;
        if (quiz.questions && quiz.questions.length > 0) {
          if (isActive) setQuestions(quiz.questions);
        } else {
          if (isActive) setIsDone(true);
        }
      } else if (isActive) {
        setNoQuizAvailable(true);
      }
    } catch {
      if (isActive) setNoQuizAvailable(true);
    }
    if (isActive) setLoading(false);
  }

  function handleSelect(idx: number) {
    if (selected !== null || !question) return;
    setSelected(idx);
    if (idx === question.correctIndex) {
      setScore((current) => current + 1);
    }
  }

  function handleNext() {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((current) => current + 1);
      setSelected(null);
      return;
    }
    setIsDone(true);
  }

  function handleReturn() {
    navigation.goBack();
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={n.colors.accent} />
          <Text style={styles.loadingText}>
            {isExternalLectureMode
              ? 'Preparing your live lecture break quiz...'
              : 'Generating quick break quiz...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (noQuizAvailable) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <View style={styles.center}>
          <Text style={styles.emoji}>☕</Text>
          <Text style={styles.title}>Take a Break!</Text>
          <Text style={styles.sub}>
            {isExternalLectureMode
              ? 'The live lecture quiz is still warming up. Stretch, breathe, then head back in.'
              : 'No topics due right now. Stretch, breathe, and get ready for more.'}
          </Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={handleReturn}
            accessibilityLabel="Return to lecture"
          >
            <Text style={styles.btnText}>
              {isExternalLectureMode ? 'Back to Lecture' : 'Return to Lecture'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isDone || !question) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <View style={styles.center}>
          <Text style={styles.emoji}>🧠</Text>
          <Text style={styles.title}>Break Complete</Text>
          <Text style={styles.sub}>
            {isExternalLectureMode
              ? `You got ${score} / ${questions.length} right. Jump back into ${breakPayload?.appName ?? 'the lecture'} when you're ready.`
              : 'You took a 20-minute milestone break.'}
          </Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={handleReturn}
            accessibilityLabel="Return to lecture"
          >
            <Text style={styles.btnText}>
              {isExternalLectureMode ? 'Back to Lecture' : 'Return to Lecture'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isCorrect = selected === question.correctIndex;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.header}>
          {isExternalLectureMode ? 'Live Lecture Pomodoro Break' : 'Pomodoro Break'}
        </Text>
        <Text style={styles.topicName}>
          {isExternalLectureMode
            ? `${breakPayload?.appName ?? 'Lecture'}${breakPayload?.subject ? ` • ${breakPayload.subject}` : ''}`
            : topic?.name}
        </Text>

        {isExternalLectureMode && (
          <LinearSurface padded={false} style={styles.contextCard}>
            {breakPayload?.summary ? (
              <>
                <Text style={styles.contextLabel}>What The Lecture Is Covering</Text>
                <Text style={styles.contextSummary}>{breakPayload.summary}</Text>
              </>
            ) : null}
            {breakPayload?.keyConcepts?.length ? (
              <>
                <Text style={[styles.contextLabel, styles.contextLabelSpacing]}>
                  Key Points Before You Continue
                </Text>
                {breakPayload.keyConcepts.map((concept) => (
                  <View key={concept} style={styles.keyConceptRow}>
                    <Text style={styles.keyConceptBullet}>•</Text>
                    <Text style={styles.keyConceptText}>{concept}</Text>
                  </View>
                ))}
              </>
            ) : null}
          </LinearSurface>
        )}

        {questions.length > 1 ? (
          <Text style={styles.progressText}>
            Question {currentQuestionIndex + 1} / {questions.length}
          </Text>
        ) : null}

        <Text style={styles.question}>{question.question}</Text>

        <View style={styles.options}>
          {question.options.map((opt: string, idx: number) => {
            let bg: string = n.colors.surface;
            let border: string = n.colors.border;
            if (selected !== null) {
              if (idx === question.correctIndex) {
                bg = '#1A2A1A';
                border = '#4CAF50';
              } else if (idx === selected) {
                bg = '#2A0A0A';
                border = '#F44336';
              }
            }
            return (
              <TouchableOpacity
                key={`${question.question}-${idx}`}
                style={[styles.option, { backgroundColor: bg, borderColor: border }]}
                onPress={() => handleSelect(idx)}
                disabled={selected !== null}
                activeOpacity={0.8}
                accessibilityLabel={`Option ${String.fromCharCode(65 + idx)}: ${opt}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: selected !== null }}
              >
                <Text style={styles.optionLetter}>{String.fromCharCode(65 + idx)}</Text>
                <Text style={styles.optionText}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {selected !== null && (
          <View
            style={[styles.feedback, isCorrect ? styles.feedbackCorrect : styles.feedbackWrong]}
          >
            <Text style={styles.feedbackLabel}>{isCorrect ? '✅ Correct!' : '❌ Incorrect'}</Text>
            <View style={{ marginTop: 12 }}>
              <MarkdownRender content={emphasizeHighYieldMarkdown(question.explanation)} compact />
            </View>
            <TouchableOpacity
              style={styles.nextBtn}
              onPress={handleNext}
              accessibilityLabel={
                currentQuestionIndex < questions.length - 1 ? 'Next question' : 'Finish break quiz'
              }
            >
              <Text style={styles.nextBtnText}>
                {currentQuestionIndex < questions.length - 1 ? 'Next Question' : 'Finish Break'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: {
    color: n.colors.textSecondary,
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: { color: n.colors.textPrimary, fontSize: 28, fontWeight: '800', marginBottom: 8 },
  sub: { color: n.colors.textSecondary, fontSize: 16, textAlign: 'center', marginBottom: 32 },
  btn: {
    backgroundColor: n.colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  container: { flexGrow: 1, padding: 24, paddingBottom: 40 },
  header: {
    color: n.colors.accent,
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  topicName: { color: n.colors.textSecondary, fontSize: 14, marginBottom: 20 },
  contextCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  contextLabel: {
    color: n.colors.accent,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  contextLabelSpacing: {
    marginTop: 14,
  },
  contextSummary: {
    color: n.colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  keyConceptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
  },
  keyConceptBullet: {
    color: n.colors.accent,
    fontSize: 16,
    lineHeight: 22,
    marginRight: 8,
  },
  keyConceptText: {
    color: n.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    flex: 1,
  },
  progressText: {
    color: n.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  question: {
    color: n.colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
    marginBottom: 32,
  },
  options: { gap: 12 },
  option: { flexDirection: 'row', padding: 16, borderRadius: 12, borderWidth: 1 },
  optionLetter: { color: n.colors.accent, fontWeight: '800', fontSize: 16, width: 24 },
  optionText: { color: n.colors.textPrimary, fontSize: 16, flex: 1, lineHeight: 22 },
  feedback: { marginTop: 24, padding: 16, borderRadius: 12, borderWidth: 1 },
  feedbackCorrect: { backgroundColor: '#0D2010', borderColor: '#4CAF50' },
  feedbackWrong: { backgroundColor: '#200D0D', borderColor: '#F44336' },
  feedbackLabel: { color: '#fff', fontWeight: '800', fontSize: 16, marginBottom: 8 },
  nextBtn: {
    marginTop: 18,
    backgroundColor: n.colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
