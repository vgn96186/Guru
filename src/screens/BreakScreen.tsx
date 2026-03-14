import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Text, StyleSheet, TouchableOpacity, BackHandler, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchContent } from '../services/aiService';
import { getTopicById } from '../db/queries/topics';
import type { QuizContent, TopicWithProgress } from '../types';
import GuruChatOverlay from '../components/GuruChatOverlay';
import VisualTimer from '../components/VisualTimer';
import { useAppStore } from '../store/useAppStore';
import { ResponsiveContainer } from '../hooks/useResponsive';

interface Props {
  countdown: number;
  totalSeconds?: number;
  topicId?: number;
  onDone: () => void;
  onEndSession?: () => void;
}

export default function BreakScreen({ countdown, totalSeconds, topicId, onDone, onEndSession }: Props) {
  const profile = useAppStore(s => s.profile);
  const [topic, setTopic] = useState<TopicWithProgress | null>(null);
  const [quizQuestion, setQuizQuestion] = useState<{ question: string; options: string[]; correct: number } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const optionAnims = useRef(new Map<number, { bg: Animated.Value; border: Animated.Value }>()).current;

  function getOptionAnim(idx: number) {
    if (!optionAnims.has(idx)) {
      optionAnims.set(idx, { bg: new Animated.Value(0), border: new Animated.Value(0) });
    }
    return optionAnims.get(idx)!;
  }

  function handleOptionPress(idx: number) {
    if (selected !== null || !quizQuestion) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(idx);
    const isCorrect = idx === quizQuestion.correct;
    const selectedAnim = getOptionAnim(idx);
    Animated.timing(selectedAnim.bg, { toValue: 1, duration: 250, useNativeDriver: false }).start();
    Animated.timing(selectedAnim.border, { toValue: 1, duration: 250, useNativeDriver: false }).start();
    if (!isCorrect) {
      const correctAnim = getOptionAnim(quizQuestion.correct);
      Animated.timing(correctAnim.bg, { toValue: 1, duration: 250, useNativeDriver: false }).start();
      Animated.timing(correctAnim.border, { toValue: 1, duration: 250, useNativeDriver: false }).start();
    }
    setTimeout(() => {
      if (isCorrect) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }, 150);
  }
  const topicName = topic?.name ?? 'General Medicine';
  const duration = totalSeconds ?? 300;

  useEffect(() => {
    if (!topicId) {
      setTopic(null);
      return;
    }
    void getTopicById(topicId).then(setTopic);
  }, [topicId]);

  useEffect(() => {
    // Block back button during break unless they want to end session early
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert('Stay focused!', 'The break timer is running.', [
        { text: 'Wait it out', style: 'cancel' },
        ...(onEndSession ? [{ text: 'End Session Early', style: 'destructive' as const, onPress: onEndSession }] : [])
      ]);
      return true;
    });
    return () => handler.remove();
  }, [onEndSession]);

  useEffect(() => {
    if (countdown <= 0) {
      onDone();
    }
  }, [countdown]);

  // Load a quick quiz question during break
  useEffect(() => {
    if (!topic) return;
    fetchContent(topic, 'quiz')
      .then(content => {
        const q = (content as QuizContent).questions?.[0];
        if (q) {
          setQuizQuestion({
            question: q.question,
            options: q.options,
            correct: q.correctIndex,
          });
        }
      })
      .catch((err) => console.warn('[BreakScreen] Failed to fetch break quiz:', err));
  }, [topic]);

  const mins = Math.floor(countdown / 60);
  const secs = countdown % 60;
  const pct = duration > 0 ? ((duration - countdown) / duration) * 100 : 100;

  return (
    <SafeAreaView style={styles.safe}>
      <ResponsiveContainer style={styles.container}>
        {/* Break header */}
        <View style={styles.timerSection}>
          <Text style={styles.breakLabel}>ACTIVE BREAK</Text>
          {profile?.visualTimersEnabled ? (
            <View style={{ marginVertical: 16 }}>
              <VisualTimer totalSeconds={duration} remainingSeconds={countdown} size={160} />
            </View>
          ) : (
            <>
              <Text style={styles.breakTimer}>{mins}:{secs.toString().padStart(2, '0')}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>
            </>
          )}
          <Text style={styles.breakSubtext}>Stay in the app — session continues automatically</Text>
        </View>

        {/* Quick quiz during break */}
        {quizQuestion && (
          <View style={styles.quizSection}>
            <Text style={styles.quizLabel}>⚡ Quick fire — stay sharp:</Text>
            <Text style={styles.quizQuestion}>{quizQuestion.question}</Text>
            {quizQuestion.options.map((opt, idx) => {
              const anim = getOptionAnim(idx);
              const isCorrectOption = idx === quizQuestion.correct;
              const isSelectedOption = selected === idx;
              const bgColor = anim.bg.interpolate({
                inputRange: [0, 1],
                outputRange: ['#1A1A24', isCorrectOption ? '#1A2A1A' : '#2A0A0A'],
              });
              const borderColor = anim.border.interpolate({
                inputRange: [0, 1],
                outputRange: ['#2A2A38', isCorrectOption ? '#4CAF50' : '#F44336'],
              });
              return (
                <Animated.View
                  key={idx}
                  style={[styles.option, { backgroundColor: bgColor, borderColor }]}
                >
                  <TouchableOpacity
                    onPress={() => handleOptionPress(idx)}
                    activeOpacity={0.8}
                    style={{ padding: 12 }}
                  >
                    <Text style={styles.optionText}>{opt}</Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
            {selected !== null && (
              <Text style={styles.result}>
                {selected === quizQuestion.correct ? '✅ Correct! +20 XP' : `❌ Answer: Option ${quizQuestion.correct + 1}`}
              </Text>
            )}
          </View>
        )}

        {!quizQuestion && (
          <View style={styles.idleSection}>
            <Text style={styles.idleEmoji}>🧘</Text>
            <Text style={styles.idleText}>Take a deep breath.</Text>
            <Text style={styles.idleText2}>Session resumes automatically.</Text>
          </View>
        )}

        {/* Emergency continue */}
        {countdown > 0 && (
          <TouchableOpacity style={styles.forceBtn} onPress={onDone} activeOpacity={0.8}>
            <Text style={styles.forceBtnText}>I'm ready now ({mins}:{secs.toString().padStart(2,'0')} left)</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.askGuruBtn} onPress={() => setChatOpen(true)} activeOpacity={0.8}>
          <Text style={styles.askGuruText}>Ask Guru a question</Text>
        </TouchableOpacity>

        {onEndSession && (
          <TouchableOpacity style={{ alignItems: 'center', marginBottom: 20 }} onPress={onEndSession}>
            <Text style={{ color: '#F44336', fontSize: 13, fontWeight: '600' }}>End Session Early</Text>
          </TouchableOpacity>
        )}
      </ResponsiveContainer>
      <GuruChatOverlay
        visible={chatOpen}
        topicName={topicName}
        onClose={() => setChatOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0F' },
  container: { flex: 1, padding: 24 },
  timerSection: { alignItems: 'center', paddingVertical: 32 },
  breakLabel: { color: '#4CAF50', fontSize: 12, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  breakTimer: { color: '#fff', fontSize: 56, fontWeight: '900', marginBottom: 16 },
  progressTrack: { width: '100%', height: 6, backgroundColor: '#1A1A24', borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 3 },
  breakSubtext: { color: '#555', fontSize: 12, textAlign: 'center' },
  quizSection: { backgroundColor: '#1A1A24', borderRadius: 16, padding: 16, marginTop: 8 },
  quizLabel: { color: '#FF9800', fontSize: 12, fontWeight: '700', marginBottom: 10 },
  quizQuestion: { color: '#fff', fontSize: 14, lineHeight: 20, marginBottom: 12 },
  option: { borderRadius: 10, marginBottom: 6, borderWidth: 1.5, overflow: 'hidden' },
  optionText: { color: '#E0E0E0', fontSize: 13 },
  result: { color: '#9E9E9E', fontSize: 13, marginTop: 8, textAlign: 'center' },
  idleSection: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  idleEmoji: { fontSize: 48, marginBottom: 12 },
  idleText: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 4 },
  idleText2: { color: '#9E9E9E', fontSize: 14 },
  forceBtn: { padding: 16, alignItems: 'center' },
  forceBtnText: { color: '#555', fontSize: 13 },
  askGuruBtn: { backgroundColor: '#1A1A2E', borderWidth: 1, borderColor: '#6C63FF66', borderRadius: 12, padding: 12, alignItems: 'center', marginHorizontal: 24, marginBottom: 8 },
  askGuruText: { color: '#6C63FF', fontWeight: '700', fontSize: 14 },
});
