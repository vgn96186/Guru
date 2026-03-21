import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList, RootStackParamList, TabParamList } from '../navigation/types';
import { useAppStore } from '../store/useAppStore';
import { useSessionStore } from '../store/useSessionStore';
import StartButton from '../components/StartButton';
import LoadingOrb from '../components/LoadingOrb';
import LectureReturnSheet from '../components/LectureReturnSheet';
import HomeTodayPathSection from '../components/home/HomeTodayPathSection';
import HomeToolsSection, { type ToolItem } from '../components/home/HomeToolsSection';
import LectureCaptureCard from '../components/home/LectureCaptureCard';
import { getDb } from '../db/database';
import { dailyAgendaRepository, dailyLogRepository, profileRepository } from '../db/repositories';
import { getAllTopicsWithProgress, getSubjectById } from '../db/queries/topics';
import { connectToRoom } from '../services/deviceSyncService';
import { ResponsiveContainer } from '../hooks/useResponsive';
import {
  useLectureReturnRecovery,
  type LectureReturnSheetData,
} from '../hooks/useLectureReturnRecovery';
import { theme } from '../constants/theme';
import { BUNDLED_GROQ_KEY } from '../config/appConfig';
import type { Mood } from '../types';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

const TABLET_BREAKPOINT = 768;
const EXAM_WINDOW_DAYS = 365;

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;
  const isTabletLandscape = isTablet && width > height;
  const navigation = useNavigation<Nav>();
  const tabsNavigation = navigation.getParent<NavigationProp<TabParamList>>();
  const rootNavigation = tabsNavigation?.getParent<NavigationProp<RootStackParamList>>();
  const { profile, levelInfo, todayPlan, setTodayPlan } = useAppStore();

  const [returnSheet, setReturnSheet] = useState<LectureReturnSheetData | null>(null);
  const [mood, setMood] = useState<Mood>('good');
  const [todayPathExpanded, setTodayPathExpanded] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [pendingStart, setPendingStart] = useState(false);
  const [sessionResumeValid, setSessionResumeValid] = useState(false);
  const [isMoodHydrated, setIsMoodHydrated] = useState(false);
  const inicetPulse = useRef(new Animated.Value(0)).current;
  const neetPulse = useRef(new Animated.Value(0)).current;

  useLectureReturnRecovery({ onRecovered: setReturnSheet });

  const refreshLaunchpadState = useCallback(() => {
    let cancelled = false;
    setIsMoodHydrated(false);

    dailyLogRepository
      .getDailyLog()
      .then((log) => {
        if (cancelled) return;
        setMood((log?.mood as Mood) ?? 'good');
      })
      .catch((err) => console.warn('[Home] Failed to load daily log:', err))
      .finally(() => {
        if (!cancelled) setIsMoodHydrated(true);
      });

    const date = new Date().toLocaleDateString('en-CA');
    dailyAgendaRepository
      .getDailyAgenda(date)
      .then((plan) => {
        if (!cancelled) setTodayPlan(plan ?? null);
      })
      .catch((err) => {
        console.warn('[Home] Failed to load daily agenda:', err);
        if (!cancelled) setTodayPlan(null);
      });

    const { sessionId, sessionState } = useSessionStore.getState();
    if (sessionId && sessionState !== 'session_done') {
      getDb()
        .getFirstAsync<{ id: number }>('SELECT id FROM sessions WHERE id = ?', [sessionId])
        .then((row) => {
          if (!cancelled) setSessionResumeValid(!!row);
        })
        .catch(() => {
          if (!cancelled) setSessionResumeValid(false);
        });
    } else {
      setSessionResumeValid(false);
    }

    return () => {
      cancelled = true;
    };
  }, [setTodayPlan]);

  useEffect(() => refreshLaunchpadState(), [refreshLaunchpadState]);

  useFocusEffect(useCallback(() => refreshLaunchpadState(), [refreshLaunchpadState]));

  useEffect(() => {
    if (!pendingStart || !isMoodHydrated) return;

    setPendingStart(false);
    navigation.navigate(
      'Session',
      sessionResumeValid ? { mood, resume: true } : { mood, mode: 'warmup' },
    );
  }, [isMoodHydrated, mood, navigation, pendingStart, sessionResumeValid]);

  useEffect(() => {
    if (!profile?.syncCode) return;
    return connectToRoom(
      profile.syncCode,
      async (msg: { type: string; durationSeconds?: number; subjectId?: number }) => {
        if (msg.type === 'BREAK_STARTED') {
          navigation.getParent()?.navigate('BreakEnforcer', {
            durationSeconds: msg.durationSeconds,
          });
        }

        if (msg.type === 'LECTURE_STARTED') {
          const subject = await getSubjectById(msg.subjectId!);
          Alert.alert(
            'Lecture Detected',
            `Tablet started ${subject?.name || 'lecture'}. Entering Hostage Mode.`,
            [
              {
                text: 'Okay',
                onPress: () => navigation.navigate('LectureMode', { subjectId: msg.subjectId }),
              },
            ],
          );
        }
      },
    );
  }, [navigation, profile?.syncCode]);

  useEffect(() => {
    const makePulse = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration: 1800,
            delay,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 1800,
            useNativeDriver: true,
          }),
        ]),
      );

    const inicetAnimation = makePulse(inicetPulse, 0);
    const neetAnimation = makePulse(neetPulse, 900);

    inicetAnimation.start();
    neetAnimation.start();

    return () => {
      inicetAnimation.stop();
      neetAnimation.stop();
    };
  }, [inicetPulse, neetPulse]);

  if (!profile || !levelInfo) {
    return (
      <SafeAreaView style={styles.safe}>
        <LoadingOrb message="Loading progress..." />
      </SafeAreaView>
    );
  }

  const daysToInicet = profileRepository.getDaysToExam(profile.inicetDate);
  const daysToNeetPg = profileRepository.getDaysToExam(profile.neetDate);
  const openStart = () => {
    if (!isMoodHydrated) {
      setPendingStart(true);
      return;
    }

    navigation.navigate(
      'Session',
      sessionResumeValid ? { mood, resume: true } : { mood, mode: 'warmup' },
    );
  };
  const openRandomTopic = async () => {
    try {
      const topics = await getAllTopicsWithProgress();
      const atomicTopics = topics.filter((topic) => topic.parentTopicId != null);
      const topicPool = atomicTopics.length > 0 ? atomicTopics : topics;

      if (topicPool.length === 0) {
        tabsNavigation?.navigate('TreeTab', { screen: 'KnowledgeTree' });
        return;
      }

      const randomTopic = topicPool[Math.floor(Math.random() * topicPool.length)];
      navigation.navigate('Session', {
        mood,
        mode: 'warmup',
        focusTopicId: randomTopic.id,
      });
    } catch (err) {
      console.warn('[Home] Failed to pick random topic:', err);
      tabsNavigation?.navigate('TreeTab', { screen: 'KnowledgeTree' });
    }
  };

  const tools: ToolItem[] = [
    {
      key: 'mind-maps',
      label: 'Mind maps',
      icon: 'git-network-outline',
      onPress: () => tabsNavigation?.navigate('TreeTab', { screen: 'KnowledgeTree' }),
    },
    {
      key: 'audio-transcription',
      label: 'Audio transcription',
      icon: 'mic-outline',
      onPress: () => navigation.navigate('LectureMode', {}),
    },
    {
      key: 'mcqs',
      label: 'MCQs',
      icon: 'help-circle-outline',
      onPress: () => navigation.navigate('MockTest'),
    },
    {
      key: 'find-from-clues',
      label: 'Find from clues',
      icon: 'search-outline',
      onPress: () => navigation.navigate('Review'),
    },
    {
      key: 'random-topic',
      label: 'Random topic',
      icon: 'shuffle-outline',
      onPress: openRandomTopic,
    },
    {
      key: 'note-from-transcript',
      label: 'Note from transcript',
      icon: 'document-text-outline',
      onPress: () => tabsNavigation?.navigate('VaultTab', { screen: 'ManualNoteCreation' }),
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />

      <ScrollView
        testID="home-scroll"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <ResponsiveContainer style={styles.content}>
          <View style={[styles.topBar, isTabletLandscape && styles.topBarLandscape]}>
            <View style={styles.countdownWrap}>
              <Text style={styles.countdownLabel}>Exams</Text>
              <View style={[styles.countdownStack, isTabletLandscape && styles.countdownStackWide]}>
                <ExamCountdownCard
                  name="INICET"
                  days={daysToInicet}
                  accent={theme.colors.primaryLight}
                  pulse={inicetPulse}
                />
                <ExamCountdownCard
                  name="NEET-PG"
                  days={daysToNeetPg}
                  accent={theme.colors.success}
                  pulse={neetPulse}
                  successTone
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => rootNavigation?.navigate('SettingsModal', { screen: 'Settings' })}
              activeOpacity={theme.alpha.subtlePressed}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
            >
              <Ionicons name="settings-outline" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View
            style={[styles.launchpadShell, isTabletLandscape && styles.launchpadShellLandscape]}
          >
            <View style={[styles.heroColumn, isTabletLandscape && styles.heroColumnLandscape]}>
              <View style={styles.startWrap}>
                <StartButton
                  onPress={openStart}
                  label="Start"
                  sublabel={
                    sessionResumeValid
                      ? 'Resume your active session without getting pulled into a fresh setup.'
                      : 'Warm up, break inertia, and let Guru adapt after the first step.'
                  }
                />
              </View>

              <LectureCaptureCard
                onPress={() => navigation.navigate('LectureMode', {})}
                isTablet={isTablet}
              />
            </View>

            <View style={[styles.dockColumn, isTabletLandscape && styles.dockColumnLandscape]}>
              <HomeTodayPathSection
                expanded={todayPathExpanded}
                todayPlan={todayPlan}
                onToggle={() => setTodayPathExpanded((prev) => !prev)}
                onOpenPlan={() => navigation.navigate('StudyPlan')}
              />

              <HomeToolsSection
                expanded={toolsExpanded}
                isTablet={isTablet}
                onToggle={() => setToolsExpanded((prev) => !prev)}
                tools={tools}
              />
            </View>
          </View>
        </ResponsiveContainer>
      </ScrollView>

      {returnSheet ? (
        <LectureReturnSheet
          visible
          appName={returnSheet.appName}
          durationMinutes={returnSheet.durationMinutes}
          recordingPath={returnSheet.recordingPath}
          logId={returnSheet.logId}
          groqKey={profile.groqApiKey || BUNDLED_GROQ_KEY}
          onDone={() => setReturnSheet(null)}
          onStudyNow={() => setReturnSheet(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

function ExamCountdownCard({
  name,
  days,
  accent,
  pulse,
  successTone = false,
}: {
  name: string;
  days: number;
  accent: string;
  pulse: Animated.Value;
  successTone?: boolean;
}) {
  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.05],
  });
  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.76, 1],
  });
  const progress = getExamProgress(days);

  return (
    <View style={[styles.countdownCard, successTone && styles.countdownCardSuccess]}>
      <View style={styles.countdownHeader}>
        <Text style={styles.countdownName}>{name}</Text>
        <Animated.View
          style={[
            styles.countdownBadge,
            successTone && styles.countdownBadgeSuccess,
            { opacity, transform: [{ scale }] },
          ]}
        >
          <Text
            style={[styles.countdownBadgeText, successTone && styles.countdownBadgeTextSuccess]}
          >
            Soon
          </Text>
        </Animated.View>
      </View>

      <View style={styles.countdownMain}>
        <Text style={styles.countdownDays}>{Math.max(0, days)}</Text>
        <Text style={styles.countdownMeta}>days remaining</Text>
      </View>

      <View style={styles.countdownBarTrack}>
        <View
          style={[styles.countdownBarFill, { width: `${progress}%`, backgroundColor: accent }]}
        />
      </View>
    </View>
  );
}

