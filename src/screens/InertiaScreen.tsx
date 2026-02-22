import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Animated, Easing, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { fetchContent } from '../services/aiService';
import { getAllTopicsWithProgress } from '../db/queries/topics';
import { useAppStore } from '../store/useAppStore';
import type { MnemonicContent, TopicWithProgress } from '../types';
import LoadingOrb from '../components/LoadingOrb';

const { width } = Dimensions.get('window');

type Phase = 'breathe' | 'fetching' | 'micro_win' | 'pivot';

export default function InertiaScreen() {
  const navigation = useNavigation<any>();
  const profile = useAppStore(s => s.profile);
  const [phase, setPhase] = useState<Phase>('breathe');
  const [breatheText, setBreatheText] = useState('Breathe in...');
  const [content, setContent] = useState<MnemonicContent | null>(null);
  const [topic, setTopic] = useState<TopicWithProgress | null>(null);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    startBreathing();
    fetchMicroWin();
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
      setPhase(content ? 'micro_win' : 'fetching');
      fadeIn();
    }, 14000);
  }

  function fadeIn() {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
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
      console.log('Failed to fetch micro win', e);
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
});
