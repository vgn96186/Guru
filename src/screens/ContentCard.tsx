import React, { useEffect, useState, useMemo, useCallback } from 'react';

import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  Dimensions,
  useWindowDimensions,
  Platform,
} from 'react-native';
import LinearText from '../components/primitives/LinearText';
import { Ionicons } from '@expo/vector-icons';
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
} from '../types';

import { askGuru, explainMostTestedRationale, explainTopicDeeper, generateEscalatingQuiz, explainQuizConcept } from '../services/aiService';
import { fetchWikipediaImage } from '../services/imageService';
import { isContentFlagged, setContentFlagged } from '../db/queries/aiCache';
import GuruChatOverlay from '../components/GuruChatOverlay';
import ErrorBoundary from '../components/ErrorBoundary';
import AppText from '../components/AppText';
import StudyMarkdown from '../components/StudyMarkdown';
import { linearTheme as n } from '../theme/linearTheme';
import { emphasizeHighYieldMarkdown } from '../utils/highlightMarkdown';
import LinearSurface from '../components/primitives/LinearSurface';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface TopicImageProps {
  topicName: string;
}

const TopicImage = React.memo(function TopicImage({ topicName }: TopicImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    fetchWikipediaImage(topicName).then((url) => {
      if (active) setImageUrl(url);
    });
    return () => {
      active = false;
    };
  }, [topicName]);

  if (!imageUrl) return null;
  if (failed) return null;

  return (
    <Image
      source={{ uri: imageUrl }}
      style={s.topicImage}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
});

/** Client-side framing strip for when a resolved image URL fails to load in the UI. */
function stripImageFraming(text: string): string {
  const IMAGE_TYPES = 'image|imaging study|photograph|micrograph|radiograph|X-ray|CT scan|MRI|ECG|histology|slide|smear|specimen|scan|film';
  return text
    .replace(new RegExp(`\\b(Based on|Referring to|Looking at|In|From|Examining) the (${IMAGE_TYPES}) (shown|displayed|provided|above|below|here|given)[.,]?\\s*`, 'gi'), '')
    .replace(new RegExp(`\\b(Based on|Referring to|Looking at|In) the (provided|given|following) (${IMAGE_TYPES})[.,]?\\s*`, 'gi'), '')
    .replace(new RegExp(`The following (${IMAGE_TYPES}) (demonstrates|shows|reveals|depicts|illustrates)[.:]?\\s*`, 'gi'), '')
    .replace(new RegExp(`As (shown|seen|depicted|demonstrated|illustrated) in the (${IMAGE_TYPES})[.,]?\\s*`, 'gi'), '')
    .replace(new RegExp(`The (${IMAGE_TYPES}) (shows|reveals|demonstrates|depicts|illustrates)[.:]?\\s*`, 'gi'), '')
    .replace(new RegExp(`Consider the following (${IMAGE_TYPES})[.:]?\\s*`, 'gi'), '')
    .replace(new RegExp(`A (${IMAGE_TYPES}) (of this patient|of the patient)? ?(shows|reveals|demonstrates|depicts)[.:]?\\s*`, 'gi'), '')
    .replace(/^\s*[,.:;]\s*/, '')
    .replace(/^([a-z])/, (c) => c.toUpperCase());
}

function isQuizImageHttpUrl(url: string | null | undefined): boolean {
  const t = url?.trim();
  if (!t) return false;
  return /^https?:\/\//i.test(t);
}

