import LinearSurface from '../components/primitives/LinearSurface';
import LinearButton from '../components/primitives/LinearButton';
import LinearBadge from '../components/primitives/LinearBadge';
import LinearText from '../components/primitives/LinearText';
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
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
import { useRefreshProfile } from '../hooks/queries/useProfile';
import type { TopicWithProgress, AIContent, ContentType } from '../types';
import LoadingOrb from '../components/LoadingOrb';
import { MarkdownRender } from '../components/MarkdownRender';
import { linearTheme as n } from '../theme/linearTheme';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { emphasizeHighYieldMarkdown } from '../utils/highlightMarkdown';
import { Ionicons } from '@expo/vector-icons';

// Spaced Repetition Ratings
const RATINGS = [
  { label: 'Again', days: 1, confidence: 1, color: n.colors.error },
  { label: 'Hard', days: 3, confidence: 2, color: n.colors.warning },
  { label: 'Good', days: 7, confidence: 3, color: n.colors.success },
  { label: 'Easy', days: 14, confidence: 4, color: n.colors.accent },
];

const CONTENT_CHIPS: { type: ContentType; label: string; icon: string; ionicon?: string }[] = [
  { type: 'keypoints', label: 'Keypoints', icon: '📋', ionicon: 'list-outline' },
  { type: 'quiz', label: 'Quiz', icon: '❓', ionicon: 'help-circle-outline' },
  { type: 'mnemonic', label: 'Mnemonic', icon: '🧠', ionicon: 'hardware-chip-outline' },
];

function getAutoContentType(confidence: number): ContentType {
  if (confidence <= 1) return 'quiz';
  if (confidence <= 3) return 'keypoints';
  return 'mnemonic';
}

