import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { checkinToday, getUserProfile, getDaysToExam } from '../db/queries/progress';
import { useAppStore } from '../store/useAppStore';
import type { Mood } from '../types';
import { MOOD_LABELS } from '../constants/gamification';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CheckIn'>;

const MOODS: Mood[] = ['energetic', 'good', 'okay', 'tired', 'stressed', 'distracted'];

const MOTIVATIONAL_MESSAGES = [
  "Every question you solve today is one less surprise on exam day.",
  "INICET toppers weren't born ready — they showed up daily.",
  "Your future patients are counting on this version of you.",
  "Small steps, Doctor. Consistency beats intensity.",
  "The only bad study session is the one that didn't happen.",
  "You don't have to be motivated. You just have to begin.",
  "Last week's you would be proud of today's effort.",
  "One more topic today = one step closer to your rank.",
  "Think of this as training, not studying. Athletes don't skip practice.",
  "Your competition is studying right now. But so are you. 💪",
  "Discipline is choosing between what you want now and what you want most.",
  "You chose medicine for a reason. Today, honor that reason.",
];

function getMotivationalMessage(): string {
  // Use day of year to cycle through messages (same message all day, changes next day)
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return MOTIVATIONAL_MESSAGES[dayOfYear % MOTIVATIONAL_MESSAGES.length];
}

export default function CheckInScreen() {
  const navigation = useNavigation<Nav>();
  const refreshProfile = useAppStore(s => s.refreshProfile);
  const [step, setStep] = useState<'mood' | 'time'>('mood');
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null);
  const setDailyAvailability = useAppStore(s => s.setDailyAvailability);
  const fadeIn = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;

  const profile = getUserProfile();
  const daysToInicet = getDaysToExam(profile.inicetDate);

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  function handleMoodSelect(mood: Mood) {
    setSelectedMood(mood);
    // Animate out
    Animated.timing(fadeOut, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setStep('time');
      // Animate in next step
      Animated.timing(fadeOut, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    });
  }

  function handleQuickStart() {
    // Quick start with default mood and 30min availability
    checkinToday('good');
    setDailyAvailability(30);
    refreshProfile();
    navigation.replace('Tabs');
  }

  function handleTimeSelect(minutes: number) {
    if (selectedMood) {
      checkinToday(selectedMood);
      setDailyAvailability(minutes);
      refreshProfile();
      navigation.replace('Tabs');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      
      {step === 'mood' ? (
        <Animated.View style={[styles.container, { opacity: fadeIn }]}>
          <View style={styles.top}>
            <Text style={styles.greeting}>Good {getTimeOfDay()}, {profile.displayName}</Text>
            <Text style={styles.countdown}>
              ⚡ {daysToInicet} days to INICET
            </Text>
            {profile.streakCurrent > 0 && (
              <Text style={styles.streak}>🔥 {profile.streakCurrent}-day streak</Text>
            )}
            <Text style={styles.motivation}>{getMotivationalMessage()}</Text>
          </View>

          <Text style={styles.question}>How are you feeling right now?</Text>

          <TouchableOpacity style={styles.quickStartBtn} onPress={handleQuickStart}>
            <Text style={styles.quickStartText}>⚡ Quick Start</Text>
            <Text style={styles.quickStartSub}>Skip check-in · 30 min session</Text>
          </TouchableOpacity>

          <Animated.View style={[styles.moodGrid, { opacity: fadeOut }]}>
            {MOODS.map(mood => {
              const info = MOOD_LABELS[mood];
              return (
                <TouchableOpacity
                  key={mood}
                  style={styles.moodBtn}
                  onPress={() => handleMoodSelect(mood)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={info.label + ' mood'}
                >
                  <Text style={styles.moodEmoji}>{info.emoji}</Text>
                  <Text style={styles.moodLabel}>{info.label}</Text>
                  <Text style={styles.moodDesc}>{info.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        </Animated.View>
      ) : (
        <Animated.View style={[styles.container, { opacity: fadeOut }]}>
          <View style={styles.top}>
            <Text style={styles.greeting}>One last thing...</Text>
            <Text style={styles.subGreeting}>To build your schedule for today:</Text>
          </View>

          <Text style={styles.question}>How much time do you have *right now*?</Text>

          <View style={styles.timeGrid}>
            <TimeOption 
              label="Sprint" 
              sub="15-20 mins" 
              emoji="⚡" 
              onPress={() => handleTimeSelect(20)} 
            />
            <TimeOption 
              label="Solid Block" 
              sub="45-60 mins" 
              emoji="🧱" 
              onPress={() => handleTimeSelect(60)} 
            />
            <TimeOption 
              label="Deep Work" 
              sub="2+ hours" 
              emoji="🌊" 
              onPress={() => handleTimeSelect(120)} 
            />
            <TimeOption 
              label="Just Checking" 
              sub="0 mins" 
              emoji="👀" 
              onPress={() => handleTimeSelect(0)} 
            />
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

function TimeOption({ label, sub, emoji, onPress }: { label: string, sub: string, emoji: string, onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.timeBtn} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.timeEmoji}>{emoji}</Text>
      <View>
        <Text style={styles.timeLabel}>{label}</Text>
        <Text style={styles.timeSub}>{sub}</Text>
      </View>
    </TouchableOpacity>
  );
}

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  container: { flex: 1, padding: 24 },
  top: { marginBottom: 32, marginTop: 16 },
  greeting: { color: '#fff', fontSize: 26, fontWeight: '800', marginBottom: 8 },
  countdown: { color: '#6C63FF', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  streak: { color: '#FF9800', fontSize: 14 },
  motivation: { color: '#888', fontSize: 13, fontStyle: 'italic', marginTop: 10, lineHeight: 18 },
  question: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 20 },
  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  moodBtn: {
    width: '47%',
    backgroundColor: '#1A1A24',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2A2A38',
  },
  moodEmoji: { fontSize: 28, marginBottom: 6 },
  moodLabel: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 2 },
  moodDesc: { color: '#9E9E9E', fontSize: 11, textAlign: 'center' },
  quickStartBtn: {
    backgroundColor: '#6C63FF22',
    borderWidth: 1,
    borderColor: '#6C63FF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  quickStartText: { color: '#6C63FF', fontSize: 16, fontWeight: '700' },
  quickStartSub: { color: '#6C63FF99', fontSize: 12, marginTop: 2 },
  subGreeting: { color: '#9E9E9E', fontSize: 16 },
  timeGrid: { gap: 12 },
  timeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A24',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A38',
  },
  timeEmoji: { fontSize: 32, marginRight: 16 },
  timeLabel: { color: '#fff', fontSize: 18, fontWeight: '700' },
  timeSub: { color: '#9E9E9E', fontSize: 13 },
});
