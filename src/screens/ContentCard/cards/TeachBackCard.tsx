import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import LinearText from '../../../components/primitives/LinearText';
import StudyMarkdown from '../../../components/StudyMarkdown';
import { emphasizeHighYieldMarkdown } from '../../../utils/highlightMarkdown';
import { askGuru } from '../../../services/ai';
import { ContentFlagButton } from '../../../components/ContentFlagButton';
import { s } from '../styles';
import { linearTheme as n } from '../../../theme/linearTheme';
import LoadingIndicator from '../../../components/primitives/LoadingIndicator';
import { Props, ContextUpdater } from '../types';
import type { TeachBackContent } from '../../../types';
import { TopicImage } from '../shared/TopicImage';
import { ConfidenceRating } from '../shared/ConfidenceRating';
import { useCardScrollContentStyle } from '../hooks/useCardScrollPadding';
import { compactLines } from '../utils/compactLines';

// ── Key Points ────────────────────────────────────────────────────
// ── Must Know & Most Tested ──────────────────────────────────────
// ── Concept Chip (inline tap-to-explain) ─────────────────────────
// ── Deep Explanation with Reveal ─────────────────────────────────
// ── Quiz ──────────────────────────────────────────────────────────
// ── Story ─────────────────────────────────────────────────────────
// ── Mnemonic ──────────────────────────────────────────────────────
// ── Teach Back ────────────────────────────────────────────────────

export function TeachBackCard({
  content,
  topicId,
  contentType,
  onDone,
  onSkip,
  onContextChange,
}: { content: TeachBackContent; onContextChange?: ContextUpdater } & Omit<Props, 'content'>) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [validating, setValidating] = useState(false);
  const [guruFeedback, setGuruFeedback] = useState<{
    feedback: string;
    score: number;
    missed: string[];
  } | null>(null);

  useEffect(() => {
    onContextChange?.(
      compactLines(
        [
          'Card type: Teach-back',
          `Topic: ${content.topicName}`,
          `Prompt given to student: ${content.prompt}`,
          `Key points student MUST mention: ${content.keyPointsToMention.join(' | ')}`,
          `Ideal Guru reaction/answer: ${content.guruReaction}`,
          answer.trim()
            ? `Student's current input: ${answer.trim()}`
            : "Student hasn't started typing yet.",
          submitted
            ? `Guru feedback shown: ${guruFeedback?.feedback ?? 'Calculating...'}`
            : 'Result not yet revealed.',
        ],
        8,
      ),
    );
  }, [answer, content, guruFeedback, onContextChange, submitted]);

  async function handleValidate() {
    if (!answer.trim()) return;
    setValidating(true);
    try {
      const context = `Topic: ${
        content.topicName
      }. Expected points: ${content.keyPointsToMention.join(', ')}`;
      const raw = await askGuru(answer, context);
      const parsed = JSON.parse(raw);
      setGuruFeedback(parsed);
      setSubmitted(true);
    } catch {
      // Fallback if AI fails
      setSubmitted(true);
    } finally {
      setValidating(false);
    }
  }

  const scrollContentStyle = useCardScrollContentStyle(0);

  return (
    <ScrollView style={s.scroll} contentContainerStyle={scrollContentStyle}>
      <LinearText style={s.cardType}>🎤 TEACH BACK</LinearText>
      <View style={s.cardHeader}>
        <LinearText style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
          {content.topicName}
        </LinearText>
        {topicId && contentType && (
          <ContentFlagButton topicId={topicId} contentType={contentType} />
        )}
      </View>
      <TopicImage topicName={content.topicName} />
      <LinearText style={s.questionText}>{content.prompt}</LinearText>
      {!submitted ? (
        <>
          <TextInput
            style={s.textInput}
            placeholder="Type your explanation here..."
            placeholderTextColor={n.colors.textMuted}
            multiline
            value={answer}
            onChangeText={setAnswer}
          />
          <TouchableOpacity
            style={[s.doneBtn, (!answer.trim() || validating) && s.disabledBtn]}
            onPress={handleValidate}
            activeOpacity={0.8}
            disabled={validating}
          >
            {validating ? (
              <LoadingIndicator color="#fff" />
            ) : (
              <LinearText style={s.doneBtnText}>Submit to Guru →</LinearText>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={s.explBox}>
            <LinearText style={s.explLabel}>
              Guru's Review (Score: {guruFeedback?.score ?? '?'} / 5):
            </LinearText>
            <View style={s.markdownBlock}>
              <StudyMarkdown
                content={emphasizeHighYieldMarkdown(guruFeedback?.feedback ?? content.guruReaction)}
                compact
              />
            </View>
            {guruFeedback?.missed && guruFeedback.missed.length > 0 && (
              <View style={s.missedBox}>
                <LinearText style={s.missedLabel}>You missed:</LinearText>
                {guruFeedback.missed.map((m, i) => (
                  <View key={i} style={s.markdownListItem}>
                    <StudyMarkdown content={emphasizeHighYieldMarkdown(`- ${m}`)} compact />
                  </View>
                ))}
              </View>
            )}
          </View>
          <View style={s.highlightsBox}>
            <LinearText style={s.highlightsLabel}>Expected key points:</LinearText>
            {content.keyPointsToMention.map((pt, i) => (
              <View key={i} style={s.markdownListItem}>
                <StudyMarkdown content={emphasizeHighYieldMarkdown(`- ${pt}`)} compact />
              </View>
            ))}
          </View>
          <ConfidenceRating
            onRate={(n) => {
              // Adjust XP based on Guru's score if possible, or just let confidence handle it
              onDone(n);
            }}
          />
        </>
      )}
      <TouchableOpacity
        onPress={onSkip}
        style={s.skipBtn}
        accessibilityRole="button"
        accessibilityLabel="Skip"
      >
        <LinearText style={s.skipText}>Skip this</LinearText>
      </TouchableOpacity>
    </ScrollView>
  );
}