function getExamProgress(days: number) {
  const clamped = Math.min(EXAM_WINDOW_DAYS, Math.max(0, days));
  return Math.round(((EXAM_WINDOW_DAYS - clamped) / EXAM_WINDOW_DAYS) * 72) + 18;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: theme.spacing.xxl,
  },
  content: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  topBarLandscape: {
    alignItems: 'stretch',
  },
  countdownWrap: {
    flex: 1,
  },
  countdownLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.sm,
  },
  countdownStack: {
    gap: theme.spacing.sm,
  },
  countdownStackWide: {
    flexDirection: 'row',
  },
  countdownCard: {
    flex: 1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  countdownCardSuccess: {
    backgroundColor: 'rgba(89,211,180,0.05)',
  },
  countdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  countdownName: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  countdownBadge: {
    minWidth: 46,
    paddingHorizontal: theme.spacing.sm,
    height: 24,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(108,99,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(139,133,255,0.28)',
  },
  countdownBadgeSuccess: {
    backgroundColor: 'rgba(89,211,180,0.14)',
    borderColor: 'rgba(89,211,180,0.28)',
  },
  countdownBadgeText: {
    color: '#DFE4FF',
    fontSize: 11,
    fontWeight: '700',
  },
  countdownBadgeTextSuccess: {
    color: '#DFFFF7',
  },
  countdownMain: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  countdownDays: {
    color: theme.colors.textPrimary,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.8,
    lineHeight: 34,
  },
  countdownMeta: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginBottom: 4,
  },
  countdownBarTrack: {
    height: 4,
    borderRadius: theme.borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  countdownBarFill: {
    height: '100%',
    borderRadius: theme.borderRadius.full,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  launchpadShell: {
    gap: theme.spacing.xl,
  },
  launchpadShellLandscape: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  heroColumn: {
    gap: theme.spacing.lg,
  },
  heroColumnLandscape: {
    flex: 1.05,
  },
  startWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
  },
  dockColumn: {
    gap: theme.spacing.md,
  },
  dockColumnLandscape: {
    flex: 0.92,
  },
});