export default function ReviewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const refreshProfile = useRefreshProfile();
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
  }, [currentIdx, progressAnim, queue.length]);

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
  }, [currentTopic, flipAnim, panXY]);

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
  }, [currentTopic, selectedContentType]);

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
          <Ionicons
            name="checkmark-circle-outline"
            size={60}
            color={n.colors.success}
            style={{ marginBottom: 20 }}
          />
          <LinearText variant="title" centered style={styles.title}>
            All caught up!
          </LinearText>
          <LinearText variant="body" tone="secondary" centered style={styles.sub}>
            No topics due for review right now.
          </LinearText>
          <LinearButton label="Back" variant="glassTinted" onPress={() => navigation.goBack()} />
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
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />

      <ResponsiveContainer>
        <View style={styles.header}>
          <LinearText variant="caption" tone="secondary" style={styles.progress}>
            Card {currentIdx + 1} / {queue.length} · ~
            {Math.ceil((queue.length - currentIdx - 1) * 0.5)} min left
          </LinearText>
          {currentTopic.progress.isNemesis && (
            <LinearBadge label="NEMESIS (+50 XP)" variant="error" />
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
            <LinearText variant="sectionTitle" style={styles.close}>
              ✕
            </LinearText>
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
                  <Ionicons
                    name={(chip.ionicon || 'list-outline') as any}
                    size={12}
                    color={isActive ? n.colors.textPrimary : n.colors.textMuted}
                    style={{ marginRight: 4 }}
                  />
                  <LinearText
                    variant="caption"
                    style={[styles.chipText, isActive && styles.chipTextActive]}
                  >
                    {chip.label}
                  </LinearText>
                  {isAuto && (
                    <LinearText variant="badge" tone="accent" style={styles.autoBadge}>
                      AUTO
                    </LinearText>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <LinearSurface style={styles.cardContainer} {...panResponder.panHandlers} padded={false}>
          <Animated.View style={[styles.cardWrap, { transform: [{ translateX: panXY.x }] }]}>
            {/* Front */}
            <Animated.View style={[styles.card, frontAnimatedStyle]}>
              <LinearText variant="caption" tone="muted" style={styles.label}>
                TOPIC
              </LinearText>
              <LinearText variant="title" centered style={styles.topic}>
                {currentTopic.name}
              </LinearText>
              <LinearText variant="body" tone="accent" centered style={styles.subject}>
                {currentTopic.subjectName}
              </LinearText>
              <LinearText variant="caption" tone="muted" centered style={styles.tapHint}>
                Tap to flip
              </LinearText>
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
                  <LinearText variant="caption" style={styles.swipeHintText}>
                    ← Again
                  </LinearText>
                </View>
                <View style={styles.swipeHintRight} pointerEvents="none">
                  <LinearText variant="caption" style={styles.swipeHintText}>
                    Good →
                  </LinearText>
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
        </LinearSurface>

        {showSwipeHint && (
          <View style={styles.swipeHintBanner}>
            <LinearText
              variant="bodySmall"
              tone="muted"
              centered
              style={styles.swipeHintBannerText}
            >
              Swipe left: Again · Swipe right: Good · Swipe up: Easy
            </LinearText>
          </View>
        )}

        {/* Controls */}
        <View style={styles.controls}>
          {isFlipped ? (
            <View style={styles.ratings}>
              {RATINGS.map((r) => (
                <LinearButton
                  key={r.label}
                  style={[styles.rateBtn, { borderColor: r.color }]}
                  onPress={() => handleRate(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`Rate ${r.label}, next review in ${r.days} days`}
                  label={`${r.label}`}
                  variant="glass"
                  textStyle={[styles.rateLabel, { color: r.color }]}
                  rightIcon={
                    <LinearText variant="caption" tone="muted" style={styles.rateDays}>
                      in {r.days}d
                    </LinearText>
                  }
                />
              ))}
            </View>
          ) : (
            <LinearButton style={styles.flipBtn} label="Show Answer" onPress={handleFlip} />
          )}
        </View>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

function renderBackContent(content: AIContent | null) {
  if (!content)
    return (
      <LinearText variant="bodySmall" tone="error" style={styles.error}>
        Could not load content.
      </LinearText>
    );

  if (content.type === 'keypoints' && Array.isArray(content.points)) {
    return (
      <View>
        <LinearText variant="caption" tone="muted" style={styles.label}>
          KEY POINTS
        </LinearText>
        {content.points.map((p, i) => (
          <LinearText key={i} variant="body" tone="secondary" style={styles.point}>
            • {p}
          </LinearText>
        ))}
        {content.memoryHook ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12 }}>
            <Ionicons name="bulb-outline" size={14} color={n.colors.warning} />
            <LinearText variant="bodySmall" tone="warning" style={[styles.hook, { marginTop: 0 }]}>
              {content.memoryHook}
            </LinearText>
          </View>
        ) : null}
      </View>
    );
  }

  if (content.type === 'mnemonic') {
    return (
      <View>
        <LinearText variant="caption" tone="muted" style={styles.label}>
          MNEMONIC
        </LinearText>
        <LinearText variant="sectionTitle" tone="accent" style={styles.mnemonicText}>
          {content.mnemonic}
        </LinearText>
        {content.expansion.map((e, i) => (
          <LinearText key={i} variant="body" tone="secondary" style={styles.point}>
            • {e}
          </LinearText>
        ))}
        {content.tip ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12 }}>
            <Ionicons name="bulb-outline" size={14} color={n.colors.warning} />
            <LinearText variant="bodySmall" tone="warning" style={[styles.hook, { marginTop: 0 }]}>
              {content.tip}
            </LinearText>
          </View>
        ) : null}
      </View>
    );
  }

  if (content.type === 'quiz' && Array.isArray(content.questions) && content.questions[0]) {
    const q = content.questions[0];
    return (
      <View>
        <LinearText variant="caption" tone="muted" style={styles.label}>
          QUICK QUIZ
        </LinearText>
        <LinearText variant="body" style={styles.quizQ}>
          {q.question}
        </LinearText>
        {q.options.map((opt, i) => (
          <LinearText key={i} variant="body" tone="secondary" style={styles.point}>
            {String.fromCharCode(65 + i)}. {opt}
          </LinearText>
        ))}
        <LinearText variant="bodySmall" tone="warning" style={styles.hook}>
          ✓ {q.options[q.correctIndex]}
        </LinearText>
        {q.explanation ? (
          <View style={{ marginTop: 8 }}>
            <MarkdownRender content={emphasizeHighYieldMarkdown(q.explanation)} compact />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <LinearText variant="bodySmall" tone="error" style={styles.error}>
      Could not load content.
    </LinearText>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    alignItems: 'center',
  },
  progress: { fontWeight: '700' },
  close: { fontSize: 20 },
  emoji: { fontSize: 60, marginBottom: 20 },
  title: { marginBottom: 8 },
  sub: { marginBottom: 30 },

  // Progress bar
  progressBarBg: {
    height: 3,
    backgroundColor: n.colors.border,
    marginHorizontal: 16,
    borderRadius: 2,
  },
  progressBarFill: { height: 3, backgroundColor: n.colors.accent, borderRadius: 2 },

  // Content type chips
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: n.colors.border,
    backgroundColor: n.colors.card,
  },
  chipActive: { borderColor: `${n.colors.accent}66`, backgroundColor: n.colors.primaryTintSoft },
  chipDisabled: { opacity: 0.4 },
  chipText: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: n.colors.textMuted },
  chipTextActive: { color: n.colors.textPrimary },
  autoBadge: {
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
    borderRadius: 20,
    padding: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: n.colors.borderHighlight,
    backfaceVisibility: 'hidden',
  },
  cardBack: {
    backgroundColor: n.colors.card,
    borderColor: `${n.colors.accent}55`,
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
    backgroundColor: `${n.colors.error}16`,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  swipeHintRight: {
    position: 'absolute',
    right: 8,
    top: '45%',
    backgroundColor: `${n.colors.success}16`,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  swipeHintText: { color: n.colors.textPrimary, fontSize: 11, fontWeight: '700', opacity: 0.65 },

  label: { letterSpacing: 1, marginBottom: 20 },
  topic: { marginBottom: 10 },
  subject: {},
  tapHint: { marginTop: 40 },
  point: { marginBottom: 12 },
  hook: { marginTop: 12, fontStyle: 'italic' },
  mnemonicText: {
    marginBottom: 16,
  },
  quizQ: { marginBottom: 16 },
  swipeHintBanner: { alignItems: 'center', marginTop: 4, marginBottom: -8 },
  swipeHintBannerText: {},
  error: {},
  controls: { padding: 20, height: 120 },
  flipBtn: {},
  ratings: { flexDirection: 'row', gap: 10 },
  rateBtn: {
    flex: 1,
    paddingHorizontal: 10,
  },
  rateLabel: { fontWeight: '800', fontSize: 14 },
  rateDays: { fontSize: 11 },
});
