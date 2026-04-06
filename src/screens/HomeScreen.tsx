import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  useWindowDimensions,
  InteractionManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList, TabParamList } from '../navigation/types';
import ScreenMotion from '../motion/ScreenMotion';
import StaggeredEntrance from '../motion/StaggeredEntrance';
import { useAppStore } from '../store/useAppStore';
import { useSessionStore } from '../store/useSessionStore';
import AgendaItem from '../components/home/AgendaItem';
import { AiStatusIndicator } from '../components/home/AiStatusIndicator';
import CompactQuickStatsBar from '../components/home/CompactQuickStatsBar';
import ExamCountdownChips from '../components/home/ExamCountdownChips';
import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';
import StartButton from '../components/StartButton';
import { profileRepository, dailyLogRepository, dailyAgendaRepository } from '../db/repositories';
import { getDb } from '../db/database';
import { getSubjectById } from '../db/queries/topics';
import { connectToRoom } from '../services/deviceSyncService';
import { getTodaysAgendaWithTimes, type TodayTask } from '../services/studyPlanner';
import type { DailyAgenda } from '../services/ai';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { useHomeDashboardData } from '../hooks/useHomeDashboardData';
import { linearTheme as n } from '../theme/linearTheme';
import { DEFAULT_INICET_DATE, DEFAULT_NEET_DATE } from '../config/appConfig';
import type { Mood, UserProfile, TopicWithProgress } from '../types';
import NextLectureSection from '../components/home/NextLectureSection';

function isLeafTopicIdListValid(allIds: number[], validLeafIds: Set<number>): boolean {
  return allIds.every((id) => validLeafIds.has(id));
}

function tasksToAgenda(tasks: TodayTask[]): DailyAgenda {
  return {
    blocks: tasks.map((task, i) => ({
      id: `local-${i}`,
      title: task.topic.name,
      topicIds: [task.topic.id],
      durationMinutes: task.duration,
      startTime: task.timeLabel.split(' - ')[0],
      type: (task.type === 'review' ? 'review' : task.type === 'deep_dive' ? 'test' : 'study') as
        | 'study'
        | 'review'
        | 'test'
        | 'break',
      why: `${task.topic.subjectName} — ${
        task.type === 'review'
          ? 'due for review'
          : task.type === 'deep_dive'
            ? 'weak, needs deep dive'
            : 'new topic to cover'
      }`,
    })),
    guruNote:
      tasks.length > 0
        ? `${tasks.length} tasks lined up. Start with ${tasks[0].topic.name}.`
        : 'Nothing urgent today — great time to explore new topics.',
  };
}

function normalizeAgendaForCompare(plan: DailyAgenda | null): string {
  if (!plan) return '';
  return JSON.stringify({
    blocks: plan.blocks.map((block) => ({
      title: block.title,
      topicIds: block.topicIds,
      durationMinutes: block.durationMinutes,
      startTime: block.startTime,
      type: block.type,
    })),
    guruNote: plan.guruNote,
  });
}

function homeSelectionReasonFromTopic(
  topic: TopicWithProgress,
  fallbackType: 'new' | 'review' | 'deep_dive',
): string {
  const due = topic.progress.fsrsDue?.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (due && due < today) return 'Review critical';
  if (topic.progress.status === 'seen' && topic.progress.confidence < 1) return 'Quiz pending';
  if (
    topic.progress.confidence <= 1 ||
    (topic.progress.wrongCount ?? 0) >= 2 ||
    topic.progress.isNemesis
  )
    return 'Foundation repair';
  if (topic.progress.status === 'unseen') return 'Fresh coverage';
  if (topic.inicetPriority >= 8) return 'High-yield focus';
  if (fallbackType === 'review') return 'Spaced repetition';
  return 'Novelty rotation';
}

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

