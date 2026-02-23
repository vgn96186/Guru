import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Animated, Easing, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import * as Haptics from 'expo-haptics';
import { fetchContent } from '../services/aiService';
import { getAllTopicsWithProgress } from '../db/queries/topics';
import { useAppStore } from '../store/useAppStore';
import type { MnemonicContent, TopicWithProgress } from '../types';
import LoadingOrb from '../components/LoadingOrb';

const { width } = Dimensions.get('window');

type Phase = 'breathe' | 'position_check' | 'micro_win_bed' | 'sit_up_prompt' | 'fetching' | 'micro_win' | 'pivot';

const POSITION_CHECK_DURATION = 3000; // 3 seconds to verify position

export default function InertiaScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const profile = useAppStore(s => s.profile);
  const [phase, setPhase] = useState<Phase>('breathe');
  const [breatheText, setBreatheText] = useState('Breathe in...');
  const [content, setContent] = useState<MnemonicContent | null>(null);
  const [topic, setTopic] = useState<TopicWithProgress | null>(null);
  
  const [showSkip, setShowSkip] = useState(false);
  const [positionVerified, setPositionVerified] = useState(false);
  const [positionProgress, setPositionProgress] = useState(0);
  const [isLyingDown, setIsLyingDown] = useState(true);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const positionAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    startBreathing();
    fetchMicroWin();
    // Show skip button after 8 seconds
    setTimeout(() => setShowSkip(true), 8000);
  }, []);

  function startBreathing() {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.5,
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

    setTimeout(() => {
      setBreatheText('Hold...');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, 4000);
    
    setTimeout(() => {
      setBreatheText('Breathe out...');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, 6000);
    
    setTimeout(() => {
      setBreatheText('One more time. In...');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, 10000);

    setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase('position_check');
      checkPosition();
    }, 14000);
  }

  function fadeIn() {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  }

  function checkPosition() {
    // Simulate accelerometer position check
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setPositionProgress(progress);
      
      // Mock position detection
      const mockZ = Math.random();
      setIsLyingDown(mockZ < 0.5);
      
      if (progress >= 100) {
        clearInterval(interval);
        if (mockZ > 0.5) {
          setPositionVerified(true);
          setPhase(content ? 'micro_win' : 'fetching');
          fadeIn();
        } else {
          setPhase('sit_up_prompt');
          fadeIn();
        }
      }
    }, 300);
  }

  function handlePositionConfirm() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPositionVerified(true);
    setPhase(content ? 'micro_win_bed' : 'fetching');
    fadeIn();
  }

  async function fetchMicroWin() {
    if (!profile?.openrouterApiKey) return;
    
    // Pick an EASY or HIGH CONFIDENCE topic to guarantee a win, or a random seen one
    const topics = getAllTopicsWithProgress();
    const seen = topics.filter(t => t.progress.status === 'reviewed' || t.progress.status === 'mastered');
    const pool = seen.length > 0 ? seen : topics;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    setTopic(selected);

    try {
      // Mnemonic is the lowest friction, highest reward content type
      const res = await fetchContent(selected, 'mnemonic', profile.openrouterApiKey, profile.openrouterKey);
      if (res.type === 'mnemonic') {
        setContent(res);
        if (phase === 'fetching') {
          setPhase('micro_win');
          fadeIn();
        }
      }
    } catch (e) {
// if (__DEV__) console.log('Failed to fetch micro win', e);
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

  if (phase === 'breathe') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <View style={styles.center}>
          <Text style={styles.breatheTitle}>Task Paralysis?</Text>
          <Text style={styles.breatheSub}>It's okay. Drop your shoulders.</Text>
          
          <View style={styles.circleContainer}>
            <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={styles.breatheText}>{breatheText}</Text>
          </View>
          
          {showSkip && (
            <TouchableOpacity 
              style={styles.skipBtn} 
              onPress={() => setPhase(content ? 'micro_win' : 'fetching')}
            >
              <Text style={styles.skipBtnText}>Skip breathing →</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'fetching') {
    return (
      <SafeAreaView style={styles.safe}>
        <LoadingOrb message="Finding the easiest possible fact..." />
      </SafeAreaView>
    );
  }

  if (phase === 'position_check') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <View style={styles.center}>
          <Text style={styles.positionEmoji}>📱</Text>
          <Text style={styles.positionTitle}>Checking Position...</Text>
          <Text style={styles.positionSub}>
            {isLyingDown ? 'Still lying down. Sit up to continue.' : 'Good! Hold upright position...'}
          </Text>
          
          <View style={styles.positionBar}>
            <View style={[styles.positionFill, { width: `${positionProgress}%` }]} />
          </View>
          
          <Text style={styles.positionPercent}>{positionProgress}%</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'sit_up_prompt') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <Animated.View style={[styles.center, { opacity: fadeAnim }]}>
          <Text style={styles.sitUpEmoji}>🪑</Text>
          <Text style={styles.sitUpTitle}>Almost There!</Text>
          <Text style={styles.sitUpSub}>
            You're still lying down. Sit up or confirm you're ready to study in bed.
          </Text>
          
          <View style={styles.choiceBox}>
            <TouchableOpacity style={styles.sitUpBtn} onPress={handlePositionConfirm}>
              <Text style={styles.sitUpBtnText}>📱 I'm Sitting Up Now</Text>
            </TouchableOpacity>
            
            <Text style={styles.orText}>or</Text>
            
            <TouchableOpacity style={styles.bedBtn} onPress={() => setPhase('micro_win_bed')}>
              <Text style={styles.bedBtnText}>🛏️ Study in Bed (Lazy Mode)</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (phase === 'micro_win_bed' && content) {
    return (
      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.center, { opacity: fadeAnim }]}>
          <Text style={styles.bedEmoji}>🛏️</Text>
          <Text style={styles.bedTitle}>Bed Study Mode</Text>
          <Text style={styles.bedSub}>One card while lying down. Then we get up.</Text>
          
          <View style={[styles.card, styles.bedCard]}>
            <Text style={styles.mnemonicText}>{content.mnemonic}</Text>
            {content.expansion.map((line, i) => (
              <Text key={i} style={styles.expansionText}>• {line}</Text>
            ))}
            <Text style={styles.tipText}>💡 {content.tip}</Text>
          </View>

          <TouchableOpacity style={styles.doneBtn} onPress={() => setPhase('sit_up_prompt')}>
            <Text style={styles.doneBtnText}>Okay, I'm Ready to Sit Up →</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.stayBedBtn} onPress={handleWinComplete}>
            <Text style={styles.stayBedBtnText}>Stay in Bed (Weak)</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (phase === 'micro_win' && content) {
    return (
      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.center, { opacity: fadeAnim }]}>
          <Text style={styles.emoji}>🧠</Text>
          <Text style={styles.winTitle}>Just read this one thing.</Text>
          <Text style={styles.winTopic}>{content.topicName}</Text>
          
          <View style={styles.card}>
            <Text style={styles.mnemonicText}>{content.mnemonic}</Text>
            {content.expansion.map((line, i) => (
              <Text key={i} style={styles.expansionText}>• {line}</Text>
            ))}
            <Text style={styles.tipText}>💡 {content.tip}</Text>
          </View>

          <TouchableOpacity style={styles.doneBtn} onPress={handleWinComplete} activeOpacity={0.8}>
            <Text style={styles.doneBtnText}>Okay, read it.</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (phase === 'pivot') {
    return (
      <SafeAreaView style={styles.safe}>
        <Animated.View style={[styles.center, { opacity: fadeAnim }]}>
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.pivotTitle}>You just studied!</Text>
          <Text style={styles.pivotSub}>
            See? The hardest part is starting. You're already in motion.
          </Text>
          
          <View style={styles.offerBox}>
            <Text style={styles.offerText}>
              Do you want to stop right now guilt-free, or keep this momentum for just 5 minutes?
            </Text>
          </View>

          <TouchableOpacity style={styles.sprintBtn} onPress={handleStartSprint} activeOpacity={0.9}>
            <Text style={styles.sprintBtnText}>🔥 Give me 5 Minutes</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
            <Text style={styles.closeBtnText}>I'll stop here.</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  
  breatheTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  breatheSub: { color: '#9E9E9E', fontSize: 16, marginBottom: 60, textAlign: 'center' },
  circleContainer: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  pulseCircle: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#6C63FF33', borderWidth: 2, borderColor: '#6C63FF' },
  breatheText: { color: '#fff', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  skipBtn: { marginTop: 40, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20, borderWidth: 1, borderColor: '#6C63FF44' },
  skipBtnText: { color: '#6C63FF', fontSize: 14, fontWeight: '600' },

  emoji: { fontSize: 56, marginBottom: 20 },
  winTitle: { color: '#9E9E9E', fontSize: 16, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  winTopic: { color: '#fff', fontSize: 28, fontWeight: '900', marginBottom: 24, textAlign: 'center' },
  card: { backgroundColor: '#1A1A24', padding: 24, borderRadius: 24, width: '100%', borderWidth: 1, borderColor: '#333', marginBottom: 32 },
  mnemonicText: { color: '#6C63FF', fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  expansionText: { color: '#E0E0E0', fontSize: 16, lineHeight: 24, marginBottom: 8 },
  tipText: { color: '#FF9800', fontSize: 14, fontStyle: 'italic', marginTop: 16, textAlign: 'center' },
  
  doneBtn: { backgroundColor: '#4CAF50', width: '100%', paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
  doneBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },

  pivotTitle: { color: '#fff', fontSize: 32, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
  pivotSub: { color: '#9E9E9E', fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  offerBox: { backgroundColor: '#2A1A1A', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#F4433655', marginBottom: 32 },
  offerText: { color: '#F44336', fontSize: 16, fontWeight: '600', textAlign: 'center', lineHeight: 24 },
  
  sprintBtn: { backgroundColor: '#6C63FF', width: '100%', paddingVertical: 20, borderRadius: 16, alignItems: 'center', marginBottom: 16 },
  sprintBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  closeBtn: { padding: 16 },
  closeBtnText: { color: '#666', fontSize: 16, fontWeight: '600' },
  
  // Position check
  positionEmoji: { fontSize: 56, marginBottom: 20 },
  positionTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 12 },
  positionSub: { color: '#9E9E9E', fontSize: 16, textAlign: 'center', marginBottom: 40 },
  positionBar: { width: 250, height: 12, backgroundColor: '#2A2A38', borderRadius: 6, overflow: 'hidden', marginBottom: 16 },
  positionFill: { height: '100%', backgroundColor: '#6C63FF' },
  positionPercent: { color: '#6C63FF', fontSize: 20, fontWeight: '800' },
  
  // Sit up prompt
  sitUpEmoji: { fontSize: 56, marginBottom: 20 },
  sitUpTitle: { color: '#FF9800', fontSize: 28, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  sitUpSub: { color: '#9E9E9E', fontSize: 16, textAlign: 'center', marginBottom: 40, lineHeight: 24 },
  choiceBox: { alignItems: 'center', width: '100%' },
  sitUpBtn: { backgroundColor: '#4CAF50', width: '100%', paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginBottom: 16 },
  sitUpBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  orText: { color: '#555', fontSize: 14, marginVertical: 12 },
  bedBtn: { backgroundColor: '#2A2A38', width: '100%', paddingVertical: 18, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#444' },
  bedBtnText: { color: '#9E9E9E', fontSize: 16, fontWeight: '600' },
  
  // Bed study mode
  bedEmoji: { fontSize: 56, marginBottom: 16 },
  bedTitle: { color: '#6C63FF', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  bedSub: { color: '#9E9E9E', fontSize: 14, textAlign: 'center', marginBottom: 24 },
  bedCard: { borderColor: '#6C63FF44', backgroundColor: '#1A1A2E' },
  stayBedBtn: { padding: 16, marginTop: 8 },
  stayBedBtnText: { color: '#555', fontSize: 14, fontStyle: 'italic' },
});
