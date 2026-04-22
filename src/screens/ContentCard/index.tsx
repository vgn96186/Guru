import { CARD_COMPONENTS } from './registry';
import React, { useEffect, useState, useMemo, useCallback } from 'react';

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
import { motion } from '../../motion/presets';
import LinearText from '../../components/primitives/LinearText';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type {
  AIContent,
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
  ContentType,
} from '../../types';

import { ContentFlagButton } from '../../components/ContentFlagButton';

import {
  askGuru,
  explainMostTestedRationale,
  explainTopicDeeper,
  generateEscalatingQuiz,
  explainQuizConcept,
} from '../../services/ai';
import { fetchWikipediaImage } from '../../services/imageService';
import { isContentFlagged, setContentFlagged } from '../../db/queries/aiCache';
import GuruChatOverlay from '../../components/GuruChatOverlay';
import ErrorBoundary from '../../components/ErrorBoundary';
import StudyMarkdown from '../../components/StudyMarkdown';
import { linearTheme as n } from '../../theme/linearTheme';
import {
  blackAlpha,
  whiteAlpha,
  captureFillAlpha,
  captureBorderAlpha,
} from '../../theme/colorUtils';
import { emphasizeHighYieldMarkdown } from '../../utils/highlightMarkdown';
import LinearSurface from '../../components/primitives/LinearSurface';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showInfo } from '../../components/dialogService';
import { s, FLASHCARD_RATINGS } from './styles';
import { Props, ContextUpdater } from './types';
import { compactLines } from './utils/compactLines';
import { buildGuruContext } from './guruContext';
import { extractMedicalConcepts } from './utils/extractMedicalConcepts';
import { formatQuizExplanation } from './utils/formatQuizExplanation';
import { stripImageFraming } from './utils/stripImageFraming';
import { isQuizImageHttpUrl } from './utils/isQuizImageHttpUrl';

import { TopicImage } from './shared/TopicImage';
import { QuestionImage } from './shared/QuestionImage';
import { ConfidenceRating } from './shared/ConfidenceRating';
import { ExplainablePoint } from './shared/ExplainablePoint';
import { ConceptChip } from './shared/ConceptChip';
import { DeepExplanationBlock } from './shared/DeepExplanationBlock';
import { QuizOptionBtn } from './shared/QuizOptionBtn';
import {
  useCardScrollPaddingBottom,
  useCardScrollContentStyle,
} from './hooks/useCardScrollPadding';
import { KeyPointsCard } from './cards/KeyPointsCard';
import { MustKnowCard } from './cards/MustKnowCard';
import { QuizCard } from './cards/QuizCard';
import { StoryCard } from './cards/StoryCard';
import { MnemonicCard } from './cards/MnemonicCard';
import { TeachBackCard } from './cards/TeachBackCard';
import { ErrorHuntCard } from './cards/ErrorHuntCard';
import { DetectiveCard } from './cards/DetectiveCard';
import { ManualReviewCard } from './cards/ManualReviewCard';
import { SocraticCard } from './cards/SocraticCard';
import { FlashcardCard } from './cards/FlashcardCard';

interface TopicImageProps {
  topicName: string;
}

export default React.memo(function ContentCardWithBoundary(props: Props) {
  return (
    <ErrorBoundary>
      <ContentCard {...props} />
    </ErrorBoundary>
  );
});

function ContentCard({
  content,
  topicId,
  contentType,
  onDone,
  onSkip,
  onQuizAnswered,
  onQuizComplete,
}: Props) {
  const [chatOpen, setChatOpen] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [liveGuruContext, setLiveGuruContext] = useState<string | undefined>(undefined);
  const hasMountedRef = React.useRef(false);
  const baseGuruContext = useMemo(() => buildGuruContext(content), [content]);
  const guruContext = useMemo(() => {
    if (baseGuruContext && liveGuruContext) {
      return `${baseGuruContext}\n\nCurrent study step:\n${liveGuruContext}`;
    }
    return liveGuruContext ?? baseGuruContext;
  }, [baseGuruContext, liveGuruContext]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    queueMicrotask(() => setLiveGuruContext(undefined));
  }, [content]);

  useEffect(() => {
    if (!topicId && flagged) {
      queueMicrotask(() => setFlagged(false));
    }
  }, [topicId, flagged]);

  useEffect(() => {
    let active = true;
    if (topicId) {
      void isContentFlagged(topicId, content.type).then((val) => {
        if (active && val !== flagged) queueMicrotask(() => setFlagged(val));
      });
    }
    return () => {
      active = false;
    };
  }, [topicId, content.type, flagged]);

  function handleFlag() {
    if (!topicId) return;
    const newFlagged = !flagged;
    setFlagged(newFlagged);
    void setContentFlagged(topicId, content.type, newFlagged);
    if (newFlagged) {
      void showInfo(
        'Flagged for review',
        'This content has been flagged. You can review all flagged items in the Flagged Review section.',
      );
    }
  }

  const handleQuizAnswered = useCallback(
    (correct: boolean) => {
      onQuizAnswered?.(correct);
    },
    [onQuizAnswered],
  );

  const Card = CARD_COMPONENTS[content.type];
  const card = Card ? (
    <Card
      content={content}
      topicId={topicId}
      contentType={contentType}
      onDone={onDone}
      onSkip={onSkip}
      onQuizAnswered={handleQuizAnswered}
      onQuizComplete={onQuizComplete}
      onContextChange={setLiveGuruContext}
    />
  ) : null;

  return (
    <LinearSurface padded={false} style={s.sessionCardShell}>
      <View style={s.sessionCardInner}>
        <View style={s.sessionCardBody}>{card}</View>
        <View style={s.cardActions}>
          {topicId ? (
            <TouchableOpacity
              style={[s.flagBtn, flagged && s.flagBtnActive]}
              onPress={handleFlag}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={flagged ? 'Unflag content' : 'Flag for review'}
            >
              <LinearText style={s.flagBtnText}>{flagged ? '🚩 Flagged' : '🏳 Flag'}</LinearText>
            </TouchableOpacity>
          ) : (
            <View />
          )}
        </View>
        {/* Floating Ask Guru FAB */}
        <TouchableOpacity
          style={s.askGuruFab}
          onPress={() => setChatOpen(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Ask Guru about this topic"
        >
          <Ionicons name="sparkles" size={20} color={n.colors.textPrimary} />
        </TouchableOpacity>
        <GuruChatOverlay
          visible={chatOpen}
          topicName={content.topicName}
          syllabusTopicId={topicId ?? undefined}
          contextText={guruContext}
          onClose={() => setChatOpen(false)}
        />
      </View>
    </LinearSurface>
  );
}

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