/** Lightweight skeleton for Home to show during transitions */
function HomeSkeleton() {
  return (
    <View style={styles.content}>
      {/* Header Skeleton */}
      <View style={[styles.headerRow, { opacity: 0.3 }]}>
        <View>
          <View
            style={{ width: 140, height: 24, backgroundColor: n.colors.border, borderRadius: 4 }}
          />
          {/* Exam Countdown Placeholder */}
          <View
            style={{
              width: 180,
              height: 14,
              backgroundColor: n.colors.border,
              borderRadius: 4,
              marginTop: 10,
              opacity: 0.6,
            }}
          />
        </View>
        <View
          style={{ width: 80, height: 32, backgroundColor: n.colors.border, borderRadius: 16 }}
        />
      </View>

      {/* Hero Button Skeleton */}
      <View style={[styles.heroSection, { opacity: 0.2, marginTop: 10 }]}>
        <View
          style={{ width: '100%', height: 180, backgroundColor: n.colors.border, borderRadius: 24 }}
        />
      </View>

      {/* Stats Bar Skeleton */}
      <View style={{ opacity: 0.2, marginBottom: n.spacing.md }}>
        <View
          style={{ width: '100%', height: 60, backgroundColor: n.colors.border, borderRadius: 12 }}
        />
      </View>

      {/* Grid Skeleton */}
      <View style={[styles.gridLandscape, styles.twoColumnGrid, { opacity: 0.2, marginTop: 16 }]}>
        <View style={styles.leftColumn}>
          <View
            style={{ width: 80, height: 12, backgroundColor: n.colors.border, marginBottom: 12 }}
          />
          <View
            style={{
              width: '100%',
              height: 120,
              backgroundColor: n.colors.border,
              borderRadius: 16,
            }}
          />
        </View>
        <View style={styles.rightColumn}>
          <View
            style={{ width: 80, height: 12, backgroundColor: n.colors.border, marginBottom: 12 }}
          />
          <View
            style={{
              width: '100%',
              height: 120,
              backgroundColor: n.colors.border,
              borderRadius: 16,
            }}
          />
        </View>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setReady(true);
    });
    return () => task.cancel();
  }, []);

  if (!ready) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <HomeSkeleton />
      </SafeAreaView>
    );
  }

  return <HomeScreenContent />;
}

