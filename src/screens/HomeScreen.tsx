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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList, TabParamList } from '../navigation/types';
import { useAppStore } from '../store/useAppStore';
import { useSessionStore } from '../store/useSessionStore';
import AgendaItem from '../components/home/AgendaItem';
import LinearSurface from '../components/primitives/LinearSurface';
import Svg, { Circle } from 'react-native-svg';
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
import { BUNDLED_HF_TOKEN, DEFAULT_INICET_DATE, DEFAULT_NEET_DATE } from '../config/appConfig';
import { getApiKeys } from '../services/ai/config';
import { isLocalLlmUsable } from '../services/deviceMemory';
import type { Mood, UserProfile, TopicWithProgress } from '../types';
import { useAiRuntimeStatus } from '../hooks/useAiRuntimeStatus';

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

/** Inline header countdown: pulse highlight on day digits (always on). */
function ExamCountdownChips({
  daysToInicet,
  daysToNeetPg,
}: {
  daysToInicet: number;
  daysToNeetPg: number;
}) {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  const pulseDigitColor = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [n.colors.textMuted, n.colors.warning],
  });

  return (
    <View
      style={styles.examCountInline}
      testID="inicet-countdown"
      accessibilityRole="text"
      accessibilityLabel={`INICET in ${daysToInicet} days, NEET-PG in ${daysToNeetPg} days.`}
    >
      <Text style={styles.examInlineLabel}>INICET </Text>
      <Animated.Text style={[styles.examInlineDays, { color: pulseDigitColor }]}>
        {daysToInicet}
      </Animated.Text>
      <Text style={styles.examInlineLabel}>d · NEET-PG </Text>
      <Animated.Text style={[styles.examInlineDays, { color: pulseDigitColor }]}>
        {daysToNeetPg}
      </Animated.Text>
      <Text style={styles.examInlineLabel}>d</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const isTabletLandscape = width >= 900 && width > height;
  const navigation = useNavigation<Nav>();
  const tabsNavigation = navigation.getParent<NavigationProp<TabParamList>>();
  const { profile, levelInfo, todayPlan, setTodayPlan } = useAppStore();

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
  const moreAnim = useRef(new Animated.Value(0)).current;

  // Added from UI-UX audit branch

  useFocusEffect(
    useCallback(() => {
      reloadHomeDashboard({ silent: true });
      // Validate that the Zustand session ID still exists in SQLite
      // (OS can purge in-memory store on low-RAM devices)
      const { sessionId, sessionState } = useSessionStore.getState();
      if (sessionId && sessionState !== 'session_done') {
        getDb()
          .getFirstAsync<{ id: number }>('SELECT id FROM sessions WHERE id = ?', [sessionId])
          .then((row) => setSessionResumeValid(!!row))
          .catch(() => setSessionResumeValid(false));
      } else {
        setSessionResumeValid(false);
      }
    }, [reloadHomeDashboard]),
  );

  useEffect(() => {
    dailyLogRepository
      .getDailyLog()
      .then((log) => setMood((log?.mood as Mood) ?? 'good'))
      .catch((err) => console.warn('[Home] Failed to load daily log:', err));

    // Load daily agenda on mount — auto-generate if missing
    const date = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
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
          {/* ── Header row: greeting + AI status ── */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.greetingText}>
                {greeting}, <Text style={styles.greetingName}>{firstName}</Text>
              </Text>
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

          {/* ── Hero: Start button + inline stats ── */}
          <View style={styles.heroSection}>
            <StartButton
              ref={startButtonRef}
              onPress={heroCta.onPress}
              label={heroCta.label}
              sublabel={heroCta.sublabel}
              hidden={bootPhase !== 'done'}
            />
            <View style={styles.heroStats}>
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatValue}>{profile.streakCurrent}</Text>
                <Text style={styles.heroStatLabel}>streak</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatValue}>{progressClamped}%</Text>
                <Text style={styles.heroStatLabel}>today</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatValue}>{levelInfo.level}</Text>
                <Text style={styles.heroStatLabel}>level</Text>
              </View>
            </View>
          </View>

          {/* ── Compact stats bar ── */}
          <LinearSurface style={styles.statsBar}>
            <View style={styles.statsBarContent}>
              {/* Progress ring */}
              <View style={styles.statsRingWrap}>
                <Svg width={RING_SIZE} height={RING_SIZE}>
                  <Circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RADIUS}
                    stroke={n.colors.border}
                    strokeWidth={STROKE_WIDTH}
                    fill="none"
                  />
                  <Circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RADIUS}
                    stroke={n.colors.accent}
                    strokeWidth={STROKE_WIDTH}
                    fill="none"
                    strokeDasharray={`${CIRCUMFERENCE}`}
                    strokeDashoffset={CIRCUMFERENCE - (CIRCUMFERENCE * progressClamped) / 100}
                    strokeLinecap="round"
                    rotation="-90"
                    origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
                  />
                </Svg>
              </View>
              {/* Minutes */}
              <Text style={styles.statsText}>
                {todayMinutes}min{' '}
                <Text style={styles.statsTextMuted}>/ {profile.dailyGoalMinutes || 120}min</Text>
              </Text>
              <View style={styles.statsBarDivider} />
              {/* Streak */}
              <View style={styles.statsBarItem}>
                <Ionicons name="flame" size={14} color={n.colors.warning} />
                <Text style={styles.statsText}>{profile.streakCurrent}</Text>
              </View>
              <View style={styles.statsBarDivider} />
              {/* Level */}
              <Text style={styles.statsText}>Lv {levelInfo.level}</Text>
              <View style={styles.statsBarDivider} />
              {/* Sessions */}
              <View style={styles.statsBarItem}>
                <Text style={styles.statsText}>{completedSessions}</Text>
                <Text style={styles.statsTextMuted}> done</Text>
              </View>
            </View>
          </LinearSurface>

          {loadError && (
            <View style={styles.loadErrorRow}>
              <Text style={styles.loadErrorText}>Couldn&apos;t load agenda.</Text>
              <TouchableOpacity
                onPress={() => reloadHomeDashboard()}
                style={styles.retryButton}
                accessibilityRole="button"
                accessibilityLabel="Retry loading"
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={isTabletLandscape ? styles.gridLandscape : null}>
            <View style={isTabletLandscape ? { flex: 1.1 } : null}>
              <Section label="DO THIS NOW" accessibilityLabel="Do this now">
                {weakTopics.length === 0 ? (
                  <TouchableOpacity
                    style={styles.emptySectionTouchable}
                    onPress={() => navigation.navigate('Session', { mood })}
                    accessibilityRole="button"
                    accessibilityLabel="Start a session to get suggestions"
                  >
                    <Text style={styles.emptySectionText}>
                      No weak topic highlighted — start a session or open Study Plan.
                    </Text>
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
                    style={styles.emptySectionTouchable}
                    onPress={() => tabsNavigation?.navigate('MenuTab', { screen: 'StudyPlan' })}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Open Study Plan"
                  >
                    <Text style={styles.emptySectionText}>
                      Nothing scheduled — tap to open Study Plan.
                    </Text>
                    <View style={styles.seeAllButton}>
                      <Text style={styles.seeAllButtonText}>Open study plan</Text>
                      <Ionicons name="chevron-forward" size={14} color={n.colors.accent} />
                    </View>
                  </TouchableOpacity>
                ) : (
                  <>
                    {todayTasks.slice(0, 2).map((t, i) => (
                      <LinearSurface compact key={i} style={styles.agendaItemWrap}>
                        <AgendaItem
                          time={t.timeLabel.split(' ')[0]}
                          title={t.topic.name}
                          type={
                            t.type === 'study' ? 'new' : (t.type as 'review' | 'deep_dive' | 'new')
                          }
                          subjectName={t.topic.subjectName}
                          priority={t.topic.inicetPriority}
                          rationale={homeSelectionReasonFromTopic(
                            t.topic,
                            t.type === 'study' ? 'new' : (t.type as 'review' | 'deep_dive' | 'new'),
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
                        onPress={() => tabsNavigation?.navigate('MenuTab', { screen: 'StudyPlan' })}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="See full study plan"
                      >
                        <View style={styles.seeAllButton}>
                          <Text style={styles.seeAllButtonText}>Open study plan</Text>
                          <Ionicons name="chevron-forward" size={14} color={n.colors.accent} />
                        </View>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </Section>
            </View>
            <View style={isTabletLandscape ? { flex: 0.9 } : null} />
          </View>

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
            <Text style={styles.sectionLabel}>TOOLS & ADVANCED</Text>
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
                  <Text style={styles.toolRowText}>Study Plan</Text>
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
                  <Text style={styles.toolRowText}>Notes Vault</Text>
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
                  <Text style={styles.toolRowText}>Inertia</Text>
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
                  <Text style={styles.toolRowText}>Guru Chat</Text>
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
                  <Text style={styles.toolRowText}>Task Paralysis</Text>
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
                  <Text style={styles.toolRowText}>Harassment Mode</Text>
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
                  <Text style={styles.toolRowText}>Nightstand Mode</Text>
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
                  <Text style={styles.toolRowText}>Flagged Review</Text>
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

function AiStatusIndicator({ profile }: { profile: NonNullable<UserProfile | null> }) {
  const runtime = useAiRuntimeStatus();
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const [elapsed, setElapsed] = useState(0);
  const isActive = runtime.activeCount > 0;

  useEffect(() => {
    if (isActive) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
          Animated.timing(pulseAnim, { toValue: 0, duration: 800, useNativeDriver: false }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    pulseAnim.setValue(0);
  }, [isActive, pulseAnim]);

  useEffect(() => {
    if (!isActive) {
      setElapsed(0);
      return;
    }
    const start = runtime.active[0]?.startedAt ?? Date.now();
    setElapsed(Math.floor((Date.now() - start) / 1000));
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [isActive, runtime.active]);

  // Same “available provider” rules as routing / Guru Chat (incl. OAuth flags + bundled keys).
  const keys = getApiKeys(profile);
  const providers: { name: string; on: boolean }[] = [
    { name: 'ChatGPT', on: keys.chatgptConnected },
    { name: 'Copilot', on: keys.githubCopilotConnected },
    { name: 'GitLab', on: keys.gitlabDuoConnected },
    { name: 'Poe', on: keys.poeConnected },
    { name: 'Groq', on: !!keys.groqKey },
    { name: 'Gemini', on: !!keys.geminiKey },
    { name: 'OR', on: !!keys.orKey },
    { name: 'DeepSeek', on: !!keys.deepseekKey },
    { name: 'AgentR', on: !!keys.agentRouterKey },
    { name: 'GitHub', on: !!keys.githubModelsPat },
    { name: 'Local', on: isLocalLlmUsable(profile) },
  ];
  const onlineProviders = providers.filter((p) => p.on);
  const hasAnyStt =
    !!(profile.huggingFaceToken?.trim() || BUNDLED_HF_TOKEN) ||
    !!(profile.useLocalWhisper && profile.localWhisperPath);

  // Active request banner
  const activeReq = runtime.active[0];
  const activeBanner = isActive
    ? `${activeReq?.modelUsed?.split('/').pop() ?? activeReq?.backend ?? 'AI'}${
        elapsed > 0 ? ` ${elapsed}s` : ''
      }`
    : runtime.lastError
      ? `Err: ${runtime.lastError.slice(0, 100)}`
      : null;

  const bannerColor = isActive ? n.colors.accent : n.colors.warning;
  const glowOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.4] });

  return (
    <View style={aiStyles.wrap}>
      {/* Active / error banner */}
      {activeBanner && (
        <View style={[aiStyles.banner, { borderColor: bannerColor }]}>
          {isActive && (
            <Animated.View
              style={[aiStyles.bannerGlow, { backgroundColor: bannerColor, opacity: glowOpacity }]}
            />
          )}
          <View style={[aiStyles.bannerDot, { backgroundColor: bannerColor }]} />
          <Text style={[aiStyles.bannerText, { color: bannerColor }]} numberOfLines={1}>
            {activeBanner}
          </Text>
        </View>
      )}
      {/* Provider tags row */}
      <View style={aiStyles.tagRow}>
        {onlineProviders.length > 0 ? (
          onlineProviders.map((p) => (
            <View key={p.name} style={aiStyles.tag}>
              <View style={[aiStyles.tagDot, { backgroundColor: n.colors.success }]} />
              <Text style={aiStyles.tagText}>{p.name}</Text>
            </View>
          ))
        ) : (
          <View style={aiStyles.tag}>
            <View
              style={[
                aiStyles.tagDot,
                { backgroundColor: hasAnyStt ? n.colors.warning : n.colors.error },
              ]}
            />
            <Text style={[aiStyles.tagText, { color: n.colors.error }]}>
              {hasAnyStt ? 'STT only' : 'No AI'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const aiStyles = StyleSheet.create({
  wrap: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 1,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    overflow: 'hidden',
  },
  bannerGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  bannerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  bannerText: {
    fontSize: 12,
    fontWeight: '800',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 4,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  tagDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
    color: n.colors.textSecondary,
  },
});

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
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

// ── Progress ring constants ──
const RING_SIZE = 48;
const STROKE_WIDTH = 5;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = RADIUS * 2 * Math.PI;

// ── Consistent spacing scale ──
const HP = n.spacing.xl; // 24 — horizontal page padding
const CARD_GAP = n.spacing.lg; // 16 — gap between cards
const SECTION_GAP = n.spacing.xl; // 24 — gap between sections

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  scrollContent: { paddingBottom: 40 },
  content: { paddingHorizontal: HP, paddingTop: n.spacing.md },

  // ── Header ──
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 0,
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
    color: n.colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  greetingName: {
    color: n.colors.textPrimary,
    fontWeight: '800',
  },

  // ── Exam countdown inline ──
  examCountInline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  examInlineLabel: {
    color: n.colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  examInlineDays: {
    fontSize: 12,
    fontWeight: '800',
  },

  // ── Stats bar ──
  statsBar: {
    marginTop: 4,
  },
  statsBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statsRingWrap: {
    marginRight: n.spacing.sm,
  },
  statsText: {
    color: n.colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  statsTextMuted: {
    color: n.colors.textMuted,
    fontWeight: '400',
  },
  statsBarDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  statsBarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  // ── Hero section ──
  heroSection: {
    alignItems: 'center',
    marginTop: -8,
    paddingTop: 0,
    paddingBottom: n.spacing.sm,
    gap: n.spacing.sm,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: n.spacing.xl,
  },
  heroStatItem: { alignItems: 'center', minWidth: 50 },
  heroStatValue: {
    color: n.colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  heroStatLabel: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: n.colors.border,
  },

  // ── Agenda item wrapper ──
  agendaItemWrap: {
    marginBottom: 8,
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
  section: { marginBottom: SECTION_GAP },
  sectionLabel: {
    color: n.colors.textMuted,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: n.spacing.md,
    textTransform: 'uppercase',
  },

  // ── Layouts ──
  gridLandscape: { flexDirection: 'row', gap: CARD_GAP },

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
