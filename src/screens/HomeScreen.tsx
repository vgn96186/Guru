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
  ActivityIndicator,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList, TabParamList } from '../navigation/types';
import { useAppStore } from '../store/useAppStore';
import { useSessionStore } from '../store/useSessionStore';
import LectureReturnSheet from '../components/LectureReturnSheet';
import StartButton from '../components/StartButton';
import LoadingOrb from '../components/LoadingOrb';
import { getDailyLog, getDaysToExam, useStreakShield, getReviewDueTopics } from '../db/queries/progress';
import { getSubjectById } from '../db/queries/topics';
import { connectToRoom } from '../services/deviceSyncService';
import * as DocumentPicker from 'expo-document-picker';
import { saveLectureTranscript } from '../db/queries/aiCache';
import { saveTranscriptToFile } from '../services/transcriptStorage';
import {
  buildQuickLectureNote,
  markTopicsFromLecture,
  transcribeAudio,
} from '../services/transcriptionService';
import { getDb } from '../db/database';
import { ResponsiveContainer } from '../hooks/useResponsive';
import Svg, { Circle } from 'react-native-svg';
import { useHomeDashboardData } from '../hooks/useHomeDashboardData';
import { useLectureReturnRecovery, type LectureReturnSheetData } from '../hooks/useLectureReturnRecovery';
import { theme } from '../constants/theme';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Home'>;
const BUNDLED_GROQ_KEY = (process.env.EXPO_PUBLIC_BUNDLED_GROQ_KEY ?? '').trim();