function HomeScreenContent() {
  const HOME_FOCUS_RELOAD_THROTTLE_MS = 15_000;
  const { width, height } = useWindowDimensions();
  const isTabletLandscape = width >= 900 && width > height;
  const navigation = useNavigation<Nav>();
  const tabsNavigation = navigation.getParent<NavigationProp<TabParamList>>();
  const profile = useAppStore((s) => s.profile);
  const levelInfo = useAppStore((s) => s.levelInfo);
  const todayPlan = useAppStore((s) => s.todayPlan);
  const setTodayPlan = useAppStore((s) => s.setTodayPlan);

  const {
    weakTopics,
    todayTasks,
    todayMinutes,
    completedSessions,
    isLoading,
    loadError,
    reload: reloadHomeDashboard,
  } = useHomeDashboardData();

  const [mood, setMood] = useState<Mood>('good');
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [sessionResumeValid, setSessionResumeValid] = useState(false);
  const [entryComplete, setEntryComplete] = useState(false);
  const moreAnim = useRef(new Animated.Value(0)).current;
  const lastHomeFocusReloadAtRef = useRef(0);

  // Added from UI-UX audit branch

  useFocusEffect(
    useCallback(() => {
      setEntryComplete(false);
      const task = InteractionManager.runAfterInteractions(() => {
        const now = Date.now();
        if (now - lastHomeFocusReloadAtRef.current > HOME_FOCUS_RELOAD_THROTTLE_MS) {
          lastHomeFocusReloadAtRef.current = now;
          void reloadHomeDashboard({ silent: true });
        }
        // Validate that the Zustand session ID still exists in SQLite
        const { sessionId, sessionState } = useSessionStore.getState();
        if (sessionId && sessionState !== 'session_done') {
          getDb()
            .getFirstAsync<{ id: number }>('SELECT id FROM sessions WHERE id = ?', [sessionId])
            .then((row) => setSessionResumeValid(!!row))
            .catch(() => setSessionResumeValid(false));
        } else {
          setSessionResumeValid(false);
        }
      });
      return () => {
        task.cancel();
        setEntryComplete(false);
      };
    }, [reloadHomeDashboard]),
  );

  useEffect(() => {
    InteractionManager.runAfterInteractions(() => {
      dailyLogRepository
        .getDailyLog()
        .then((log) => setMood((log?.mood as Mood) ?? 'good'))
        .catch((err) => console.warn('[Home] Failed to load daily log:', err));

      // Load daily agenda on mount — auto-generate if missing
      const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      dailyAgendaRepository
        .getDailyAgenda(date)
        .then(async (plan) => {
          if (plan) {
            // Validate: check that topicIds in blocks actually exist in the DB
            const allIds = plan.blocks.flatMap((b) => b.topicIds ?? []).filter((id) => id > 0);
            if (allIds.length > 0) {
              const db = getDb();
              const placeholders = allIds.map(() => '?').join(',');
              const rows = await db.getAllAsync<{ id: number }>(
                `SELECT id FROM topics WHERE id IN (${placeholders}) AND parent_topic_id IS NOT NULL`,
                allIds,
              );
              const validLeafIds = new Set(rows.map((r) => r.id));
              const hasInvalidTopicIds = !isLeafTopicIdListValid(allIds, validLeafIds);
              if (hasInvalidTopicIds) {
                if (__DEV__) {
                  const invalidCount = allIds.filter((id) => !validLeafIds.has(id)).length;
                  console.warn(
                    `[Home] Discarding stale plan: ${invalidCount} invalid or parent topic IDs`,
                  );
                }
                await dailyAgendaRepository.deleteDailyAgenda(date);
                // Fall through to auto-generate
              } else {
                setTodayPlan(plan);
                return;
              }
            } else {
              setTodayPlan(plan);
              return;
            }
          }
          // Auto-generate plan when none exists or stale plan was discarded
          try {
            const tasks = await getTodaysAgendaWithTimes();
            const newPlan = tasksToAgenda(tasks);
            await dailyAgendaRepository.saveDailyAgenda(date, newPlan, 'local');
            setTodayPlan(newPlan);
          } catch (e) {
            console.warn('[Home] Auto plan generation failed:', e);
          }
        })
        .catch((err) => console.warn('[Home] Failed to load daily agenda:', err));
    });
  }, [setTodayPlan]);

  useEffect(() => {
    if (!profile) return;
    const syncedPlan = tasksToAgenda(todayTasks);
    const incoming = normalizeAgendaForCompare(syncedPlan);
    const existing = normalizeAgendaForCompare(todayPlan ?? null);
    if (incoming === existing) return;

    const date = new Date().toLocaleDateString('en-CA');
    void dailyAgendaRepository
      .saveDailyAgenda(date, syncedPlan, 'local')
      .then(() => setTodayPlan(syncedPlan))
      .catch((err) => console.warn('[Home] Failed to sync computed plan:', err));
  }, [profile, setTodayPlan, todayPlan, todayTasks]);

  useEffect(() => {
    if (!profile?.syncCode) return;
    return connectToRoom(
      profile.syncCode,
      async (msg: { type: string; durationSeconds?: number; subjectId?: number }) => {
        if (msg.type === 'BREAK_STARTED')
          navigation
            .getParent()
            ?.navigate('BreakEnforcer', { durationSeconds: msg.durationSeconds });
        if (msg.type === 'LECTURE_STARTED') {
          const sub = await getSubjectById(msg.subjectId!);
          Alert.alert(
            'Lecture Detected',
            `Tablet started ${sub?.name || 'lecture'}. Entering Hostage Mode.`,
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
  }, [profile?.syncCode, navigation]);

  // Compute heroCta label early so boot transition hooks can use it before early return
  const heroCtaLabel = sessionResumeValid
    ? 'START FRESH'
    : todayTasks.length > 0
      ? 'DO NEXT TASK'
      : 'START FOCUS SPRINT';
  const heroCtaSublabel = sessionResumeValid
    ? 'New session'
    : todayTasks.length > 0
      ? todayTasks[0].topic.name
      : 'Quick guided session';

  // Boot transition hooks — must be before early return to satisfy rules of hooks
  const bootPhase = useAppStore((s) => s.bootPhase);
  const setBootPhase = useAppStore((s) => s.setBootPhase);
  const setStartButtonLayout = useAppStore((s) => s.setStartButtonLayout);
  const setStartButtonCta = useAppStore((s) => s.setStartButtonCta);
  const startButtonRef = useRef<View>(null);

  useEffect(() => {
    if (!isLoading) {
      setStartButtonCta(heroCtaLabel, heroCtaSublabel);
    }
  }, [isLoading, heroCtaLabel, heroCtaSublabel, setStartButtonCta]);

  useEffect(() => {
    if (!isLoading && bootPhase === 'calming') {
      const timer = setTimeout(() => {
        if (startButtonRef.current) {
          startButtonRef.current.measureInWindow((x, y, width, height) => {
            setStartButtonLayout({ x, y, width, height });
            setBootPhase('settling');
          });
        } else {
          setBootPhase('settling');
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, bootPhase, setBootPhase, setStartButtonLayout]);

  if (isLoading || !profile || !levelInfo) {
    return <SafeAreaView style={styles.safe} />;
  }

  const progressClamped = Math.min(
    100,
    Math.max(0, Math.round((todayMinutes / (profile.dailyGoalMinutes || 120)) * 100)),
  );
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
  const firstName = profile.displayName?.split(' ')[0] || 'Doctor';

  const heroCta = (() => {
    if (sessionResumeValid) {
      return {
        label: heroCtaLabel,
        sublabel: heroCtaSublabel,
        onPress: () => {
          useSessionStore.getState().resetSession();
          navigation.navigate('Session', { mood, mode: 'warmup' });
        },
      };
    }
    if (todayTasks.length > 0) {
      const next = todayTasks[0];
      return {
        label: heroCtaLabel,
        sublabel: heroCtaSublabel,
        onPress: () =>
          navigation.navigate('Session', {
            mood,
            focusTopicId: next.topic.id,
            preferredActionType: next.type,
          }),
      };
    }
    return {
      label: heroCtaLabel,
      sublabel: heroCtaSublabel,
      onPress: () => navigation.navigate('Session', { mood, mode: 'warmup' }),
    };
  })();

  const daysToInicet = profileRepository.getDaysToExam(profile.inicetDate || DEFAULT_INICET_DATE);
  const daysToNeetPg = profileRepository.getDaysToExam(profile.neetDate || DEFAULT_NEET_DATE);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />

      <ScrollView
        testID="home-scroll"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <ResponsiveContainer style={styles.content}>
          <ScreenMotion style={styles.motionShell} isEntryComplete={() => setEntryComplete(true)}>
            <StaggeredEntrance index={0}>
              <View style={styles.headerRow}>
                <View style={styles.headerLeft}>
                  <LinearText variant="title" style={styles.greetingText}>
                    {greeting},{' '}
                    <LinearText variant="title" style={styles.greetingName}>
                      {firstName}
                    </LinearText>
                  </LinearText>
                  <ExamCountdownChips daysToInicet={daysToInicet} daysToNeetPg={daysToNeetPg} />
                </View>
                <View style={styles.headerRight}>
                  <AiStatusIndicator profile={profile} />
                  <TouchableOpacity
                    style={styles.settingsBtn}
                    onPress={() => tabsNavigation?.navigate('MenuTab', { screen: 'Settings' })}
                    accessibilityRole="button"
                    accessibilityLabel="Open settings"
                  >
                    <Ionicons name="settings-sharp" size={22} color={n.colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            </StaggeredEntrance>

            <StaggeredEntrance index={1}>
              <View style={styles.heroSection}>
                <StartButton
                  ref={startButtonRef}
                  onPress={heroCta.onPress}
                  label={heroCta.label}
                  sublabel={heroCta.sublabel}
                  hidden={bootPhase !== 'done'}
                />
              </View>
            </StaggeredEntrance>

            <StaggeredEntrance index={2}>
              <CompactQuickStatsBar
                progressPercent={progressClamped}
                todayMinutes={todayMinutes}
                dailyGoal={profile.dailyGoalMinutes || 120}
                streak={profile.streakCurrent}
                level={levelInfo.level}
                completedSessions={completedSessions}
              />
            </StaggeredEntrance>

            {loadError && (
              <View style={styles.loadErrorRow}>
                <LinearText variant="bodySmall" tone="error" style={styles.loadErrorText}>
                  Couldn&apos;t load agenda.
                </LinearText>
                <TouchableOpacity
                  onPress={() => reloadHomeDashboard()}
                  style={styles.retryButton}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading"
                >
                  <LinearText variant="label" tone="error" style={styles.retryButtonText}>
                    Retry
                  </LinearText>
                </TouchableOpacity>
              </View>
            )}

            <StaggeredEntrance index={3}>
              <View style={[styles.gridLandscape, styles.twoColumnGrid]}>
                <View style={styles.leftColumn}>
                  <NextLectureSection />
                </View>

                <View style={styles.rightColumn}>
                  <Section label="DO THIS NOW" accessibilityLabel="Do this now">
                    {weakTopics.length === 0 ? (
                      <TouchableOpacity
                        style={styles.emptySectionTouchable}
                        onPress={() => navigation.navigate('Session', { mood })}
                        accessibilityRole="button"
                        accessibilityLabel="Start a session to get suggestions"
                      >
                        <LinearText
                          variant="bodySmall"
                          tone="secondary"
                          style={styles.emptySectionText}
                        >
                          No weak topic highlighted — start a session or open Study Plan.
                        </LinearText>
                      </TouchableOpacity>
                    ) : (
                      weakTopics.slice(0, 1).map((t) => (
                        <LinearSurface compact key={t.id} style={styles.agendaItemWrap}>
                          <AgendaItem
                            time="Now"
                            title={t.name}
                            type={t.progress.status === 'unseen' ? 'new' : 'deep_dive'}
                            subjectName={t.subjectName}
                            priority={t.inicetPriority}
                            rationale={homeSelectionReasonFromTopic(
                              t,
                              t.progress.status === 'unseen' ? 'new' : 'deep_dive',
                            )}
                            onPress={() =>
                              navigation.navigate('Session', {
                                mood,
                                focusTopicId: t.id,
                                preferredActionType:
                                  t.progress.status === 'unseen' ? 'study' : 'deep_dive',
                              })
                            }
                          />
                        </LinearSurface>
                      ))
                    )}
                  </Section>
                  <Section label="UP NEXT" accessibilityLabel="Up next">
                    {todayTasks.length === 0 ? (
                      <TouchableOpacity
                        onPress={() => tabsNavigation?.navigate('MenuTab', { screen: 'StudyPlan' })}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="Open Study Plan"
                      >
                        <LinearSurface compact style={styles.agendaItemWrap}>
                          <LinearText
                            variant="bodySmall"
                            tone="secondary"
                            style={styles.emptySectionText}
                          >
                            Nothing scheduled — tap to open Study Plan.
                          </LinearText>
                          <View style={styles.seeAllButton}>
                            <LinearText
                              variant="label"
                              tone="accent"
                              style={styles.seeAllButtonText}
                            >
                              Open study plan
                            </LinearText>
                            <Ionicons name="chevron-forward" size={14} color={n.colors.accent} />
                          </View>
                        </LinearSurface>
                      </TouchableOpacity>
                    ) : (
                      <>
                        {todayTasks.slice(0, 2).map((t, i) => (
                          <LinearSurface compact key={i} style={styles.agendaItemWrap}>
                            <AgendaItem
                              time={t.timeLabel.split(' ')[0]}
                              title={t.topic.name}
                              type={
                                t.type === 'study'
                                  ? 'new'
                                  : (t.type as 'review' | 'deep_dive' | 'new')
                              }
                              subjectName={t.topic.subjectName}
                              priority={t.topic.inicetPriority}
                              rationale={homeSelectionReasonFromTopic(
                                t.topic,
                                t.type === 'study'
                                  ? 'new'
                                  : (t.type as 'review' | 'deep_dive' | 'new'),
                              )}
                              onPress={() =>
                                navigation.navigate('Session', {
                                  mood,
                                  focusTopicId: t.topic.id,
                                  preferredActionType: t.type,
                                  forcedMinutes: t.duration,
                                })
                              }
                            />
                          </LinearSurface>
                        ))}
                        {todayTasks.length > 2 && (
                          <TouchableOpacity
                            style={styles.seeAllButtonStandalone}
                            onPress={() =>
                              tabsNavigation?.navigate('MenuTab', { screen: 'StudyPlan' })
                            }
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel="See full study plan"
                          >
                            <View style={styles.seeAllButton}>
                              <LinearText
                                variant="label"
                                tone="accent"
                                style={styles.seeAllButtonText}
                              >
                                Open study plan
                              </LinearText>
                              <Ionicons name="chevron-forward" size={14} color={n.colors.accent} />
                            </View>
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </Section>
                </View>
              </View>
            </StaggeredEntrance>
          </ScreenMotion>

          <TouchableOpacity
            testID="tools-library-header"
            style={styles.moreHeader}
            onPress={() => {
              setMoreExpanded(!moreExpanded);
              Animated.timing(moreAnim, {
                toValue: moreExpanded ? 0 : 1,
                duration: 200,
                useNativeDriver: true,
              }).start();
            }}
            accessibilityRole="button"
            accessibilityLabel={
              moreExpanded ? 'Collapse Tools and Advanced' : 'Expand Tools and Advanced'
            }
          >
            <LinearText variant="label" tone="muted" style={styles.sectionLabel}>
              TOOLS & ADVANCED
            </LinearText>
            <Animated.View
              style={{
                transform: [
                  {
                    rotate: moreAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '180deg'],
                    }),
                  },
                ],
              }}
            >
              <Ionicons name="chevron-down" size={16} color={n.colors.textMuted} />
            </Animated.View>
          </TouchableOpacity>

          {moreExpanded && (
            <View style={styles.moreContent}>
              {/* Merged shortcuts */}
              <LinearSurface compact style={styles.toolRow}>
                <TouchableOpacity
                  style={styles.toolRowInner}
                  onPress={() => tabsNavigation?.navigate('MenuTab', { screen: 'StudyPlan' })}
                  accessibilityRole="button"
                  accessibilityLabel="Open Study Plan"
                >
                  <Ionicons name="calendar-outline" size={18} color={n.colors.accent} />
                  <LinearText variant="bodySmall" style={styles.toolRowText}>
                    Study Plan
                  </LinearText>
                  <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
                </TouchableOpacity>
              </LinearSurface>
              <LinearSurface compact style={styles.toolRow}>
                <TouchableOpacity
                  style={styles.toolRowInner}
                  onPress={() => tabsNavigation?.navigate('MenuTab', { screen: 'NotesVault' })}
                  accessibilityRole="button"
                  accessibilityLabel="Open Notes Vault"
                >
                  <Ionicons name="library-outline" size={18} color={n.colors.success} />
                  <LinearText variant="bodySmall" style={styles.toolRowText}>
                    Notes Vault
                  </LinearText>
                  <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
                </TouchableOpacity>
              </LinearSurface>
              <LinearSurface compact style={styles.toolRow}>
                <TouchableOpacity
                  style={styles.toolRowInner}
                  onPress={() => navigation.navigate('Inertia')}
                  accessibilityRole="button"
                  accessibilityLabel="Open Inertia"
                >
                  <Ionicons name="flash-outline" size={18} color={n.colors.warning} />
                  <LinearText variant="bodySmall" style={styles.toolRowText}>
                    Inertia
                  </LinearText>
                  <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
                </TouchableOpacity>
              </LinearSurface>
              <LinearSurface compact style={styles.toolRow}>
                <TouchableOpacity
                  style={styles.toolRowInner}
                  onPress={() => tabsNavigation?.navigate('ChatTab', { screen: 'GuruChat' })}
                  accessibilityRole="button"
                  accessibilityLabel="Open Guru Chat"
                >
                  <Ionicons name="chatbubbles-outline" size={18} color={n.colors.accent} />
                  <LinearText variant="bodySmall" style={styles.toolRowText}>
                    Guru Chat
                  </LinearText>
                  <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
                </TouchableOpacity>
              </LinearSurface>
              {/* Existing tools */}
              <LinearSurface compact style={styles.toolRow}>
                <TouchableOpacity
                  style={styles.toolRowInner}
                  onPress={() => navigation.navigate('Inertia')}
                  testID="task-paralysis-btn"
                  accessibilityRole="button"
                  accessibilityLabel="Open Task Paralysis helper"
                >
                  <Ionicons name="flash-outline" size={18} color={n.colors.textMuted} />
                  <LinearText variant="bodySmall" style={styles.toolRowText}>
                    Task Paralysis
                  </LinearText>
                  <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
                </TouchableOpacity>
              </LinearSurface>
              <LinearSurface compact style={styles.toolRow}>
                <TouchableOpacity
                  style={styles.toolRowInner}
                  onPress={() => navigation.getParent()?.navigate('DoomscrollGuide')}
                  accessibilityRole="button"
                  accessibilityLabel="Open Harassment Mode"
                >
                  <Ionicons name="alert-circle-outline" size={18} color={n.colors.textMuted} />
                  <LinearText variant="bodySmall" style={styles.toolRowText}>
                    Harassment Mode
                  </LinearText>
                  <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
                </TouchableOpacity>
              </LinearSurface>
              <LinearSurface compact style={styles.toolRow}>
                <TouchableOpacity
                  style={styles.toolRowInner}
                  onPress={() => navigation.getParent()?.navigate('SleepMode')}
                  accessibilityRole="button"
                  accessibilityLabel="Open Nightstand Mode"
                >
                  <Ionicons name="moon-outline" size={18} color={n.colors.textMuted} />
                  <LinearText variant="bodySmall" style={styles.toolRowText}>
                    Nightstand Mode
                  </LinearText>
                  <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
                </TouchableOpacity>
              </LinearSurface>
              <LinearSurface compact style={styles.toolRow}>
                <TouchableOpacity
                  style={styles.toolRowInner}
                  onPress={() => navigation.navigate('FlaggedReview')}
                  accessibilityRole="button"
                  accessibilityLabel="Open Flagged Review"
                >
                  <Ionicons name="flag-outline" size={18} color={n.colors.textMuted} />
                  <LinearText variant="bodySmall" style={styles.toolRowText}>
                    Flagged Review
                  </LinearText>
                  <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
                </TouchableOpacity>
              </LinearSurface>
            </View>
          )}
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  label,
  children,
  accessibilityLabel,
}: {
  label: string;
  children: React.ReactNode;
  accessibilityLabel?: string;
}) {
  return (
    <View
      style={styles.section}
      accessibilityRole="summary"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <LinearText variant="label" tone="muted" style={styles.sectionLabel}>
        {label}
      </LinearText>
      {children}
    </View>
  );
}

// ── Consistent spacing scale ──
const HP = n.spacing.xl; // 24 — horizontal page padding
const CARD_GAP = n.spacing.lg; // 16 — gap between cards
const SECTION_GAP = n.spacing.xl; // 24 — gap between sections

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  scrollContent: { paddingBottom: 40 },
  content: { paddingHorizontal: HP, paddingTop: n.spacing.md },
  motionShell: {
    width: '100%',
  },

  // ── Header ──
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: n.spacing.sm,
  },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingsBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingText: {
    ...n.typography.title,
    color: n.colors.textSecondary,
  },
  greetingName: {
    color: n.colors.textPrimary,
  },

  // ── Hero section ──
  heroSection: {
    alignItems: 'center',
    marginTop: -8,
    paddingTop: 0,
    paddingBottom: n.spacing.lg,
  },

  // ── Agenda item wrapper ──
  agendaItemWrap: {
    marginBottom: 12,
    height: 135,
    justifyContent: 'center',
  },

  // ── Two Column Layout ──
  gridLandscape: {
    flexDirection: 'row',
    gap: 32,
  },
  twoColumnGrid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  leftColumn: {
    flex: 1,
  },
  rightColumn: {
    flex: 1,
  },

  // ── Error row ──
  loadErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: n.colors.errorSurface,
    borderRadius: n.radius.md,
    padding: n.spacing.md,
    marginBottom: CARD_GAP,
    borderWidth: 1,
    borderColor: n.colors.error,
  },
  loadErrorText: { color: n.colors.textSecondary, fontSize: 13 },
  retryButton: {
    backgroundColor: n.colors.error,
    paddingHorizontal: n.spacing.lg,
    paddingVertical: n.spacing.sm,
    borderRadius: n.radius.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  retryButtonText: { color: n.colors.textPrimary, fontWeight: '700', fontSize: 13 },

  // ── Empty sections ──
  emptySectionTouchable: {
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 8,
    borderLeftWidth: 2,
    borderLeftColor: n.colors.border,
  },
  emptySectionText: {
    color: n.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },

  // ── Sections ──
  section: { marginBottom: n.spacing.md },
  sectionLabel: {
    color: n.colors.textMuted,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: n.spacing.md,
    textTransform: 'uppercase',
  },

  // ── Layouts ──

  // ── Tools section ──
  moreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: n.spacing.md,
    alignItems: 'center',
  },
  moreContent: { paddingBottom: SECTION_GAP, gap: 8 },
  toolRow: {
    // No extra margin needed — gap on parent handles spacing
  },
  toolRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: n.spacing.md,
    minHeight: 44,
  },
  toolRowText: { color: n.colors.textSecondary, fontSize: 14, fontWeight: '500', flex: 1 },

  // ── See all link ──
  seeAllButtonStandalone: {
    marginTop: 8,
    alignSelf: 'flex-end',
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: n.radius.full,
    backgroundColor: n.colors.primaryTintSoft,
    borderWidth: 1,
    borderColor: n.colors.borderLight,
  },
  seeAllButtonText: {
    color: n.colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
});
