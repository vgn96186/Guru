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
// HeroCard removed — exam countdown consolidated into header row
import QuickStatsCard from '../components/home/QuickStatsCard';
import ShortcutTile from '../components/home/ShortcutTile';
import AgendaItem from '../components/home/AgendaItem';
import TodayPlanCard from '../components/home/TodayPlanCard';
import StartButton from '../components/StartButton';
import LoadingOrb from '../components/LoadingOrb';
import LectureReturnSheet from '../components/LectureReturnSheet';
import { profileRepository, dailyLogRepository, dailyAgendaRepository } from '../db/repositories';
import { getDb } from '../db/database';
import { getSubjectById } from '../db/queries/topics';
import { connectToRoom } from '../services/deviceSyncService';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { useHomeDashboardData } from '../hooks/useHomeDashboardData';
import {
  useLectureReturnRecovery,
  type LectureReturnSheetData,
} from '../hooks/useLectureReturnRecovery';
import { theme } from '../constants/theme';
import { BUNDLED_GROQ_KEY, BUNDLED_HF_TOKEN } from '../config/appConfig';
import { isLocalLlmUsable } from '../services/deviceMemory';
import type { Mood, UserProfile } from '../types';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

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

  const [returnSheet, setReturnSheet] = useState<LectureReturnSheetData | null>(null);
  const [mood, setMood] = useState<Mood>('good');
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [sessionResumeValid, setSessionResumeValid] = useState(false);
  const moreAnim = useRef(new Animated.Value(0)).current;

  // Added from UI-UX audit branch
  const [criticalExpanded, setCriticalExpanded] = useState(false);

  useLectureReturnRecovery({ onRecovered: setReturnSheet });

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

    // Load daily agenda on mount
    const date = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
    dailyAgendaRepository
      .getDailyAgenda(date)
      .then((plan) => {
        if (plan) setTodayPlan(plan);
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
  const greeting =
    new Date().getHours() < 12
      ? 'Good morning'
      : new Date().getHours() < 18
        ? 'Good afternoon'
        : 'Good evening';
  const firstName = profile.displayName?.split(' ')[0] || 'Doctor';

  const heroCta = (() => {
    if (sessionResumeValid) {
      return {
        label: 'CONTINUE SESSION',
        sublabel: 'Pick up where you left off',
        onPress: () => navigation.navigate('Session', { mood, resume: true }),
      };
    }
    if (todayTasks.length > 0) {
      const next = todayTasks[0];
      return {
        label: 'START NEXT TASK',
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
      label: 'START',
      sublabel: 'Quiz · stop anytime',
      onPress: () => navigation.navigate('Session', { mood, mode: 'warmup' }),
    };
  })();

  const criticalItems = [
    {
      key: 'inertia',
      title: 'Task Paralysis',
      sub: "Can't get started? Break the loop.",
      badge: 'BLOCKER',
      accent: theme.colors.error,
      onPress: () => navigation.navigate('Inertia'),
    },
    {
      key: 'doomscroll',
      title: 'Harassment Mode',
      sub: 'Stop mindless scrolling now.',
      badge: 'URGENT',
      accent: theme.colors.warning,
      onPress: () => navigation.getParent()?.navigate('DoomscrollGuide'),
    },
  ];

  const daysToInicet = profileRepository.getDaysToExam(profile.inicetDate);
  const daysToNeetPg = profileRepository.getDaysToExam(profile.neetDate);

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
                {greeting}, {firstName}
              </Text>
              <View style={styles.examCountRow}>
                <Text style={styles.examChip}>INICET {daysToInicet}d</Text>
                <Text style={styles.examDivider}>·</Text>
                <Text style={styles.examChip}>NEET {daysToNeetPg}d</Text>
              </View>
            </View>
            <AiStatusDot profile={profile} />
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

          <TodayPlanCard />

          <QuickStatsCard
            progressPercent={progressClamped}
            todayMinutes={todayMinutes}
            dailyGoal={profile.dailyGoalMinutes || 120}
            streak={profile.streakCurrent}
            level={levelInfo.level}
            completedSessions={completedSessions}
          />

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

          {/* CRITICAL NOW Section from UX Audit */}
          <View style={styles.collapsibleSection}>
            <TouchableOpacity
              style={styles.collapsibleHeader}
              onPress={() => setCriticalExpanded((prev) => !prev)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={
                criticalExpanded ? 'Collapse Critical Now section' : 'Expand Critical Now section'
              }
            >
              <Text style={styles.sectionLabel}>CRITICAL NOW</Text>
              <Ionicons
                name={criticalExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={theme.colors.textMuted}
              />
            </TouchableOpacity>
            {criticalExpanded && (
              <View style={styles.criticalSectionContent}>
                {criticalItems.map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.criticalCard, { borderColor: item.accent + '44' }]}
                    onPress={item.onPress}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={item.title}
                  >
                    <View style={styles.criticalCardTop}>
                      <Text style={[styles.criticalBadge, { color: item.accent }]}>
                        {item.badge}
                      </Text>
                      <Text style={[styles.criticalArrow, { color: item.accent }]}>›</Text>
                    </View>
                    <Text style={styles.criticalTitle}>{item.title}</Text>
                    <Text style={styles.criticalSub}>{item.sub}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

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
                  weakTopics
                    .slice(0, 1)
                    .map((t) => (
                      <AgendaItem
                        key={t.id}
                        time="Now"
                        title={t.name}
                        type="deep_dive"
                        subjectName={t.subjectName}
                        priority={10}
                        onPress={() =>
                          navigation.navigate('Session', { mood, focusTopicId: t.id, mode: 'deep' })
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
                    <Text style={styles.seeAllLink}>See full plan →</Text>
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
                        onPress={() => tabsNavigation?.navigate('MenuTab', { screen: 'StudyPlan' })}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="See full study plan"
                      >
                        <Text style={styles.seeAllLink}>See full plan →</Text>
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
                    onPress={() => tabsNavigation?.navigate('MenuTab', { screen: 'NotesHub' })}
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

      {returnSheet && (
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
      )}
    </SafeAreaView>
  );
}

function AiStatusDot({ profile }: { profile: NonNullable<UserProfile | null> }) {
  // LLM backend
  const hasGroq = !!(profile.groqApiKey?.trim() || BUNDLED_GROQ_KEY);
  const hasOpenRouter = !!profile.openrouterKey?.trim();
  const hasLocal = isLocalLlmUsable(profile);

  const llmColor = hasGroq
    ? '#22c55e'
    : hasOpenRouter
      ? '#a78bfa'
      : hasLocal
        ? '#60a5fa'
        : '#ef4444';

  // STT (transcription) backend
  const hasHF = !!(profile.huggingFaceToken?.trim() || BUNDLED_HF_TOKEN);
  const hasLocalWhisper = !!(profile.useLocalWhisper && profile.localWhisperPath);
  const hasGroqSTT = hasGroq;

  const sttColor = hasLocalWhisper
    ? '#60a5fa'
    : hasGroqSTT
      ? '#22c55e'
      : hasHF
        ? '#f59e0b'
        : '#ef4444';

  return (
    <View style={styles.aiDotRow}>
      <View style={[styles.aiDot, { backgroundColor: llmColor }]} />
      <View style={[styles.aiDot, { backgroundColor: sttColor }]} />
    </View>
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
  content: { paddingHorizontal: HP, paddingTop: theme.spacing.lg },

  // ── Header ──
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  headerLeft: { flex: 1 },
  greetingText: {
    color: theme.colors.textPrimary,
    ...theme.typography.h3,
    letterSpacing: -0.3,
  },
  examCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  examChip: {
    color: theme.colors.textMuted,
    ...theme.typography.caption,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  examDivider: {
    color: theme.colors.border,
    ...theme.typography.caption,
  },

  // ── AI Status ──
  aiDotRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  aiDot: { width: 10, height: 10, borderRadius: 5 },

  // ── Hero section ──
  heroSection: {
    alignItems: 'center',
    paddingVertical: SECTION_GAP,
    gap: theme.spacing.lg,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xxl,
  },
  heroStatItem: { alignItems: 'center' },
  heroStatValue: {
    color: theme.colors.textPrimary,
    ...theme.typography.h2,
    letterSpacing: -0.3,
  },
  heroStatLabel: {
    color: theme.colors.textMuted,
    ...theme.typography.caption,
    fontWeight: '600',
    marginTop: theme.spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: theme.colors.border,
  },

  // ── Error row ──
  loadErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.errorSurface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: CARD_GAP,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  loadErrorText: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodySmall,
  },
  retryButton: {
    backgroundColor: theme.colors.error,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    minHeight: theme.minTouchSize,
    justifyContent: 'center',
  },
  retryButtonText: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
    ...theme.typography.bodySmall,
  },

  // ── Empty sections ──
  emptySectionTouchable: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    minHeight: 88,
    justifyContent: 'center',
  },
  emptySectionText: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodySmall,
    lineHeight: 20,
  },

  // ── Sections ──
  section: { marginBottom: SECTION_GAP },
  sectionLabel: {
    color: theme.colors.textMuted,
    ...theme.typography.caption,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: theme.spacing.md,
    textTransform: 'uppercase',
  },

  // ── Layouts ──
  gridLandscape: { flexDirection: 'row', gap: CARD_GAP },
  shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },

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
    paddingVertical: theme.spacing.lg,
    minHeight: theme.minTouchSize,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  moreLinkText: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodySmall,
    fontWeight: '500',
  },

  // ── Critical section ──
  collapsibleSection: { marginBottom: SECTION_GAP },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
  },
  criticalSectionContent: { gap: theme.spacing.md, marginTop: theme.spacing.md },
  criticalCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    padding: theme.spacing.lg,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  criticalCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  criticalBadge: {
    ...theme.typography.caption,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  criticalArrow: {
    fontSize: 18,
    fontWeight: '600',
  },
  criticalTitle: {
    color: theme.colors.textPrimary,
    ...theme.typography.body,
    fontWeight: '600',
    marginBottom: theme.spacing.sm,
  },
  criticalSub: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19 },

  // ── See all link ──
  seeAllLink: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'right',
  },
});
