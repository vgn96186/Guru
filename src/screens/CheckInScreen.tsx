import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, StatusBar, ScrollView } from 'react-native';
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
import { linearTheme as n } from '../theme/linearTheme';
import { MS_PER_DAY } from '../constants/time';
import { ResponsiveContainer } from '../hooks/useResponsive';
import LinearSurface from '../components/primitives/LinearSurface';

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
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / MS_PER_DAY);
  return MOTIVATIONAL_MESSAGES[dayOfYear % MOTIVATIONAL_MESSAGES.length];
}

export default function CheckInScreen() {
  const navigation = useNavigation<Nav>();
  const refreshProfile = useAppStore((s) => s.refreshProfile);
  const setDailyAvailability = useAppStore((s) => s.setDailyAvailability);
  const profile = useAppStore((s) => s.profile);

  const [step, setStep] = useState<'mood' | 'time'>('mood');
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null);
  const [yesterdayMood, setYesterdayMood] = useState<Mood | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fadeIn = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;

  const daysToInicet = profile ? profileRepository.getDaysToExam(profile.inicetDate) : 0;
  const daysToNeet = profile ? profileRepository.getDaysToExam(profile.neetDate) : 0;

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }).start();

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);
    dailyLogRepository.getDailyLog(yStr).then((yLog) => {
      if (yLog?.mood) setYesterdayMood(yLog.mood);
    });
  }, [fadeIn]);

  function handleMoodSelect(mood: Mood) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMood(mood);
    Animated.timing(fadeOut, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
      setStep('time');
      Animated.timing(fadeOut, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    });
  }

  async function completeCheckin(mood: Mood, minutes: number, isQuickStart: boolean) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await dailyLogRepository.checkinToday(mood);
      setDailyAvailability(minutes);

      const currentStreak = profile?.quickStartStreak ?? 0;
      await profileRepository.updateProfile({
        quickStartStreak: isQuickStart ? currentStreak + 1 : 0,
      });

      invalidatePlanCache();
      await refreshProfile();
      await requestAllPermissions();
      navigation.replace('Tabs');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQuickStart() {
    await completeCheckin(yesterdayMood ?? 'good', 30, true);
  }

  async function handleTimeSelect(minutes: number) {
    if (!selectedMood) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await completeCheckin(selectedMood, minutes, false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {step === 'mood' ? (
            <Animated.View style={[styles.container, { opacity: fadeIn }]}> 
              <View style={styles.headerRow}>
                <View style={styles.headerTextWrap}>
                  <Text style={styles.greeting}>Good {getTimeOfDay()}, {profile?.displayName ?? 'Doctor'}</Text>
                  <Text style={styles.motivation}>{getMotivationalMessage()}</Text>
                </View>
                {(profile?.streakCurrent ?? 0) > 0 && (
                  <View style={styles.streakPill}>
                    <Ionicons name="flame-outline" size={13} color={n.colors.warning} />
                    <Text style={styles.streakText}>{profile?.streakCurrent ?? 0}d</Text>
                  </View>
                )}
              </View>

              <View style={styles.examStrip}>
                <View style={styles.examInline}>
                  <Ionicons name="medkit-outline" size={14} color={n.colors.accent} />
                  <Text style={styles.examLabel}>INICET</Text>
                  <Text style={styles.examValue}>{daysToInicet}d</Text>
                </View>
                <View style={styles.examInline}>
                  <Ionicons name="pulse-outline" size={14} color={n.colors.warning} />
                  <Text style={styles.examLabel}>NEET PG</Text>
                  <Text style={styles.examValue}>{daysToNeet}d</Text>
                </View>
              </View>

              <Text style={styles.question}>How are you feeling right now?</Text>

              <TouchableOpacity
                testID="quick-start-btn"
                style={[styles.quickStartRow, submitting && styles.disabled]}
                onPress={handleQuickStart}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Quick start with default 30 minute session"
              >
                <Ionicons name="rocket-outline" size={18} color={n.colors.accent} />
                <View style={styles.quickTextWrap}>
                  <Text style={styles.quickTitle}>Quick Start</Text>
                  <Text style={styles.quickSub}>Skip check-in, start 30 min</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={n.colors.textMuted} />
              </TouchableOpacity>

              <Animated.View style={[styles.moodGrid, { opacity: fadeOut }]}> 
                {MOODS.map((mood) => {
                  const info = MOOD_LABELS[mood];
                  const isYesterday = mood === yesterdayMood;
                  return (
                    <TouchableOpacity
                      key={mood}
                      style={[
                        styles.moodChip,
                        isYesterday && styles.moodChipYesterday,
                        selectedMood === mood && styles.moodChipSelected,
                      ]}
                      onPress={() => handleMoodSelect(mood)}
                      activeOpacity={n.alpha.pressed}
                      accessibilityRole="button"
                      accessibilityLabel={info.label + ' mood'}
                      testID={`mood-${mood}`}
                    >
                      <Ionicons name={MOOD_ICONS[mood]} size={16} color={n.colors.accent} />
                      <Text style={styles.moodLabel}>{info.label}</Text>
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
                style={styles.backBtn}
                accessibilityRole="button"
                accessibilityLabel="Go back and change mood"
              >
                <Ionicons name="arrow-back" size={14} color={n.colors.textMuted} />
                <Text style={styles.backBtnText}>Change Mood</Text>
              </TouchableOpacity>

              <Text style={styles.question}>How much time do you have right now?</Text>
              <Text style={styles.subHeading}>Choose one to build today's plan.</Text>

              <View style={styles.timeList}>
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
      style={[styles.timeRow, disabled && styles.disabled]}
      onPress={onPress}
      activeOpacity={n.alpha.pressed}
      disabled={disabled}
      testID={`time-${label.toLowerCase().replace(/\s+/g, '-')}`}
      accessibilityRole="button"
      accessibilityLabel={`${label} option, ${sub}`}
    >
      <View style={styles.timeLeading}>
        <Ionicons name={icon} size={18} color={n.colors.accent} />
      </View>
      <View style={styles.timeTextWrap}>
        <Text style={styles.timeLabel}>{label}</Text>
        <Text style={styles.timeSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={n.colors.textMuted} />
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
  safe: { flex: 1, backgroundColor: n.colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 14 },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerTextWrap: { flex: 1, paddingRight: 10 },
  greeting: { color: n.colors.textPrimary, fontSize: 24, fontWeight: '800' },
  motivation: { color: n.colors.textSecondary, fontSize: 13, marginTop: 6, lineHeight: 18 },

  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: n.colors.warning,
    backgroundColor: "rgba(217,119,6,0.08)",
  },
  streakText: { color: n.colors.warning, fontSize: 11, fontWeight: '700' },

  examStrip: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: n.colors.border,
  },
  examInline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  examLabel: { color: n.colors.textMuted, fontSize: 11, fontWeight: '700' },
  examValue: { color: n.colors.textPrimary, fontSize: 12, fontWeight: '800', marginLeft: 'auto' },

  question: { color: n.colors.textPrimary, fontSize: 20, fontWeight: '800', marginBottom: 10 },
  subHeading: { color: n.colors.textSecondary, fontSize: 13, marginBottom: 12 },

  quickStartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: n.colors.borderHighlight,
    paddingHorizontal: 2,
    paddingVertical: 10,
    marginBottom: 12,
  },
  quickTextWrap: { flex: 1 },
  quickTitle: { color: n.colors.textPrimary, fontSize: 15, fontWeight: '700' },
  quickSub: { color: n.colors.textSecondary, fontSize: 12, marginTop: 1 },

  moodGrid: { gap: 2, paddingBottom: 6 },
  moodChip: {
    width: '100%',
    minHeight: 50,
    borderBottomWidth: 1,
    borderBottomColor: n.colors.border,
    paddingHorizontal: 2,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moodChipYesterday: { borderBottomColor: n.colors.borderHighlight },
  moodChipSelected: {
    borderBottomColor: n.colors.accent,
  },
  moodLabel: { color: n.colors.textPrimary, fontSize: 14, fontWeight: '700', flex: 1 },
  yesterdayTag: { color: n.colors.accent, fontSize: 10, fontWeight: '700' },

  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 12 },
  backBtnText: { color: n.colors.textMuted, fontSize: 14, fontWeight: '600' },

  timeList: { gap: 2 },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: n.colors.border,
    paddingHorizontal: 2,
    paddingVertical: 11,
    minHeight: 58,
  },
  timeLeading: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: n.colors.primaryTintSoft,
    marginRight: 10,
  },
  timeTextWrap: { flex: 1, minWidth: 0 },
  timeLabel: { color: n.colors.textPrimary, fontSize: 16, fontWeight: '700' },
  timeSub: { color: n.colors.textSecondary, fontSize: 12, marginTop: 1 },

  disabled: { opacity: 0.6 },
});
