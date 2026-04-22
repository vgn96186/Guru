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

export function MustKnowCard({
  content,
  topicId,
  contentType,
  onDone,
  onSkip,
}: { content: MustKnowContent } & Omit<Props, 'content'>) {
  const [showRating, setShowRating] = useState(false);
  const scrollContentStyle = useCardScrollContentStyle(0);

  return (
    <ScrollView style={s.scroll} contentContainerStyle={scrollContentStyle}>
      <LinearText style={s.cardType}>MUST KNOW</LinearText>
      <View style={s.cardHeader}>
        <LinearText style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
          {content.topicName}
        </LinearText>
        {topicId && contentType && (
          <ContentFlagButton topicId={topicId} contentType={contentType} />
        )}
      </View>
      <TopicImage topicName={content.topicName} />

      <LinearText style={s.mkSectionLabel}>
        <Ionicons name="alert-circle" size={13} color={n.colors.error} />
        {'  '}CANNOT FORGET
      </LinearText>
      <View style={s.mkList}>
        {content.mustKnow.map((item, i) => (
          <View key={i} style={[s.mkItem, { borderLeftColor: n.colors.error }]}>
            <StudyMarkdown content={emphasizeHighYieldMarkdown(item)} compact />
          </View>
        ))}
      </View>

      <LinearText style={s.mkSectionLabel}>
        <Ionicons name="flame" size={13} color={n.colors.warning} />
        {'  '}MOST TESTED
      </LinearText>
      <View style={s.mkList}>
        {content.mostTested.map((item, i) => (
          <ExplainablePoint
            key={i}
            item={item}
            topicName={content.topicName}
            color={n.colors.warning}
          />
        ))}
      </View>

      <View style={s.mkTipBox}>
        <LinearText style={s.mkTipLabel}>EXAM TIP</LinearText>
        <LinearText style={s.mkTipText}>{content.examTip}</LinearText>
      </View>

      {!showRating ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setShowRating(true)} activeOpacity={0.8}>
          <LinearText style={s.doneBtnText}>Got it</LinearText>
        </TouchableOpacity>
      ) : (
        <ConfidenceRating onRate={onDone} />
      )}
      <TouchableOpacity
        onPress={onSkip}
        style={s.skipBtn}
        accessibilityRole="button"
        accessibilityLabel="Skip content type"
      >
        <LinearText style={s.skipText}>Skip content type</LinearText>
      </TouchableOpacity>
    </ScrollView>
  );
}
