import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../navigation/types';
import { profileRepository, dailyLogRepository } from '../db/repositories';
import { useAppStore } from '../store/useAppStore';
import type { Mood } from '../types';
import { MOOD_LABELS } from '../constants/gamification';
import { invalidatePlanCache } from '../services/studyPlanner';
import { requestAllPermissions } from '../services/appPermissions';
import { theme } from '../constants/theme';
import { MS_PER_DAY } from '../constants/time';
import { ResponsiveContainer } from '../hooks/useResponsive';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CheckIn'>;

const MOODS: Mood[] = ['energetic', 'good', 'okay', 'tired', 'stressed', 'distracted'];

const MOTIVATIONAL_MESSAGES = [
  'Every question you solve today is one less surprise on exam day.',
  'INICET toppers were not born ready. They showed up daily.',
  'Your future patients are counting on this version of you.',
  'Small steps, Doctor. Consistency beats intensity.',
  "The only bad study session is the one that didn't happen.",
  "You don't have to be motivated. You just have to begin.",
  "Last week's you would be proud of today's effort.",
  'One more topic today = one step closer to your rank.',
  "Think of this as training, not studying. Athletes don't skip practice.",
  'Your competition is studying right now. But so are you.',
  'Discipline is choosing between what you want now and what you want most.',
  'You chose medicine for a reason. Today, honor that reason.',
];

const MOOD_ICONS: Record<Mood, React.ComponentProps<typeof Ionicons>['name']> = {
  energetic: 'flash-outline',
  good: 'sunny-outline',
  okay: 'thumbs-up-outline',
  tired: 'moon-outline',
  stressed: 'alert-circle-outline',
  distracted: 'scan-outline',
};

function getMotivationalMessage(): string {
  // Use day of year to cycle through messages (same message all day, changes next day)
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / MS_PER_DAY);
  return MOTIVATIONAL_MESSAGES[dayOfYear % MOTIVATIONAL_MESSAGES.length];
}

