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
import QuickStatsCard from '../components/home/QuickStatsCard';
import ShortcutTile from '../components/home/ShortcutTile';
import AgendaItem from '../components/home/AgendaItem';
import TodayPlanCard from '../components/home/TodayPlanCard';
import StartButton from '../components/StartButton';
import LoadingOrb from '../components/LoadingOrb';
import { profileRepository, dailyLogRepository, dailyAgendaRepository } from '../db/repositories';
import { getDb } from '../db/database';
import { getSubjectById } from '../db/queries/topics';
import { connectToRoom } from '../services/deviceSyncService';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { useHomeDashboardData } from '../hooks/useHomeDashboardData';
import { theme } from '../constants/theme';
import {
  BUNDLED_GROQ_KEY,
  BUNDLED_HF_TOKEN,
  DEFAULT_INICET_DATE,
  DEFAULT_NEET_DATE,
} from '../config/appConfig';
import { isLocalLlmUsable } from '../services/deviceMemory';
import type { Mood, UserProfile } from '../types';
import { useAiRuntimeStatus } from '../hooks/useAiRuntimeStatus';

function isLeafTopicIdListValid(allIds: number[], validLeafIds: Set<number>): boolean {
  return allIds.every((id) => validLeafIds.has(id));
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
    outputRange: [theme.colors.textPrimary, theme.colors.warning],
  });

  return (
    <View
      style={styles.examCountRow}
      testID="inicet-countdown"
      accessibilityRole="text"
      accessibilityLabel={`INICET in ${daysToInicet} days, NEET-PG in ${daysToNeetPg} days.`}
    >
      <View style={styles.examPill}>
        <Text style={styles.examPillLabel}>INICET</Text>
        <View style={styles.examPillValueRow}>
          <Animated.Text style={[styles.examPillDays, { color: pulseDigitColor }]}>
            {daysToInicet}
          </Animated.Text>
          <Text style={styles.examPillUnit}>days</Text>
        </View>
      </View>
      <View style={styles.examPill}>
        <Text style={styles.examPillLabel}>NEET-PG</Text>
        <View style={styles.examPillValueRow}>
          <Animated.Text style={[styles.examPillDays, { color: pulseDigitColor }]}>
            {daysToNeetPg}
          </Animated.Text>
          <Text style={styles.examPillUnit}>days</Text>
        </View>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const isTabletLandscape = width >= 900 && width > height;
  const navigation = useNavigation<Nav>();
  const tabsNavigation = navigation.getParent<NavigationProp<TabParamList>>();
  const { profile, levelInfo, setTodayPlan } = useAppStore();

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

    // Load daily agenda on mount and validate topic IDs
    const date = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
    dailyAgendaRepository
      .getDailyAgenda(date)
      .then(async (plan) => {
        if (!plan) return;
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
            return;
          }
        }
        setTodayPlan(plan);
      })
      .catch((err) => console.warn('[Home] Failed to load daily agenda:', err));
  }, [setTodayPlan]);

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

  if (isLoading || !profile || !levelInfo) {
    return (
      <SafeAreaView style={styles.safe}>
        <LoadingOrb message="Loading progress..." />
      </SafeAreaView>
    );
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
        label: 'START FRESH',
        sublabel: 'New session',
        onPress: () => {
          useSessionStore.getState().resetSession();
          navigation.navigate('Session', { mood, mode: 'warmup' });
        },
      };
    }
    if (todayTasks.length > 0) {
      const next = todayTasks[0];
      return {
        label: 'DO NEXT TASK',
        sublabel: next.topic.name,
        onPress: () =>
          navigation.navigate('Session', {
            mood,
            focusTopicId: next.topic.id,
            preferredActionType: next.type,
          }),
      };
    }
    return {
      label: 'START FOCUS SPRINT',
      sublabel: 'Quick guided session',
      onPress: () => navigation.navigate('Session', { mood, mode: 'warmup' }),
    };
  })();

  const daysToInicet = profileRepository.getDaysToExam(profile.inicetDate || DEFAULT_INICET_DATE);
  const daysToNeetPg = profileRepository.getDaysToExam(profile.neetDate || DEFAULT_NEET_DATE);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />

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
                <Ionicons name="settings-sharp" size={22} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Hero: Start button + inline stats ── */}
          <View style={styles.heroSection}>
            <StartButton
              onPress={heroCta.onPress}
              label={heroCta.label}
              sublabel={heroCta.sublabel}
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

          <View style={styles.dualCardRow}>
            <View style={styles.dualCardSlot}>
              <TodayPlanCard />
            </View>
            <View style={styles.dualCardSlot}>
              <QuickStatsCard
                progressPercent={progressClamped}
                todayMinutes={todayMinutes}
                dailyGoal={profile.dailyGoalMinutes || 120}
                streak={profile.streakCurrent}
                level={levelInfo.level}
                completedSessions={completedSessions}
              />
            </View>
          </View>

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
                    <AgendaItem
                      key={t.id}
                      time="Now"
                      title={t.name}
                      type={t.progress.status === 'unseen' ? 'new' : 'deep_dive'}
                      subjectName={t.subjectName}
                      priority={t.inicetPriority}
                      onPress={() =>
                        navigation.navigate('Session', {
                          mood,
                          focusTopicId: t.id,
                          preferredActionType:
                            t.progress.status === 'unseen' ? 'study' : 'deep_dive',
                        })
                      }
                    />
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
                      <Ionicons name="chevron-forward" size={14} color={theme.colors.primary} />
                    </View>
                  </TouchableOpacity>
                ) : (
                  <>
                    {todayTasks.slice(0, 2).map((t, i) => (
                      <AgendaItem
                        key={i}
                        time={t.timeLabel.split(' ')[0]}
                        title={t.topic.name}
                        type={
                          t.type === 'study' ? 'new' : (t.type as 'review' | 'deep_dive' | 'new')
                        }
                        subjectName={t.topic.subjectName}
                        priority={t.topic.inicetPriority}
                        onPress={() =>
                          navigation.navigate('Session', {
                            mood,
                            focusTopicId: t.topic.id,
                            preferredActionType: t.type,
                          })
                        }
                      />
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
                          <Ionicons name="chevron-forward" size={14} color={theme.colors.primary} />
                        </View>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </Section>
            </View>
            <View style={isTabletLandscape ? { flex: 0.9 } : null}>
              <Section label="QUICK ACCESS" accessibilityLabel="Quick access">
                <View style={styles.shortcutGrid}>
                  <ShortcutTile
                    title="Study Plan"
                    icon="calendar-outline"
                    accent={theme.colors.primary}
                    onPress={() => tabsNavigation?.navigate('MenuTab', { screen: 'StudyPlan' })}
                    accessibilityLabel="Open Study Plan"
                  />
                  <ShortcutTile
                    title="Notes Vault"
                    icon="library-outline"
                    accent={theme.colors.success}
                    onPress={() => tabsNavigation?.navigate('MenuTab', { screen: 'NotesVault' })}
                    accessibilityLabel="Open Notes Vault"
                  />
                  <ShortcutTile
                    title="Inertia"
                    icon="flash-outline"
                    accent={theme.colors.warning}
                    onPress={() => navigation.navigate('Inertia')}
                    accessibilityLabel="Open Task Paralysis helper"
                  />
                  <ShortcutTile
                    title="Guru Chat"
                    icon="chatbubbles-outline"
                    accent={theme.colors.info}
                    onPress={() => tabsNavigation?.navigate('ChatTab', { screen: 'GuruChat' })}
                    accessibilityLabel="Open Guru Chat"
                  />
                </View>
              </Section>
            </View>
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
              <Ionicons name="chevron-down" size={16} color={theme.colors.textMuted} />
            </Animated.View>
          </TouchableOpacity>

          {moreExpanded && (
            <View style={styles.moreContent}>
              <TouchableOpacity
                style={styles.moreLink}
                onPress={() => navigation.navigate('Inertia')}
                testID="task-paralysis-btn"
                accessibilityRole="button"
                accessibilityLabel="Open Task Paralysis helper"
              >
                <Ionicons name="flash-outline" size={18} color={theme.colors.textMuted} />
                <Text style={styles.moreLinkText}>Task Paralysis</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.moreLink}
                onPress={() => navigation.getParent()?.navigate('DoomscrollGuide')}
                accessibilityRole="button"
                accessibilityLabel="Open Harassment Mode"
              >
                <Ionicons name="alert-circle-outline" size={18} color={theme.colors.textMuted} />
                <Text style={styles.moreLinkText}>Harassment Mode</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.moreLink}
                onPress={() => navigation.getParent()?.navigate('SleepMode')}
                accessibilityRole="button"
                accessibilityLabel="Open Nightstand Mode"
              >
                <Ionicons name="moon-outline" size={18} color={theme.colors.textMuted} />
                <Text style={styles.moreLinkText}>Nightstand Mode</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.moreLink}
                onPress={() => navigation.navigate('FlaggedReview')}
                accessibilityRole="button"
                accessibilityLabel="Open Flagged Review"
              >
                <Ionicons name="flag-outline" size={18} color={theme.colors.textMuted} />
                <Text style={styles.moreLinkText}>Flagged Review</Text>
              </TouchableOpacity>
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

  // Build provider list
  const providers: { name: string; on: boolean }[] = [
    { name: 'Groq', on: !!(profile.groqApiKey?.trim() || BUNDLED_GROQ_KEY) },
    { name: 'Gemini', on: !!profile.geminiKey?.trim() },
    { name: 'OR', on: !!profile.openrouterKey?.trim() },
    { name: 'DeepSeek', on: !!profile.deepseekKey?.trim() },
    { name: 'AgentR', on: !!profile.agentRouterKey?.trim() },
    { name: 'GitHub', on: !!profile.githubModelsPat?.trim() },
    { name: 'Local', on: isLocalLlmUsable(profile) },
  ];
  const onlineProviders = providers.filter((p) => p.on);
  const hasAnyStt =
    !!(profile.huggingFaceToken?.trim() || BUNDLED_HF_TOKEN) ||
    !!(profile.useLocalWhisper && profile.localWhisperPath);

  // Active request banner
  const activeReq = runtime.active[0];
  const activeBanner = isActive
    ? `${activeReq?.modelUsed?.split('/').pop() ?? activeReq?.backend ?? 'AI'}${elapsed > 0 ? ` ${elapsed}s` : ''}`
    : runtime.lastError
      ? `Err: ${runtime.lastError.slice(0, 30)}`
      : null;

  const bannerColor = isActive ? theme.colors.primary : theme.colors.warning;
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
              <View style={[aiStyles.tagDot, { backgroundColor: theme.colors.success }]} />
              <Text style={aiStyles.tagText}>{p.name}</Text>
            </View>
          ))
        ) : (
          <View style={aiStyles.tag}>
            <View
              style={[
                aiStyles.tagDot,
                { backgroundColor: hasAnyStt ? theme.colors.warning : theme.colors.error },
              ]}
            />
            <Text style={[aiStyles.tagText, { color: theme.colors.error }]}>
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
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
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tagDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textSecondary,
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

// ── Consistent spacing scale ──
const HP = theme.spacing.xl; // 24 — horizontal page padding
const CARD_GAP = theme.spacing.lg; // 16 — gap between cards
const SECTION_GAP = theme.spacing.xl; // 24 — gap between sections

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { paddingBottom: 40 },
  content: { paddingHorizontal: HP, paddingTop: theme.spacing.md },

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
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  greetingText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  greetingName: {
    color: theme.colors.textPrimary,
    fontWeight: '800',
  },
  examCountRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
    gap: 6,
  },
  examPill: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  examPillLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  examPillValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  examPillDays: {
    fontSize: 36,
    lineHeight: 38,
    fontWeight: '900',
    letterSpacing: -1,
  },
  examPillUnit: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    paddingBottom: 5,
  },

  // AI Status styles moved to aiStyles (inline with AiStatusIndicator)

  // ── Dual card row ──
  dualCardRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dualCardSlot: {
    flex: 1,
  },

  // ── Hero section ──
  heroSection: {
    alignItems: 'center',
    marginTop: -8,
    paddingTop: 0,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xl,
  },
  heroStatItem: { alignItems: 'center', minWidth: 50 },
  heroStatValue: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  heroStatLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: theme.colors.border,
  },

  // ── Error row ──
  loadErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.errorSurface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: CARD_GAP,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  loadErrorText: { color: theme.colors.textSecondary, fontSize: 13 },
  retryButton: {
    backgroundColor: theme.colors.error,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  retryButtonText: { color: theme.colors.textPrimary, fontWeight: '700', fontSize: 13 },

  // ── Empty sections ──
  emptySectionTouchable: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  emptySectionText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },

  // ── Sections ──
  section: { marginBottom: SECTION_GAP },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: theme.spacing.md,
    textTransform: 'uppercase',
  },

  // ── Layouts ──
  gridLandscape: { flexDirection: 'row', gap: CARD_GAP },
  shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  // ── Tools section ──
  moreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  moreContent: { paddingBottom: SECTION_GAP },
  moreLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  moreLinkText: { color: theme.colors.textSecondary, fontSize: 14, fontWeight: '500' },

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
    borderRadius: 999,
    backgroundColor: theme.colors.primaryTintSoft,
    borderWidth: 1,
    borderColor: theme.colors.primaryTintMedium,
  },
  seeAllButtonText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
});
