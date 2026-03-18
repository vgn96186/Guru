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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList, TabParamList } from '../navigation/types';
import { useAppStore } from '../store/useAppStore';
import { useSessionStore } from '../store/useSessionStore';
import HeroCard from '../components/home/HeroCard';
import QuickStatsCard from '../components/home/QuickStatsCard';
import ShortcutTile from '../components/home/ShortcutTile';
import AgendaItem from '../components/home/AgendaItem';
import TodayPlanCard from '../components/home/TodayPlanCard';
import StartButton from '../components/StartButton';
import LoadingOrb from '../components/LoadingOrb';
import LectureReturnSheet from '../components/LectureReturnSheet';
import { profileRepository, dailyLogRepository, dailyAgendaRepository } from '../db/repositories';
import { getSubjectById, getSubjectByName } from '../db/queries/topics';
import { connectToRoom } from '../services/deviceSyncService';
import * as DocumentPicker from 'expo-document-picker';
import { saveLectureTranscript } from '../db/queries/aiCache';
import { buildQuickLectureNote, transcribeAudio } from '../services/transcriptionService';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { useHomeDashboardData } from '../hooks/useHomeDashboardData';
import {
  useLectureReturnRecovery,
  type LectureReturnSheetData,
} from '../hooks/useLectureReturnRecovery';
import { theme } from '../constants/theme';
import { BUNDLED_GROQ_KEY } from '../config/appConfig';
import type { Mood } from '../types';

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
  const [isTranscribingUpload, setIsTranscribingUpload] = useState(false);
  const [moreExpanded, setMoreExpanded] = useState(false);
  const moreAnim = useRef(new Animated.Value(0)).current;

  // Added from UI-UX audit branch
  const [criticalExpanded, setCriticalExpanded] = useState(false);

  useLectureReturnRecovery({ onRecovered: setReturnSheet });

  useFocusEffect(
    useCallback(() => {
      reloadHomeDashboard({ silent: true });
    }, [reloadHomeDashboard]),
  );

  useEffect(() => {
    dailyLogRepository.getDailyLog().then((log) => setMood((log?.mood as Mood) ?? 'good'));

    // Load daily agenda on mount
    const date = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
    dailyAgendaRepository.getDailyAgenda(date).then((plan) => {
      if (plan) setTodayPlan(plan);
    });
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
    const session = useSessionStore.getState();
    if (session.sessionId && session.sessionState !== 'session_done') {
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
      label: 'START SESSION',
      sublabel: `~${profile.preferredSessionLength} min`,
      onPress: () => navigation.navigate('Session', { mood }),
    };
  })();

  const handleAudioUpload = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['audio/*'] });
    if (res.canceled || !res.assets[0]) return;
    setIsTranscribingUpload(true);
    try {
      const analysis = await transcribeAudio({ audioFilePath: res.assets[0].uri });
      const hasTranscript = !!analysis.transcript?.trim();
      const hasMeaningfulSummary =
        !!analysis.lectureSummary &&
        ![
          'No audio recorded (empty file)',
          'No speech detected (silent audio)',
          'No speech detected',
          'Lecture content recorded',
          'No medical content detected',
        ].includes(analysis.lectureSummary);
      if (!hasTranscript || !hasMeaningfulSummary) {
        throw new Error('No usable lecture content was detected in this recording.');
      }
      const note = buildQuickLectureNote(analysis);
      const sub = await getSubjectByName(analysis.subject);
      await saveLectureTranscript({
        subjectId: sub?.id ?? null,
        note,
        transcript: analysis.transcript,
        summary: analysis.lectureSummary,
        topics: analysis.topics,
        appName: 'Upload',
        confidence: analysis.estimatedConfidence,
        embedding: analysis.embedding,
      });
      reloadHomeDashboard();
      Alert.alert('Success', 'Audio transcribed and added to notes vault.');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      Alert.alert('Error', message);
    } finally {
      setIsTranscribingUpload(false);
    }
  };

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

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <ResponsiveContainer style={styles.content}>
          <HeroCard
            greeting={greeting}
            firstName={firstName}
            daysToInicet={profileRepository.getDaysToExam(profile.inicetDate)}
            daysToNeetPg={profileRepository.getDaysToExam(profile.neetDate)}
          />
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

          <TodayPlanCard />

          <View style={styles.startArea}>
            <StartButton
              onPress={heroCta.onPress}
              label={heroCta.label}
              sublabel={heroCta.sublabel}
            />
          </View>

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
              <Text style={styles.moreChevron}>{criticalExpanded ? '▲' : '▼'}</Text>
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
            <Animated.Text
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
              ▼
            </Animated.Text>
          </TouchableOpacity>

          {moreExpanded && (
            <View style={styles.moreContent}>
              <TouchableOpacity
                style={styles.moreLink}
                onPress={handleAudioUpload}
                disabled={isTranscribingUpload}
                accessibilityRole="button"
                accessibilityLabel={
                  isTranscribingUpload ? 'Transcribing audio' : 'Transcribe audio file'
                }
              >
                <Text style={styles.moreLinkText}>
                  {isTranscribingUpload ? 'Transcribing...' : 'Transcribe Audio'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.moreLink}
                onPress={() => navigation.getParent()?.navigate('SleepMode')}
                accessibilityRole="button"
                accessibilityLabel="Open Nightstand Mode"
              >
                <Text style={styles.moreLinkText}>Nightstand Mode</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.moreLink}
                onPress={() => navigation.navigate('FlaggedReview')}
                accessibilityRole="button"
                accessibilityLabel="Open Flagged Review"
              >
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { paddingBottom: theme.spacing.xxl },
  content: { padding: 16 },
  loadErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.errorSurface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
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
  emptySectionTouchable: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  emptySectionText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginBottom: 4,
  },
  section: { marginBottom: 20 },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  startArea: { paddingVertical: 30, alignItems: 'center' },
  gridLandscape: { flexDirection: 'row', gap: 16 },
  shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    alignItems: 'center',
  },
  moreChevron: { color: theme.colors.textMuted, fontSize: 12 },
  moreContent: { paddingBottom: 20 },
  moreLink: {
    paddingVertical: 14,
    minHeight: 44,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  moreLinkText: { color: theme.colors.textSecondary, fontSize: 14 },

  // Collapsible UX Audit styles
  collapsibleSection: { marginBottom: 20 },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  criticalSectionContent: { paddingBottom: 10 },
  criticalCard: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
    borderColor: theme.colors.border,
  },
  criticalCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  criticalBadge: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  criticalArrow: { fontSize: 20, fontWeight: '800' },
  criticalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  criticalSub: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19 },
  emptyAgendaRow: {
    paddingVertical: 12,
    paddingRight: 8,
  },
  emptyAgendaText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyAgendaLink: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  seeAllLink: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'right',
  },
});
