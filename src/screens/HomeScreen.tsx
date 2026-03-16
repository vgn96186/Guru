import React, { useEffect, useRef, useState } from 'react';
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
import { useNavigation, type NavigationProp } from '@react-navigation/native';
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
      accent: '#FF5252',
      onPress: () => navigation.navigate('Inertia'),
    },
    {
      key: 'doomscroll',
      title: 'Harassment Mode',
      sub: 'Stop mindless scrolling now.',
      badge: 'URGENT',
      accent: '#FFB300',
      onPress: () => navigation.getParent()?.navigate('DoomscrollGuide'),
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false}>
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
              <Section label="DO THIS NOW">
                {weakTopics.slice(0, 1).map((t) => (
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
                ))}
              </Section>
              <Section label="UP NEXT">
                {todayTasks.slice(0, 2).map((t, i) => (
                  <AgendaItem
                    key={i}
                    time={t.timeLabel.split(' ')[0]}
                    title={t.topic.name}
                    type={t.type === 'study' ? 'new' : (t.type as 'review' | 'deep_dive' | 'new')}
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
                  >
                    <Text style={styles.seeAllLink}>See full plan →</Text>
                  </TouchableOpacity>
                )}
              </Section>
            </View>
            <View style={isTabletLandscape ? { flex: 0.9 } : null}>
              <Section label="QUICK ACCESS">
                <View style={styles.shortcutGrid}>
                  <ShortcutTile
                    title="Study Plan"
                    icon="calendar-outline"
                    accent={theme.colors.primary}
                    onPress={() => tabsNavigation?.navigate('MenuTab', { screen: 'StudyPlan' })}
                  />
                  <ShortcutTile
                    title="Notes Vault"
                    icon="library-outline"
                    accent={theme.colors.success}
                    onPress={() => tabsNavigation?.navigate('MenuTab', { screen: 'NotesHub' })}
                  />
                  <ShortcutTile
                    title="Inertia"
                    icon="flash-outline"
                    accent={theme.colors.warning}
                    onPress={() => navigation.navigate('Inertia')}
                  />
                  <ShortcutTile
                    title="Guru Chat"
                    icon="chatbubbles-outline"
                    accent={theme.colors.info}
                    onPress={() => tabsNavigation?.navigate('ChatTab', { screen: 'GuruChat' })}
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
              >
                <Text style={styles.moreLinkText}>
                  {isTranscribingUpload ? 'Transcribing...' : 'Transcribe Audio'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.moreLink}
                onPress={() => navigation.getParent()?.navigate('SleepMode')}
              >
                <Text style={styles.moreLinkText}>Nightstand Mode</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.moreLink}
                onPress={() => navigation.navigate('FlaggedReview')}
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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xxxl, paddingTop: theme.spacing.xl },
  section: { marginBottom: theme.spacing.xxl },
  sectionLabel: {
    ...theme.typography.sectionLabel,
    marginBottom: theme.spacing.md,
  },
  startArea: { paddingVertical: theme.spacing.xxxl, alignItems: "center" },
  gridLandscape: { flexDirection: "row", gap: theme.spacing.xl },
  shortcutGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  moreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    alignItems: 'center',
  },
  moreChevron: { color: theme.colors.textMuted, fontSize: 14, fontWeight: "800" },
  moreContent: { paddingBottom: 20 },
  moreLink: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.divider },
  moreLinkText: { color: theme.colors.textSecondary, fontSize: 14 },

  // Collapsible UX Audit styles
  collapsibleSection: { marginBottom: theme.spacing.xxl },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  criticalSectionContent: { paddingBottom: theme.spacing.md },
  criticalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xxl,
    borderWidth: 1,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.md,
    ...theme.shadows.card,
  },
  criticalCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  criticalBadge: {
    ...theme.typography.caption,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  criticalArrow: { fontSize: 20, fontWeight: '800' },
  criticalTitle: {
    color: theme.colors.textPrimary,
    ...theme.typography.subtitle,
    marginBottom: theme.spacing.xs,
  },
  criticalSub: {
    color: theme.colors.textSecondary,
    ...theme.typography.body,
    fontSize: 14,
  },
  seeAllLink: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'right',
  },
});
