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
import { useSPen } from '../../../hooks/useSPen';
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
// ── Detective ─────────────────────────────────────────────────────
// ── Manual Review ──────────────────────────────────────────────────
// ── SocraticCard ────────────────────────────────────────────────────────────

export function FlashcardCard({
  content,
  topicId,
  contentType,
  onDone,
  onSkip,
}: { content: FlashcardsContent } & Omit<Props, 'content'>) {
  const [cardIdx, setCardIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  if (content.cards.length === 0) {
    return (
      <View style={s.flashcardContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={n.colors.textMuted} />
        <LinearText style={s.flashcardEmpty} variant="body" tone="muted">
          AI generated 0 flashcards for this topic.
        </LinearText>
        <TouchableOpacity style={s.flashcardDoneBtn} onPress={() => onSkip()}>
          <LinearText style={s.flashcardDoneText}>Skip</LinearText>
        </TouchableOpacity>
      </View>
    );
  }

  const card = content.cards[cardIdx];
  if (!card) {
    return (
      <View style={s.flashcardContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={n.colors.textMuted} />
        <LinearText style={s.flashcardEmpty} variant="body" tone="muted">
          No flashcards available
        </LinearText>
        <TouchableOpacity style={s.flashcardDoneBtn} onPress={() => onSkip()}>
          <LinearText style={s.flashcardDoneText}>Skip</LinearText>
        </TouchableOpacity>
      </View>
    );
  }

  const isLastCard = cardIdx === content.cards.length - 1;

  function handleFlip() {
    setIsFlipped((prev) => !prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function handleNext() {
    setCardIdx((i) => i + 1);
    setIsFlipped(false);
  }

  function handleRate(confidence: number) {
    Haptics.notificationAsync(
      confidence === 0
        ? Haptics.NotificationFeedbackType.Error
        : Haptics.NotificationFeedbackType.Success,
    );
    onDone(confidence);
  }

  useSPen({
    onButton: () => handleFlip(),
    onAirMotion: (dx) => {
      if (Math.abs(dx) < 0.6) return;
      if (dx > 0 && !isLastCard) handleNext();
    },
  });

  return (
    <View style={s.flashcardContainer}>
      <View style={s.cardHeader}>
        <LinearText variant="chip" tone="muted">
          {content.topicName} · Card {cardIdx + 1}/{content.cards.length}
        </LinearText>
        {topicId && contentType && (
          <ContentFlagButton topicId={topicId} contentType={contentType} />
        )}
      </View>

      <TouchableOpacity style={s.flashcardBody} onPress={handleFlip} activeOpacity={0.7}>
        <LinearText style={s.flashcardLabel}>{isFlipped ? 'ANSWER' : 'QUESTION'}</LinearText>
        {card.imageUrl && !isFlipped && <QuestionImage url={card.imageUrl} />}
        <LinearText style={s.flashcardText} variant="body">
          {isFlipped ? card.back : card.front}
        </LinearText>
        <LinearText style={s.flashcardHint} variant="meta" tone="muted">
          {isFlipped ? 'Tap to go back' : 'Tap to reveal'}
        </LinearText>
      </TouchableOpacity>

      <View style={s.flashcardActions}>
        {!isFlipped ? (
          <TouchableOpacity style={s.flashcardFlipBtn} onPress={handleFlip}>
            <LinearText style={s.flashcardFlipText}>Reveal Answer</LinearText>
          </TouchableOpacity>
        ) : isLastCard ? (
          <View style={s.flashcardRatingRow}>
            {FLASHCARD_RATINGS.map((r) => (
              <TouchableOpacity
                key={r.label}
                style={[
                  s.flashcardRatingBtn,
                  { backgroundColor: r.color + '22', borderColor: r.color },
                ]}
                onPress={() => handleRate(r.confidence)}
              >
                <LinearText style={[s.flashcardRatingText, { color: r.color }]}>
                  {r.label}
                </LinearText>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <TouchableOpacity style={s.flashcardNextBtn} onPress={handleNext}>
            <LinearText style={s.flashcardNextText}>Next Card →</LinearText>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
