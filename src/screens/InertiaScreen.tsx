import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Animated, Linking, Platform, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { fetchContent } from '../services/aiService';
import { getWeakestTopics } from '../db/queries/topics';
import { useAppStore } from '../store/useAppStore';
import type { StoryContent } from '../types';
import LoadingOrb from '../components/LoadingOrb';

const STEPS = [
  "Breathe in...",
  "Just one cool fact...",
  "Okay, one more...",
  "You're doing great. Last one!",
];

const { width } = Dimensions.get('window');

export default function InertiaScreen() {
  const navigation = useNavigation();
  const profile = useAppStore(s => s.profile);
  const [step, setStep] = useState(0);
  const [content, setContent] = useState<StoryContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [facts, setFacts] = useState<string[]>([]);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadContent();
  }, []);

  useEffect(() => {
    animateIn();
  }, [step]);

  async function loadContent() {
    if (!profile?.openrouterApiKey) {
      setLoading(false); // No key
      return;
    }
    
    // Pick a random weak topic
    const weak = getWeakestTopics(5);
    const topic = weak.length > 0 ? weak[Math.floor(Math.random() * weak.length)] : null;
    
    if (!topic) {
        // Fallback or handle no weak topics
        setLoading(false);
        return;
    }

    try {
      const res = await fetchContent(topic, 'story', profile.openrouterApiKey);
      if (res.type === 'story') {
        setContent(res);
        // Extract bite-sized facts
        const extracted = res.keyConceptHighlights && res.keyConceptHighlights.length >= 3 
            ? res.keyConceptHighlights.slice(0, 3) 
            : [res.story.slice(0, 100), "Key fact 2 placeholder", "Key fact 3 placeholder"];
        setFacts(extracted);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function animateIn() {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }

  function handleNext() {
    if (step < 3) {
      setStep(s => s + 1);
    } else {
        // Done with inertia, go to final screen or action
        setStep(4);
    }
  }
  
  function handleClose() {
      navigation.goBack();
  }

  async function openCerebellum() {
    const packageName = 'com.cerebellummobileapp';
    const intentUrl = `intent://#Intent;package=${packageName};end`;
    const webUrl = 'https://www.cerebellumacademy.com/';

    try {
      // Try Android intent first to force app open
      await Linking.openURL(intentUrl);
    } catch (e) {
      // Fallback to web
      Linking.openURL(webUrl).catch(() => {});
    }
    navigation.goBack();
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <LoadingOrb message="Finding something cool..." />
      </SafeAreaView>
    );
  }

  if (!content && !loading) {
     // Handle error state gracefully
     return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.center}>
                <Text style={styles.text}>Could not load content. Check connection or API key.</Text>
                <TouchableOpacity onPress={handleClose} style={styles.btn}><Text style={styles.btnText}>Close</Text></TouchableOpacity>
            </View>
        </SafeAreaView>
     );
  }

  // Phase 4: The Push (Final Screen)
  if (step === 4) {
    return (
      <SafeAreaView style={[styles.safe, styles.finalSafe]}>
        <View style={styles.center}>
          <Text style={styles.emoji}>🧠</Text>
          <Text style={styles.finalTitle}>You're In The Zone.</Text>
          <Text style={styles.finalSub}>
            You've already started. The hardest part is over.
            Now, switch to Cerebellum and watch just **one** BTR video.
          </Text>
          <Text style={styles.finalSub}>
            Come back afterwards to log your progress.
          </Text>
          
          <TouchableOpacity style={styles.cerebellumBtn} onPress={openCerebellum}>
            <Text style={styles.cerebellumBtnText}>🚀 Open Cerebellum</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleClose}>
            <Text style={styles.secondaryText}>I'll stay here</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Phases 1-3: The Facts
  // Step 0 is just "Breathe in..."
  // Steps 1-3 show facts index 0-2
  const currentFact = step === 0 ? "Take a deep breath." : (facts[step - 1] || "Stay focused.");

  const stepLabel = step < STEPS.length ? STEPS[step] : "Keep going...";

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: `${((step + 1) / 5) * 100}%` }]} />
      </View>
      
      <View style={styles.contentContainer}>
        <Text style={styles.stepLabel}>{stepLabel}</Text>
        <Animated.View style={{ opacity: fadeAnim, width: '100%', alignItems: 'center' }}>
          {content && <Text style={styles.topicName}>{content.topicName}</Text>}
          <View style={styles.card}>
            <Text style={styles.factText}>{currentFact}</Text>
          </View>
        </Animated.View>
      </View>

      <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.8}>
        <Text style={styles.nextBtnText}>Next →</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  finalSafe: { backgroundColor: '#0A1A1A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  text: { color: '#fff', textAlign: 'center', marginBottom: 20 },
  btn: { backgroundColor: '#333', padding: 16, borderRadius: 12 },
  btnText: { color: '#fff' },
  
  progressContainer: { height: 4, backgroundColor: '#222', width: '100%', position: 'absolute', top: 0 },
  progressBar: { height: '100%', backgroundColor: '#6C63FF' },
  
  contentContainer: { flex: 1, justifyContent: 'center', padding: 24, alignItems: 'center' },
  stepLabel: { color: '#666', fontSize: 14, fontWeight: '700', textTransform: 'uppercase', marginBottom: 20, letterSpacing: 1 },
  topicName: { color: '#6C63FF', fontSize: 24, fontWeight: '900', marginBottom: 16, textAlign: 'center' },
  card: { backgroundColor: '#1A1A24', padding: 32, borderRadius: 24, borderWidth: 1, borderColor: '#333', width: '100%', alignItems: 'center' },
  factText: { color: '#E0E0E0', fontSize: 20, lineHeight: 32, fontWeight: '500', textAlign: 'center' },
  
  nextBtn: { backgroundColor: '#6C63FF', margin: 24, padding: 20, borderRadius: 16, alignItems: 'center' },
  nextBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },

  emoji: { fontSize: 64, marginBottom: 24 },
  finalTitle: { color: '#fff', fontSize: 32, fontWeight: '900', marginBottom: 16, textAlign: 'center' },
  finalSub: { color: '#ccc', fontSize: 16, lineHeight: 24, textAlign: 'center', marginBottom: 16 },
  cerebellumBtn: { backgroundColor: '#00BCD4', paddingHorizontal: 32, paddingVertical: 18, borderRadius: 16, marginTop: 16, width: '100%', alignItems: 'center' },
  cerebellumBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  secondaryBtn: { padding: 16, marginTop: 8 },
  secondaryText: { color: '#666', fontWeight: '600' },
});