/** Per-question medical image with tap-to-enlarge lightbox. */
const QuestionImage = React.memo(function QuestionImage({
  url,
  onFailed,
}: {
  url: string;
  onFailed?: () => void;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const screenW = Dimensions.get('window').width;
  const screenH = Dimensions.get('window').height;

  function handleError() {
    setFailed(true);
    onFailed?.();
  }

  if (failed) {
    return (
      <View
        style={{
          backgroundColor: `${n.colors.border}55`,
          borderRadius: 10,
          paddingVertical: 12,
          paddingHorizontal: 16,
          marginBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderWidth: 1,
          borderColor: n.colors.border,
        }}
      >
        <Ionicons name="image-outline" size={16} color={n.colors.textMuted} />
        <LinearText style={{ color: n.colors.textMuted, fontSize: 12, fontStyle: 'italic' }}>
          Image could not be loaded
        </LinearText>
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity activeOpacity={0.85} onPress={() => setLightboxOpen(true)}>
        <Image
          source={{ uri: url }}
          style={s.questionImage}
          resizeMode="contain"
          onError={handleError}
        />
        <LinearText style={s.tapToEnlarge}>Tap to enlarge</LinearText>
      </TouchableOpacity>
      <Modal
        visible={lightboxOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxOpen(false)}
      >
        <Pressable style={s.lightboxBackdrop} onPress={() => setLightboxOpen(false)}>
          <Image
            source={{ uri: url }}
            style={{ width: screenW * 0.95, height: screenH * 0.7 }}
            resizeMode="contain"
          />
        </Pressable>
      </Modal>
    </>
  );
});

interface Props {
  content: AIContent;
  topicId?: number;
  onDone: (confidence: number) => void;
  onSkip: () => void;
  onQuizAnswered?: (correct: boolean) => void;
  onQuizComplete?: (correct: number, total: number) => void;
}

type ContextUpdater = (context: string | undefined) => void;

export default React.memo(function ContentCardWithBoundary(props: Props) {
  return (
    <ErrorBoundary>
      <ContentCard {...props} />
    </ErrorBoundary>
  );
});

function compactLines(lines: string[], limit = 3): string {
  return lines
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, limit)
    .join('\n');
}

function buildGuruContext(content: AIContent): string | undefined {
  switch (content.type) {
    case 'keypoints':
      return compactLines([
        'Card type: Key points',
        `Points:\n${content.points
          .slice(0, 4)
          .map((point, index) => `${index + 1}. ${point}`)
          .join('\n')}`,
        `Memory hook: ${content.memoryHook}`,
      ]);
    case 'must_know':
      return compactLines([
        'Card type: Must Know & Most Tested',
        `Must know: ${content.mustKnow.join(' | ')}`,
        `Most tested: ${content.mostTested.join(' | ')}`,
        `Exam tip: ${content.examTip}`,
      ]);
    case 'quiz':
      return compactLines([
        'Card type: Quiz',
        `Topic: ${content.topicName}`,
        `Total questions: ${content.questions.length}`,
        'The live study step below contains the active question, all options, correct answer, and explanation.',
        'When answering student questions, first explain the broader concept being tested, then address the specific question.',
      ]);
    case 'story':
      return compactLines([
        'Card type: Story',
        `Story: ${content.story}`,
        `Highlights: ${content.keyConceptHighlights.join(' | ')}`,
      ]);
    case 'mnemonic':
      return compactLines(
        [
          'Card type: Mnemonic',
          `Mnemonic: ${content.mnemonic}`,
          `Expansion: ${content.expansion.join(' | ')}`,
          `Tip: ${content.tip}`,
        ],
        4,
      );
    case 'teach_back':
      return compactLines(
        [
          'Card type: Teach-back',
          `Prompt: ${content.prompt}`,
          `Key points to mention: ${content.keyPointsToMention.join(' | ')}`,
          `Guru reaction target: ${content.guruReaction}`,
        ],
        4,
      );
    case 'error_hunt':
      return compactLines(
        [
          'Card type: Error hunt',
          `Paragraph: ${content.paragraph}`,
          ...content.errors
            .slice(0, 2)
            .map(
              (error, index) =>
                `Error ${index + 1}: wrong "${error.wrong}", correct "${error.correct}". ${error.explanation}`,
            ),
        ],
        4,
      );
    case 'detective':
      return compactLines(
        [
          'Card type: Detective',
          `Clues: ${content.clues.join(' | ')}`,
          `Answer: ${content.answer}`,
          `Explanation: ${content.explanation}`,
        ],
        4,
      );
    case 'manual':
      return 'Card type: Manual review';
    case 'socratic':
      return compactLines(
        [
          'Card type: Socratic',
          ...content.questions
            .slice(0, 3)
            .map(
              (question, index) =>
                `Q${index + 1}: ${question.question}\nAnswer: ${question.answer}\nWhy it matters: ${question.whyItMatters}`,
            ),
        ],
        4,
      );
    default:
      return undefined;
  }
}

function ContentCard({ content, topicId, onDone, onSkip, onQuizAnswered, onQuizComplete }: Props) {
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
    setLiveGuruContext(undefined);
  }, [content]);

  useEffect(() => {
    if (!topicId && flagged) {
      setFlagged(false);
    }
  }, [topicId, flagged]);

  useEffect(() => {
    let active = true;
    if (topicId) {
      void isContentFlagged(topicId, content.type).then((val) => {
        if (active && val !== flagged) setFlagged(val);
      });
    }
    return () => {
      active = false;
    };
  }, [topicId, content.type]);

  function handleFlag() {
    if (!topicId) return;
    const newFlagged = !flagged;
    setFlagged(newFlagged);
    void setContentFlagged(topicId, content.type, newFlagged);
    if (newFlagged)
      Alert.alert(
        'Flagged for review',
        'This content has been flagged. You can review all flagged items in the Flagged Review section.',
      );
  }

  const handleQuizAnswered = useCallback(
    (correct: boolean) => {
      onQuizAnswered?.(correct);
    },
    [onQuizAnswered],
  );

  const card = useMemo(() => {
    switch (content.type) {
      case 'keypoints':
        return (
          <KeyPointsCard
            content={content}
            onDone={onDone}
            onSkip={onSkip}
            onContextChange={setLiveGuruContext}
          />
        );
      case 'must_know':
        return <MustKnowCard content={content} onDone={onDone} onSkip={onSkip} />;
      case 'quiz':
        return (
          <QuizCard
            content={content}
            onDone={onDone}
            onSkip={onSkip}
            onQuizAnswered={handleQuizAnswered}
            onQuizComplete={onQuizComplete}
            onContextChange={setLiveGuruContext}
          />
        );
      case 'story':
        return <StoryCard content={content} onDone={onDone} onSkip={onSkip} />;
      case 'mnemonic':
        return (
          <MnemonicCard
            content={content}
            onDone={onDone}
            onSkip={onSkip}
            onContextChange={setLiveGuruContext}
          />
        );
      case 'teach_back':
        return (
          <TeachBackCard
            content={content}
            onDone={onDone}
            onSkip={onSkip}
            onContextChange={setLiveGuruContext}
          />
        );
      case 'error_hunt':
        return (
          <ErrorHuntCard
            content={content}
            onDone={onDone}
            onSkip={onSkip}
            onContextChange={setLiveGuruContext}
          />
        );
      case 'detective':
        return (
          <DetectiveCard
            content={content}
            onDone={onDone}
            onSkip={onSkip}
            onContextChange={setLiveGuruContext}
          />
        );
      case 'manual':
        return <ManualReviewCard content={content} onDone={onDone} onSkip={onSkip} />;
      case 'socratic':
        return (
          <SocraticCard
            content={content}
            onDone={onDone}
            onSkip={onSkip}
            onContextChange={setLiveGuruContext}
          />
        );
      case 'flashcards':
        return <FlashcardCard content={content} onDone={onDone} onSkip={onSkip} />;
      default:
        return null;
    }
  }, [content, onDone, onSkip, handleQuizAnswered, onQuizComplete]);

  return (
    <View style={{ flex: 1 }}>
      {card}
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
        <TouchableOpacity
          style={s.askGuruBtn}
          onPress={() => setChatOpen(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Ask Guru about this topic"
        >
          <LinearText style={s.askGuruText}>Ask Guru</LinearText>
        </TouchableOpacity>
      </View>
      <GuruChatOverlay
        visible={chatOpen}
        topicName={content.topicName}
        syllabusTopicId={topicId ?? undefined}
        contextText={guruContext}
        onClose={() => setChatOpen(false)}
      />
    </View>
  );
}

function ConfidenceRating({ onRate }: { onRate: (n: number) => void }) {
  return (
    <View style={s.ratingContainer}>
      <LinearText style={s.ratingTitle}>How well did you get this?</LinearText>
      <View style={s.ratingRow}>
        <TouchableOpacity
          style={[s.ratingBtn, { flex: 1, borderColor: n.colors.error }]}
          onPress={() => onRate(0)}
          activeOpacity={0.8}
        >
          <LinearText style={[s.ratingNum, { color: n.colors.error, fontSize: 15 }]}>
            Not yet
          </LinearText>
          <LinearText style={s.ratingLabel}>😕</LinearText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.ratingBtn, { flex: 1, borderColor: n.colors.warning }]}
          onPress={() => onRate(1)}
          activeOpacity={0.8}
        >
          <LinearText style={[s.ratingNum, { color: n.colors.warning, fontSize: 15 }]}>
            Will forget
          </LinearText>
          <LinearText style={s.ratingLabel}>🤔</LinearText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.ratingBtn, { flex: 1, borderColor: n.colors.success }]}
          onPress={() => onRate(3)}
          activeOpacity={0.8}
        >
          <LinearText style={[s.ratingNum, { color: n.colors.success, fontSize: 15 }]}>
            Got it!
          </LinearText>
          <LinearText style={s.ratingLabel}>🔥</LinearText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Key Points ────────────────────────────────────────────────────

