import React, { useEffect, useState, useRef } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MenuStackParamList } from '../navigation/types';
import { getTopicById, getTopicsDueForReview, updateTopicProgress } from '../db/queries/topics';
import { profileRepository } from '../db/repositories';
import { fetchContent } from '../services/aiService';
import { useAppStore } from '../store/useAppStore';
import type { TopicWithProgress, FlashcardsContent } from '../types';
import LoadingOrb from '../components/LoadingOrb';
import { linearTheme as n } from '../theme/linearTheme';
import LinearSurface from '../components/primitives/LinearSurface';
import { ResponsiveContainer } from '../hooks/useResponsive';
import ScreenHeader from '../components/ScreenHeader';

const RATINGS = [
  { label: 'Again', confidence: 0, color: n.colors.error },
  { label: 'Hard', confidence: 1, color: n.colors.warning },
  { label: 'Good', confidence: 2, color: n.colors.success },
  { label: 'Easy', confidence: 3, color: n.colors.accent },
];

export default function FlashcardsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
  const route = useRoute<RouteProp<MenuStackParamList, 'Flashcards'>>();
  const refreshProfile = useAppStore((s) => s.refreshProfile);
  const [queue, setQueue] = useState<TopicWithProgress[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [cards, setCards] = useState<FlashcardsContent['cards']>([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(false);

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
          return;
        }
      }
      const due = await getTopicsDueForReview(10);
      setQueue(due);
    }
    loadQueue();
  }, [route.params?.topicId]);

  const currentTopic = queue[currentIdx];

  useEffect(() => {
    if (!currentTopic) return;
    setLoading(true);
    setCardIdx(0);
    setIsFlipped(false);
    isFlippedRef.current = false;
    flipAnim.setValue(0);

    // fetchContent handles the cache check internally, but we'll re-verify it's reused.
    fetchContent(currentTopic, 'flashcards')
      .then((c) => {
        if (c.type === 'flashcards') {
          setCards(c.cards);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [currentTopic?.id]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => {
        if (!isFlippedRef.current || isAnimatingRef.current) return false;
        return Math.abs(gs.dx) > 10;
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
      <SafeAreaView style={styles.safe}>
        <ResponsiveContainer style={styles.center}>
          <Ionicons name="sparkles" size={60} color={n.colors.accent} />
          <LinearText style={styles.title}>All Caught Up!</LinearText>
          <LinearText style={styles.sub}>Finished all reviews for now</LinearText>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.btn}>
            <LinearText style={styles.btnText}>Back to Menu</LinearText>
          </TouchableOpacity>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  const currentCard = cards[cardIdx];
  if (!currentCard) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <ResponsiveContainer>
          <ScreenHeader title="Flashcards" />
          <View style={styles.cardArea}>
            <LinearText style={{ textAlign: 'center', marginTop: 40 }}>
              No cards available
            </LinearText>
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
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ResponsiveContainer>
        <ScreenHeader
          title={currentTopic?.name ?? 'Flashcards'}
          subtitle={currentTopic?.subjectName}
          rightElement={
            <LinearText style={styles.progressText}>
              {cardIdx + 1}/{cards.length} · Topic {currentIdx + 1}/{queue.length}
            </LinearText>
          }
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
                    <Image
                      source={{ uri: currentCard.imageUrl }}
                      style={styles.cardImage}
                      resizeMode="contain"
                    />
                  ) : null}
                  <LinearText style={styles.cardContent}>{currentCard.front}</LinearText>
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
                      <Image
                        source={{ uri: currentCard.imageUrl }}
                        style={styles.cardImage}
                        resizeMode="contain"
                      />
                    ) : null}
                    <LinearText style={styles.cardContent}>{currentCard.back}</LinearText>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
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
  },
  btnText: { color: n.colors.textPrimary, fontWeight: '700' },
  errorText: { color: n.colors.error, textAlign: 'center' },
});
