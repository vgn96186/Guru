import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import LinearText from '../../../components/primitives/LinearText';
import StudyMarkdown from '../../../components/StudyMarkdown';
import { emphasizeHighYieldMarkdown } from '../../../utils/highlightMarkdown';


import { ContentFlagButton } from '../../../components/ContentFlagButton';
import { s } from '../styles';
import { linearTheme as n } from '../../../theme/linearTheme';
import { Props, ContextUpdater } from '../types';
import type {
  ErrorHuntContent,
} from '../../../types';
import { TopicImage } from '../shared/TopicImage';
import { ConfidenceRating } from '../shared/ConfidenceRating';
import {
  useCardScrollContentStyle,
} from '../hooks/useCardScrollPadding';
import { compactLines } from '../utils/compactLines';



// ── Key Points ────────────────────────────────────────────────────
// ── Must Know & Most Tested ──────────────────────────────────────
// ── Concept Chip (inline tap-to-explain) ─────────────────────────
// ── Deep Explanation with Reveal ─────────────────────────────────
// ── Quiz ──────────────────────────────────────────────────────────
// ── Story ─────────────────────────────────────────────────────────
// ── Mnemonic ──────────────────────────────────────────────────────
// ── Teach Back ────────────────────────────────────────────────────
// ── Error Hunt ────────────────────────────────────────────────────

export function ErrorHuntCard({
  content,
  topicId,
  contentType,
  onDone,
  onSkip,
  onContextChange,
}: { content: ErrorHuntContent; onContextChange?: ContextUpdater } & Omit<Props, 'content'>) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    onContextChange?.(
      compactLines(
        [
          'Card type: Error hunt',
          `Paragraph: ${content.paragraph}`,
          `Actual errors to find: ${content.errors
            .map((e) => `"${e.wrong}" should be "${e.correct}" because ${e.explanation}`)
            .join(' | ')}`,
          revealed
            ? 'Corrections are revealed to student.'
            : 'Student is still searching for errors.',
        ],
        5,
      ),
    );
  }, [content, onContextChange, revealed]);
  const scrollContentStyle = useCardScrollContentStyle(0);
  return (
    <ScrollView style={s.scroll} contentContainerStyle={scrollContentStyle}>
      <LinearText style={s.cardType}>🔍 ERROR HUNT</LinearText>
      <View style={s.cardHeader}>
        <LinearText style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
          {content.topicName}
        </LinearText>
        {topicId && contentType && (
          <ContentFlagButton topicId={topicId} contentType={contentType} />
        )}
      </View>
      <TopicImage topicName={content.topicName} />
      <LinearText style={s.questionText}>Find the 2 factual errors in this paragraph:</LinearText>
      <View style={s.paragraphBox}>
        <LinearText style={s.paragraphText}>{content.paragraph}</LinearText>
      </View>
      {!revealed ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setRevealed(true)} activeOpacity={0.8}>
          <LinearText style={s.doneBtnText}>Reveal Errors →</LinearText>
        </TouchableOpacity>
      ) : (
        <>
          {content.errors.map((err, i) => (
            <View key={i} style={s.explBox}>
              <LinearText style={s.explLabel}>Error {i + 1}:</LinearText>
              <LinearText style={[s.explText, { color: n.colors.error }]}>
                ❌ "{err.wrong}"
              </LinearText>
              <LinearText style={[s.explText, { color: n.colors.success }]}>
                ✅ Should be: "{err.correct}"
              </LinearText>
              <View style={{ marginTop: 4 }}>
                <StudyMarkdown content={emphasizeHighYieldMarkdown(err.explanation)} />
              </View>
            </View>
          ))}
          <ConfidenceRating onRate={onDone} />
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