const RING_SIZE = 56;
const STROKE_WIDTH = 5;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = RADIUS * 2 * Math.PI;

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const isTabletLandscape = width >= 900 && width > height;
  const navigation = useNavigation<Nav>();
  const tabsNavigation = navigation.getParent<NavigationProp<TabParamList>>();
  const profile = useAppStore(state => state.profile);
  const levelInfo = useAppStore(state => state.levelInfo);
  const refreshProfile = useAppStore(state => state.refreshProfile);
  const {
    weakTopics,
    dueTopics,
    todayTasks,
    todayMinutes,
    completedSessions,
    isLoading,
    reload: reloadHomeDashboard,
  } = useHomeDashboardData();
  const [returnSheet, setReturnSheet] = useState<LectureReturnSheetData | null>(null);
  useLectureReturnRecovery({ onRecovered: setReturnSheet });
  const [isTranscribingUpload, setIsTranscribingUpload] = useState(false);
  const [uploadTranscript, setUploadTranscript] = useState('');
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [renderMoreContent, setRenderMoreContent] = useState(false);
  const moreAnim = useRef(new Animated.Value(0)).current;

  function toggleMore() {
    const next = !moreExpanded;
    if (next) setRenderMoreContent(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(moreAnim, { toValue: next ? 1 : 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
      if (finished) {
        setMoreExpanded(next);
        if (!next) setRenderMoreContent(false);
      }
    });
    setMoreExpanded(next);
  }

  const lectureStartAlertVisibleRef = useRef(false);
  useEffect(() => {
    if (!profile?.syncCode) return;

    const unsubscribe = connectToRoom(profile.syncCode, (msg: any) => {
      if (msg.type === 'BREAK_STARTED') {
        navigation.getParent()?.navigate('BreakEnforcer', { durationSeconds: msg.durationSeconds });
      }
      if (msg.type === 'LECTURE_STARTED') {
        if (lectureStartAlertVisibleRef.current) return;
        lectureStartAlertVisibleRef.current = true;
        const sub = getSubjectById(msg.subjectId);
        const openLectureMode = () => {
          lectureStartAlertVisibleRef.current = false;
          navigation.navigate('LectureMode', { subjectId: msg.subjectId });
        };
        Alert.alert(
          'Lecture Detected',
          `Your tablet just started a ${sub?.name || 'lecture'}. Your phone is now entering Hostage Mode.`,
          [{ text: 'Okay', onPress: openLectureMode }],
          {
            cancelable: true,
            onDismiss: () => {
              lectureStartAlertVisibleRef.current = false;
            },
          },
        );
      }
    });
    return unsubscribe;
  }, [navigation, profile?.syncCode]);

  if (isLoading || !profile || !levelInfo) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
        <LoadingOrb message="Loading your progress..." />
      </SafeAreaView>
    );
  }

  const daysToInicet = getDaysToExam(profile.inicetDate);
  const daysToNeetPg = getDaysToExam(profile.neetDate);
  const mood = getDailyLog()?.mood ?? 'good';
  const reviewDue = getReviewDueTopics();
  const overdueReviews = reviewDue.filter(r => r.daysOverdue > 0);

  const daysSinceActive = (() => {
    if (!profile.lastActiveDate) return 999;
    const last = new Date(profile.lastActiveDate);
    const now = new Date();
    return Math.floor((now.getTime() - last.getTime()) / 86400000);
  })();
  const startLabel = daysSinceActive >= 4 ? 'JUST 1 QUESTION' : daysSinceActive >= 2 ? 'JUST 5 MINUTES' : 'START SESSION';
  const startSublabel = daysSinceActive >= 4 ? 'One question. That is it.' : daysSinceActive >= 2 ? 'A tiny win to get back on track' : `~${profile.preferredSessionLength} min`;

  const dailyGoalRaw = Number(profile.dailyGoalMinutes);
  const dailyGoal = Number.isFinite(dailyGoalRaw) && dailyGoalRaw > 0 ? dailyGoalRaw : 120;
  const progressPercentRaw = Math.round((todayMinutes / dailyGoal) * 100);
  const progressPercent = Number.isFinite(progressPercentRaw) ? progressPercentRaw : 0;
  const progressClamped = Math.min(100, Math.max(0, progressPercent));
  const strokeDashoffset = CIRCUMFERENCE - (CIRCUMFERENCE * progressClamped) / 100;
  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  })();
  const firstName = profile.displayName?.trim()?.split(' ')[0] || 'Doctor';

  function handleStartSession() {
    navigation.navigate('Session', { mood });
  }

  function handleRepairStreak() {
    const success = useStreakShield();
    if (success) {
      refreshProfile();
      Alert.alert('Shield Used', 'Your streak has been repaired!');
    } else {
      Alert.alert('No Shields', 'You are out of streak shields!');
    }
  }

  async function handleAudioUpload() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['audio/*'], copyToCacheDirectory: true });
      if (result.canceled) return;

      const uri = result.assets[0]?.uri;
      if (!uri) return;

      setIsTranscribingUpload(true);
      let analysis;
      try {
        analysis = await transcribeAudio(uri);
      } catch (err: any) {
        Alert.alert('Transcription Required', err?.message ?? 'Enable Local Whisper or add a Groq API key in Settings.');
        return;
      }

      if (!analysis.transcript || analysis.lectureSummary === 'No medical content detected') {
        Alert.alert('No Speech Detected', 'No usable speech was found in this audio file.');
        return;
      }

      const db = getDb();
      if (analysis.topics.length > 0) {
        markTopicsFromLecture(db, analysis.topics, analysis.estimatedConfidence, analysis.subject);
      }

      const quickNote = buildQuickLectureNote(analysis);
      const transcriptUri = await saveTranscriptToFile(analysis.transcript);
      const subjectRow = db.getFirstSync<{ id: number }>(
        'SELECT id FROM subjects WHERE LOWER(name) = LOWER(?) LIMIT 1',
        [analysis.subject],
      );
      saveLectureTranscript({
        subjectId: subjectRow?.id ?? null,
        note: quickNote,
        transcript: typeof transcriptUri !== 'undefined' ? transcriptUri : analysis.transcript,
        summary: analysis.lectureSummary,
        topics: analysis.topics,
        appName: 'Uploaded Audio',
        confidence: analysis.estimatedConfidence,
      });

      void reloadHomeDashboard();
      setUploadTranscript(quickNote);
      setShowTranscriptModal(true);
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message);
    } finally {
      setIsTranscribingUpload(false);
    }
  }

  const nextPlannedTask = todayTasks[0] ?? null;
  const heroCta = (() => {
    const sessionSnapshot = useSessionStore.getState();
    const snapshotItemIndex = sessionSnapshot.currentItemIndex ?? 0;
    const snapshotAgenda = sessionSnapshot.agenda;
    const snapshotTopicName = snapshotAgenda?.items[snapshotItemIndex]?.topic?.name ?? null;
    const snapshotAgendaLength = snapshotAgenda?.items.length ?? 0;
    const canResumeSession = Boolean(
      sessionSnapshot.sessionId &&
      snapshotTopicName &&
      sessionSnapshot.sessionState !== 'session_done',
    );
    const remainingTopics = canResumeSession
      ? Math.max(0, snapshotAgendaLength - snapshotItemIndex)
      : 0;

    if (canResumeSession && snapshotTopicName) {
      return {
        label: 'CONTINUE SESSION',
        sublabel: `${snapshotTopicName} · ${remainingTopics} topic${remainingTopics === 1 ? '' : 's'} left`,
        onPress: () => navigation.navigate('Session', { mood, resume: true }),
      };
    }
    if (overdueReviews.length > 0) {
      return {
        label: 'REVIEW OVERDUE TOPICS',
        sublabel: `${overdueReviews.length} overdue · ${overdueReviews[0].topicName}`,
        onPress: () => navigation.navigate('Session', {
          mood: 'good',
          focusTopicIds: overdueReviews.slice(0, 4).map(item => item.topicId),
          preferredActionType: 'review',
        }),
      };
    }
    if (nextPlannedTask) {
      return {
        label: 'START NEXT TASK',
        sublabel: `${nextPlannedTask.topic.name} · ${nextPlannedTask.type === 'review' ? 'Review' : nextPlannedTask.type === 'deep_dive' ? 'Deep dive' : 'New topic'}`,
        onPress: () => navigation.navigate('Session', {
          mood,
          mode: nextPlannedTask.type === 'deep_dive' ? 'deep' : undefined,
          focusTopicId: nextPlannedTask.topic.id,
          preferredActionType: nextPlannedTask.type,
        }),
      };
    }
    if (weakTopics.length > 0) {
      return {
        label: 'FIX A WEAK SPOT',
        sublabel: weakTopics[0].name,
        onPress: () => navigation.navigate('Session', {
          mood: 'energetic',
          mode: 'deep',
          focusTopicId: weakTopics[0].id,
          preferredActionType: 'deep_dive',
        }),
      };
    }
    return { label: startLabel, sublabel: startSublabel, onPress: handleStartSession };
  })();

  const criticalItems = (() => {
    const items: Array<{
      key: string;
      title: string;
      sub: string;
      accent: string;
      badge: string;
      onPress: () => void;
    }> = [];

    if (overdueReviews.length > 0) {
      items.push({
        key: 'overdue',
        title: `${overdueReviews.length} overdue review${overdueReviews.length > 1 ? 's' : ''}`,
        sub: overdueReviews.slice(0, 2).map(item => item.topicName).join(', ') || 'Tap to clear overdue reviews',
        accent: theme.colors.warning,
        badge: 'OVERDUE',
        onPress: () => navigation.navigate('Session', {
          mood: 'good',
          focusTopicIds: overdueReviews.slice(0, 4).map(item => item.topicId),
          preferredActionType: 'review',
        }),
      });
    } else if (reviewDue.length > 0) {
      items.push({
        key: 'due',
        title: `${reviewDue.length} review${reviewDue.length > 1 ? 's' : ''} due today`,
        sub: reviewDue.slice(0, 2).map(item => item.topicName).join(', ') || 'Tap to clear today due reviews',
        accent: theme.colors.success,
        badge: 'DUE',
        onPress: () => navigation.navigate('Review'),
      });
    }

    if (weakTopics.length > 0) {
      items.push({
        key: 'weak',
        title: `${weakTopics.length} weak topic${weakTopics.length > 1 ? 's' : ''} need attention`,
        sub: weakTopics[0].name,
        accent: theme.colors.warning,
        badge: 'WEAK',
        onPress: () => navigation.navigate('BossBattle'),
      });
    }

    if (nextPlannedTask) {
      items.push({
        key: 'next',
        title: 'Next planned topic',
        sub: `${nextPlannedTask.topic.name} · ${nextPlannedTask.timeLabel}`,
        accent: theme.colors.primary,
        badge: nextPlannedTask.type === 'review' ? 'REVIEW' : nextPlannedTask.type === 'deep_dive' ? 'DEEP' : 'NEW',
        onPress: () => navigation.navigate('Session', {
          mood,
          mode: nextPlannedTask.type === 'deep_dive' ? 'deep' : undefined,
          focusTopicId: nextPlannedTask.topic.id,
          preferredActionType: nextPlannedTask.type,
        }),
      });
    }

    if (items.length === 0) {
      items.push({
        key: 'challenge',
        title: 'Daily challenge',
        sub: '5 rapid-fire questions from weak topics',
        accent: theme.colors.primary,
        badge: 'GO',
        onPress: () => navigation.navigate('DailyChallenge'),
      });
    }

    return items.slice(0, 3);
  })();

  const quickAccessActions = [
    {
      key: 'plan',
      title: 'Study Plan',
      subtitle: 'Open your full agenda and next best moves',
      accent: theme.colors.primary,
      icon: 'calendar-outline' as const,
      onPress: () => tabsNavigation?.navigate('MenuTab', { screen: 'StudyPlan' }),
      accessibilityLabel: 'Open study plan',
      testID: 'study-plan-btn',
    },
    {
      key: 'notes',
      title: 'Notes Vault',
      subtitle: 'Search transcripts and lecture notes',
      accent: theme.colors.success,
      icon: 'library-outline' as const,
      onPress: () => tabsNavigation?.navigate('MenuTab', { screen: 'NotesHub' }),
      accessibilityLabel: 'Open notes vault',
    },
    {
      key: 'flagged',
      title: 'Inertia Helper',
      subtitle: 'Use commitment ladders when you are stuck',
      accent: theme.colors.warning,
      icon: 'flash-outline' as const,
      onPress: () => navigation.navigate('Inertia'),
      accessibilityLabel: 'Open task paralysis helper',
    },
  ] as const;
  const visibleTasks = todayTasks.slice(0, 2);

  const CriticalSection = (landscape: boolean) => (
    <View style={[styles.criticalSection, landscape && styles.sectionNoInset]}>
      <Text style={styles.sectionLabel}>DO THIS NOW</Text>
      {criticalItems.map(item => (
        <TouchableOpacity
          key={item.key}
          style={[styles.criticalCard, { borderLeftColor: item.accent }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); item.onPress(); }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={item.title}
          accessibilityHint={item.sub}
        >
          <View style={styles.criticalCardInner}>
            <View style={styles.criticalCardBody}>
              <View style={styles.criticalTitleRow}>
                <View style={[styles.criticalBadgeWrap, { backgroundColor: `${item.accent}22` }]}>
                  <Text style={[styles.criticalBadge, { color: item.accent }]}>{item.badge}</Text>
                </View>
                <Text style={styles.criticalTitle} numberOfLines={1}>{item.title}</Text>
              </View>
              <Text style={styles.criticalSub} numberOfLines={1}>{item.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={item.accent} />
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );

  const ShortcutsSection = (landscape: boolean) => (
    <View style={[styles.coreActionsSection, landscape && styles.sectionNoInset]}>
      <Text style={styles.sectionLabel}>QUICK ACCESS</Text>
      <View style={styles.shortcutGrid}>
        {quickAccessActions.map(action => (
          <TouchableOpacity
            key={action.key}
            style={styles.shortcutTile}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              action.onPress();
            }}
            activeOpacity={0.8}
            testID={'testID' in action ? action.testID : undefined}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
          >
            <View style={[styles.shortcutTileIcon, { backgroundColor: `${action.accent}1F`, borderColor: `${action.accent}44` }]}>
              <Ionicons name={action.icon} size={20} color={action.accent} />
            </View>
            <Text style={styles.shortcutTileTitle}>{action.title}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const AgendaSection = (landscape: boolean) => (
    visibleTasks.length > 0 ? (
      <View style={[styles.agendaSection, landscape && styles.sectionNoInset]}>
        <Text style={styles.sectionLabel}>UP NEXT</Text>
        {visibleTasks.map((task, i) => (
          <TouchableOpacity
            key={i}
            style={styles.agendaRow}
            onPress={() => navigation.navigate('Session', {
              mood,
              mode: task.type === 'deep_dive' ? 'deep' : undefined,
              focusTopicId: task.topic.id,
              preferredActionType: task.type,
            })}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Open ${task.topic.name}`}
            accessibilityHint={`${task.type} task for ${task.topic.subjectName}`}
          >
            <View style={styles.agendaTime}>
              <Text style={styles.agendaTimeText}>{task.timeLabel.split(' - ')[0]}</Text>
            </View>
            <View style={[styles.agendaCard, task.type === 'review' && styles.agendaReview, task.type === 'deep_dive' && styles.agendaDeep]}>
              <Text style={styles.agendaTitle} numberOfLines={1}>{task.topic.name}</Text>
              <Text style={styles.agendaSub}>{task.type === 'review' ? 'REVIEW' : task.type === 'deep_dive' ? 'DEEP DIVE' : 'NEW'} · {task.topic.subjectName}</Text>
              <View style={styles.agendaBadgeRow}>
                {task.type === 'review' && <Text style={styles.agendaBadge}>Due now</Text>}
                {task.type === 'deep_dive' && <Text style={styles.agendaBadge}>Weak topic</Text>}
                {task.topic.inicetPriority >= 8 && <Text style={styles.agendaBadge}>High yield</Text>}
              </View>
            </View>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          onPress={() => tabsNavigation?.navigate('MenuTab', { screen: 'StudyPlan' })}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="See full study plan"
        >
          <Text style={styles.seeAllLink}>Open full plan</Text>
        </TouchableOpacity>
      </View>
    ) : null
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} testID="home-scroll">
        <ResponsiveContainer style={styles.content}>
          <View style={[styles.heroCard, isTabletLandscape && styles.heroCardLandscape]}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroCopy}>
                <Text style={styles.heroGreeting}>{greeting}, {firstName}</Text>
                <Text style={styles.heroTitle}>Let us lock your next focused hour.</Text>
                <Text style={styles.heroSub}>
                  {progressClamped >= 100
                    ? 'Daily goal complete. Stack one more high-yield block.'
                    : `${Math.max(0, dailyGoal - todayMinutes)} min left to hit today target.`}
                </Text>
              </View>
              <View style={styles.ringWrap}>
                <Svg width={RING_SIZE} height={RING_SIZE}>
                  <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RADIUS} stroke={theme.colors.border} strokeWidth={STROKE_WIDTH} fill="transparent" />
                  <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RADIUS} stroke={progressClamped >= 100 ? theme.colors.success : theme.colors.primary} strokeWidth={STROKE_WIDTH} fill="transparent" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={strokeDashoffset} strokeLinecap="round" rotation="-90" origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`} />
                </Svg>
                <View style={[StyleSheet.absoluteFill, styles.ringLabel]} pointerEvents="none">
                  <Text style={styles.ringPercent}>{progressClamped}%</Text>
                </View>
              </View>
            </View>

            <View style={styles.heroMetaRow}>
              <View style={styles.metaChip}>
                <Ionicons name="flame-outline" size={13} color={theme.colors.warning} />
                <Text style={styles.metaChipText}>{profile.streakCurrent} day streak</Text>
              </View>
              <View style={styles.metaChip}>
                <Ionicons name="trophy-outline" size={13} color={theme.colors.primaryLight} />
                <Text style={styles.metaChipText}>Level {levelInfo.level}</Text>
              </View>
              <View style={styles.metaChip}>
                <Ionicons name="albums-outline" size={13} color={theme.colors.textSecondary} />
                <Text style={styles.metaChipText}>{completedSessions} session{completedSessions === 1 ? '' : 's'} done</Text>
              </View>
            </View>

            <View style={styles.heroStatsRow}>
              <View style={styles.heroStat}>
                <View style={styles.examClockRow}>
                  <Text style={styles.examLabel}>INICET</Text>
                  <Text style={[styles.examDays, daysToInicet <= 30 && styles.examDaysUrgent]}>{daysToInicet}d</Text>
                </View>
                <View style={styles.examClockRow}>
                  <Text style={styles.examLabel}>NEET-PG</Text>
                  <Text style={[styles.examDays, daysToNeetPg <= 30 && styles.examDaysUrgent]}>{daysToNeetPg}d</Text>
                </View>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{reviewDue.length} reviews</Text>
                <Text style={styles.heroStatSub}>{overdueReviews.length > 0 ? `${overdueReviews.length} overdue` : 'Due today'}</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{weakTopics.length} weak</Text>
                <Text style={styles.heroStatSub}>{dueTopics.length} due topics</Text>
              </View>
            </View>
          </View>

          {profile.streakCurrent === 0 && profile.streakBest > 0 && (
            <TouchableOpacity style={styles.repairNudge} onPress={handleRepairStreak} activeOpacity={0.8}>
              <Text style={styles.repairText}>Your {profile.streakBest}-day streak broke. Tap to use a shield.</Text>
            </TouchableOpacity>
          )}

          <View style={[styles.startArea, isTabletLandscape && styles.startAreaLandscape]}>
            <StartButton onPress={heroCta.onPress} label={heroCta.label} sublabel={heroCta.sublabel} />
          </View>

          {isTabletLandscape ? (
            <View style={styles.dashboardGridLandscape}>
              <View style={styles.dashboardColPrimary}>
                {CriticalSection(true)}
                {AgendaSection(true)}
              </View>
              <View style={styles.dashboardColSecondary}>
                {ShortcutsSection(true)}
              </View>
            </View>
          ) : (
            <>
              {CriticalSection(false)}
              {ShortcutsSection(false)}
              {AgendaSection(false)}
            </>
          )}

          <TouchableOpacity style={styles.moreHeader} onPress={toggleMore} activeOpacity={0.7} testID="more-header">
            <Text style={styles.sectionLabel}>TOOLS & ADVANCED</Text>
            <Animated.Text style={[styles.moreChevron, { transform: [{ rotate: moreAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }]}>▼</Animated.Text>
          </TouchableOpacity>

          {renderMoreContent ? (
            <Animated.View
              style={{
                opacity: moreAnim,
                transform: [{ translateY: moreAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
              }}
            >
              <View style={styles.moreContent}>
                <Text style={styles.moreGroupLabel}>QUICK START</Text>
                <View style={styles.moreRow}>
                  <TouchableOpacity style={styles.moreBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate('Session', { mood, mode: 'sprint' }); }} activeOpacity={0.8}>
                    <Text style={styles.moreBtnText}>10m Sprint</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.moreBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate('MockTest'); }} activeOpacity={0.8}>
                    <Text style={styles.moreBtnText}>Mock Test</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.moreRow}>
                  <TouchableOpacity style={styles.moreBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate('DailyChallenge'); }} activeOpacity={0.8}>
                    <Text style={styles.moreBtnText}>Daily Challenge</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.moreBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate('BossBattle'); }} activeOpacity={0.8}>
                    <Text style={styles.moreBtnText}>Boss Battle</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.moreGroupLabel}>AI TOOLS</Text>
                <TouchableOpacity style={styles.moreLink} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.getParent()?.navigate('BrainDumpReview'); }}>
                  <Text style={styles.moreLinkText}>Review Parked Thoughts</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.moreLink, isTranscribingUpload && { opacity: 0.7 }]} onPress={handleAudioUpload} disabled={isTranscribingUpload}>
                  <View style={styles.moreLinkRow}>
                    <Text style={styles.moreLinkText}>{isTranscribingUpload ? 'Transcribing audio...' : 'Transcribe Audio'}</Text>
                    {isTranscribingUpload && <ActivityIndicator size="small" color={theme.colors.primary} />}
                  </View>
                </TouchableOpacity>

                <Text style={styles.moreGroupLabel}>CHALLENGES & UTILITIES</Text>
                <TouchableOpacity style={styles.moreLink} onPress={() => navigation.getParent()?.navigate('Lockdown', { duration: 300 })}>
                  <Text style={[styles.moreLinkText, { color: theme.colors.error }]}>Force Lockdown</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.moreLink} onPress={() => navigation.getParent()?.navigate('SleepMode')}>
                  <Text style={styles.moreLinkText}>Nightstand Mode</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.moreLink} onPress={() => navigation.getParent()?.navigate('DoomscrollGuide')}>
                  <Text style={styles.moreLinkText}>App Hijack Setup</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          ) : null}

          <View style={{ height: 8 }} />
        </ResponsiveContainer>
      </ScrollView>

      {returnSheet && (
        <LectureReturnSheet
          visible={!!returnSheet}
          appName={returnSheet.appName}
          durationMinutes={returnSheet.durationMinutes}
          recordingPath={returnSheet.recordingPath}
          logId={returnSheet.logId}
          groqKey={profile?.groqApiKey?.trim() || BUNDLED_GROQ_KEY}
          onDone={() => setReturnSheet(null)}
          onStudyNow={() => setReturnSheet(null)}
        />
      )}

      {showTranscriptModal ? (
        <View style={styles.modalOverlay} pointerEvents="box-none">
          <Pressable style={styles.modalBackdrop} onPress={() => setShowTranscriptModal(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Transcription Result</Text>
            <Text style={styles.modalHint}>Saved to lecture notes and used to update matching topics.</Text>
            <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent}>
              <Text style={styles.modalText}>{uploadTranscript}</Text>
            </ScrollView>
            <Pressable style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.modalCloseBtnPressed]} onPress={() => setShowTranscriptModal(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flex: 1 },
  content: { paddingBottom: 0, flex: 0 },

  heroCard: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: theme.colors.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
  },
  heroCardLandscape: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heroCopy: { flex: 1 },
  heroGreeting: { color: theme.colors.primaryLight, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 2 },
  heroTitle: { color: theme.colors.textPrimary, fontSize: 19, fontWeight: '900', lineHeight: 25 },
  heroSub: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  ringWrap: { width: RING_SIZE, height: RING_SIZE },
  ringLabel: { alignItems: 'center', justifyContent: 'center' },
  ringPercent: { color: theme.colors.textPrimary, fontWeight: '800', fontSize: 11 },
  heroMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaChipText: { color: theme.colors.textSecondary, fontSize: 10, fontWeight: '700' },

  repairNudge: {
    marginHorizontal: 16,
    marginTop: 6,
    backgroundColor: theme.colors.warningSurface,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.warningTintSoft,
  },
  repairText: { color: theme.colors.warning, fontSize: 12, fontWeight: '600', textAlign: 'center' },

  startArea: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 36,
    paddingBottom: 40,
    width: '100%',
  },
  startAreaLandscape: {
    paddingTop: 32,
    paddingBottom: 36,
  },

  dashboardGridLandscape: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
  },
  dashboardColPrimary: { flex: 1.1 },
  dashboardColSecondary: { flex: 0.9 },
  sectionNoInset: { paddingHorizontal: 0 },

  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatDivider: { width: 1, height: 28, backgroundColor: theme.colors.border },
  examClockRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginVertical: 1 },
  examLabel: { color: theme.colors.textSecondary, fontSize: 11, fontWeight: '700' },
  examDays: { color: theme.colors.primaryLight, fontSize: 15, fontWeight: '900' },
  examDaysUrgent: { color: theme.colors.warning },
  heroStatValue: { color: theme.colors.textPrimary, fontSize: 13, fontWeight: '700' },
  heroStatSub: { color: theme.colors.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 2 },

  criticalSection: { paddingHorizontal: 16, marginBottom: 16 },
  sectionLabel: { color: theme.colors.textMuted, fontWeight: '800', fontSize: 11, letterSpacing: 1.5, marginBottom: 8 },
  criticalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderLeftWidth: 3,
    padding: 12,
    marginBottom: 8,
  },
  criticalCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  criticalCardBody: { flex: 1 },
  criticalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  criticalBadgeWrap: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  criticalBadge: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  criticalTitle: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  criticalSub: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 17 },

  coreActionsSection: { paddingHorizontal: 16, marginBottom: 16 },
  shortcutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  shortcutTile: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: theme.colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    alignItems: 'center',
    gap: 8,
  },
  shortcutTileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutTileTitle: { color: theme.colors.textPrimary, fontSize: 12, fontWeight: '700', textAlign: 'center' },

  agendaSection: { paddingHorizontal: 16, marginBottom: 12 },
  agendaRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'center' },
  agendaTime: { width: 44, alignItems: 'flex-end', marginRight: 10 },
  agendaTimeText: { color: '#B1B7C5', fontSize: 11, fontWeight: '700' },
  agendaCard: { flex: 1, backgroundColor: theme.colors.surface, padding: 12, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: theme.colors.primary },
  agendaReview: { borderLeftColor: theme.colors.success },
  agendaDeep: { borderLeftColor: theme.colors.error },
  agendaTitle: { color: theme.colors.textPrimary, fontSize: 13, fontWeight: '600' },
  agendaSub: { color: theme.colors.textSecondary, fontSize: 10, marginTop: 2, textTransform: 'uppercase' },
  agendaBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  agendaBadge: {
    color: '#D7DEEC',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: theme.colors.card,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  seeAllLink: { color: theme.colors.primary, fontSize: 12, fontWeight: '700', marginTop: 8, textAlign: 'right' },

  moreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  moreChevron: { color: theme.colors.textMuted, fontSize: 12 },
  moreContent: { paddingHorizontal: 16 },
  moreGroupLabel: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 6, marginBottom: 8 },
  moreRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  moreBtn: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  moreBtnText: { color: theme.colors.textSecondary, fontWeight: '600', fontSize: 13 },
  moreLink: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.divider },
  moreLinkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  moreLinkText: { color: theme.colors.textSecondary, fontSize: 14, flexShrink: 1, lineHeight: 20 },

  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  modalCard: {
    backgroundColor: theme.colors.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    maxHeight: '75%',
    padding: 16,
  },
  modalTitle: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: '700' },
  modalHint: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 4, marginBottom: 10 },
  modalBody: { backgroundColor: '#101019', borderRadius: 10 },
  modalBodyContent: { padding: 12 },
  modalText: { color: '#E6E9EF', fontSize: 14, lineHeight: 20 },
  modalCloseBtn: {
    alignSelf: 'flex-end',
    marginTop: 12,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  modalCloseBtnPressed: { opacity: 0.88 },
  modalCloseText: { color: theme.colors.textPrimary, fontSize: 13, fontWeight: '700' },
});
