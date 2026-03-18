import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { getTopicsDueForReview, getWeakestTopics } from '../db/queries/topics';
import { fetchContent } from '../services/aiService';
import type { QuizContent, TopicWithProgress } from '../types';
import { theme } from '../constants/theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PomodoroQuiz'>;

export default function PomodoroQuizScreen() {
  const navigation = useNavigation<Nav>();
  const [question, setQuestion] = useState<QuizContent['questions'][0] | null>(null);
  const [topic, setTopic] = useState<TopicWithProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [noQuizAvailable, setNoQuizAvailable] = useState(false);

  useEffect(() => {
    let isActive = true;
    loadQuestion(isActive);
    return () => { isActive = false; };
  }, []);

  async function loadQuestion(isActive: boolean) {
    setLoading(true);
    try {
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
          if (isActive) setQuestion(quiz.questions[0]);
        } else {
          if (isActive) setIsDone(true);
        }
      } else {
        if (isActive) setNoQuizAvailable(true);
      }
    } catch {
      if (isActive) setNoQuizAvailable(true);
    }
    if (isActive) setLoading(false);
  }

  function handleSelect(idx: number) {
    if (selected !== null) return;
    setSelected(idx);
    setTimeout(() => {
      setIsDone(true);
    }, 2000);
  }

  function handleReturn() {
    navigation.goBack();
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Generating quick break quiz...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (noQuizAvailable) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
        <View style={styles.center}>
          <Text style={styles.emoji}>☕</Text>
          <Text style={styles.title}>Take a Break!</Text>
          <Text style={styles.sub}>No topics due right now. Stretch, breathe, and get ready for more.</Text>
          <TouchableOpacity style={styles.btn} onPress={handleReturn} accessibilityLabel="Return to lecture">
            <Text style={styles.btnText}>Return to Lecture</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isDone || !question) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
        <View style={styles.center}>
          <Text style={styles.emoji}>🧠</Text>
          <Text style={styles.title}>Great Job!</Text>
          <Text style={styles.sub}>You took a 20-minute milestone break.</Text>
          <TouchableOpacity style={styles.btn} onPress={handleReturn} accessibilityLabel="Return to lecture">
            <Text style={styles.btnText}>Return to Lecture</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isCorrect = selected === question.correctIndex;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.header}>Pomodoro Break</Text>
        <Text style={styles.topicName}>{topic?.name}</Text>
        <Text style={styles.question}>{question.question}</Text>

        <View style={styles.options}>
          {question.options.map((opt: string, idx: number) => {
            let bg: string = theme.colors.surfaceAlt;
            let border: string = theme.colors.border;
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
                key={idx}
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
          <View style={[styles.feedback, isCorrect ? styles.feedbackCorrect : styles.feedbackWrong]}>
            <Text style={styles.feedbackLabel}>{isCorrect ? '✅ Correct!' : '❌ Incorrect'}</Text>
            <Text style={styles.feedbackExpl}>{question.explanation}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { color: theme.colors.textSecondary, marginTop: 16, fontSize: 16 },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: { color: theme.colors.textPrimary, fontSize: 28, fontWeight: '800', marginBottom: 8 },
  sub: { color: theme.colors.textSecondary, fontSize: 16, textAlign: 'center', marginBottom: 32 },
  btn: { backgroundColor: theme.colors.primary, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12, minHeight: 48, justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  container: { flex: 1, padding: 24 },
  header: { color: theme.colors.primary, fontSize: 14, fontWeight: '800', textTransform: 'uppercase', marginBottom: 8 },
  topicName: { color: theme.colors.textSecondary, fontSize: 14, marginBottom: 24 },
  question: { color: theme.colors.textPrimary, fontSize: 20, fontWeight: '700', lineHeight: 28, marginBottom: 32 },
  options: { gap: 12 },
  option: { flexDirection: 'row', padding: 16, borderRadius: 12, borderWidth: 1 },
  optionLetter: { color: theme.colors.primary, fontWeight: '800', fontSize: 16, width: 24 },
  optionText: { color: theme.colors.textPrimary, fontSize: 16, flex: 1, lineHeight: 22 },
  feedback: { marginTop: 24, padding: 16, borderRadius: 12, borderWidth: 1 },
  feedbackCorrect: { backgroundColor: '#0D2010', borderColor: '#4CAF50' },
  feedbackWrong: { backgroundColor: '#200D0D', borderColor: '#F44336' },
  feedbackLabel: { color: '#fff', fontWeight: '800', fontSize: 16, marginBottom: 8 },
  feedbackExpl: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20 },
});
