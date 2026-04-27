import React, { useState, useEffect, useMemo } from 'react';
import { View, ScrollView, TouchableOpacity, useWindowDimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import LinearText from '../../../components/primitives/LinearText';
import StudyMarkdown from '../../../components/StudyMarkdown';
import { emphasizeHighYieldMarkdown } from '../../../utils/highlightMarkdown';
import { explainTopicDeeper, generateEscalatingQuiz } from '../../../services/ai';
import { ContentFlagButton } from '../../../components/ContentFlagButton';
import { s } from '../styles';
import { linearTheme as n } from '../../../theme/linearTheme';
import LoadingIndicator from '../../../components/primitives/LoadingIndicator';
import { Props, ContextUpdater } from '../types';
import type { QuizContent } from '../../../types';
import { QuestionImage } from '../shared/QuestionImage';
import { ConceptChip } from '../shared/ConceptChip';
import { DeepExplanationBlock } from '../shared/DeepExplanationBlock';
import { QuizOptionBtn } from '../shared/QuizOptionBtn';
import { useCardScrollContentStyle } from '../hooks/useCardScrollPadding';
import { formatQuizExplanation } from '../utils/formatQuizExplanation';
import { extractMedicalConcepts } from '../utils/extractMedicalConcepts';
import { isQuizImageHttpUrl } from '../utils/isQuizImageHttpUrl';
import { stripImageFraming } from '../utils/stripImageFraming';
import { compactLines } from '../utils/compactLines';

import { useSPen } from '../../../hooks/useSPen';

// ── Key Points ────────────────────────────────────────────────────
// ── Must Know & Most Tested ──────────────────────────────────────
// ── Concept Chip (inline tap-to-explain) ─────────────────────────
// ── Deep Explanation with Reveal ─────────────────────────────────
// ── Quiz ──────────────────────────────────────────────────────────

export function QuizCard({
  content,
  topicId,
  contentType,
  onDone,
  onSkip,
  onQuizAnswered,
  onQuizComplete,
  onContextChange,
}: { content: QuizContent; onContextChange?: ContextUpdater } & Omit<Props, 'content'>) {
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showExpl, setShowExpl] = useState(false);
  const [score, setScore] = useState(0);
  const [deepExplanation, setDeepExplanation] = useState<string | null>(null);
  const [isLoadingDeepExpl, setIsLoadingDeepExpl] = useState(false);
  // Track image load failures per question index so we can strip framing text at render time
  const [failedImageIndices, setFailedImageIndices] = useState<Set<number>>(new Set());

  // Keep Quizzing state
  const [keepQuizzing, setKeepQuizzing] = useState(false);
  const [escalatedContent, setEscalatedContent] = useState<QuizContent | null>(null);
  const [escalatingRound, setEscalatingRound] = useState(0);
  const [isLoadingEscalated, setIsLoadingEscalated] = useState(false);
  const [wrongQuestions, setWrongQuestions] = useState<string[]>([]);

  // Use escalated questions when available, otherwise original
  const activeQuestions = escalatedContent ? escalatedContent.questions : content.questions;

  // Filter out incomplete questions (truncated AI output)
  const validQuestions = useMemo(
    () =>
      activeQuestions.filter(
        (question) =>
          question.question?.trim() &&
          Array.isArray(question.options) &&
          question.options.length >= 2 &&
          question.options.every((opt: string) => opt?.trim()) &&
          typeof question.correctIndex === 'number' &&
          question.correctIndex >= 0 &&
          question.correctIndex < question.options.length,
      ),

    [activeQuestions],
  );

  const q = validQuestions[currentQ];
  const formattedExplanation = useMemo(
    () => formatQuizExplanation(q?.explanation ?? '', q?.options ?? [], q?.correctIndex ?? -1),
    [q?.correctIndex, q?.explanation, q?.options],
  );

  const { width: quizW, height: quizH } = useWindowDimensions();
  const quizExtraBottom = useMemo(() => {
    const isLandscape = quizW > quizH;
    const isTablet = Math.min(quizW, quizH) >= 600;
    let extra = 0;
    if (showExpl && !deepExplanation && !isLoadingDeepExpl) {
      extra = 52 + (isLandscape ? (isTablet ? 52 : 38) : isTablet ? 32 : 18);
    } else if (deepExplanation || isLoadingDeepExpl) {
      extra = 132 + (isLandscape ? (isTablet ? 72 : 52) : isTablet ? 44 : 26);
    }
    return extra;
  }, [quizW, quizH, showExpl, deepExplanation, isLoadingDeepExpl]);
  const quizScrollContentStyle = useCardScrollContentStyle(quizExtraBottom);

  useEffect(() => {
    if (!q) return;
    onContextChange?.(
      compactLines(
        [
          `Card type: Quiz — Topic: ${content.topicName}`,
          `Active Question (${currentQ + 1}/${validQuestions.length}): ${q.question}`,
          `Options: ${q.options
            .map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`)
            .join(' | ')}`,
          `Correct Answer: ${String.fromCharCode(65 + q.correctIndex)}. ${
            q.options[q.correctIndex]
          }`,
          selected !== null
            ? `Student chose: ${
                selected === -1
                  ? "I don't know (revealed answer)"
                  : `${String.fromCharCode(65 + selected)}. ${q.options[selected]} — ${
                      selected === q.correctIndex ? 'CORRECT' : 'INCORRECT'
                    }`
              }`
            : 'Student has not answered yet.',
          `Explanation: ${formattedExplanation}`,
          deepExplanation ? `Deeper explanation visible: ${deepExplanation.slice(0, 200)}...` : '',
        ],
        8,
      ),
    );
  }, [
    content.topicName,
    validQuestions.length,
    currentQ,
    onContextChange,
    q,
    selected,
    showExpl,
    formattedExplanation,
    deepExplanation,
  ]);

  const scoreRef = React.useRef(score);
  scoreRef.current = score;

  function handleSelect(idx: number) {
    if (selected !== null) return;
    setSelected(idx);
    setShowExpl(true);
    setDeepExplanation(null);
    const correct = idx === q.correctIndex;
    if (correct) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScore((s) => {
        const next = s + 1;
        scoreRef.current = next;
        return next;
      });
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setWrongQuestions((prev) => [...prev, q.question]);
    }
    onQuizAnswered?.(correct);
  }

  function handleIDontKnow() {
    if (selected !== null) return;
    setSelected(-1);
    setShowExpl(true);
    setWrongQuestions((prev) => [...prev, q.question]);
    onQuizAnswered?.(false);
    fetchDeepExplanation();
  }

  async function fetchDeepExplanation() {
    if (isLoadingDeepExpl || deepExplanation) return;
    setIsLoadingDeepExpl(true);
    try {
      const result = await explainTopicDeeper(
        content.topicName,
        q.question,
        q.options[q.correctIndex],
        q.explanation,
      );
      setDeepExplanation(result);
    } catch {
      setDeepExplanation(
        'Could not generate explanation. Try the Guru chat button above for help.',
      );
    } finally {
      setIsLoadingDeepExpl(false);
    }
  }

  function handleNext() {
    if (currentQ < validQuestions.length - 1) {
      setCurrentQ((c) => c + 1);
      setSelected(null);
      setShowExpl(false);
      setDeepExplanation(null);
      setIsLoadingDeepExpl(false);
      // failedImageIndices intentionally kept — per-question failures persist for the round
    } else {
      const finalScore = Math.max(scoreRef.current, score);
      onQuizComplete?.(finalScore, validQuestions.length);
    }
  }

  useSPen({
    onButton: () => {
      if (!q) return;
      if (selected !== null) {
        handleNext();
      } else {
        handleSelect(q.correctIndex);
      }
    },
  });

  if (!q) return null;

  function handleFinishQuiz() {
    const finalScore = Math.max(scoreRef.current, score);
    const confidence = Math.round((finalScore / validQuestions.length) * 4) + 1;
    onDone(Math.min(5, confidence));
  }

  async function handleKeepQuizzing() {
    setIsLoadingEscalated(true);
    setKeepQuizzing(false);
    try {
      const nextRound = escalatingRound + 1;
      const result = await generateEscalatingQuiz(
        content.topicName,
        // subjectName not available in content — pass empty string, prompt is robust
        '',
        escalatingRound,
        wrongQuestions,
      );
      setEscalatedContent(result);
      setEscalatingRound(nextRound);
      // Reset quiz state for new round
      setCurrentQ(0);
      setSelected(null);
      setShowExpl(false);
      setDeepExplanation(null);
      setIsLoadingDeepExpl(false);
      setScore(0);
      scoreRef.current = 0;
      setWrongQuestions([]);
    } catch {
      // On failure just finish normally
      handleFinishQuiz();
    } finally {
      setIsLoadingEscalated(false);
    }
  }

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={quizScrollContentStyle}
      removeClippedSubviews={false}
      nestedScrollEnabled={Platform.OS === 'android'}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
    >
      <View style={s.inlineLabelRow}>
        <Ionicons name="help-circle-outline" size={14} color="#6C63FF" />
        <LinearText style={s.cardType}>
          QUIZ {currentQ + 1}/{validQuestions.length}
        </LinearText>
      </View>
      <View style={s.cardHeader}>
        <LinearText style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
          {content.topicName}
        </LinearText>
        {topicId && contentType && (
          <ContentFlagButton topicId={topicId} contentType={contentType} />
        )}
      </View>
      {isQuizImageHttpUrl(q.imageUrl) ? (
        <QuestionImage
          url={q.imageUrl!.trim()}
          onFailed={() => setFailedImageIndices((prev) => new Set([...prev, currentQ]))}
        />
      ) : null}
      <LinearText style={s.questionText}>
        {failedImageIndices.has(currentQ) ? stripImageFraming(q.question) : q.question}
      </LinearText>
      <View style={s.optionsContainer}>
        {q.options.map((opt, idx) => (
          <QuizOptionBtn
            key={`${currentQ}-${idx}`}
            idx={idx}
            opt={opt}
            isSelected={selected === idx}
            isCorrect={idx === q.correctIndex}
            isRevealed={selected !== null}
            onPress={handleSelect}
          />
        ))}
      </View>
      {/* "I don't know" button — shown before answering */}
      {selected === null && (
        <TouchableOpacity style={s.iDontKnowBtn} onPress={handleIDontKnow} activeOpacity={0.8}>
          <LinearText style={s.iDontKnowText}>I don't know — Explain this</LinearText>
        </TouchableOpacity>
      )}
      {showExpl && (
        <View style={s.explBox}>
          <View style={s.inlineLabelRow}>
            <Ionicons
              name={
                selected === q.correctIndex
                  ? 'checkmark-circle'
                  : selected === -1
                    ? 'information-circle'
                    : 'close-circle'
              }
              size={16}
              color={
                selected === q.correctIndex
                  ? n.colors.success
                  : selected === -1
                    ? n.colors.accent
                    : n.colors.error
              }
            />
            <LinearText style={s.explLabel}>
              {selected === q.correctIndex
                ? 'Correct'
                : selected === -1
                  ? 'Here is the answer'
                  : 'Incorrect'}
            </LinearText>
          </View>
          {/* Show the correct answer prominently when user didn't know */}
          {selected !== q.correctIndex && (
            <View style={s.correctAnswerBox}>
              <LinearText style={s.correctAnswerLabel}>Correct Answer</LinearText>
              <LinearText style={s.correctAnswerText}>{q.options[q.correctIndex]}</LinearText>
            </View>
          )}
          <View style={s.explSection}>
            <View style={s.inlineLabelRow}>
              <Ionicons name="reader-outline" size={14} color={n.colors.accent} />
              <LinearText style={s.explSectionTitle}>Explanation</LinearText>
            </View>
            <StudyMarkdown content={emphasizeHighYieldMarkdown(formattedExplanation)} />
          </View>
        </View>
      )}
      {/* Inline concept chips — tap to explain key terms */}
      {showExpl &&
        (() => {
          const concepts = extractMedicalConcepts(
            q.question,
            q.options,
            q.options[q.correctIndex] ?? '',
          );
          if (concepts.length === 0) return null;
          return (
            <View style={{ marginTop: 12, marginBottom: 4 }}>
              <View style={[s.inlineLabelRow, { marginBottom: 8 }]}>
                <Ionicons name="bulb-outline" size={13} color={n.colors.textMuted} />
                <LinearText style={[s.explSectionTitle, { color: n.colors.textMuted }]}>
                  KEY CONCEPTS
                </LinearText>
              </View>
              {concepts.map((c, i) => (
                <ConceptChip key={i} concept={c} topicName={content.topicName} />
              ))}
            </View>
          );
        })()}

      {/* Deep AI explanation */}
      {showExpl && !deepExplanation && !isLoadingDeepExpl && (
        <TouchableOpacity
          style={s.explainDeeperBtn}
          onPress={fetchDeepExplanation}
          activeOpacity={0.8}
        >
          <View style={s.inlineLabelRow}>
            <Ionicons name="bulb-outline" size={14} color={n.colors.accent} />
            <LinearText style={s.explainDeeperText}>Explain the broader topic</LinearText>
          </View>
        </TouchableOpacity>
      )}
      {isLoadingDeepExpl && (
        <View style={s.deepExplLoading}>
          <LoadingIndicator size="small" color={n.colors.accent} />
          <LinearText style={s.deepExplLoadingText}>Guru is explaining...</LinearText>
        </View>
      )}
      {deepExplanation && <DeepExplanationBlock explanation={deepExplanation} />}
      {isLoadingEscalated && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 8 }}>
          <LoadingIndicator size="small" color={n.colors.accent} />
          <LinearText style={{ color: n.colors.textSecondary, fontSize: 13 }}>
            Loading harder questions...
          </LinearText>
        </View>
      )}
      {keepQuizzing && !isLoadingEscalated && (
        <View
          style={{
            marginTop: 16,
            backgroundColor: n.colors.surface,
            borderRadius: 14,
            padding: 18,
            borderWidth: 1,
            borderColor: n.colors.borderHighlight,
            gap: 12,
          }}
        >
          <LinearText
            style={{
              color: n.colors.textPrimary,
              fontWeight: '700',
              fontSize: 15,
              textAlign: 'center',
            }}
          >
            Round {escalatingRound + 1} complete — {score}/{validQuestions.length} correct
          </LinearText>
          <TouchableOpacity
            style={[s.doneBtn, { backgroundColor: n.colors.accent }]}
            onPress={handleKeepQuizzing}
            activeOpacity={0.8}
          >
            <LinearText style={[s.doneBtnText, { color: n.colors.textInverse }]}>
              Keep Quizzing — Harder ↑
            </LinearText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              s.doneBtn,
              { backgroundColor: n.colors.card, borderWidth: 1, borderColor: n.colors.border },
            ]}
            onPress={handleFinishQuiz}
            activeOpacity={0.8}
          >
            <LinearText style={[s.doneBtnText, { color: n.colors.textPrimary }]}>
              Done with this topic
            </LinearText>
          </TouchableOpacity>
        </View>
      )}
      {showExpl && !keepQuizzing && !isLoadingEscalated && (
        <TouchableOpacity style={s.doneBtn} onPress={handleNext} activeOpacity={0.8}>
          <LinearText style={s.doneBtnText}>
            {currentQ < validQuestions.length - 1
              ? 'Next Question →'
              : `Done (${score}/${validQuestions.length}) →`}
          </LinearText>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={onSkip}
        style={s.skipBtn}
        accessibilityRole="button"
        accessibilityLabel="Skip"
      >
        <LinearText style={s.skipText}>Skip quiz</LinearText>
      </TouchableOpacity>
    </ScrollView>
  );
}
