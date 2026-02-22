import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { getTopicsDueForReview, updateTopicProgress } from '../db/queries/topics';
import { addXp } from '../db/queries/progress';
import { fetchContent } from '../services/aiService';
import { useAppStore } from '../store/useAppStore';
import type { TopicWithProgress, AIContent } from '../types';
import LoadingOrb from '../components/LoadingOrb';

// Spaced Repetition Ratings
const RATINGS = [
  { label: 'Again', days: 1, confidence: 1, color: '#F44336' },
  { label: 'Hard', days: 3, confidence: 2, color: '#FF9800' },
  { label: 'Good', days: 7, confidence: 3, color: '#2ECC71' },
  { label: 'Easy', days: 14, confidence: 4, color: '#3498DB' },
];

export default function ReviewScreen() {
  const navigation = useNavigation();
  const { profile, refreshProfile } = useAppStore();
  const [queue, setQueue] = useState<TopicWithProgress[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [content, setContent] = useState<AIContent | null>(null);
  const [loading, setLoading] = useState(false);

  const flipAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Load due topics (limit 20 for a session)
    const due = getTopicsDueForReview(20);
    setQueue(due);
  }, []);

  const currentTopic = queue[currentIdx];

  useEffect(() => {
    if (!currentTopic || !profile?.openrouterApiKey) return;
    setLoading(true);
    setContent(null);
    setIsFlipped(false);
    flipAnim.setValue(0);

    // Fetch 'keypoints' or 'mnemonic' for flashcard back
    fetchContent(currentTopic, 'keypoints', profile.openrouterApiKey, profile.openrouterKey || undefined)
      .then(c => {
        setContent(c);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [currentTopic]);

  function handleFlip() {
    Animated.spring(flipAnim, {
      toValue: 180,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
    setIsFlipped(true);
  }

  function handleRate(rating: typeof RATINGS[0]) {
    if (!currentTopic) return;

    // Update DB
    // logic similar to updateTopicProgress but using explicit 'days' if needed, 
    // or just mapping confidence. Our existing updateTopicProgress uses confidence.
    // For now, we map confidence to our SRS intervals in db/queries/topics
    // so we just pass the new confidence.

    // 5 = Mastered (for Easy if already high), but let's stick to 1-4 scale for cards
    let newConf = rating.confidence;
    if (rating.label === 'Easy' && currentTopic.progress.confidence >= 4) newConf = 5;

    // Use a simplified XP reward for flashcards (lower than full study)
    const xp = 10 * newConf;

    updateTopicProgress(
      currentTopic.id,
      newConf >= 4 ? 'mastered' : newConf >= 2 ? 'reviewed' : 'seen',
      newConf,
      xp
    );

    addXp(xp);
    refreshProfile();

    // Next card
    if (currentIdx < queue.length - 1) {
      setCurrentIdx(i => i + 1);
    } else {
      navigation.goBack(); // Done
    }
  }

  if (queue.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>All caught up!</Text>
          <Text style={styles.sub}>No topics due for review right now.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.btn}>
            <Text style={styles.btnText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentTopic) return null;

  const frontAnimatedStyle = {
    transform: [{ rotateY: flipAnim.interpolate({ inputRange: [0, 180], outputRange: ['0deg', '180deg'] }) }],
    backfaceVisibility: 'hidden' as const,
    position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0
  };
  const backAnimatedStyle = {
    transform: [{ rotateY: flipAnim.interpolate({ inputRange: [0, 180], outputRange: ['180deg', '360deg'] }) }],
    backfaceVisibility: 'hidden' as const,
    position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />

      <View style={styles.header}>
        <Text style={styles.progress}>Card {currentIdx + 1} / {queue.length}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.close}>✕</Text></TouchableOpacity>
      </View>

      <View style={styles.cardContainer}>
        {/* Front */}
        <Animated.View style={[styles.card, frontAnimatedStyle]}>
          <Text style={styles.label}>TOPIC</Text>
          <Text style={styles.topic}>{currentTopic.name}</Text>
          <Text style={styles.subject}>{currentTopic.subjectName}</Text>
          <Text style={styles.tapHint}>Tap to flip</Text>
        </Animated.View>

        {/* Back */}
        <Animated.View style={[styles.card, styles.cardBack, backAnimatedStyle]}>
          {loading ? (
            <LoadingOrb />
          ) : content && content.type === 'keypoints' ? (
            <View>
              <Text style={styles.label}>KEY POINTS</Text>
              {content.points.slice(0, 4).map((p, i) => (
                <Text key={i} style={styles.point}>• {p}</Text>
              ))}
              <Text style={styles.hook}>💡 {content.memoryHook}</Text>
            </View>
          ) : (
            <Text style={styles.error}>Could not load content.</Text>
          )}
        </Animated.View>

        {/* Invisible touch layer for flipping */}
        {!isFlipped && (
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleFlip} activeOpacity={1} />
        )}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {isFlipped ? (
          <View style={styles.ratings}>
            {RATINGS.map(r => (
              <TouchableOpacity
                key={r.label}
                style={[styles.rateBtn, { borderColor: r.color }]}
                onPress={() => handleRate(r)}
              >
                <Text style={[styles.rateLabel, { color: r.color }]}>{r.label}</Text>
                <Text style={styles.rateDays}>{r.days}d</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <TouchableOpacity style={styles.flipBtn} onPress={handleFlip}>
            <Text style={styles.flipText}>Show Answer</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  progress: { color: '#666', fontWeight: '700' },
  close: { color: '#fff', fontSize: 20 },
  emoji: { fontSize: 60, marginBottom: 20 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  sub: { color: '#888', fontSize: 16, marginBottom: 30, textAlign: 'center' },
  btn: { backgroundColor: '#333', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '700' },
  cardContainer: { flex: 1, margin: 20, justifyContent: 'center' },
  card: {
    backgroundColor: '#1A1A24',
    borderRadius: 20,
    padding: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    backfaceVisibility: 'hidden',
  },
  cardBack: {
    backgroundColor: '#15151E',
    borderColor: '#6C63FF',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  label: { color: '#555', fontSize: 12, fontWeight: '900', letterSpacing: 1, marginBottom: 20 },
  topic: { color: '#fff', fontSize: 28, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
  subject: { color: '#6C63FF', fontSize: 16, fontWeight: '600' },
  tapHint: { color: '#444', marginTop: 40, fontSize: 12 },
  point: { color: '#ddd', fontSize: 16, marginBottom: 12, lineHeight: 22 },
  hook: { color: '#FF9800', fontSize: 14, marginTop: 20, fontStyle: 'italic' },
  error: { color: '#F44336' },
  controls: { padding: 20, height: 120 },
  flipBtn: { backgroundColor: '#6C63FF', padding: 16, borderRadius: 12, alignItems: 'center' },
  flipText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  ratings: { flexDirection: 'row', gap: 10 },
  rateBtn: { flex: 1, borderWidth: 2, borderRadius: 12, padding: 12, alignItems: 'center', backgroundColor: '#1A1A24' },
  rateLabel: { fontWeight: '800', fontSize: 14, marginBottom: 4 },
  rateDays: { color: '#666', fontSize: 11 },
});