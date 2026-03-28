import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Animated,
  PanResponder,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import { getTopicsDueForReview, updateTopicProgress } from '../db/queries/topics';
import { profileRepository } from '../db/repositories';
import { fetchContent } from '../services/aiService';
import { useAppStore } from '../store/useAppStore';
import type { TopicWithProgress, AIContent, ContentType } from '../types';
import LoadingOrb from '../components/LoadingOrb';
import { MarkdownRender } from '../components/MarkdownRender';
import { theme } from '../constants/theme';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { emphasizeHighYieldMarkdown } from '../utils/highlightMarkdown';

// Spaced Repetition Ratings
const RATINGS = [
  { label: 'Again', days: 1, confidence: 1, color: theme.colors.error },
  { label: 'Hard', days: 3, confidence: 2, color: theme.colors.warning },
  { label: 'Good', days: 7, confidence: 3, color: theme.colors.success },
  { label: 'Easy', days: 14, confidence: 4, color: theme.colors.info },
];

const CONTENT_CHIPS: { type: ContentType; label: string; icon: string }[] = [
  { type: 'keypoints', label: 'Keypoints', icon: '📋' },
  { type: 'quiz', label: 'Quiz', icon: '❓' },
  { type: 'mnemonic', label: 'Mnemonic', icon: '🧠' },
];

function getAutoContentType(confidence: number): ContentType {
  if (confidence <= 1) return 'quiz';
  if (confidence <= 3) return 'keypoints';
  return 'mnemonic';
}

