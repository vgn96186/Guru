import React, { useEffect, useState, useRef } from 'react';
import type { ImageStyle } from 'react-native';
import {
  Image,
  View,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Animated,
  PanResponder,
  ScrollView,
} from 'react-native';
import LinearText from '../components/primitives/LinearText';
import ErrorBoundary from '../components/ErrorBoundary';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  getTopicById,
  getTopicsDueForReview,
  updateTopicProgress,
  getAllTopicsWithProgress,
} from '../db/queries/topics';
import { profileRepository } from '../db/repositories';
import { fetchContent } from '../services/ai';
import { useRefreshProfile } from '../hooks/queries/useProfile';
import type { TopicWithProgress, FlashcardsContent } from '../types';
import LoadingOrb from '../components/LoadingOrb';
import { linearTheme as n } from '../theme/linearTheme';
import { ResponsiveContainer } from '../hooks/useResponsive';
import ScreenHeader from '../components/ScreenHeader';
import { InlineMarkdownText } from '../components/InlineMarkdownText.tsx';

import { MenuNav } from '../navigation/typedHooks';
/** Flashcard image that hides gracefully when loading fails */
const FlashcardImage = React.memo(function FlashcardImage({
  url,
  style,
}: {
  url: string;
  style: ImageStyle;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Image
      source={{ uri: url }}
      style={style}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
});

const RATINGS = [
  { label: 'Again', confidence: 0, color: n.colors.error },
  { label: 'Hard', confidence: 1, color: n.colors.warning },
  { label: 'Good', confidence: 2, color: n.colors.success },
  { label: 'Easy', confidence: 3, color: n.colors.accent },
];

export default function FlashcardsScreen() {
  const navigation = MenuNav.useNav();
  const route = MenuNav.useRoute<'Flashcards'>();
  const refreshProfile = useRefreshProfile();
  const [queue, setQueue] = useState<TopicWithProgress[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [cards, setCards] = useState<FlashcardsContent['cards']>([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [, setNoDueTopics] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const flipAnim = useRef(new Animated.Value(0)).current;
  const panXY = useRef(new Animated.ValueXY()).current;
  const isFlippedRef = useRef(false);
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    async function loadQueue() {
      if (route.params?.topicId) {
        const topic = await getTopicById(route.params.topicId);
        if (topic) {
          setQueue([topic]);
          setNoDueTopics(false);
          return;
        }
      }
      let due = await getTopicsDueForReview(10);
      if (due.length === 0) {
        const all = await getAllTopicsWithProgress();
        // Filter out mastered/nemesis if we just want random practice, or just take the first 10 available
        due = all.filter((t) => t.progress.status !== 'unseen').slice(0, 10);
        if (due.length === 0) {
          due = all.slice(0, 10);
        }
        if (due.length === 0) {
          setNoDueTopics(true);
          setQueue([]);
          return;
        }
      }
      setNoDueTopics(false);
      setQueue(due);
    }
    loadQueue();
  }, [route.params?.topicId]);

  async function loadPracticeAnything() {
    setLoading(true);
    try {
      const all = await getAllTopicsWithProgress();
      // Shuffle and pick 10
      const shuffled = all.sort(() => Math.random() - 0.5);
      const picked = shuffled.slice(0, 10);
      if (picked.length > 0) {
        setNoDueTopics(false);
        setQueue(picked);
        setCurrentIdx(0);
      }
    } finally {
      setLoading(false);
    }
  }

  const currentTopic = queue[currentIdx];

  useEffect(() => {
    if (!currentTopic) return;
    setLoading(true);
    setLoadError(null);
    setCards([]);
    setCardIdx(0);
    setIsFlipped(false);
    isFlippedRef.current = false;
    flipAnim.setValue(0);

    // fetchContent handles the cache check internally, but we'll re-verify it's reused.
    fetchContent(currentTopic, 'flashcards')
      .then((c) => {
        if (c.type === 'flashcards') {
          setCards(c.cards);
          setLoadError(null);
        } else {
          setLoadError(`AI returned ${c.type} instead of flashcards.`);
          setCards([]);
        }
        setLoading(false);
      })
      .catch((e) => {
        console.error('[Flashcards] Failed to load cards:', e);
        setLoadError(e?.message ?? 'Failed to load cards. Check your connection and try again.');
        setCards([]);
        setLoading(false);
      });
  }, [currentTopic, flipAnim]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => {
        if (!isFlippedRef.current || isAnimatingRef.current) return false;
        // Only trigger pan responder for intentional horizontal swipes
        return Math.abs(gs.dx) > 25 && Math.abs(gs.dx) > Math.abs(gs.dy);
      },
      onPanResponderMove: Animated.event([null, { dx: panXY.x }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > 80) {
          Animated.timing(panXY, {
            toValue: { x: 500, y: 0 },
            duration: 200,
            useNativeDriver: false,
          }).start(() => {
            panXY.setValue({ x: 0, y: 0 });
            handleNextCard();
          });
        } else if (gs.dx < -80) {
          Animated.timing(panXY, {
            toValue: { x: -500, y: 0 },
            duration: 200,
            useNativeDriver: false,
          }).start(() => {
            panXY.setValue({ x: 0, y: 0 });
            handleNextCard();
          });
        } else {
          Animated.spring(panXY, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      },
    }),
  ).current;

  function handleFlip() {
    const newValue = isFlippedRef.current ? 0 : 180;
    isAnimatingRef.current = true;
    Animated.spring(flipAnim, {
      toValue: newValue,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start(() => {
      isAnimatingRef.current = false;
    });
    setIsFlipped(!isFlippedRef.current);
    isFlippedRef.current = !isFlippedRef.current;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function handleNextCard() {
    if (cardIdx < cards.length - 1) {
      setCardIdx((i) => i + 1);
      setIsFlipped(false);
      isFlippedRef.current = false;
      flipAnim.setValue(0);
    } else {
      // Done with this topic's cards, show ratings
    }
  }

  async function handleRate(rating: (typeof RATINGS)[0]) {
    if (!currentTopic) return;

    const newConf = rating.confidence;
    const xp = 10 * (newConf + 1) + (currentTopic.progress.isNemesis ? 50 : 0);

    await updateTopicProgress(
      currentTopic.id,
      newConf >= 3 ? 'mastered' : newConf >= 2 ? 'reviewed' : 'seen',
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

  if (queue.length === 0) {
    return (
      // eslint-disable-next-line guru/prefer-screen-shell -- SafeAreaView needed here
      <SafeAreaView style={styles.safe}>
        <ResponsiveContainer style={styles.center}>
          <Ionicons name="layers-outline" size={64} color={n.colors.textMuted} />
          <LinearText style={styles.title}>No Flashcards Available</LinearText>
          <LinearText style={styles.sub}>
            Complete quiz sessions to generate flashcards for review.
          </LinearText>
          <View style={styles.btnRow}>
            <TouchableOpacity
              onPress={loadPracticeAnything}
              style={[styles.btn, styles.btnPrimary]}
            >
              <Ionicons name="shuffle" size={18} color={n.colors.accent} />
              <LinearText style={[styles.btnText, styles.btnTextPrimary]}>
                Practice Anything
              </LinearText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.btn}>
              <LinearText style={styles.btnText}>Back to Menu</LinearText>
            </TouchableOpacity>
          </View>
          {loading && <LinearText style={styles.loadingText}>Loading topics...</LinearText>}
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  const currentCard = cards[cardIdx];
  if (!currentCard) {
    return (
      // eslint-disable-next-line guru/prefer-screen-shell -- SafeAreaView needed here
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer>
          <ScreenHeader title="Flashcards" showSettings />
          <View style={styles.cardArea}>
            <Ionicons
              name={loadError ? 'alert-circle-outline' : 'card-outline'}
              size={60}
              color={loadError ? n.colors.error : n.colors.textMuted}
            />
            <LinearText
              style={{
                textAlign: 'center',
                marginTop: 16,
                fontSize: 18,
                fontWeight: '700',
                color: n.colors.textPrimary,
              }}
            >
              {loadError ? 'Failed to Load Cards' : 'No Flashcards Available'}
            </LinearText>
            <LinearText
              style={{
                textAlign: 'center',
                marginTop: 8,
                color: n.colors.textSecondary,
                paddingHorizontal: 20,
              }}
            >
              {loadError ||
                "AI couldn't generate flashcards for this topic. Try a different topic or check back later."}
            </LinearText>
            <View style={styles.cardActions}>
              <TouchableOpacity
                onPress={() => {
                  // Retry loading cards for this topic
                  setCards([]);
                  setLoadError(null);
                  setLoading(true);
                  fetchContent(currentTopic, 'flashcards')
                    .then((c) => {
                      if (c.type === 'flashcards') {
                        setCards(c.cards);
                        setLoadError(null);
                      } else {
                        setLoadError(`AI returned ${c.type} instead of flashcards.`);
                        setCards([]);
                      }
                      setLoading(false);
                    })
                    .catch((e) => {
                      setLoadError(e?.message ?? 'Failed to load cards.');
                      setLoading(false);
                    });
                }}
                style={styles.cardActionBtn}
              >
                <Ionicons name="refresh" size={18} color={n.colors.accent} />
                <LinearText style={styles.cardActionText}>Retry</LinearText>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cardActionBtn}>
                <LinearText style={styles.cardActionText}>Back to Menu</LinearText>
              </TouchableOpacity>
            </View>
          </View>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }
  const isLastCard = cardIdx === cards.length - 1;

  const frontAnimatedStyle = {
    transform: [
      { rotateY: flipAnim.interpolate({ inputRange: [0, 180], outputRange: ['0deg', '180deg'] }) },
    ],
    backfaceVisibility: 'hidden' as const,
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

  return (
    // eslint-disable-next-line guru/prefer-screen-shell -- SafeAreaView needed here
    <SafeAreaView style={styles.safe}>
      <ErrorBoundary>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer>
          <ScreenHeader
            title={currentTopic?.name ?? 'Flashcards'}
            rightElement={
              <LinearText style={styles.progressText}>
                {cardIdx + 1}/{cards.length} · Topic {currentIdx + 1}/{queue.length}
              </LinearText>
            }
            showSettings
          />

          <View style={styles.cardArea}>
            {loading ? (
              <LoadingOrb />
            ) : currentCard ? (
              <View style={styles.cardContainer} {...panResponder.panHandlers}>
                <Animated.View style={[styles.cardWrap, { transform: [{ translateX: panXY.x }] }]}>
                  {/* Front */}
                  <Animated.View style={[styles.card, frontAnimatedStyle]}>
                    <LinearText style={styles.cardLabel}>QUESTION</LinearText>
                    {currentCard.imageUrl ? (
                      <FlashcardImage url={currentCard.imageUrl} style={styles.cardImage} />
                    ) : null}
                    <InlineMarkdownText content={currentCard.front} style={styles.cardContent} />
                    <TouchableOpacity style={styles.tapToReveal} onPress={handleFlip}>
                      <LinearText style={styles.tapText}>Tap to reveal</LinearText>
                    </TouchableOpacity>
                  </Animated.View>

                  {/* Back */}
                  <Animated.View style={[styles.card, styles.cardBack, backAnimatedStyle]}>
                    <LinearText style={[styles.cardLabel, { color: n.colors.accent }]}>
                      ANSWER
                    </LinearText>
                    <ScrollView showsVerticalScrollIndicator={false} centerContent>
                      {currentCard.imageUrl ? (
                        <FlashcardImage url={currentCard.imageUrl} style={styles.cardImage} />
                      ) : null}
                      <InlineMarkdownText content={currentCard.back} style={styles.cardContent} />
                    </ScrollView>
                    {!isLastCard && isFlipped && (
                      <TouchableOpacity style={styles.nextCardBtn} onPress={handleNextCard}>
                        <LinearText style={styles.nextCardText}>Next Card →</LinearText>
                      </TouchableOpacity>
                    )}
                  </Animated.View>

                  {/* Tap for flip when not flipped */}
                  {!isFlipped && (
                    <TouchableOpacity
                      style={StyleSheet.absoluteFill}
                      onPress={handleFlip}
                      activeOpacity={1}
                    />
                  )}
                </Animated.View>
              </View>
            ) : (
              <LinearText style={styles.errorText}>No cards found for this topic.</LinearText>
            )}
          </View>

          <View style={styles.controls}>
            {isFlipped && isLastCard ? (
              <View style={styles.ratings}>
                {RATINGS.map((r) => (
                  <TouchableOpacity
                    key={r.label}
                    style={[
                      styles.rateBtn,
                      { backgroundColor: r.color + '22', borderColor: r.color },
                    ]}
                    onPress={() => handleRate(r)}
                  >
                    <LinearText style={[styles.rateText, { color: r.color }]}>{r.label}</LinearText>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.metaInfo}>
                <LinearText style={styles.cardCounter}>
                  Card {cardIdx + 1} of {cards.length}
                </LinearText>
              </View>
            )}
          </View>
        </ResponsiveContainer>
      </ErrorBoundary>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 12,
  },
  headerText: { flex: 1 },
  headerTitle: { color: n.colors.textPrimary, fontSize: 18, fontWeight: '800' },
  headerSub: { color: n.colors.accent, fontSize: 12, fontWeight: '600' },
  progressText: { color: n.colors.textMuted, fontSize: 14, fontWeight: '700' },
  cardArea: { flex: 1, padding: 20, justifyContent: 'center' },
  cardContainer: { height: 400 },
  cardWrap: { flex: 1 },
  card: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: n.colors.surface,
    borderRadius: 24,
    padding: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: n.colors.border,
    shadowColor: n.colors.background,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  cardBack: {
    backgroundColor: n.colors.surface,
    borderColor: n.colors.accent,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    color: n.colors.textMuted,
    marginBottom: 20,
    position: 'absolute',
    top: 30,
  },
  cardContent: {
    color: n.colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 32,
  },
  cardImage: {
    width: '100%',
    height: 160,
    borderRadius: 16,
    marginBottom: 20,
    backgroundColor: n.colors.surface,
  },
  tapToReveal: {
    position: 'absolute',
    bottom: 30,
  },
  tapText: { color: n.colors.textMuted, fontSize: 13, fontWeight: '600' },
  nextCardBtn: {
    position: 'absolute',
    bottom: 30,
    backgroundColor: n.colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  nextCardText: { color: n.colors.textPrimary, fontWeight: '800' },
  controls: { padding: 20, height: 100, justifyContent: 'center' },
  metaInfo: { alignItems: 'center' },
  cardCounter: { color: n.colors.textMuted, fontWeight: '600' },
  ratings: { flexDirection: 'row', gap: 8 },
  rateBtn: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rateText: { fontWeight: '800', fontSize: 14 },
  title: { color: n.colors.textPrimary, fontSize: 24, fontWeight: '900', marginTop: 16 },
  sub: {
    color: n.colors.textSecondary,
    fontSize: 16,
    marginVertical: 8,
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: 20,
  },
  btn: {
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnPrimary: {
    borderColor: n.colors.accent,
    backgroundColor: n.colors.accent + '18',
  },
  btnText: { color: n.colors.textPrimary, fontWeight: '700' },
  btnTextPrimary: { color: n.colors.accent },
  btnRow: {
    marginTop: 20,
    gap: 12,
    alignItems: 'center',
    width: '100%',
  },
  loadingText: {
    color: n.colors.textMuted,
    fontSize: 14,
    marginTop: 12,
  },
  cardActions: {
    marginTop: 24,
    gap: 12,
    alignItems: 'center',
  },
  cardActionBtn: {
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardActionText: {
    color: n.colors.textPrimary,
    fontWeight: '700',
  },
  errorText: { color: n.colors.error, textAlign: 'center' },
});