export default function CheckInScreen() {
  const navigation = useNavigation<Nav>();
  const refreshProfile = useAppStore((s) => s.refreshProfile);
  const [step, setStep] = useState<'mood' | 'time'>('mood');
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null);
  const [yesterdayMood, setYesterdayMood] = useState<Mood | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const setDailyAvailability = useAppStore((s) => s.setDailyAvailability);
  const fadeIn = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;

  const profile = useAppStore((s) => s.profile);
  const daysToInicet = profile ? profileRepository.getDaysToExam(profile.inicetDate) : 0;
  const daysToNeet = profile ? profileRepository.getDaysToExam(profile.neetDate) : 0;

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    // Load yesterday's mood for visual hint
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);
    dailyLogRepository.getDailyLog(yStr).then((yLog) => {
      if (yLog?.mood) setYesterdayMood(yLog.mood);
    });
  }, []);

  function handleMoodSelect(mood: Mood) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMood(mood);
    // Animate out
    Animated.timing(fadeOut, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setStep('time');
      // Animate in next step
      Animated.timing(fadeOut, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    });
  }

  async function handleQuickStart() {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Quick start: use yesterday's mood if available, otherwise default to 'good'
      await dailyLogRepository.checkinToday(yesterdayMood ?? 'good');
      setDailyAvailability(30);
      // Track consecutive Quick Start usage for auto-skip
      const currentStreak = profile?.quickStartStreak ?? 0;
      await profileRepository.updateProfile({ quickStartStreak: currentStreak + 1 });
      invalidatePlanCache();
      await refreshProfile();
      // Request permissions so reminders, recording, and file access work
      await requestAllPermissions();
      navigation.replace('Tabs');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTimeSelect(minutes: number) {
    if (submitting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (selectedMood) {
      setSubmitting(true);
      try {
        await dailyLogRepository.checkinToday(selectedMood);
        setDailyAvailability(minutes);
        // Reset Quick Start streak when user manually picks mood
        await profileRepository.updateProfile({ quickStartStreak: 0 });
        invalidatePlanCache();
        await refreshProfile();
        // Request permissions so reminders, recording, and file access work
        await requestAllPermissions();
        navigation.replace('Tabs');
      } finally {
        setSubmitting(false);
      }
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ResponsiveContainer>
        <View style={styles.backgroundBlobTop} pointerEvents="none" />
        <View style={styles.backgroundBlobBottom} pointerEvents="none" />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {step === 'mood' ? (
            <Animated.View style={[styles.container, { opacity: fadeIn }]}>
              <View style={styles.heroCard}>
                <Text style={styles.greeting}>
                  Good {getTimeOfDay()}, {profile?.displayName ?? 'Doctor'}
                </Text>
                <Text style={styles.heroSub}>Set your baseline and enter focus mode.</Text>
                <View style={styles.examRow}>
                  <View style={styles.examChip}>
                    <Ionicons name="medkit-outline" size={16} color="#88E0D0" />
                    <Text style={styles.examLabel}>INICET</Text>
                    <Text style={styles.examValue}>{daysToInicet} days</Text>
                  </View>
                  <View style={styles.examChip}>
                    <Ionicons name="pulse-outline" size={16} color="#FFD08A" />
                    <Text style={styles.examLabel}>NEET PG</Text>
                    <Text style={styles.examValue}>{daysToNeet} days</Text>
                  </View>
                </View>
                {(profile?.streakCurrent ?? 0) > 0 && (
                  <View style={styles.streakBadge}>
                    <Ionicons name="flame-outline" size={14} color="#FFB35B" />
                    <Text style={styles.streakText}>{profile?.streakCurrent}-day streak</Text>
                  </View>
                )}
                <Text style={styles.motivation}>{getMotivationalMessage()}</Text>
              </View>

              <Text style={styles.question}>How are you feeling right now?</Text>

              <TouchableOpacity
                testID="quick-start-btn"
                style={[styles.quickStartBtn, submitting && { opacity: 0.6 }]}
                onPress={handleQuickStart}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Quick start with default 30 minute session"
              >
                <View style={styles.quickStartIconWrap}>
                  <Ionicons name="rocket-outline" size={18} color="#0B1320" />
                </View>
                <View style={styles.quickStartTextWrap}>
                  <Text style={styles.quickStartText}>Quick Start</Text>
                  <Text style={styles.quickStartSub}>
                    Skip check-in and start a 30 minute session
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#0B1320" />
              </TouchableOpacity>

              <Animated.View style={[styles.moodGrid, { opacity: fadeOut }]}>
                {MOODS.map((mood) => {
                  const info = MOOD_LABELS[mood];
                  const isYesterday = mood === yesterdayMood;
                  return (
                    <TouchableOpacity
                      key={mood}
                      style={[
                        styles.moodBtn,
                        isYesterday && styles.moodBtnYesterday,
                        selectedMood === mood && styles.moodBtnSelected,
                      ]}
                      onPress={() => handleMoodSelect(mood)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={info.label + ' mood'}
                      testID={`mood-${mood}`}
                    >
                      <View style={styles.moodIconWrap}>
                        <Ionicons name={MOOD_ICONS[mood]} size={20} color="#9ED3FF" />
                      </View>
                      <Text style={styles.moodLabel}>{info.label}</Text>
                      <Text style={styles.moodDesc}>{info.desc}</Text>
                      {isYesterday && <Text style={styles.yesterdayTag}>Yesterday</Text>}
                    </TouchableOpacity>
                  );
                })}
              </Animated.View>
            </Animated.View>
          ) : (
            <Animated.View style={[styles.container, { opacity: fadeOut }]}>
              <TouchableOpacity
                onPress={() => {
                  setStep('mood');
                  fadeOut.setValue(1);
                }}
                style={styles.changeMoodBtn}
                accessibilityRole="button"
                accessibilityLabel="Go back and change mood"
              >
                <Ionicons name="arrow-back" size={14} color={theme.colors.textMuted} />
                <Text style={styles.changeMoodText}>Change Mood</Text>
              </TouchableOpacity>

              <View style={styles.heroCard}>
                <Text style={styles.greeting}>One last thing</Text>
                <Text style={styles.subGreeting}>
                  Pick your available study block for accurate planning.
                </Text>
              </View>

              <Text style={styles.question}>How much time do you have right now?</Text>

              <View style={styles.timeGrid}>
                <TimeOption
                  label="Sprint"
                  sub="15-20 mins"
                  icon="flash-outline"
                  onPress={() => handleTimeSelect(20)}
                  disabled={submitting}
                />
                <TimeOption
                  label="Solid Block"
                  sub="45-60 mins"
                  icon="layers-outline"
                  onPress={() => handleTimeSelect(60)}
                  disabled={submitting}
                />
                <TimeOption
                  label="Deep Work"
                  sub="2+ hours"
                  icon="hourglass-outline"
                  onPress={() => handleTimeSelect(120)}
                  disabled={submitting}
                />
                <TimeOption
                  label="Just Checking"
                  sub="0 mins"
                  icon="eye-outline"
                  onPress={() => handleTimeSelect(0)}
                  disabled={submitting}
                />
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

function TimeOption({
  label,
  sub,
  icon,
  onPress,
  disabled,
}: {
  label: string;
  sub: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.timeBtn, disabled && { opacity: 0.6 }]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={disabled}
      testID={`time-${label.toLowerCase().replace(/\s+/g, '-')}`}
      accessibilityRole="button"
      accessibilityLabel={`${label} option, ${sub}`}
    >
      <View style={styles.timeIconWrap}>
        <Ionicons name={icon} size={24} color="#98D9FF" />
      </View>
      <View style={styles.timeTextWrap}>
        <Text style={styles.timeLabel}>{label}</Text>
        <Text style={styles.timeSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#54657B" />
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
  safe: { flex: 1, backgroundColor: '#08121A' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 28 },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  backgroundBlobTop: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#123248',
    opacity: 0.45,
  },
  backgroundBlobBottom: {
    position: 'absolute',
    bottom: -150,
    left: -90,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#183449',
    opacity: 0.3,
  },
  heroCard: {
    backgroundColor: '#0E1D2A',
    borderWidth: 1,
    borderColor: '#1D3345',
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
  },
  greeting: {
    color: '#EDF7FF',
    fontSize: 25,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'left',
  },
  heroSub: { color: '#A8C0D6', fontSize: 14, marginBottom: 14, lineHeight: 20 },
  examRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  examChip: {
    flex: 1,
    backgroundColor: '#102637',
    borderColor: '#23445E',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'flex-start',
    justifyContent: 'center',
    minHeight: 78,
  },
  examLabel: { color: '#9FC0D9', fontSize: 11, fontWeight: '700', marginTop: 6 },
  examValue: { color: '#F5FBFF', fontSize: 17, fontWeight: '800', marginTop: 2 },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#2A2A1A',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#4E4422',
    marginBottom: 10,
    gap: 6,
  },
  streakText: { color: '#FAD08B', fontSize: 12, fontWeight: '700' },
  motivation: { color: '#9FB4C7', fontSize: 13, marginTop: 2, lineHeight: 18 },
  question: {
    color: '#F4FBFF',
    fontSize: 21,
    fontWeight: '800',
    marginBottom: 14,
    textAlign: 'left',
    lineHeight: 28,
  },
  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  moodBtn: {
    width: '48%',
    backgroundColor: '#0F1F2E',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1F3A51',
    minHeight: 142,
    position: 'relative',
  },
  moodIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1B3347',
    marginBottom: 8,
  },
  moodLabel: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    marginBottom: 4,
    textAlign: 'center',
  },
  moodDesc: { color: '#A2BED5', fontSize: 12, textAlign: 'center', lineHeight: 16 },
  moodBtnYesterday: { borderColor: '#3D6A8D' },
  moodBtnSelected: {
    borderColor: '#6FBAFF',
    backgroundColor: '#193850',
    transform: [{ scale: 0.96 }],
  },
  yesterdayTag: {
    color: '#A6C8E2',
    fontSize: 10,
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  quickStartBtn: {
    backgroundColor: '#C6F1FF',
    borderWidth: 1,
    borderColor: '#A9DEEF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  quickStartIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#9BE4F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickStartTextWrap: { flex: 1 },
  quickStartText: { color: '#0B1320', fontSize: 17, fontWeight: '800' },
  quickStartSub: { color: '#2D4159', fontSize: 12, marginTop: 1, lineHeight: 16 },
  subGreeting: { color: '#A9C2D8', fontSize: 16, lineHeight: 22 },
  changeMoodBtn: {
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginBottom: 8,
  },
  changeMoodText: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '600' },
  timeGrid: { gap: 10 },
  timeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E1E2D',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#21425C',
    minHeight: 72,
  },
  timeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#173247',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  timeTextWrap: { flex: 1, minWidth: 0 },
  timeLabel: { color: '#EDF8FF', fontSize: 18, fontWeight: '700' },
  timeSub: { color: '#A4BED2', fontSize: 13, marginTop: 2 },
});
