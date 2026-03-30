import React, { useEffect, useState, useMemo, useCallback } from 'react';

import {
  View,
  Text,
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
} from 'react-native';
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
} from '../types';

import { askGuru, explainTopicDeeper } from '../services/aiService';
import { fetchWikipediaImage } from '../services/imageService';
import { isContentFlagged, setContentFlagged } from '../db/queries/aiCache';
import GuruChatOverlay from '../components/GuruChatOverlay';
import ErrorBoundary from '../components/ErrorBoundary';
import AppText from '../components/AppText';
import StudyMarkdown from '../components/StudyMarkdown';
import { theme } from '../constants/theme';
import { emphasizeHighYieldMarkdown } from '../utils/highlightMarkdown';

interface TopicImageProps {
  topicName: string;
}

const TopicImage = React.memo(function TopicImage({ topicName }: TopicImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchWikipediaImage(topicName).then((url) => {
      if (active) setImageUrl(url);
    });
    return () => {
      active = false;
    };
  }, [topicName]);

  if (!imageUrl) return null;

  return <Image source={{ uri: imageUrl }} style={s.topicImage} resizeMode="contain" />;
});

/** Per-question medical image with tap-to-enlarge lightbox. */
const QuestionImage = React.memo(function QuestionImage({ url }: { url: string }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const screenW = Dimensions.get('window').width;
  const screenH = Dimensions.get('window').height;

  return (
    <>
      <TouchableOpacity activeOpacity={0.85} onPress={() => setLightboxOpen(true)}>
        <Image source={{ uri: url }} style={s.questionImage} resizeMode="contain" />
        <Text style={s.tapToEnlarge}>Tap to enlarge</Text>
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
        `Total questions: ${content.questions.length}`,
        'Use the current study step for the active question, options, and explanation state.',
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
            <Text style={s.flagBtnText}>{flagged ? '🚩 Flagged' : '🏳 Flag'}</Text>
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
          <Text style={s.askGuruText}>Ask Guru</Text>
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
      <Text style={s.ratingTitle}>How well did you get this?</Text>
      <View style={s.ratingRow}>
        <TouchableOpacity
          style={[s.ratingBtn, { flex: 1, borderColor: '#F44336' }]}
          onPress={() => onRate(0)}
          activeOpacity={0.8}
        >
          <Text style={[s.ratingNum, { color: '#F44336', fontSize: 15 }]}>Not yet</Text>
          <Text style={s.ratingLabel}>😕</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.ratingBtn, { flex: 1, borderColor: '#FF9800' }]}
          onPress={() => onRate(1)}
          activeOpacity={0.8}
        >
          <Text style={[s.ratingNum, { color: '#FF9800', fontSize: 15 }]}>Will forget</Text>
          <Text style={s.ratingLabel}>🤔</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.ratingBtn, { flex: 1, borderColor: '#4CAF50' }]}
          onPress={() => onRate(3)}
          activeOpacity={0.8}
        >
          <Text style={[s.ratingNum, { color: '#4CAF50', fontSize: 15 }]}>Got it!</Text>
          <Text style={s.ratingLabel}>🔥</Text>
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
    theme.colors.primary,
    theme.colors.accent,
    theme.colors.warning,
    theme.colors.success,
    theme.colors.error,
    theme.colors.info,
  ];

  return (
    <ScrollView
      key={`${viewportWidth}x${viewportHeight}`}
      style={s.scroll}
      contentContainerStyle={s.container}
    >
      <Text style={s.cardType}>KEY POINTS</Text>
      <AppText style={s.cardTitle} numberOfLines={3} variant="title">
        {content.topicName}
      </AppText>
      <Text style={s.kpProgress}>
        {Math.min(revealIndex + 1, content.points.length)} / {content.points.length}
      </Text>
      <TopicImage topicName={content.topicName} />
      <View style={s.pointsContainer}>
        {content.points.slice(0, revealIndex + 1).map((pt, i) => {
          const color = POINT_COLORS[i % POINT_COLORS.length];
          return (
            <View key={i} style={[s.kpCard, { borderLeftColor: color }]}>
              <View style={[s.kpNumber, { backgroundColor: color + '22' }]}>
                <Text style={[s.kpNumberText, { color }]}>{i + 1}</Text>
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
          <Text style={s.hookLabel}>Memory Hook</Text>
          <StudyMarkdown content={emphasizeHighYieldMarkdown(content.memoryHook)} compact />
        </View>
      )}
      {!isFullyRevealed ? (
        <TouchableOpacity
          style={s.doneBtn}
          onPress={() => setRevealIndex((i) => i + 1)}
          activeOpacity={0.8}
        >
          <Text style={s.doneBtnText}>
            Next ({revealIndex + 1}/{content.points.length})
          </Text>
        </TouchableOpacity>
      ) : !showRating ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setShowRating(true)} activeOpacity={0.8}>
          <Text style={s.doneBtnText}>Got it</Text>
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
        <Text style={s.skipText}>Skip content type</Text>
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
      const resp = await askGuru(
        `Briefly explain why this is most tested/high yield (under 3 sentences):\n\n${item}`,
        `Topic: ${topicName}`,
      );
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
          <Text style={s.explSectionTitle}>GURU'S EXPLANATION</Text>
          <Text style={s.explText}>{explanation}</Text>
        </View>
      ) : loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={{ color: theme.colors.textSecondary, fontSize: 13, fontStyle: 'italic' }}>
            Explaining...
          </Text>
        </View>
      ) : (
        <TouchableOpacity style={s.smallExplainBtn} onPress={handleExplain} activeOpacity={0.8}>
          <Ionicons name="sparkles" size={14} color={theme.colors.primary} />
          <Text style={s.smallExplainText}>Explain this</Text>
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

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <Text style={s.cardType}>MUST KNOW</Text>
      <Text style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
        {content.topicName}
      </Text>
      <TopicImage topicName={content.topicName} />

      <Text style={s.mkSectionLabel}>
        <Ionicons name="alert-circle" size={13} color={theme.colors.error} />
        {'  '}CANNOT FORGET
      </Text>
      <View style={s.mkList}>
        {content.mustKnow.map((item, i) => (
          <View key={i} style={[s.mkItem, { borderLeftColor: theme.colors.error }]}>
            <StudyMarkdown content={emphasizeHighYieldMarkdown(item)} compact />
          </View>
        ))}
      </View>

      <Text style={s.mkSectionLabel}>
        <Ionicons name="flame" size={13} color={theme.colors.warning} />
        {'  '}MOST TESTED
      </Text>
      <View style={s.mkList}>
        {content.mostTested.map((item, i) => (
          <ExplainablePoint
            key={i}
            item={item}
            topicName={content.topicName}
            color={theme.colors.warning}
          />
        ))}
      </View>

      <View style={s.mkTipBox}>
        <Text style={s.mkTipLabel}>EXAM TIP</Text>
        <Text style={s.mkTipText}>{content.examTip}</Text>
      </View>

      {!showRating ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setShowRating(true)} activeOpacity={0.8}>
          <Text style={s.doneBtnText}>Got it</Text>
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
        <Text style={s.skipText}>Skip content type</Text>
      </TouchableOpacity>
    </ScrollView>
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

  // Filter out incomplete questions (truncated AI output)
  const validQuestions = useMemo(
    () =>
      content.questions.filter(
        (question) =>
          question.question?.trim() &&
          Array.isArray(question.options) &&
          question.options.length >= 2 &&
          question.options.every((opt: string) => opt?.trim()) &&
          typeof question.correctIndex === 'number' &&
          question.correctIndex >= 0 &&
          question.correctIndex < question.options.length,
      ),
    [content.questions],
  );

  const q = validQuestions[currentQ];
  const formattedExplanation = useMemo(
    () => formatQuizExplanation(q?.explanation ?? '', q?.options ?? [], q?.correctIndex ?? -1),
    [q?.correctIndex, q?.explanation, q?.options],
  );
  if (!q) return null;

  useEffect(() => {
    const selectedOption = selected !== null ? q.options[selected] : undefined;
    onContextChange?.(
      compactLines(
        [
          `Card type: Quiz`,
          `Current question ${currentQ + 1} of ${validQuestions.length}: ${q.question}`,
          `Options: ${q.options.join(' | ')}`,
          selectedOption
            ? `Student selected: ${selectedOption}`
            : 'Student has not selected an option yet.',
          showExpl ? `Explanation shown: ${formattedExplanation}` : 'Explanation is not shown yet.',
        ],
        5,
      ),
    );
  }, [
    validQuestions.length,
    currentQ,
    onContextChange,
    q,
    selected,
    showExpl,
    formattedExplanation,
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
      setScore((s) => {
        const next = s + 1;
        scoreRef.current = next;
        return next;
      });
    }
    onQuizAnswered?.(correct);
  }

  function handleIDontKnow() {
    if (selected !== null) return;
    // Reveal the correct answer, mark as incorrect
    setSelected(-1); // -1 = "I don't know" (no option selected)
    setShowExpl(true);
    onQuizAnswered?.(false);
    // Auto-fetch deeper explanation
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
    } else {
      // Ref is updated synchronously in handleSelect on last correct; fallback to state.
      const finalScore = Math.max(scoreRef.current, score);
      onQuizComplete?.(finalScore, validQuestions.length);
      const confidence = Math.round((finalScore / validQuestions.length) * 4) + 1;
      onDone(Math.min(5, confidence));
    }
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <View style={s.inlineLabelRow}>
        <Ionicons name="help-circle-outline" size={14} color="#6C63FF" />
        <Text style={s.cardType}>
          QUIZ {currentQ + 1}/{validQuestions.length}
        </Text>
      </View>
      <Text style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
        {content.topicName}
      </Text>
      {q.imageUrl ? <QuestionImage url={q.imageUrl} /> : null}
      <Text style={s.questionText}>{q.question}</Text>
      <View style={s.optionsContainer}>
        {q.options.map((opt, idx) => {
          let bgColor = '#1A1A24';
          let borderColor = '#2A2A38';
          if (selected !== null) {
            if (idx === q.correctIndex) {
              bgColor = '#1A2A1A';
              borderColor = '#4CAF50';
            } else if (idx === selected) {
              bgColor = '#2A0A0A';
              borderColor = '#F44336';
            }
          }
          return (
            <TouchableOpacity
              key={idx}
              style={[s.optionBtn, { backgroundColor: bgColor, borderColor }]}
              onPress={() => handleSelect(idx)}
              activeOpacity={0.8}
            >
              <Text style={s.optionText} numberOfLines={4}>
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {/* "I don't know" button — shown before answering */}
      {selected === null && (
        <TouchableOpacity style={s.iDontKnowBtn} onPress={handleIDontKnow} activeOpacity={0.8}>
          <Text style={s.iDontKnowText}>I don't know — Explain this</Text>
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
                  ? theme.colors.success
                  : selected === -1
                    ? theme.colors.primary
                    : theme.colors.error
              }
            />
            <Text style={s.explLabel}>
              {selected === q.correctIndex
                ? 'Correct'
                : selected === -1
                  ? 'Here is the answer'
                  : 'Incorrect'}
            </Text>
          </View>
          {/* Show the correct answer prominently when user didn't know */}
          {selected !== q.correctIndex && (
            <View style={s.correctAnswerBox}>
              <Text style={s.correctAnswerLabel}>Correct Answer</Text>
              <Text style={s.correctAnswerText}>{q.options[q.correctIndex]}</Text>
            </View>
          )}
          <View style={s.explSection}>
            <View style={s.inlineLabelRow}>
              <Ionicons name="reader-outline" size={14} color={theme.colors.primary} />
              <Text style={s.explSectionTitle}>Explanation</Text>
            </View>
            <StudyMarkdown content={emphasizeHighYieldMarkdown(formattedExplanation)} />
          </View>
        </View>
      )}
      {/* Deep AI explanation */}
      {showExpl && !deepExplanation && !isLoadingDeepExpl && (
        <TouchableOpacity
          style={s.explainDeeperBtn}
          onPress={fetchDeepExplanation}
          activeOpacity={0.8}
        >
          <View style={s.inlineLabelRow}>
            <Ionicons name="bulb-outline" size={14} color={theme.colors.primary} />
            <Text style={s.explainDeeperText}>Explain the broader topic</Text>
          </View>
        </TouchableOpacity>
      )}
      {isLoadingDeepExpl && (
        <View style={s.deepExplLoading}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={s.deepExplLoadingText}>Guru is explaining...</Text>
        </View>
      )}
      {deepExplanation && (
        <View style={[s.explBox, { borderLeftWidth: 3, borderLeftColor: theme.colors.primary }]}>
          <View style={s.inlineLabelRow}>
            <Ionicons name="school-outline" size={14} color={theme.colors.primary} />
            <Text style={s.explSectionTitle}>Deeper Explanation</Text>
          </View>
          <StudyMarkdown content={emphasizeHighYieldMarkdown(deepExplanation)} compact />
        </View>
      )}
      {showExpl && (
        <TouchableOpacity style={s.doneBtn} onPress={handleNext} activeOpacity={0.8}>
          <Text style={s.doneBtnText}>
            {currentQ < validQuestions.length - 1
              ? 'Next Question →'
              : `Done (${score}/${validQuestions.length}) →`}
          </Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={onSkip}
        style={s.skipBtn}
        accessibilityRole="button"
        accessibilityLabel="Skip"
      >
        <Text style={s.skipText}>Skip quiz</Text>
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
  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <Text style={s.cardType}>📖 CLINICAL STORY</Text>
      <Text style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
        {content.topicName}
      </Text>
      <TopicImage topicName={content.topicName} />
      <View style={{ marginBottom: 20 }}>
        <StudyMarkdown content={emphasizeHighYieldMarkdown(content.story)} />
      </View>
      <View style={s.highlightsBox}>
        <Text style={s.highlightsLabel}>Key concepts in this story:</Text>
        <View style={s.highlightChips}>
          {content.keyConceptHighlights.map((kw, i) => (
            <View key={i} style={s.chip}>
              <Text style={s.chipText}>{kw}</Text>
            </View>
          ))}
        </View>
      </View>
      {!showRating ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setShowRating(true)} activeOpacity={0.8}>
          <Text style={s.doneBtnText}>Read it →</Text>
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
        <Text style={s.skipText}>Skip story</Text>
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

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <Text style={s.cardType}>🧠 MNEMONIC</Text>
      <Text style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
        {content.topicName}
      </Text>
      <TopicImage topicName={content.topicName} />
      <View style={s.mnemonicBox}>
        <Text style={s.mnemonicMain}>{content.mnemonic}</Text>
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
          <Text style={s.hookLabel}>💡 Tip</Text>
          <StudyMarkdown content={emphasizeHighYieldMarkdown(content.tip)} compact />
        </View>
      )}
      {revealStep < 2 ? (
        <TouchableOpacity
          style={s.doneBtn}
          onPress={() => setRevealStep((i) => i + 1)}
          activeOpacity={0.8}
        >
          <Text style={s.doneBtnText}>{revealStep === 0 ? 'Decode it →' : 'Show tip →'}</Text>
        </TouchableOpacity>
      ) : !showRating ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setShowRating(true)} activeOpacity={0.8}>
          <Text style={s.doneBtnText}>Got it →</Text>
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
        <Text style={s.skipText}>Skip mnemonic</Text>
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
          `Prompt: ${content.prompt}`,
          answer.trim()
            ? `Student draft answer: ${answer.trim()}`
            : 'Student has not drafted an answer yet.',
          submitted
            ? `Guru review visible: ${guruFeedback?.feedback ?? content.guruReaction}`
            : 'Guru review is not shown yet.',
        ],
        4,
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

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <Text style={s.cardType}>🎤 TEACH BACK</Text>
      <Text style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
        {content.topicName}
      </Text>
      <TopicImage topicName={content.topicName} />
      <Text style={s.questionText}>{content.prompt}</Text>
      {!submitted ? (
        <>
          <TextInput
            style={s.textInput}
            placeholder="Type your explanation here..."
            placeholderTextColor={theme.colors.textMuted}
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
              <Text style={s.doneBtnText}>Submit to Guru →</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={s.explBox}>
            <Text style={s.explLabel}>
              Guru's Review (Score: {guruFeedback?.score ?? '?'} / 5):
            </Text>
            <View style={s.markdownBlock}>
              <StudyMarkdown
                content={emphasizeHighYieldMarkdown(guruFeedback?.feedback ?? content.guruReaction)}
                compact
              />
            </View>
            {guruFeedback?.missed && guruFeedback.missed.length > 0 && (
              <View style={s.missedBox}>
                <Text style={s.missedLabel}>You missed:</Text>
                {guruFeedback.missed.map((m, i) => (
                  <View key={i} style={s.markdownListItem}>
                    <StudyMarkdown content={emphasizeHighYieldMarkdown(`- ${m}`)} compact />
                  </View>
                ))}
              </View>
            )}
          </View>
          <View style={s.highlightsBox}>
            <Text style={s.highlightsLabel}>Expected key points:</Text>
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
        <Text style={s.skipText}>Skip this</Text>
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
          'Task: Find the factual errors in the paragraph.',
          `Paragraph: ${content.paragraph}`,
          revealed
            ? `Revealed corrections: ${content.errors.map((error) => `${error.wrong} -> ${error.correct}`).join(' | ')}`
            : 'Corrections are not revealed yet.',
        ],
        4,
      ),
    );
  }, [content, onContextChange, revealed]);
  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <Text style={s.cardType}>🔍 ERROR HUNT</Text>
      <Text style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
        {content.topicName}
      </Text>
      <TopicImage topicName={content.topicName} />
      <Text style={s.questionText}>Find the 2 factual errors in this paragraph:</Text>
      <View style={s.paragraphBox}>
        <Text style={s.paragraphText}>{content.paragraph}</Text>
      </View>
      {!revealed ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setRevealed(true)} activeOpacity={0.8}>
          <Text style={s.doneBtnText}>Reveal Errors →</Text>
        </TouchableOpacity>
      ) : (
        <>
          {content.errors.map((err, i) => (
            <View key={i} style={s.explBox}>
              <Text style={s.explLabel}>Error {i + 1}:</Text>
              <Text style={[s.explText, { color: '#F44336' }]}>❌ "{err.wrong}"</Text>
              <Text style={[s.explText, { color: '#4CAF50' }]}>✅ Should be: "{err.correct}"</Text>
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
        <Text style={s.skipText}>Skip this</Text>
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
          `Visible clues: ${content.clues.slice(0, revealedClues).join(' | ')}`,
          solved ? `Answer revealed: ${content.answer}` : 'Answer is not revealed yet.',
          solved ? `Explanation visible: ${content.explanation}` : '',
        ],
        4,
      ),
    );
  }, [content, onContextChange, revealedClues, solved]);
  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <Text style={s.cardType}>🕵️ CLINICAL DETECTIVE</Text>
      <Text style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
        {content.topicName}
      </Text>
      <TopicImage topicName={content.topicName} />
      {content.clues.slice(0, revealedClues).map((clue, i) => (
        <View key={i} style={[s.clueBox, i === revealedClues - 1 && s.clueBoxNew]}>
          <Text style={s.clueNum}>Clue {i + 1}</Text>
          <Text style={s.clueText}>{clue}</Text>
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
              <Text style={s.doneBtnText}>Reveal next clue</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.doneBtn} onPress={() => setSolved(true)} activeOpacity={0.8}>
            <Text style={s.doneBtnText}>I know the answer →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={s.explBox}>
            <Text style={s.explLabel}>Diagnosis:</Text>
            <Text style={[s.explText, { color: '#4CAF50', fontSize: 18, fontWeight: '700' }]}>
              {content.answer}
            </Text>
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
        <Text style={s.skipText}>Skip case</Text>
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
  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <Text style={s.cardType}>📴 MANUAL REVIEW (OFFLINE)</Text>
      <Text style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
        {content.topicName}
      </Text>
      <TopicImage topicName={content.topicName} />

      <View style={s.offlineBox}>
        <Text style={s.offlineEmoji}>📡❌</Text>
        <Text style={s.offlineText}>
          Guru is offline or AI is unavailable. Spend 2-5 minutes recalling everything you know
          about this topic.
        </Text>
      </View>

      <Text style={s.promptText}>
        Close your eyes and try to visualize:
        {'\n'}• Classification / Types
        {'\n'}• Clinical presentation
        {'\n'}• Gold standard diagnosis
        {'\n'}• First-line treatment
      </Text>

      {!showRating ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setShowRating(true)} activeOpacity={0.8}>
          <Text style={s.doneBtnText}>I've reviewed it →</Text>
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
        <Text style={s.skipText}>Skip topic</Text>
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
    <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 }}>
        <Text
          style={{
            color: '#6C63FF',
            fontSize: 11,
            fontWeight: '800',
            letterSpacing: 1.2,
            marginBottom: 16,
          }}
        >
          QUESTION {index + 1} / {content.questions.length}
        </Text>

        <View
          style={{
            backgroundColor: '#1A1A2E',
            borderRadius: 16,
            padding: 20,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: '#2A2A4A',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700', lineHeight: 28 }}>
            {question.question}
          </Text>
        </View>

        {!revealed ? (
          <TouchableOpacity
            style={{
              backgroundColor: '#6C63FF',
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: 'center',
              marginBottom: 12,
            }}
            onPress={() => setRevealed(true)}
            activeOpacity={0.8}
          >
            <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 15 }}>Reveal Answer</Text>
          </TouchableOpacity>
        ) : (
          <>
            <View
              style={{
                backgroundColor: '#0D1F0D',
                borderRadius: 16,
                padding: 20,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: '#1E5C1E',
              }}
            >
              <StudyMarkdown content={emphasizeHighYieldMarkdown(question.answer)} />
            </View>
            <Text
              style={{
                color: '#888',
                fontSize: 12,
                fontStyle: 'italic',
                marginBottom: 20,
                paddingHorizontal: 4,
              }}
            >
              {question.whyItMatters}
            </Text>
            <Text
              style={{
                color: '#CCC',
                fontSize: 14,
                fontWeight: '600',
                textAlign: 'center',
                marginBottom: 12,
              }}
            >
              Did you know this?
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#1E3A1E',
                  borderRadius: 14,
                  paddingVertical: 14,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#2E6A2E',
                }}
                onPress={() => next(true)}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#4CAF50', fontWeight: '800', fontSize: 15 }}>Yes ✓</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#2A1A1A',
                  borderRadius: 14,
                  paddingVertical: 14,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#5C1E1E',
                }}
                onPress={() => next(false)}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#EF5350', fontWeight: '800', fontSize: 15 }}>Not quite</Text>
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
          <Text style={s.skipText}>Skip topic</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1 },
  // stretch: default flex-start shrink-wraps children; markdown rows then mis-measure width
  // (last words clipped on Android, esp. landscape with plenty of horizontal space).
  container: { padding: 20, paddingBottom: 60, alignItems: 'stretch' as const },
  cardType: {
    color: '#6C63FF',
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
    color: '#fff',
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
    backgroundColor: '#1A1A24',
  },
  questionImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    marginBottom: 4,
    backgroundColor: '#1A1A24',
  },
  tapToEnlarge: {
    color: '#888',
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
  bullet: { color: theme.colors.primary, fontSize: 16, marginRight: 10, marginTop: 1 },
  pointText: { color: theme.colors.textPrimary, fontSize: 15, flex: 1, lineHeight: 22 },
  kpCard: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    alignSelf: 'stretch' as const,
    minWidth: 0,
    backgroundColor: theme.colors.surface,
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
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600' as const,
    marginBottom: 12,
  },
  hookBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.colors.primary + '44',
  },
  hookLabel: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  hookText: { color: theme.colors.textPrimary, fontSize: 14, fontStyle: 'italic' as const },
  doneBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  disabledBtn: { backgroundColor: '#333' },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  skipBtn: { padding: 12, alignItems: 'center' },
  skipText: { color: theme.colors.textMuted, fontSize: 13 },
  ratingContainer: { marginTop: 16, marginBottom: 10 },
  ratingTitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  ratingRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  ratingBtn: {
    backgroundColor: '#1A1A24',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    minWidth: 56,
    borderWidth: 1,
    borderColor: '#2A2A38',
  },
  ratingNum: { color: '#fff', fontWeight: '800', fontSize: 18 },
  ratingLabel: { fontSize: 18 },
  questionText: { color: '#E0E0E0', fontSize: 16, lineHeight: 24, marginBottom: 16 },
  optionsContainer: { gap: 8, marginBottom: 12 },
  optionBtn: { borderRadius: 12, padding: 14, borderWidth: 2, minWidth: 0 },
  optionText: { color: '#E0E0E0', fontSize: 14, lineHeight: 20 },
  iDontKnowBtn: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.warning,
    paddingVertical: 14,
    alignItems: 'center' as const,
    marginBottom: 12,
  },
  iDontKnowText: { color: theme.colors.warning, fontWeight: '700' as const, fontSize: 15 },
  correctAnswerBox: {
    backgroundColor: '#1A2A1A',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
    padding: 10,
    marginVertical: 8,
  },
  correctAnswerLabel: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  correctAnswerText: { color: '#E0E0E0', fontSize: 15, fontWeight: '600' as const, lineHeight: 22 },
  explSection: { marginTop: 8 },
  explSectionTitle: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: 'uppercase' as const,
  },
  explainDeeperBtn: {
    backgroundColor: theme.colors.primaryTintSoft,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center' as const,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  explainDeeperText: { color: theme.colors.primary, fontWeight: '700' as const, fontSize: 14 },
  smallExplainBtn: {
    alignSelf: 'flex-start' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.primaryTintSoft,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    gap: 4,
  },
  smallExplainText: {
    color: theme.colors.primary,
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
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontStyle: 'italic' as const,
  },
  explBox: { backgroundColor: '#1A1A24', borderRadius: 12, padding: 14, marginBottom: 12 },
  explLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  explText: { color: '#E0E0E0', fontSize: 14, lineHeight: 20 },
  markdownBlock: { marginTop: 2 },
  markdownListItem: { marginBottom: 4 },
  storyText: { color: '#E0E0E0', fontSize: 15, lineHeight: 26, marginBottom: 20 },
  highlightsBox: { backgroundColor: '#1A1A24', borderRadius: 12, padding: 14, marginBottom: 20 },
  highlightsLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  highlightChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: '#6C63FF22',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#6C63FF44',
  },
  chipText: { color: '#6C63FF', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  mnemonicBox: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#6C63FF',
  },
  mnemonicMain: {
    color: '#6C63FF',
    fontWeight: '900',
    fontSize: 28,
    textAlign: 'center',
    letterSpacing: 2,
  },
  expansionList: { marginBottom: 16 },
  expansionLine: { color: '#E0E0E0', fontSize: 14, lineHeight: 24, paddingLeft: 8 },
  textInput: {
    backgroundColor: '#1A1A24',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2A38',
  },
  paragraphBox: { backgroundColor: '#1A1A24', borderRadius: 12, padding: 16, marginBottom: 16 },
  paragraphText: { color: '#E0E0E0', fontSize: 15, lineHeight: 24 },
  clueBox: { backgroundColor: '#1A1A24', borderRadius: 12, padding: 14, marginBottom: 8 },
  clueBoxNew: { borderColor: '#6C63FF', borderWidth: 1 },
  clueNum: { color: '#6C63FF', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  clueText: { color: '#E0E0E0', fontSize: 15, lineHeight: 22 },
  detectiveActions: { gap: 8, marginTop: 8 },
  hintBtn: { backgroundColor: '#1A1A2E', borderWidth: 1, borderColor: '#6C63FF' },
  missedBox: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#2A2A38' },
  missedLabel: { color: '#F44336', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  flagBtn: {
    backgroundColor: '#1A1A2E',
    borderColor: '#FF980044',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  flagBtnActive: { backgroundColor: '#2A1A00', borderColor: '#FF9800' },
  flagBtnText: { color: '#FF9800', fontWeight: '600', fontSize: 12 },
  askGuruBtn: {
    backgroundColor: '#1A1A2E',
    borderColor: '#6C63FF66',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    elevation: 4,
  },
  askGuruText: { color: '#6C63FF', fontWeight: '700', fontSize: 13 },
  offlineBox: {
    backgroundColor: '#1A1A24',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#333',
  },
  offlineEmoji: { fontSize: 32, textAlign: 'center', marginBottom: 12 },
  offlineText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  promptText: {
    color: '#E0E0E0',
    fontSize: 15,
    lineHeight: 28,
    backgroundColor: '#0A0A14',
    padding: 20,
    borderRadius: 12,
    marginBottom: 32,
  },
  mkSectionLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '800' as const,
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 10,
    textTransform: 'uppercase' as const,
  },
  mkList: { gap: 10, marginBottom: 10 },
  mkItem: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
  },
  mkTipBox: {
    backgroundColor: theme.colors.primaryTintSoft,
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: theme.colors.primary + '33',
  },
  mkTipLabel: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '900' as const,
    letterSpacing: 1,
    marginBottom: 6,
  },
  mkTipText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic' as const,
  },
});
