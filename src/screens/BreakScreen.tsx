import LinearSurface from '../components/primitives/LinearSurface';
import LinearButton from '../components/primitives/LinearButton';
import LinearBadge from '../components/primitives/LinearBadge';
import LinearText from '../components/primitives/LinearText';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, StyleSheet, TouchableOpacity, BackHandler, StatusBar } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchContent } from '../services/ai';
import { getTopicById } from '../db/queries/topics';
import type { QuizContent, TopicWithProgress } from '../types';
import GuruChatOverlay from '../components/GuruChatOverlay';
import VisualTimer from '../components/VisualTimer';
import { useProfileQuery } from '../hooks/queries/useProfile';
import { linearTheme as n } from '../theme/linearTheme';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { confirmDestructive } from '../components/dialogService';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  countdown: number;
  totalSeconds?: number;
  topicId?: number;
  onDone: () => void;
  onEndSession?: () => void;
}

export default function BreakScreen({
  countdown,
  totalSeconds,
  topicId,
  onDone,
  onEndSession,
}: Props) {
  const { data: profile } = useProfileQuery();
  const [topic, setTopic] = useState<TopicWithProgress | null>(null);
  const [quizQuestion, setQuizQuestion] = useState<{
    question: string;
    options: string[];
    correct: number;
  } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const optionAnims = useRef(
    new Map<number, { bg: Animated.Value; border: Animated.Value }>(),
  ).current;

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
    Animated.timing(selectedAnim.border, {
      toValue: 1,
      duration: 250,
      useNativeDriver: false,
    }).start();
    if (!isCorrect) {
      const correctAnim = getOptionAnim(quizQuestion.correct);
      Animated.timing(correctAnim.bg, {
        toValue: 1,
        duration: 250,
        useNativeDriver: false,
      }).start();
      Animated.timing(correctAnim.border, {
        toValue: 1,
        duration: 250,
        useNativeDriver: false,
      }).start();
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
      if (onEndSession) {
        confirmDestructive('Stay focused!', 'The break timer is running.', {
          confirmLabel: 'End Session Early',
          cancelLabel: 'Wait it out',
        }).then((ok) => {
          if (ok) onEndSession();
        });
      } else {
        confirmDestructive('Stay focused!', 'The break timer is running.', {
          confirmLabel: 'Wait it out',
        }).then(() => {});
      }
      return true;
    });
    return () => handler.remove();
  }, [onEndSession]);

  useEffect(() => {
    if (countdown <= 0) {
      onDone();
    }
  }, [countdown, onDone]);

  // Load a quick quiz question during break
  useEffect(() => {
    if (!topic) return;
    fetchContent(topic, 'quiz')
      .then((content) => {
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
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer style={styles.container}>
        {/* Break header */}
        <LinearSurface style={styles.timerSection}>
          <LinearBadge label="ACTIVE BREAK" variant="success" />
          {profile?.visualTimersEnabled ? (
            <View style={{ marginVertical: 16 }}>
              <VisualTimer totalSeconds={duration} remainingSeconds={countdown} size={160} />
            </View>
          ) : (
            <>
              <LinearText variant="display" centered style={styles.breakTimer}>
                {mins}:{secs.toString().padStart(2, '0')}
              </LinearText>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>
            </>
          )}
          <LinearText variant="caption" tone="muted" centered style={styles.breakSubtext}>
            Stay in the app — session continues automatically
          </LinearText>
        </LinearSurface>

        {/* Quick quiz during break */}
        {quizQuestion && (
          <LinearSurface style={styles.quizSection}>
            <LinearText variant="caption" tone="warning" style={styles.quizLabel}>
              Quick fire — stay sharp
            </LinearText>
            <LinearText variant="body" style={styles.quizQuestion}>
              {quizQuestion.question}
            </LinearText>
            {quizQuestion.options.map((opt, idx) => {
              const anim = getOptionAnim(idx);
              const isCorrectOption = idx === quizQuestion.correct;
              const bgColor = anim.bg.interpolate({
                inputRange: [0, 1],
                outputRange: [
                  n.colors.card,
                  isCorrectOption ? `${n.colors.success}16` : `${n.colors.error}16`,
                ],
              });
              const borderColor = anim.border.interpolate({
                inputRange: [0, 1],
                outputRange: [n.colors.border, isCorrectOption ? n.colors.success : n.colors.error],
              });
              return (
                <Animated.View
                  key={idx}
                  style={[styles.option, { backgroundColor: bgColor, borderColor }]}
                >
                  <TouchableOpacity
                    onPress={() => handleOptionPress(idx)}
                    activeOpacity={0.8}
                    style={{ padding: 12, minHeight: 44, justifyContent: 'center' }}
                    accessibilityRole="button"
                    accessibilityLabel={`Answer option ${idx + 1}: ${opt}`}
                  >
                    <LinearText variant="bodySmall" style={styles.optionText}>
                      {opt}
                    </LinearText>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
            {selected !== null && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 8,
                }}
              >
                {selected === quizQuestion.correct ? (
                  <Ionicons name="checkmark-circle" size={14} color={n.colors.success} />
                ) : (
                  <Ionicons name="close-circle" size={14} color={n.colors.error} />
                )}
                <LinearText variant="bodySmall" tone="secondary" style={{ marginLeft: 4 }}>
                  {selected === quizQuestion.correct
                    ? 'Correct! +20 XP'
                    : `Answer: Option ${quizQuestion.correct + 1}`}
                </LinearText>
              </View>
            )}
          </LinearSurface>
        )}

        {!quizQuestion && (
          <View style={styles.idleSection}>
            <LinearText style={styles.idleEmoji}>🧘</LinearText>
            <LinearText variant="sectionTitle" centered style={styles.idleText}>
              Take a deep breath.
            </LinearText>
            <LinearText variant="bodySmall" tone="secondary" centered style={styles.idleText2}>
              Session resumes automatically.
            </LinearText>
          </View>
        )}

        {/* Emergency continue */}
        {countdown > 0 && (
          <LinearButton
            variant="secondary"
            style={styles.forceBtn}
            onPress={onDone}
            accessibilityRole="button"
            accessibilityLabel={`I'm ready now, ${mins} minutes ${secs} seconds left`}
            label={`I'm ready now (${mins}:${secs.toString().padStart(2, '0')} left)`}
          />
        )}

        <LinearButton
          variant="secondary"
          style={styles.askGuruBtn}
          onPress={() => setChatOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Ask Guru a question"
          label="Ask Guru a question"
        />

        {onEndSession && (
          <TouchableOpacity
            style={{
              alignItems: 'center',
              marginBottom: 20,
              minHeight: 44,
              justifyContent: 'center',
            }}
            onPress={onEndSession}
            accessibilityRole="button"
            accessibilityLabel="End session early"
          >
            <LinearText variant="label" tone="error">
              End Session Early
            </LinearText>
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
  safe: { flex: 1, backgroundColor: n.colors.background },
  container: { flex: 1, padding: 24 },
  timerSection: { alignItems: 'center', paddingVertical: 32 },
  breakTimer: { marginBottom: 16 },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: n.colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: { height: '100%', backgroundColor: n.colors.success, borderRadius: 3 },
  breakSubtext: {},
  quizSection: { marginTop: 8 },
  quizLabel: { marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  quizQuestion: { marginBottom: 12 },
  option: { borderRadius: n.radius.md, marginBottom: 6, borderWidth: 1, overflow: 'hidden' },
  optionText: {},
  result: { marginTop: 8 },
  idleSection: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  idleEmoji: { fontSize: 48, marginBottom: 12 },
  idleText: { marginBottom: 4 },
  idleText2: {},
  forceBtn: { marginTop: 8 },
  askGuruBtn: { marginHorizontal: 24, marginBottom: 8 },
});
