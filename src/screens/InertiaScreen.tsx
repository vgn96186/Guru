import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Animated, Easing, Dimensions, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import * as Haptics from 'expo-haptics';
import { fetchContent } from '../services/aiService';
import { fetchWikipediaImage } from '../services/imageService';
import { getAllTopicsWithProgress } from '../db/queries/topics';
import LoadingOrb from '../components/LoadingOrb';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { MarkdownRender } from '../components/MarkdownRender';
import { theme } from '../constants/theme';
import type { DetectiveContent, TopicWithProgress } from '../types';

const { width } = Dimensions.get('window');

function TopicImage({ topicName }: { topicName: string }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchWikipediaImage(topicName).then(setImageUrl);
  }, [topicName]);

  if (!imageUrl) return null;

  return (
    <Image 
      source={{ uri: imageUrl }} 
      style={styles.topicImage} 
      resizeMode="contain"
    />
  );
}

type Phase = 'breathe' | 'sit_up_prompt' | 'fetching' | 'micro_win_bed' | 'micro_win' | 'pivot';

export default function InertiaScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [phase, setPhase] = useState<Phase>('breathe');
  const [breatheText, setBreatheText] = useState('Breathe in...');
  const [content, setContent] = useState<DetectiveContent | null>(null);
  const [topic, setTopic] = useState<TopicWithProgress | null>(null);
  const [revealStep, setRevealStep] = useState(1);
  const [isSolved, setIsSolved] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    startBreathing();
    fetchMicroWin();
    setTimeout(() => setShowSkip(true), 8000);
  }, []);

  function startBreathing() {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.4,
          duration: 4000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 4000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        })
      ])
    ).start();

    setTimeout(() => setBreatheText('Hold...'), 4000);
    setTimeout(() => setBreatheText('Breathe out...'), 6000);
    setTimeout(() => setBreatheText('One more time. In...'), 10000);

    setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase('sit_up_prompt');
      fadeIn();
    }, 14000);
  }

  function fadeIn() {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  }

  async function fetchMicroWin() {
    try {
      const topics = await getAllTopicsWithProgress();
      const pool = topics
        .filter(t => t.progress.status === 'reviewed' || t.progress.status === 'mastered' || t.inicetPriority >= 8)
        .slice(0, 50);
      const selected = pool[Math.floor(Math.random() * pool.length)] || topics[0];
      setTopic(selected);

      const res = await fetchContent(selected, 'detective');
      if (res.type === 'detective') {
        setContent(res);
        if (phase === 'fetching') {
          setPhase('micro_win');
          fadeIn();
        }
      }
    } catch (e) {
      console.error('Failed to fetch mystery', e);
    }
  }

  function handlePositionConfirm() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase(content ? 'micro_win' : 'fetching');
    fadeIn();
  }

  function handleNextClue() {
    if (!content) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (revealStep < content.clues.length) {
      setRevealStep(prev => prev + 1);
    } else {
      setIsSolved(true);
    }
  }

  function handleWinComplete() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPhase('pivot');
    fadeIn();
  }

  function handleStartSprint() {
    navigation.navigate('Session', { mood: 'distracted', mode: 'sprint', forcedMinutes: 5 });
  }

  function handleClose() {
    navigation.goBack();
  }

  const DetectiveDisplay = ({ content, revealStep, isSolved }: { content: DetectiveContent, revealStep: number, isSolved: boolean }) => (
    <View style={styles.card}>
      <Text style={styles.cardHeader}>CLINICAL MYSTERY</Text>
      
      {content.clues.slice(0, revealStep).map((clue, i) => (
        <View key={i} style={[styles.clueBox, i === revealStep - 1 && styles.newClue]}>
          <Text style={styles.clueLabel}>Visual / Sign {i + 1}</Text>
          <Text style={styles.clueText}>{clue}</Text>
        </View>
      ))}

      {isSolved && (
        <Animated.View style={[styles.solutionBox, { opacity: revealStep > 0 ? 1 : 0 }]}>
          <Text style={styles.solutionLabel}>Diagnosis:</Text>
          <Text style={styles.solutionValue}>{content.answer}</Text>
          <View style={styles.divider} />
          <MarkdownRender content={content.explanation} compact />
        </Animated.View>
      )}
    </View>
  );

  if (phase === 'breathe') {
    return (
      <SafeAreaView style={styles.safe}>
        <ResponsiveContainer style={styles.center}>
          <Text style={styles.breatheTitle}>Brain Fog?</Text>
          <Text style={styles.breatheSub}>Let's reset. Breathe with the circle.</Text>
          <View style={styles.circleContainer}>
            <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={styles.breatheText}>{breatheText}</Text>
          </View>
          {showSkip && (
            <TouchableOpacity style={styles.skipBtn} onPress={() => setPhase('sit_up_prompt')}>
              <Text style={styles.skipBtnText}>Skip breathing →</Text>
            </TouchableOpacity>
          )}
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  if (phase === 'fetching') {
    return (
      <SafeAreaView style={styles.safe}>
        <LoadingOrb message="Constructing a diagnostic puzzle..." />
      </SafeAreaView>
    );
  }

  if (phase === 'sit_up_prompt') {
    return (
      <SafeAreaView style={styles.safe}>
        <ResponsiveContainer style={{ flex: 1 }}>
          <Animated.View style={[styles.center, { opacity: fadeAnim }]}>
            <Text style={styles.sitUpEmoji}>🕵️</Text>
            <Text style={styles.sitUpTitle}>One Minute Mystery</Text>
            <Text style={styles.sitUpSub}>
              Don't study yet. Just solve this one 3-clue clinical case.
            </Text>
            <View style={styles.choiceBox}>
              <TouchableOpacity style={styles.sitUpBtn} onPress={handlePositionConfirm}>
                <Text style={styles.sitUpBtnText}>📱 I'm Ready (Sit Up)</Text>
              </TouchableOpacity>
              <Text style={styles.orText}>or</Text>
              <TouchableOpacity style={styles.bedBtn} onPress={() => setPhase('micro_win_bed')}>
                <Text style={styles.bedBtnText}>🛏️ Play from Bed (Lazy Mode)</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  if ((phase === 'micro_win' || phase === 'micro_win_bed') && content) {
    return (
      <SafeAreaView style={styles.safe}>
        <ResponsiveContainer style={{ flex: 1 }}>
          <Animated.View style={[styles.center, { opacity: fadeAnim }]}>
            <Text style={styles.winTitle}>Solve the Mystery</Text>
            <Text style={styles.winTopic}>{content.topicName}</Text>
            
            <TopicImage topicName={content.topicName} />
            
            <DetectiveDisplay content={content} revealStep={revealStep} isSolved={isSolved} />

            {!isSolved ? (
              <View style={{ width: '100%', gap: 12, marginTop: 20 }}>
                <TouchableOpacity style={styles.doneBtn} onPress={handleNextClue}>
                  <Text style={styles.doneBtnText}>
                    {revealStep < content.clues.length ? 'Next Clue →' : 'I know the Diagnosis →'}
                  </Text>
                </TouchableOpacity>
                {revealStep >= 2 && (
                  <TouchableOpacity style={styles.giveUpBtn} onPress={() => setIsSolved(true)}>
                    <Text style={styles.giveUpText}>Just show me the answer</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <TouchableOpacity style={[styles.doneBtn, { backgroundColor: theme.colors.success, marginTop: 20 }]} onPress={handleWinComplete}>
                <Text style={styles.doneBtnText}>Boom. I'm moving. →</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  if (phase === 'pivot') {
    return (
      <SafeAreaView style={styles.safe}>
        <ResponsiveContainer style={{ flex: 1 }}>
          <Animated.View style={[styles.center, { opacity: fadeAnim }]}>
            <Text style={styles.emoji}>🔥</Text>
            <Text style={styles.pivotTitle}>Brain Sparked!</Text>
            <Text style={styles.pivotSub}>
              You just diagnosed a case. The hardest part is over.
            </Text>
            <View style={styles.offerBox}>
              <Text style={styles.offerText}>
                Keep this momentum for just 5 minutes?
              </Text>
            </View>
            <TouchableOpacity style={styles.sprintBtn} onPress={handleStartSprint}>
              <Text style={styles.sprintBtnText}>🚀 Start 5-Min Sprint</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Text style={styles.closeBtnText}>I'll stop here for now.</Text>
            </TouchableOpacity>
          </Animated.View>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topicImage: { width: '100%', height: 160, borderRadius: 16, marginBottom: 20, backgroundColor: theme.colors.surface },
  
  breatheTitle: { color: '#fff', fontSize: 28, fontWeight: '900', marginBottom: 8, textAlign: 'center' },
  breatheSub: { color: theme.colors.textSecondary, fontSize: 16, marginBottom: 60, textAlign: 'center' },
  circleContainer: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
  pulseCircle: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: theme.colors.primaryTintSoft, borderWidth: 2, borderColor: theme.colors.primary },
  breatheText: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  skipBtn: { marginTop: 40, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border },
  skipBtnText: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '600' },

  emoji: { fontSize: 64, marginBottom: 20 },
  winTitle: { color: theme.colors.primaryLight, fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 },
  winTopic: { color: '#fff', fontSize: 28, fontWeight: '900', marginBottom: 24, textAlign: 'center' },
  
  card: { backgroundColor: theme.colors.surface, padding: 20, borderRadius: 24, width: '100%', borderWidth: 1, borderColor: theme.colors.border },
  cardHeader: { color: theme.colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginBottom: 16 },
  clueBox: { backgroundColor: '#13131A', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#252535' },
  newClue: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryTintSoft },
  clueLabel: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '700', marginBottom: 4 },
  clueText: { color: theme.colors.textPrimary, fontSize: 16, lineHeight: 22 },
  
  solutionBox: { marginTop: 8, padding: 16, backgroundColor: '#1A2A1A', borderRadius: 16, borderWidth: 1, borderColor: '#2D4A2D' },
  solutionLabel: { color: theme.colors.success, fontSize: 11, fontWeight: '800', marginBottom: 4 },
  solutionValue: { color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 12 },
  divider: { height: 1, backgroundColor: '#2D4A2D', marginVertical: 12 },
  
  doneBtn: { backgroundColor: theme.colors.primary, width: '100%', paddingVertical: 18, borderRadius: 16, alignItems: 'center', ...theme.shadows.glow(theme.colors.primary) },
  doneBtnText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  giveUpBtn: { padding: 16, alignItems: 'center' },
  giveUpText: { color: theme.colors.textMuted, fontSize: 14, textDecorationLine: 'underline' },

  pivotTitle: { color: '#fff', fontSize: 32, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
  pivotSub: { color: theme.colors.textSecondary, fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  offerBox: { backgroundColor: theme.colors.primaryTintSoft, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.primaryTint, marginBottom: 32 },
  offerText: { color: theme.colors.primaryLight, fontSize: 16, fontWeight: '700', textAlign: 'center', lineHeight: 24 },
  
  sprintBtn: { backgroundColor: theme.colors.primary, width: '100%', paddingVertical: 20, borderRadius: 16, alignItems: 'center', marginBottom: 16 },
  sprintBtnText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  closeBtn: { padding: 16 },
  closeBtnText: { color: theme.colors.textMuted, fontSize: 16, fontWeight: '600' },
  
  sitUpEmoji: { fontSize: 64, marginBottom: 20 },
  sitUpTitle: { color: '#fff', fontSize: 28, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
  sitUpSub: { color: theme.colors.textSecondary, fontSize: 16, textAlign: 'center', marginBottom: 40, lineHeight: 24 },
  choiceBox: { alignItems: 'center', width: '100%' },
  sitUpBtn: { backgroundColor: theme.colors.success, width: '100%', paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginBottom: 16 },
  sitUpBtnText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  orText: { color: theme.colors.textMuted, fontSize: 14, marginVertical: 12 },
  bedBtn: { backgroundColor: theme.colors.surface, width: '100%', paddingVertical: 18, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
  bedBtnText: { color: theme.colors.textSecondary, fontSize: 16, fontWeight: '700' },
});
