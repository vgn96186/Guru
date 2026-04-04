import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, StatusBar, ScrollView } from 'react-native';
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
import LinearBadge from '../components/primitives/LinearBadge';
import LinearButton from '../components/primitives/LinearButton';
import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';

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
                  <LinearText variant="title" style={styles.greeting}>
                    Good {getTimeOfDay()}, {profile?.displayName ?? 'Doctor'}
                  </LinearText>
                  <LinearText variant="bodySmall" tone="secondary" style={styles.motivation}>
                    {getMotivationalMessage()}
                  </LinearText>
                </View>
                {(profile?.streakCurrent ?? 0) > 0 && (
                  <LinearBadge
                    label={`${profile?.streakCurrent ?? 0}d`}
                    variant="warning"
                    style={styles.streakPill}
                  >
                    <Ionicons name="flame-outline" size={13} color={n.colors.warning} />
                  </LinearBadge>
                )}
              </View>

              <View style={styles.examStrip}>
                <LinearSurface padded={false} style={styles.examInline}>
                  <Ionicons name="medkit-outline" size={14} color={n.colors.accent} />
                  <LinearText variant="badge" tone="muted" style={styles.examLabel}>
                    INICET
                  </LinearText>
                  <LinearText variant="label" style={styles.examValue}>
                    {daysToInicet}d
                  </LinearText>
                </LinearSurface>
                <LinearSurface padded={false} style={styles.examInline}>
                  <Ionicons name="pulse-outline" size={14} color={n.colors.warning} />
                  <LinearText variant="badge" tone="muted" style={styles.examLabel}>
                    NEET PG
                  </LinearText>
                  <LinearText variant="label" style={styles.examValue}>
                    {daysToNeet}d
                  </LinearText>
                </LinearSurface>
              </View>

              <LinearText variant="sectionTitle" style={styles.question}>
                How are you feeling right now?
              </LinearText>

              <LinearSurface
                testID="quick-start-btn"
                style={[styles.quickStartRow, submitting && styles.disabled]}
              >
                <LinearButton
                  label="Quick Start"
                  variant="glassTinted"
                  style={styles.quickStartButton}
                  textStyle={styles.quickTitle}
                  onPress={handleQuickStart}
                  disabled={submitting}
                  accessibilityLabel="Quick start with default 30 minute session"
                  leftIcon={
                    <Ionicons name="rocket-outline" size={18} color={n.colors.textPrimary} />
                  }
                  rightIcon={
                    <Ionicons name="chevron-forward" size={18} color={n.colors.textPrimary} />
                  }
                />
                <LinearText variant="caption" tone="secondary" style={styles.quickSub}>
                  Skip check-in, start 30 min
                </LinearText>
              </LinearSurface>

              <Animated.View style={[styles.moodGrid, { opacity: fadeOut }]}>
                {MOODS.map((mood) => {
                  const info = MOOD_LABELS[mood];
                  const isYesterday = mood === yesterdayMood;
                  return (
                    <TouchableOpacity
                      key={mood}
                      onPress={() => handleMoodSelect(mood)}
                      activeOpacity={n.alpha.pressed}
                      accessibilityRole="button"
                      accessibilityLabel={info.label + ' mood'}
                      testID={`mood-${mood}`}
                    >
                      <LinearSurface
                        padded={false}
                        style={[
                          styles.moodChip,
                          isYesterday && styles.moodChipYesterday,
                          selectedMood === mood && styles.moodChipSelected,
                        ]}
                      >
                        <Ionicons name={MOOD_ICONS[mood]} size={16} color={n.colors.accent} />
                        <LinearText variant="label" style={styles.moodLabel}>
                          {info.label}
                        </LinearText>
                        {isYesterday && (
                          <LinearText variant="badge" tone="accent" style={styles.yesterdayTag}>
                            Yesterday
                          </LinearText>
                        )}
                      </LinearSurface>
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
                <LinearText variant="bodySmall" tone="muted" style={styles.backBtnText}>
                  Change Mood
                </LinearText>
              </TouchableOpacity>

              <LinearText variant="sectionTitle" style={styles.question}>
                How much time do you have right now?
              </LinearText>
              <LinearText variant="bodySmall" tone="secondary" style={styles.subHeading}>
                Choose one to build today&apos;s plan.
              </LinearText>

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
      onPress={onPress}
      activeOpacity={n.alpha.pressed}
      disabled={disabled}
      testID={`time-${label.toLowerCase().replace(/\s+/g, '-')}`}
      accessibilityRole="button"
      accessibilityLabel={`${label} option, ${sub}`}
    >
      <LinearSurface padded={false} style={[styles.timeRow, disabled && styles.disabled]}>
        <View style={styles.timeLeading}>
          <Ionicons name={icon} size={18} color={n.colors.accent} />
        </View>
        <View style={styles.timeTextWrap}>
          <LinearText variant="body" style={styles.timeLabel}>
            {label}
          </LinearText>
          <LinearText variant="caption" tone="secondary" style={styles.timeSub}>
            {sub}
          </LinearText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={n.colors.textMuted} />
      </LinearSurface>
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

  streakPill: { paddingLeft: 10, paddingRight: 10 },
  streakText: { color: n.colors.warning, fontSize: 11, fontWeight: '700' },

  examStrip: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    marginBottom: 14,
  },
  examInline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  examLabel: { color: n.colors.textMuted, fontSize: 11, fontWeight: '700' },
  examValue: { color: n.colors.textPrimary, fontSize: 12, fontWeight: '800', marginLeft: 'auto' },

  question: { color: n.colors.textPrimary, fontSize: 20, fontWeight: '800', marginBottom: 10 },
  subHeading: { color: n.colors.textSecondary, fontSize: 13, marginBottom: 12 },

  quickStartRow: {
    padding: 12,
    marginBottom: 12,
  },
  quickStartButton: { width: '100%' },
  quickTextWrap: { flex: 1 },
  quickTitle: { fontSize: 15, fontWeight: '800' },
  quickSub: { marginTop: 8 },

  moodGrid: { gap: 10, paddingBottom: 6 },
  moodChip: {
    width: '100%',
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moodChipYesterday: { borderColor: n.colors.borderHighlight },
  moodChipSelected: {
    borderColor: `${n.colors.accent}77`,
    backgroundColor: n.colors.primaryTintSoft,
  },
  moodLabel: { flex: 1 },
  yesterdayTag: {},

  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  backBtnText: { color: n.colors.textMuted, fontSize: 14, fontWeight: '600' },

  timeList: { gap: 10 },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  timeLabel: {},
  timeSub: { marginTop: 1 },

  disabled: { opacity: 0.6 },
});
