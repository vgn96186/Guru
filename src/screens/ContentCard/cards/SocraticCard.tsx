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
// ── Detective ─────────────────────────────────────────────────────
// ── Manual Review ──────────────────────────────────────────────────
// ── SocraticCard ────────────────────────────────────────────────────────────
export function SocraticCard({
  content,
  topicId: _topicId,
  contentType: _contentType,
  onDone,
  onSkip,
  onContextChange,
}: { content: SocraticContent; onContextChange?: ContextUpdater } & Omit<Props, 'content'>) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const question = content.questions[index];
  const isLast = index === content.questions.length - 1;
  const socraticPadBottom = useCardScrollPaddingBottom(0);

  function next(knew: boolean) {
    if (isLast) {
      onDone(knew ? 4 : 2);
    } else {
      setIndex(index + 1);
      setRevealed(false);
    }
  }

  useEffect(() => {
    if (!content.questions || content.questions.length === 0) onDone(3);
  }, [content.questions, onDone]);

  useEffect(() => {
    if (!question) return;
    onContextChange?.(
      compactLines(
        [
          'Card type: Socratic',
          `Current question ${index + 1} of ${content.questions.length}: ${question.question}`,
          revealed ? `Answer shown: ${question.answer}` : 'Answer is not shown yet.',
          revealed ? `Why it matters: ${question.whyItMatters}` : '',
        ],
        4,
      ),
    );
  }, [content.questions.length, index, onContextChange, question, revealed]);

  if (!question) {
    return null;
  }

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: 'stretch' as const,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: socraticPadBottom,
      }}
    >
      <View style={{ paddingBottom: 4 }}>
        <LinearText
          style={{
            color: n.colors.accent,
            fontSize: 11,
            fontWeight: '800',
            letterSpacing: 1.2,
            marginBottom: 16,
          }}
        >
          QUESTION {index + 1} / {content.questions.length}
        </LinearText>

        <View
          style={{
            backgroundColor: n.colors.surface,
            borderRadius: 16,
            padding: 20,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: n.colors.border,
          }}
        >
          <LinearText
            style={{ color: n.colors.textPrimary, fontSize: 18, fontWeight: '700', lineHeight: 28 }}
          >
            {question.question}
          </LinearText>
        </View>

        {!revealed ? (
          <TouchableOpacity
            style={{
              backgroundColor: n.colors.accent,
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: 'center',
              marginBottom: 12,
            }}
            onPress={() => setRevealed(true)}
            activeOpacity={0.8}
          >
            <LinearText style={{ color: n.colors.background, fontWeight: '800', fontSize: 15 }}>
              Reveal Answer
            </LinearText>
          </TouchableOpacity>
        ) : (
          <>
            <View
              style={{
                backgroundColor: n.colors.surface,
                borderRadius: 16,
                padding: 20,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: n.colors.border,
              }}
            >
              <StudyMarkdown content={emphasizeHighYieldMarkdown(question.answer)} />
            </View>
            <LinearText
              style={{
                color: n.colors.textSecondary,
                fontSize: 12,
                fontStyle: 'italic',
                marginBottom: 20,
                paddingHorizontal: 4,
              }}
            >
              {question.whyItMatters}
            </LinearText>
            <LinearText
              style={{
                color: n.colors.textPrimary,
                fontSize: 14,
                fontWeight: '600',
                textAlign: 'center',
                marginBottom: 12,
              }}
            >
              Did you know this?
            </LinearText>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: `${n.colors.success}33`,
                  borderRadius: 14,
                  paddingVertical: 14,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: n.colors.success,
                }}
                onPress={() => next(true)}
                activeOpacity={0.8}
              >
                <LinearText style={{ color: n.colors.success, fontWeight: '800', fontSize: 15 }}>
                  Yes ✓
                </LinearText>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: `${n.colors.error}33`,
                  borderRadius: 14,
                  paddingVertical: 14,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: n.colors.error,
                }}
                onPress={() => next(false)}
                activeOpacity={0.8}
              >
                <LinearText style={{ color: n.colors.error, fontWeight: '800', fontSize: 15 }}>
                  Not quite
                </LinearText>
              </TouchableOpacity>
            </View>
          </>
        )}

        <TouchableOpacity
          style={s.skipBtn}
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip"
        >
          <LinearText style={s.skipText}>Skip topic</LinearText>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