function KeyPointsCard({
  content,
  onDone,
  onSkip,
  onContextChange,
}: { content: KeyPointsContent; onContextChange?: ContextUpdater } & Omit<Props, 'content'>) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [revealIndex, setRevealIndex] = useState(0);
  const [showRating, setShowRating] = useState(false);

  const isFullyRevealed = revealIndex >= content.points.length;

  useEffect(() => {
    const revealedPoints = content.points.slice(0, revealIndex + 1);
    onContextChange?.(
      compactLines([
        `Card type: Key points`,
        `Currently visible points: ${revealedPoints.join(' | ')}`,
        isFullyRevealed ? `Memory hook visible: ${content.memoryHook}` : '',
      ]),
    );
  }, [content, revealIndex, isFullyRevealed, onContextChange]);

  const POINT_COLORS = [
    n.colors.accent,
    n.colors.error,
    n.colors.warning,
    n.colors.success,
    n.colors.error,
    n.colors.accent,
  ];

  const scrollContentStyle = useCardScrollContentStyle(0);

  return (
    <ScrollView
      key={`${viewportWidth}x${viewportHeight}`}
      style={s.scroll}
      contentContainerStyle={scrollContentStyle}
    >
      <LinearText style={s.cardType}>KEY POINTS</LinearText>
      <AppText style={s.cardTitle} numberOfLines={3} variant="title">
        {content.topicName}
      </AppText>
      <LinearText style={s.kpProgress}>
        {Math.min(revealIndex + 1, content.points.length)} / {content.points.length}
      </LinearText>
      <TopicImage topicName={content.topicName} />
      <View style={s.pointsContainer}>
        {content.points.slice(0, revealIndex + 1).map((pt, i) => {
          const color = POINT_COLORS[i % POINT_COLORS.length];
          return (
            <View key={i} style={[s.kpCard, { borderLeftColor: color }]}>
              <View style={[s.kpNumber, { backgroundColor: color + '22' }]}>
                <LinearText style={[s.kpNumberText, { color }]}>{i + 1}</LinearText>
              </View>
              <View style={s.kpContent}>
                <StudyMarkdown content={emphasizeHighYieldMarkdown(pt)} compact />
              </View>
            </View>
          );
        })}
      </View>
      {isFullyRevealed && (
        <View style={s.hookBox}>
          <LinearText style={s.hookLabel}>Memory Hook</LinearText>
          <StudyMarkdown content={emphasizeHighYieldMarkdown(content.memoryHook)} compact />
        </View>
      )}
      {!isFullyRevealed ? (
        <TouchableOpacity
          style={s.doneBtn}
          onPress={() => setRevealIndex((i) => i + 1)}
          activeOpacity={0.8}
        >
          <LinearText style={s.doneBtnText}>
            Next ({revealIndex + 1}/{content.points.length})
          </LinearText>
        </TouchableOpacity>
      ) : !showRating ? (
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

// ── Must Know & Most Tested ──────────────────────────────────────

function ExplainablePoint({
  item,
  topicName,
  color,
}: {
  item: string;
  topicName: string;
  color: string;
}) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleExplain() {
    if (explanation) return;
    setLoading(true);
    try {
      const resp = await explainMostTestedRationale(item, topicName);
      setExplanation(resp);
    } catch (err) {
      setExplanation('Could not load explanation. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[s.mkItem, { borderLeftColor: color }]}>
      <StudyMarkdown content={emphasizeHighYieldMarkdown(item)} compact />
      {explanation ? (
        <View style={s.explSection}>
          <LinearText style={s.explSectionTitle}>GURU'S EXPLANATION</LinearText>
          <StudyMarkdown content={emphasizeHighYieldMarkdown(explanation)} />
        </View>
      ) : loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}>
          <ActivityIndicator size="small" color={n.colors.accent} />
          <LinearText style={{ color: n.colors.textSecondary, fontSize: 13, fontStyle: 'italic' }}>
            Explaining...
          </LinearText>
        </View>
      ) : (
        <TouchableOpacity style={s.smallExplainBtn} onPress={handleExplain} activeOpacity={0.8}>
          <Ionicons name="sparkles" size={14} color={n.colors.accent} />
          <LinearText style={s.smallExplainText}>Explain this</LinearText>
        </TouchableOpacity>
      )}
    </View>
  );
}

function MustKnowCard({
  content,
  onDone,
  onSkip,
}: { content: MustKnowContent } & Omit<Props, 'content'>) {
  const [showRating, setShowRating] = useState(false);
  const scrollContentStyle = useCardScrollContentStyle(0);

  return (
    <ScrollView style={s.scroll} contentContainerStyle={scrollContentStyle}>
      <LinearText style={s.cardType}>MUST KNOW</LinearText>
      <LinearText style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
        {content.topicName}
      </LinearText>
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

// ── Concept Chip (inline tap-to-explain) ─────────────────────────

/**
 * Extracts likely medical concepts worth explaining from a quiz question + options.
 * Looks for: lab values (Na, K, Hb...), named signs/tests, drug names, and specific measurements.
 */
function extractMedicalConcepts(question: string, options: string[], correctAnswer: string): string[] {
  const combined = `${question} ${options.join(' ')}`;
  const found: string[] = [];

  // Lab values / named signs patterns
  const patterns = [
    /\b(serum\s+\w+|\w+\s+level)\b/gi,
    /\b([A-Z][a-z]+\s+(sign|test|syndrome|disease|law|index|score|criteria|classification|reflex|phenomenon|reaction))\b/g,
    /\b(pH\s*[\d.]+|pO2|pCO2|HbA1c|INR|PT|APTT|ESR|CRP|AST|ALT|ALP|GFR|creatinine)\b/gi,
    /\b(\d+\s*(mg|g|mmol|mEq|IU|U\/L|μmol|nmol|pmol)\/[dLlmgk]+)\b/gi,
  ];

  for (const pattern of patterns) {
    const matches = combined.match(pattern) ?? [];
    for (const m of matches) {
      const clean = m.trim();
      if (clean.length > 3 && !found.includes(clean)) found.push(clean);
    }
  }

  // Also extract the correct answer text (without option prefix)
  const answerText = correctAnswer.replace(/^[A-D][.)]\s*/,'').trim();
  if (answerText.length > 5 && answerText.length < 60 && !found.includes(answerText)) {
    found.unshift(answerText); // correct answer concept is highest priority
  }

  return found.slice(0, 3); // max 3 chips to avoid clutter
}

function ConceptChip({ concept, topicName }: { concept: string; topicName: string }) {
  const [expanded, setExpanded] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleExpand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (explanation) return;
    setLoading(true);
    try {
      const result = await explainQuizConcept(concept, topicName);
      setExplanation(result);
    } catch {
      setExplanation('Could not load explanation.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ marginBottom: 6 }}>
      <TouchableOpacity
        onPress={handleExpand}
        activeOpacity={0.8}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: expanded ? `${n.colors.accent}22` : n.colors.surface,
          borderRadius: 20,
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderWidth: 1,
          borderColor: expanded ? `${n.colors.accent}66` : n.colors.border,
          alignSelf: 'flex-start',
        }}
      >
        <Ionicons name="information-circle-outline" size={13} color={n.colors.accent} />
        <LinearText style={{ color: n.colors.textPrimary, fontSize: 12, fontWeight: '600' }}>
          {concept.length > 35 ? `${concept.slice(0, 33)}…` : concept}
        </LinearText>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color={n.colors.textSecondary} />
      </TouchableOpacity>
      {expanded && (
        <View
          style={{
            backgroundColor: n.colors.surface,
            borderRadius: 10,
            padding: 12,
            marginTop: 4,
            borderWidth: 1,
            borderColor: `${n.colors.accent}33`,
          }}
        >
          {loading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ActivityIndicator size="small" color={n.colors.accent} />
              <LinearText style={{ color: n.colors.textSecondary, fontSize: 12 }}>
                Explaining...
              </LinearText>
            </View>
          ) : explanation ? (
            <StudyMarkdown content={emphasizeHighYieldMarkdown(explanation)} compact />
          ) : null}
        </View>
      )}
    </View>
  );
}

// ── Deep Explanation with Reveal ─────────────────────────────────

/** Parses ||answer|| reveal blocks from deep explanation text and renders them as tap-to-reveal. */
function DeepExplanationBlock({ explanation }: { explanation: string }) {
  // Split on the "Quick check:" line to separate main body from check question
  const quickCheckMatch = explanation.match(/^([\s\S]*?)(Quick check:[\s\S]*)$/im);
  const mainBody = quickCheckMatch ? quickCheckMatch[1].trim() : explanation.trim();
  const checkLine = quickCheckMatch ? quickCheckMatch[2].trim() : null;

  // Parse ||answer|| from the check line
  const revealMatch = checkLine?.match(/^(Quick check:.*?)\|\|(.+?)\|\|(.*)$/is);
  const checkQuestion = revealMatch ? revealMatch[1].trim() : checkLine;
  const revealAnswer = revealMatch ? revealMatch[2].trim() : null;
  const checkRemainder = revealMatch ? revealMatch[3].trim() : null;

  const [answerRevealed, setAnswerRevealed] = useState(false);

  return (
    <View
      style={[
        s.explBox,
        s.explBoxDeep,
        { borderLeftWidth: 3, borderLeftColor: n.colors.accent },
      ]}
    >
      <View style={s.inlineLabelRow}>
        <Ionicons name="school-outline" size={14} color={n.colors.accent} />
        <LinearText style={s.explSectionTitle}>Deeper Explanation</LinearText>
      </View>
      <StudyMarkdown content={emphasizeHighYieldMarkdown(mainBody)} />

      {checkQuestion && (
        <View
          style={{
            marginTop: 14,
            backgroundColor: n.colors.surface,
            borderRadius: 12,
            padding: 14,
            borderWidth: 1,
            borderColor: n.colors.borderHighlight,
          }}
        >
          <View style={[s.inlineLabelRow, { marginBottom: 8 }]}>
            <Ionicons name="help-circle-outline" size={14} color={n.colors.warning} />
            <LinearText style={[s.explSectionTitle, { color: n.colors.warning }]}>
              Check Your Understanding
            </LinearText>
          </View>
          <LinearText style={{ color: n.colors.textPrimary, fontSize: 14, lineHeight: 20 }}>
            {checkQuestion.replace(/^Quick check:\s*/i, '')}
          </LinearText>
          {checkRemainder ? (
            <LinearText style={{ color: n.colors.textSecondary, fontSize: 13, marginTop: 4 }}>
              {checkRemainder}
            </LinearText>
          ) : null}
          {revealAnswer && !answerRevealed && (
            <TouchableOpacity
              style={{
                marginTop: 10,
                backgroundColor: `${n.colors.warning}22`,
                borderRadius: 10,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderWidth: 1,
                borderColor: `${n.colors.warning}55`,
                alignItems: 'center',
              }}
              onPress={() => setAnswerRevealed(true)}
              activeOpacity={0.8}
            >
              <LinearText style={{ color: n.colors.warning, fontWeight: '700', fontSize: 13 }}>
                Reveal Answer
              </LinearText>
            </TouchableOpacity>
          )}
          {revealAnswer && answerRevealed && (
            <View
              style={{
                marginTop: 10,
                backgroundColor: `${n.colors.success}11`,
                borderRadius: 10,
                padding: 12,
                borderWidth: 1,
                borderColor: `${n.colors.success}33`,
              }}
            >
              <StudyMarkdown content={emphasizeHighYieldMarkdown(revealAnswer)} compact />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── Quiz ──────────────────────────────────────────────────────────

function formatQuizExplanation(
  rawExplanation: string,
  options: string[],
  correctIndex: number,
): string {
  const decoded = rawExplanation
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
    // Repair common malformed option-label markdown like "**A\nLower trunk**"
    .replace(/\*\*([A-D])\s*\n\s*/g, '**$1. ')
    // Keep option labels on one line before sentence splitting
    .replace(/\b([A-D])\.\s*\n\s*/g, '$1. ')
    .trim();

  if (!decoded) return 'No explanation available.';

  // Keep already-structured markdown untouched.
  if ((/^#{1,3}\s/m.test(decoded) || /^-\s/m.test(decoded)) && decoded.includes('\n')) {
    return decoded;
  }

  const normalized = decoded
    // Protect option prefixes from sentence splitting ("A. ...", "B. ...")
    .replace(/\b([A-D])\.\s+/g, '$1) ')
    .replace(/\s+/g, ' ')
    .trim();
  const withoutPrefix = normalized.replace(/^Correct Answer\s*:\s*[A-D][.)]?\s*/i, '').trim();
  const body = withoutPrefix || normalized;

  const optionSplitPoints = body
    .replace(/\sOption\s+([A-D])\b/gi, '\nOption $1')
    .replace(/\s([A-D])\.\s+/g, '\n$1. ')
    .replace(/\s([A-D])\)\s+/g, '\n$1. ');

  const optionAnchoredLines = optionSplitPoints
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const explicitOptionLines = optionAnchoredLines.filter(
    (line) => /^[A-D][.)]\s+/.test(line) || /^Option\s+[A-D]\b/i.test(line),
  );

  const sentences = body
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((sentence) => sentence.replace(/\b([A-D])\)\s+/g, '$1. ').trim())
    .filter(Boolean);

  const whyCorrect = sentences.slice(0, 2);
  const whyOthersWrong = explicitOptionLines.length > 0 ? explicitOptionLines : sentences.slice(2);
  const fallbackPoint = sentences[0] ?? body;

  const correctOption = options[correctIndex] ?? '';
  const correctLetter =
    Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex < options.length
      ? String.fromCharCode(65 + correctIndex)
      : 'N/A';

  const whyCorrectSection = (whyCorrect.length > 0 ? whyCorrect : [fallbackPoint])
    .map((point) => `- ${point}`)
    .join('\n');

  const wrongSection = (
    whyOthersWrong.length > 0
      ? whyOthersWrong
      : ['Eliminate distractors using the most specific vignette clues and pathophysiology.']
  )
    .map((point) => {
      const cleaned = point.replace(/^-\s*/, '').trim();
      const optionWordMatch = cleaned.match(/^Option\s+([A-D])\s*(?:[:.)-])?\s*(.*)$/i);
      if (optionWordMatch) {
        const letter = optionWordMatch[1].toUpperCase();
        const rest = optionWordMatch[2].trim();
        return `- **${letter}.** ${rest}`;
      }
      if (/^[A-D][.)]\s+/.test(cleaned))
        return `- **${cleaned.slice(0, 2).replace(')', '.')}** ${cleaned.slice(2).trim()}`;
      return `- ${cleaned}`;
    })
    .join('\n');

  return `### Correct answer
**${correctLetter}. ${correctOption || 'See options above'}**

### Why this is correct
${whyCorrectSection}

### Why other options are wrong
${wrongSection}`;
}

function QuizCard({
  content,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          `Options: ${q.options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join(' | ')}`,
          `Correct Answer: ${String.fromCharCode(65 + q.correctIndex)}. ${q.options[q.correctIndex]}`,
          selected !== null
            ? `Student chose: ${selected === -1 ? "I don't know (revealed answer)" : `${String.fromCharCode(65 + selected)}. ${q.options[selected]} — ${selected === q.correctIndex ? 'CORRECT' : 'INCORRECT'}`}`
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

  if (!q) return null;

  function handleSelect(idx: number) {
    if (selected !== null) return;
    setSelected(idx);
    setShowExpl(true);
    setDeepExplanation(null);
    const correct = idx === q.correctIndex;
    if (correct) {
      setScore((s) => {
        const next = s + 1;
        scoreRef.current = next;
        return next;
      });
    } else {
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
      setKeepQuizzing(true); // show Keep Quizzing / Done choice
    }
  }

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
      <LinearText style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
        {content.topicName}
      </LinearText>
      {isQuizImageHttpUrl(q.imageUrl) ? (
        <QuestionImage
          url={q.imageUrl!.trim()}
          onFailed={() => setFailedImageIndices(prev => new Set([...prev, currentQ]))}
        />
      ) : null}
      <LinearText style={s.questionText}>
        {failedImageIndices.has(currentQ) ? stripImageFraming(q.question) : q.question}
      </LinearText>
      <View style={s.optionsContainer}>
        {q.options.map((opt, idx) => {
          let bgColor = n.colors.surface as string;
          let borderColor = n.colors.border as string;
          if (selected !== null) {
            if (idx === q.correctIndex) {
              bgColor = n.colors.successSurface as string;
              borderColor = n.colors.success as string;
            } else if (idx === selected) {
              bgColor = n.colors.errorSurface as string;
              borderColor = n.colors.error as string;
            }
          }
          return (
            <TouchableOpacity
              key={idx}
              style={[s.optionBtn, { backgroundColor: bgColor, borderColor }]}
              onPress={() => handleSelect(idx)}
              activeOpacity={0.8}
            >
              <LinearText style={s.optionText} numberOfLines={4}>
                {opt}
              </LinearText>
            </TouchableOpacity>
          );
        })}
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
      {showExpl && (() => {
        const concepts = extractMedicalConcepts(q.question, q.options, q.options[q.correctIndex] ?? '');
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
          <ActivityIndicator size="small" color={n.colors.accent} />
          <LinearText style={s.deepExplLoadingText}>Guru is explaining...</LinearText>
        </View>
      )}
      {deepExplanation && (
        <DeepExplanationBlock explanation={deepExplanation} />
      )}
      {isLoadingEscalated && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 8 }}>
          <ActivityIndicator size="small" color={n.colors.accent} />
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
          <LinearText style={{ color: n.colors.textPrimary, fontWeight: '700', fontSize: 15, textAlign: 'center' }}>
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
            style={[s.doneBtn, { backgroundColor: n.colors.card, borderWidth: 1, borderColor: n.colors.border }]}
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

// ── Story ─────────────────────────────────────────────────────────

function StoryCard({
  content,
  onDone,
  onSkip,
}: { content: StoryContent } & Omit<Props, 'content'>) {
  const [showRating, setShowRating] = useState(false);
  const scrollContentStyle = useCardScrollContentStyle(0);
  return (
    <ScrollView style={s.scroll} contentContainerStyle={scrollContentStyle}>
      <LinearText style={s.cardType}>📖 CLINICAL STORY</LinearText>
      <LinearText style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
        {content.topicName}
      </LinearText>
      <TopicImage topicName={content.topicName} />
      <View style={{ marginBottom: 20 }}>
        <StudyMarkdown content={emphasizeHighYieldMarkdown(content.story)} />
      </View>
      <View style={s.highlightsBox}>
        <LinearText style={s.highlightsLabel}>Key concepts in this story:</LinearText>
        <View style={s.highlightChips}>
          {content.keyConceptHighlights.map((kw, i) => (
            <View key={i} style={s.chip}>
              <LinearText style={s.chipText}>{kw}</LinearText>
            </View>
          ))}
        </View>
      </View>
      {!showRating ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setShowRating(true)} activeOpacity={0.8}>
          <LinearText style={s.doneBtnText}>Read it →</LinearText>
        </TouchableOpacity>
      ) : (
        <ConfidenceRating onRate={onDone} />
      )}
      <TouchableOpacity
        onPress={onSkip}
        style={s.skipBtn}
        accessibilityRole="button"
        accessibilityLabel="Skip"
      >
        <LinearText style={s.skipText}>Skip story</LinearText>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Mnemonic ──────────────────────────────────────────────────────

function MnemonicCard({
  content,
  onDone,
  onSkip,
  onContextChange,
}: { content: MnemonicContent; onContextChange?: ContextUpdater } & Omit<Props, 'content'>) {
  const [revealStep, setRevealStep] = useState(0);
  const [showRating, setShowRating] = useState(false);

  useEffect(() => {
    onContextChange?.(
      compactLines(
        [
          'Card type: Mnemonic',
          `Mnemonic visible: ${content.mnemonic}`,
          revealStep >= 1
            ? `Expansion visible: ${content.expansion.join(' | ')}`
            : 'Expansion is hidden.',
          revealStep >= 2 ? `Tip visible: ${content.tip}` : 'Tip is hidden.',
        ],
        4,
      ),
    );
  }, [content, onContextChange, revealStep]);

  const scrollContentStyle = useCardScrollContentStyle(0);

  return (
    <ScrollView style={s.scroll} contentContainerStyle={scrollContentStyle}>
      <LinearText style={s.cardType}>🧠 MNEMONIC</LinearText>
      <LinearText style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
        {content.topicName}
      </LinearText>
      <TopicImage topicName={content.topicName} />
      <View style={s.mnemonicBox}>
        <LinearText style={s.mnemonicMain}>{content.mnemonic}</LinearText>
      </View>
      <View style={s.expansionList}>
        {revealStep >= 1 &&
          content.expansion.map((line, i) => (
            <View key={i} style={{ paddingLeft: 8 }}>
              <StudyMarkdown content={emphasizeHighYieldMarkdown(line)} compact />
            </View>
          ))}
      </View>
      {revealStep >= 2 && (
        <View style={s.hookBox}>
          <LinearText style={s.hookLabel}>💡 Tip</LinearText>
          <StudyMarkdown content={emphasizeHighYieldMarkdown(content.tip)} compact />
        </View>
      )}
      {revealStep < 2 ? (
        <TouchableOpacity
          style={s.doneBtn}
          onPress={() => setRevealStep((i) => i + 1)}
          activeOpacity={0.8}
        >
          <LinearText style={s.doneBtnText}>
            {revealStep === 0 ? 'Decode it →' : 'Show tip →'}
          </LinearText>
        </TouchableOpacity>
      ) : !showRating ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setShowRating(true)} activeOpacity={0.8}>
          <LinearText style={s.doneBtnText}>Got it →</LinearText>
        </TouchableOpacity>
      ) : (
        <ConfidenceRating onRate={onDone} />
      )}
      <TouchableOpacity
        onPress={onSkip}
        style={s.skipBtn}
        accessibilityRole="button"
        accessibilityLabel="Skip"
      >
        <LinearText style={s.skipText}>Skip mnemonic</LinearText>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Teach Back ────────────────────────────────────────────────────

function TeachBackCard({
  content,
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
      const context = `Topic: ${content.topicName}. Expected points: ${content.keyPointsToMention.join(', ')}`;
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
      <LinearText style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
        {content.topicName}
      </LinearText>
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
              <ActivityIndicator color="#fff" />
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

// ── Error Hunt ────────────────────────────────────────────────────

function ErrorHuntCard({
  content,
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
      <LinearText style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
        {content.topicName}
      </LinearText>
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

// ── Detective ─────────────────────────────────────────────────────

function DetectiveCard({
  content,
  onDone,
  onSkip,
  onContextChange,
}: { content: DetectiveContent; onContextChange?: ContextUpdater } & Omit<Props, 'content'>) {
  const [revealedClues, setRevealedClues] = useState(1);
  const [solved, setSolved] = useState(false);

  useEffect(() => {
    onContextChange?.(
      compactLines(
        [
          'Card type: Detective',
          `Diagnosis (Student shouldn't know yet unless solved): ${content.answer}`,
          `Explanation: ${content.explanation}`,
          `All Clues: ${content.clues.join(' | ')}`,
          `Visible Clues count: ${revealedClues}`,
          solved ? 'Student has solved/seen result.' : 'Student is still investigating.',
        ],
        7,
      ),
    );
  }, [content, onContextChange, revealedClues, solved]);
  const scrollContentStyle = useCardScrollContentStyle(0);
  return (
    <ScrollView style={s.scroll} contentContainerStyle={scrollContentStyle}>
      <LinearText style={s.cardType}>🕵️ CLINICAL DETECTIVE</LinearText>
      <LinearText style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
        {content.topicName}
      </LinearText>
      <TopicImage topicName={content.topicName} />
      {content.clues.slice(0, revealedClues).map((clue, i) => (
        <View key={i} style={[s.clueBox, i === revealedClues - 1 && s.clueBoxNew]}>
          <LinearText style={s.clueNum}>Clue {i + 1}</LinearText>
          <LinearText style={s.clueText}>{clue}</LinearText>
        </View>
      ))}
      {!solved ? (
        <View style={s.detectiveActions}>
          {revealedClues < content.clues.length && (
            <TouchableOpacity
              style={[s.doneBtn, s.hintBtn]}
              onPress={() => setRevealedClues((c) => c + 1)}
              activeOpacity={0.8}
            >
              <LinearText style={s.doneBtnText}>Reveal next clue</LinearText>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.doneBtn} onPress={() => setSolved(true)} activeOpacity={0.8}>
            <LinearText style={s.doneBtnText}>I know the answer →</LinearText>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.iDontKnowBtn}
            onPress={() => {
              setRevealedClues(content.clues.length);
              setSolved(true);
            }}
            activeOpacity={0.8}
          >
            <LinearText style={s.iDontKnowText}>I don't know</LinearText>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={s.explBox}>
            <LinearText style={s.explLabel}>Diagnosis:</LinearText>
            <LinearText
              style={[s.explText, { color: n.colors.success, fontSize: 18, fontWeight: '700' }]}
            >
              {content.answer}
            </LinearText>
            <View style={{ marginTop: 4 }}>
              <StudyMarkdown content={emphasizeHighYieldMarkdown(content.explanation)} />
            </View>
          </View>
          <ConfidenceRating onRate={onDone} />
        </>
      )}
      <TouchableOpacity
        onPress={onSkip}
        style={s.skipBtn}
        accessibilityRole="button"
        accessibilityLabel="Skip"
      >
        <LinearText style={s.skipText}>Skip case</LinearText>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Manual Review ──────────────────────────────────────────────────

function ManualReviewCard({
  content,
  onDone,
  onSkip,
}: { content: ManualContent } & Omit<Props, 'content'>) {
  const [showRating, setShowRating] = useState(false);
  const scrollContentStyle = useCardScrollContentStyle(0);
  return (
    <ScrollView style={s.scroll} contentContainerStyle={scrollContentStyle}>
      <LinearText style={s.cardType}>📴 MANUAL REVIEW (OFFLINE)</LinearText>
      <LinearText style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
        {content.topicName}
      </LinearText>
      <TopicImage topicName={content.topicName} />

      <View style={s.offlineBox}>
        <LinearText style={s.offlineEmoji}>📡❌</LinearText>
        <LinearText style={s.offlineText}>
          Guru is offline or AI is unavailable. Spend 2-5 minutes recalling everything you know
          about this topic.
        </LinearText>
      </View>

      <LinearText style={s.promptText}>
        Close your eyes and try to visualize:
        {'\n'}• Classification / Types
        {'\n'}• Clinical presentation
        {'\n'}• Gold standard diagnosis
        {'\n'}• First-line treatment
      </LinearText>

      {!showRating ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setShowRating(true)} activeOpacity={0.8}>
          <LinearText style={s.doneBtnText}>I've reviewed it →</LinearText>
        </TouchableOpacity>
      ) : (
        <ConfidenceRating onRate={onDone} />
      )}
      <TouchableOpacity
        onPress={onSkip}
        style={s.skipBtn}
        accessibilityRole="button"
        accessibilityLabel="Skip"
      >
        <LinearText style={s.skipText}>Skip topic</LinearText>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── SocraticCard ────────────────────────────────────────────────────────────
function SocraticCard({
  content,
  onDone,
  onSkip,
  onContextChange,
}: {
  content: SocraticContent;
  onDone: (confidence: number) => void;
  onSkip: () => void;
  onContextChange?: ContextUpdater;
}) {
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

  if (!question) {
    return null;
  }

  useEffect(() => {
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

const s = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0, minWidth: 0 },
  // stretch: default flex-start shrink-wraps children; markdown rows then mis-measure width
  // (last words clipped on Android, esp. landscape with plenty of horizontal space).
  container: {
    padding: 20,
    paddingBottom: 72,
    alignItems: 'stretch' as const,
    flexGrow: 1,
  },
  cardType: {
    color: n.colors.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  inlineLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardTitle: {
    color: n.colors.textPrimary,
    fontWeight: '800',
    fontSize: 22,
    marginBottom: 20,
    lineHeight: 28,
    minWidth: 0,
    width: '100%',
  },
  topicImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: n.colors.surface,
  },
  questionImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    marginBottom: 4,
    backgroundColor: n.colors.surface,
  },
  tapToEnlarge: {
    color: n.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center' as const,
    marginBottom: 14,
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  pointsContainer: { marginBottom: 16, gap: 10 },
  pointRow: { flexDirection: 'row' as const, marginBottom: 12 },
  bullet: { color: n.colors.accent, fontSize: 16, marginRight: 10, marginTop: 1 },
  pointText: { color: n.colors.textPrimary, fontSize: 15, flex: 1, lineHeight: 22 },
  kpCard: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    alignSelf: 'stretch' as const,
    minWidth: 0,
    backgroundColor: n.colors.surface,
    borderRadius: 12,
    borderLeftWidth: 3,
    padding: 12,
    gap: 10,
  },
  kpNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  kpNumberText: {
    fontSize: 13,
    fontWeight: '800' as const,
  },
  kpContent: {
    flex: 1,
    minWidth: 0,
  },
  kpProgress: {
    color: n.colors.textMuted,
    fontSize: 12,
    fontWeight: '600' as const,
    marginBottom: 12,
  },
  hookBox: {
    backgroundColor: n.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: n.colors.accent + '44',
  },
  hookLabel: {
    color: n.colors.accent,
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  hookText: { color: n.colors.textPrimary, fontSize: 14, fontStyle: 'italic' as const },
  doneBtn: {
    backgroundColor: 'rgba(109,153,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(130,170,255,0.24)',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  disabledBtn: { opacity: 0.5 },
  doneBtnText: { color: n.colors.textPrimary, fontWeight: '800', fontSize: 16 },
  skipBtn: { padding: 12, alignItems: 'center' },
  skipText: { color: n.colors.textMuted, fontSize: 13 },
  ratingContainer: { marginTop: 16, marginBottom: 10 },
  ratingTitle: {
    color: n.colors.textSecondary,
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  ratingRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  ratingBtn: {
    backgroundColor: n.colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    minWidth: 56,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  ratingNum: { color: n.colors.textPrimary, fontWeight: '800', fontSize: 18 },
  ratingLabel: { fontSize: 18 },
  questionText: { color: n.colors.textPrimary, fontSize: 16, lineHeight: 24, marginBottom: 16 },
  optionsContainer: { gap: 8, marginBottom: 12 },
  optionBtn: { borderRadius: 12, padding: 14, borderWidth: 2, minWidth: 0 },
  optionText: { color: n.colors.textPrimary, fontSize: 14, lineHeight: 20 },
  iDontKnowBtn: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: n.colors.warning,
    paddingVertical: 14,
    alignItems: 'center' as const,
    marginBottom: 12,
  },
  iDontKnowText: { color: n.colors.warning, fontWeight: '700' as const, fontSize: 15 },
  correctAnswerBox: {
    backgroundColor: `${n.colors.success}1A`,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: n.colors.success,
    padding: 10,
    marginVertical: 8,
  },
  correctAnswerLabel: {
    color: n.colors.success,
    fontSize: 12,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  correctAnswerText: {
    color: n.colors.textPrimary,
    fontSize: 15,
    fontWeight: '600' as const,
    lineHeight: 22,
  },
  explSection: { marginTop: 8 },
  explSectionTitle: {
    color: n.colors.accent,
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: 'uppercase' as const,
  },
  explainDeeperBtn: {
    backgroundColor: 'rgba(109,153,255,0.1)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center' as const,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: n.colors.accent,
  },
  explainDeeperText: { color: n.colors.accent, fontWeight: '700' as const, fontSize: 14 },
  smallExplainBtn: {
    alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(109,153,255,0.1)',
    borderWidth: 1,
    borderColor: n.colors.accent,
    gap: 4,
  },
  smallExplainText: {
    color: n.colors.accent,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  deepExplLoading: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 16,
    marginBottom: 12,
    gap: 10,
  },
  deepExplLoadingText: {
    color: n.colors.textSecondary,
    fontSize: 13,
    fontStyle: 'italic' as const,
  },
  explBox: {
    backgroundColor: n.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    minWidth: 0,
    alignSelf: 'stretch' as const,
  },
  explBoxDeep: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  explLabel: {
    color: n.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  explText: { color: n.colors.textPrimary, fontSize: 14, lineHeight: 20 },
  markdownBlock: { marginTop: 2 },
  markdownListItem: { marginBottom: 4 },
  storyText: { color: n.colors.textPrimary, fontSize: 15, lineHeight: 26, marginBottom: 20 },
  highlightsBox: {
    backgroundColor: n.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  highlightsLabel: {
    color: n.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  highlightChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: `${n.colors.accent}22`,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: `${n.colors.accent}44`,
  },
  chipText: { color: n.colors.accent, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  mnemonicBox: {
    backgroundColor: n.colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: n.colors.accent,
  },
  mnemonicMain: {
    color: n.colors.accent,
    fontWeight: '900',
    fontSize: 28,
    textAlign: 'center',
    letterSpacing: 2,
  },
  expansionList: { marginBottom: 16 },
  expansionLine: { color: n.colors.textPrimary, fontSize: 14, lineHeight: 24, paddingLeft: 8 },
  textInput: {
    backgroundColor: n.colors.surface,
    borderRadius: 12,
    padding: 14,
    color: n.colors.textPrimary,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  paragraphBox: {
    backgroundColor: n.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  paragraphText: { color: n.colors.textPrimary, fontSize: 15, lineHeight: 24 },
  clueBox: { backgroundColor: n.colors.surface, borderRadius: 12, padding: 14, marginBottom: 8 },
  clueBoxNew: { borderColor: n.colors.accent, borderWidth: 1 },
  clueNum: { color: n.colors.accent, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  clueText: { color: n.colors.textPrimary, fontSize: 15, lineHeight: 22 },
  detectiveActions: { gap: 8, marginTop: 8 },
  hintBtn: { backgroundColor: n.colors.surface, borderWidth: 1, borderColor: n.colors.accent },
  missedBox: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: n.colors.border },
  missedLabel: { color: n.colors.error, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  flagBtn: {
    backgroundColor: n.colors.surface,
    borderColor: `${n.colors.warning}44`,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  flagBtnActive: { backgroundColor: `${n.colors.warning}22`, borderColor: n.colors.warning },
  flagBtnText: { color: n.colors.warning, fontWeight: '600', fontSize: 12 },
  askGuruBtn: {
    backgroundColor: n.colors.surface,
    borderColor: `${n.colors.accent}66`,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    elevation: 4,
  },
  askGuruText: { color: n.colors.accent, fontWeight: '700', fontSize: 13 },
  offlineBox: {
    backgroundColor: n.colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  offlineEmoji: { fontSize: 32, textAlign: 'center', marginBottom: 12 },
  offlineText: {
    color: n.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  promptText: {
    color: n.colors.textPrimary,
    fontSize: 15,
    lineHeight: 28,
    backgroundColor: n.colors.background,
    padding: 20,
    borderRadius: 12,
    marginBottom: 32,
  },
  mkSectionLabel: {
    color: n.colors.textSecondary,
    fontSize: 12,
    fontWeight: '800' as const,
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 10,
    textTransform: 'uppercase' as const,
  },
  mkList: { gap: 10, marginBottom: 10 },
  mkItem: {
    backgroundColor: n.colors.surface,
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
  },
  mkTipBox: {
    backgroundColor: n.colors.primaryTintSoft,
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: n.colors.accent + '33',
  },
  mkTipLabel: {
    color: n.colors.accent,
    fontSize: 11,
    fontWeight: '900' as const,
    letterSpacing: 1,
    marginBottom: 6,
  },
  mkTipText: {
    color: n.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic' as const,
  },
  flashcardContainer: { flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center' },
  flashcardHeader: { alignSelf: 'flex-start', marginBottom: 12 },
  flashcardEmpty: { textAlign: 'center', marginTop: 16, marginBottom: 24 },
  flashcardBody: {
    width: '100%',
    minHeight: 200,
    backgroundColor: n.colors.surface,
    borderRadius: 20,
    padding: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  flashcardLabel: {
    fontSize: 12,
    fontWeight: '900' as const,
    letterSpacing: 2,
    color: n.colors.textMuted,
    marginBottom: 20,
  },
  flashcardText: {
    color: n.colors.textPrimary,
    fontSize: 20,
    fontWeight: '700' as const,
    textAlign: 'center',
    lineHeight: 30,
  },
  flashcardHint: { marginTop: 20 },
  flashcardActions: { marginTop: 20, width: '100%', alignItems: 'center' },
  flashcardFlipBtn: {
    backgroundColor: n.colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
  },
  flashcardFlipText: {
    color: n.colors.textPrimary,
    fontWeight: '800' as const,
    fontSize: 16,
  },
  flashcardDoneBtn: {
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 16,
  },
  flashcardDoneText: { color: n.colors.textPrimary, fontWeight: '700' as const, fontSize: 16 },
  flashcardNextBtn: {
    backgroundColor: n.colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
  },
  flashcardNextText: {
    color: n.colors.textPrimary,
    fontWeight: '800' as const,
    fontSize: 16,
  },
});

function FlashcardCard({
  content,
  onDone,
  onSkip,
}: {
  content: FlashcardsContent;
  onDone: (confidence: number) => void;
  onSkip: () => void;
}) {
  const [cardIdx, setCardIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const card = content.cards[cardIdx];
  if (!card) {
    return (
      <View style={s.flashcardContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={n.colors.textMuted} />
        <LinearText style={s.flashcardEmpty} variant="body" tone="muted">
          No flashcards available
        </LinearText>
        <TouchableOpacity style={s.flashcardDoneBtn} onPress={() => onDone(2)}>
          <LinearText style={s.flashcardDoneText}>Skip</LinearText>
        </TouchableOpacity>
      </View>
    );
  }

  const isLastCard = cardIdx === content.cards.length - 1;

  return (
    <View style={s.flashcardContainer}>
      <View style={s.flashcardHeader}>
        <LinearText variant="chip" tone="muted">
          Card {cardIdx + 1}/{content.cards.length}
        </LinearText>
      </View>

      <TouchableOpacity
        style={s.flashcardBody}
        onPress={() => setIsFlipped(!isFlipped)}
        activeOpacity={0.7}
      >
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
          <TouchableOpacity style={s.flashcardFlipBtn} onPress={() => setIsFlipped(true)}>
            <LinearText style={s.flashcardFlipText}>Reveal Answer</LinearText>
          </TouchableOpacity>
        ) : isLastCard ? (
          <TouchableOpacity style={s.flashcardDoneBtn} onPress={() => onDone(2)}>
            <LinearText style={s.flashcardDoneText}>Done</LinearText>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={s.flashcardNextBtn}
            onPress={() => {
              setCardIdx((i) => i + 1);
              setIsFlipped(false);
            }}
          >
            <LinearText style={s.flashcardNextText}>Next Card →</LinearText>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function useCardScrollPaddingBottom(extraBottom = 0) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return useMemo(() => {
    const isLandscape = width > height;
    const isTablet = Math.min(width, height) >= 600;
    const safeBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 0);
    const orientationPad = isLandscape ? (isTablet ? 36 : 26) : isTablet ? 16 : 8;
    return 72 + safeBottom + orientationPad + extraBottom;
  }, [width, height, insets.bottom, extraBottom]);
}

function useCardScrollContentStyle(extraBottom = 0) {
  const paddingBottom = useCardScrollPaddingBottom(extraBottom);
  return useMemo(() => [s.container, { paddingBottom }], [paddingBottom]);
}
