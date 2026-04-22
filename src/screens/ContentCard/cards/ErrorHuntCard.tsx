import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  useWindowDimensions,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { motion } from '../../../motion/presets';
import * as Haptics from 'expo-haptics';
import LinearText from '../../../components/primitives/LinearText';
import LinearSurface from '../../../components/primitives/LinearSurface';
import StudyMarkdown from '../../../components/StudyMarkdown';
import { emphasizeHighYieldMarkdown } from '../../../utils/highlightMarkdown';
import { fetchWikipediaImage } from '../../../services/imageService';
import {
  explainMostTestedRationale,
  explainTopicDeeper,
  explainQuizConcept,
  askGuru,
  generateEscalatingQuiz,
} from '../../../services/ai';
import { ContentFlagButton } from '../../../components/ContentFlagButton';
import { s, FLASHCARD_RATINGS } from '../styles';
import { linearTheme as n } from '../../../theme/linearTheme';
import { Props, ContextUpdater } from '../types';
import type {
  KeyPointsContent,
  MustKnowContent,
  QuizContent,
  StoryContent,
  MnemonicContent,
  TeachBackContent,
  ErrorHuntContent,
  DetectiveContent,
  ManualContent,
  SocraticContent,
  FlashcardsContent,
} from '../../../types';
import { TopicImage } from '../shared/TopicImage';
import { QuestionImage } from '../shared/QuestionImage';
import { ConfidenceRating } from '../shared/ConfidenceRating';
import { ExplainablePoint } from '../shared/ExplainablePoint';
import { ConceptChip } from '../shared/ConceptChip';
import { DeepExplanationBlock } from '../shared/DeepExplanationBlock';
import { QuizOptionBtn } from '../shared/QuizOptionBtn';
import {
  useCardScrollPaddingBottom,
  useCardScrollContentStyle,
} from '../hooks/useCardScrollPadding';
import { formatQuizExplanation } from '../utils/formatQuizExplanation';
import { extractMedicalConcepts } from '../utils/extractMedicalConcepts';
import { isQuizImageHttpUrl } from '../utils/isQuizImageHttpUrl';
import { stripImageFraming } from '../utils/stripImageFraming';
import { compactLines } from '../utils/compactLines';
import {
  captureFillAlpha,
  captureBorderAlpha,
  whiteAlpha,
  blackAlpha,
} from '../../../theme/colorUtils';

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