export default function ReviewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { profile, refreshProfile } = useAppStore();
  const [queue, setQueue] = useState<TopicWithProgress[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [content, setContent] = useState<AIContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedContentType, setSelectedContentType] = useState<ContentType | null>(null);

  const [showSwipeHint, setShowSwipeHint] = useState(false);

  const flipAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const panXY = useRef(new Animated.ValueXY()).current;
  const isFlippedRef = useRef(false);
  const handleRateRef = useRef<(rating: (typeof RATINGS)[0]) => void>(() => {});

  useEffect(() => {
    void getTopicsDueForReview(20).then(setQueue);
    AsyncStorage.getItem('review_swipe_hint_shown').then((v) => {
      if (!v) setShowSwipeHint(true);
    });
    return () => {
      Speech.stop();
    };
  }, []);

  // Auto-dismiss swipe hint after 5 seconds
  useEffect(() => {
    if (!showSwipeHint) return;
    const timer = setTimeout(() => {
      setShowSwipeHint(false);
      AsyncStorage.setItem('review_swipe_hint_shown', 'true');
    }, 5000);
    return () => clearTimeout(timer);
  }, [showSwipeHint]);

  const currentTopic = queue[currentIdx];

  // Animate progress bar
  useEffect(() => {
    if (queue.length === 0) return;
    Animated.timing(progressAnim, {
      toValue: currentIdx / queue.length,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [currentIdx, queue.length]);

  // Reset state on topic change and fetch with auto type
  useEffect(() => {
    if (!currentTopic) return;
    setIsFlipped(false);
    isFlippedRef.current = false;
    flipAnim.setValue(0);
    panXY.setValue({ x: 0, y: 0 });
    setSelectedContentType(null);
    setLoading(true);
    setContent(null);
    const autoType = getAutoContentType(currentTopic.progress.confidence);
    fetchContent(currentTopic, autoType)
      .then((c) => {
        setContent(c);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [currentTopic?.id]);

  // Re-fetch when user selects a specific content type
  useEffect(() => {
    if (!currentTopic || selectedContentType === null) return;
    setLoading(true);
    setContent(null);
    fetchContent(currentTopic, selectedContentType)
      .then((c) => {
        setContent(c);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedContentType]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => {
        if (!isFlippedRef.current) return false;
        return Math.abs(gs.dx) > 10 || Math.abs(gs.dy) > 10;
      },
      onPanResponderMove: Animated.event([null, { dx: panXY.x }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gs) => {
        if (Math.abs(gs.dx) > 80 || gs.dy < -80) {
          setShowSwipeHint(false);
          AsyncStorage.setItem('review_swipe_hint_shown', 'true');
        }
        if (gs.dx > 80) {
          Animated.timing(panXY, {
            toValue: { x: 500, y: 0 },
            duration: 200,
            useNativeDriver: false,
          }).start(() => {
            panXY.setValue({ x: 0, y: 0 });
            handleRateRef.current(RATINGS[2]); // Good
          });
        } else if (gs.dx < -80) {
          Animated.timing(panXY, {
            toValue: { x: -500, y: 0 },
            duration: 200,
            useNativeDriver: false,
          }).start(() => {
            panXY.setValue({ x: 0, y: 0 });
            handleRateRef.current(RATINGS[0]); // Again
          });
        } else if (gs.dy < -80) {
          Animated.timing(panXY, {
            toValue: { x: 0, y: -600 },
            duration: 200,
            useNativeDriver: false,
          }).start(() => {
            panXY.setValue({ x: 0, y: 0 });
            handleRateRef.current(RATINGS[3]); // Easy
          });
        } else {
          Animated.spring(panXY, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      },
    }),
  ).current;

  function handleFlip() {
    Animated.spring(flipAnim, {
      toValue: 180,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
    setIsFlipped(true);
    isFlippedRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function handleRate(rating: (typeof RATINGS)[0]) {
    Speech.stop();
    if (!currentTopic) return;

    let newConf = rating.confidence;
    if (rating.label === 'Easy' && currentTopic.progress.confidence >= 4) newConf = 5;

    let xp = 10 * newConf;
    if (currentTopic.progress.isNemesis) xp += 50;

    await updateTopicProgress(
      currentTopic.id,
      newConf >= 4 ? 'mastered' : newConf >= 2 ? 'reviewed' : 'seen',
      newConf,
      xp,
    );

    await profileRepository.addXp(xp);
    await refreshProfile();

    if (currentIdx < queue.length - 1) {
      setCurrentIdx((i) => i + 1);
    } else {
      navigation.goBack();
    }
  }

  handleRateRef.current = handleRate;

  if (queue.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <ResponsiveContainer style={styles.center}>
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>All caught up!</Text>
          <Text style={styles.sub}>No topics due for review right now.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.btn}>
            <Text style={styles.btnText}>Back</Text>
          </TouchableOpacity>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  if (!currentTopic) return null;

  const frontAnimatedStyle = {
    transform: [
      { rotateY: flipAnim.interpolate({ inputRange: [0, 180], outputRange: ['0deg', '180deg'] }) },
    ],
    backfaceVisibility: 'hidden' as const,
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  };
  const backAnimatedStyle = {
    transform: [
      {
        rotateY: flipAnim.interpolate({ inputRange: [0, 180], outputRange: ['180deg', '360deg'] }),
      },
    ],
    backfaceVisibility: 'hidden' as const,
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  };

  const autoType = getAutoContentType(currentTopic.progress.confidence);
  const activeChip = selectedContentType ?? autoType;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />

      <ResponsiveContainer>
        <View style={styles.header}>
          <Text style={styles.progress}>
            Card {currentIdx + 1} / {queue.length} · ~{Math.ceil((queue.length - currentIdx) * 0.5)}{' '}
            min left
          </Text>
          {currentTopic.progress.isNemesis && (
            <View style={styles.nemesisBadge}>
              <Text style={styles.nemesisBadgeText}>⚔️ NEMESIS (+50 XP)</Text>
            </View>
          )}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close review"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={() => {
              Speech.stop();
              navigation.goBack();
            }}
          >
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBarBg}>
          <Animated.View
            style={[
              styles.progressBarFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>

        {/* Content type chips (only when not flipped) */}
        {!isFlipped && (
          <View style={styles.chipRow}>
            {CONTENT_CHIPS.map((chip) => {
              const isActive = chip.type === activeChip;
              const isAuto = selectedContentType === null && chip.type === autoType;
              return (
                <TouchableOpacity
                  key={chip.type}
                  style={[
                    styles.chip,
                    isActive && styles.chipActive,
                    loading && styles.chipDisabled,
                  ]}
                  onPress={() => {
                    if (loading) return;
                    setSelectedContentType(chip.type === selectedContentType ? null : chip.type);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                    {chip.icon} {chip.label}
                  </Text>
                  {isAuto && <Text style={styles.autoBadge}>AUTO</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={styles.cardContainer} {...panResponder.panHandlers}>
          <Animated.View style={[styles.cardWrap, { transform: [{ translateX: panXY.x }] }]}>
            {/* Front */}
            <Animated.View style={[styles.card, frontAnimatedStyle]}>
              <Text style={styles.label}>TOPIC</Text>
              <Text style={styles.topic}>{currentTopic.name}</Text>
              <Text style={styles.subject}>{currentTopic.subjectName}</Text>
              <Text style={styles.tapHint}>Tap to flip</Text>
            </Animated.View>

            {/* Back — scrollable */}
            <Animated.View style={[styles.card, styles.cardBack, backAnimatedStyle]}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={styles.backScroll}
                contentContainerStyle={styles.backScrollContent}
              >
                {loading ? <LoadingOrb /> : renderBackContent(content)}
              </ScrollView>
            </Animated.View>

            {/* Swipe hints when flipped */}
            {isFlipped && (
              <>
                <View style={styles.swipeHintLeft} pointerEvents="none">
                  <Text style={styles.swipeHintText}>← Again</Text>
                </View>
                <View style={styles.swipeHintRight} pointerEvents="none">
                  <Text style={styles.swipeHintText}>Good →</Text>
                </View>
              </>
            )}

            {/* Tap overlay for flip */}
            {!isFlipped && (
              <TouchableOpacity
                style={StyleSheet.absoluteFill}
                onPress={handleFlip}
                activeOpacity={1}
              />
            )}
          </Animated.View>
        </View>

        {showSwipeHint && (
          <View style={styles.swipeHintBanner}>
            <Text style={styles.swipeHintBannerText}>
              Swipe left: Again · Swipe right: Good · Swipe up: Easy
            </Text>
          </View>
        )}

        {/* Controls */}
        <View style={styles.controls}>
          {isFlipped ? (
            <View style={styles.ratings}>
              {RATINGS.map((r) => (
                <TouchableOpacity
                  key={r.label}
                  style={[styles.rateBtn, { borderColor: r.color }]}
                  onPress={() => handleRate(r)}
                  hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Rate ${r.label}, next review in ${r.days} days`}
                >
                  <Text style={[styles.rateLabel, { color: r.color }]}>{r.label}</Text>
                  <Text style={styles.rateDays}>in {r.days}d</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <TouchableOpacity style={styles.flipBtn} onPress={handleFlip}>
              <Text style={styles.flipText}>Show Answer</Text>
            </TouchableOpacity>
          )}
        </View>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

function renderBackContent(content: AIContent | null) {
  if (!content) return <Text style={styles.error}>Could not load content.</Text>;

  if (content.type === 'keypoints' && Array.isArray(content.points)) {
    return (
      <View>
        <Text style={styles.label}>KEY POINTS</Text>
        {content.points.map((p, i) => (
          <Text key={i} style={styles.point}>
            • {p}
          </Text>
        ))}
        {content.memoryHook ? <Text style={styles.hook}>💡 {content.memoryHook}</Text> : null}
      </View>
    );
  }

  if (content.type === 'mnemonic') {
    return (
      <View>
        <Text style={styles.label}>MNEMONIC</Text>
        <Text style={styles.mnemonicText}>{content.mnemonic}</Text>
        {content.expansion.map((e, i) => (
          <Text key={i} style={styles.point}>
            • {e}
          </Text>
        ))}
        {content.tip ? <Text style={styles.hook}>💡 {content.tip}</Text> : null}
      </View>
    );
  }

  if (content.type === 'quiz' && Array.isArray(content.questions) && content.questions[0]) {
    const q = content.questions[0];
    return (
      <View>
        <Text style={styles.label}>QUICK QUIZ</Text>
        <Text style={styles.quizQ}>{q.question}</Text>
        {q.options.map((opt, i) => (
          <Text key={i} style={styles.point}>
            {String.fromCharCode(65 + i)}. {opt}
          </Text>
        ))}
        <Text style={styles.hook}>✓ {q.options[q.correctIndex]}</Text>
        {q.explanation ? (
          <View style={{ marginTop: 8 }}>
            <MarkdownRender content={emphasizeHighYieldMarkdown(q.explanation)} compact />
          </View>
        ) : null}
      </View>
    );
  }

  return <Text style={styles.error}>Could not load content.</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    alignItems: 'center',
  },
  progress: { color: theme.colors.textMuted, fontWeight: '700' },
  nemesisBadge: {
    backgroundColor: theme.colors.errorTintSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  nemesisBadgeText: {
    color: theme.colors.error,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  close: { color: theme.colors.textPrimary, fontSize: 20 },
  emoji: { fontSize: 60, marginBottom: 20 },
  title: { color: theme.colors.textPrimary, fontSize: 24, fontWeight: '800', marginBottom: 8 },
  sub: { color: theme.colors.textSecondary, fontSize: 16, marginBottom: 30, textAlign: 'center' },
  btn: {
    backgroundColor: theme.colors.borderLight,
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnText: { color: theme.colors.textPrimary, fontWeight: '700' },

  // Progress bar
  progressBarBg: {
    height: 3,
    backgroundColor: theme.colors.border,
    marginHorizontal: 16,
    borderRadius: 2,
  },
  progressBarFill: { height: 3, backgroundColor: theme.colors.primary, borderRadius: 2 },

  // Content type chips
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  chipActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryTintSoft },
  chipDisabled: { opacity: 0.4 },
  chipText: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  chipTextActive: { color: theme.colors.primary },
  autoBadge: {
    color: theme.colors.primary,
    fontSize: 8,
    lineHeight: 12,
    fontWeight: '900',
    marginTop: 2,
    letterSpacing: 0.5,
  },

  // Card container with pan
  cardContainer: { flex: 1, margin: 20 },
  cardWrap: { flex: 1 },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backfaceVisibility: 'hidden',
  },
  cardBack: {
    backgroundColor: theme.colors.panelAlt,
    borderColor: theme.colors.primary,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    padding: 0,
  },
  backScroll: { flex: 1, width: '100%' },
  backScrollContent: { padding: 24, paddingBottom: 40 },

  // Swipe hints
  swipeHintLeft: {
    position: 'absolute',
    left: 8,
    top: '45%',
    backgroundColor: 'rgba(244,67,54,0.15)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  swipeHintRight: {
    position: 'absolute',
    right: 8,
    top: '45%',
    backgroundColor: 'rgba(46,204,113,0.15)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  swipeHintText: { color: theme.colors.textPrimary, fontSize: 11, fontWeight: '700', opacity: 0.5 },

  label: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 20,
  },
  topic: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
  },
  subject: { color: theme.colors.primary, fontSize: 16, fontWeight: '600' },
  tapHint: { color: theme.colors.textMuted, marginTop: 40, fontSize: 12 },
  point: { color: theme.colors.textSecondary, fontSize: 16, marginBottom: 12, lineHeight: 22 },
  hook: { color: theme.colors.warning, fontSize: 14, marginTop: 12, fontStyle: 'italic' },
  mnemonicText: {
    color: theme.colors.primary,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 16,
    lineHeight: 28,
  },
  quizQ: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    lineHeight: 24,
  },
  swipeHintBanner: { alignItems: 'center', marginTop: 4, marginBottom: -8 },
  swipeHintBannerText: { color: theme.colors.textMuted, fontSize: 13, textAlign: 'center' },
  error: { color: theme.colors.error },
  controls: { padding: 20, height: 120 },
  flipBtn: {
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  flipText: { color: theme.colors.textPrimary, fontWeight: '800', fontSize: 16 },
  ratings: { flexDirection: 'row', gap: 10 },
  rateBtn: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  rateLabel: { fontWeight: '800', fontSize: 14, marginBottom: 4 },
  rateDays: { color: theme.colors.textMuted, fontSize: 11 },
});
