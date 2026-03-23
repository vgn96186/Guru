import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  BackHandler,
  Alert,
  Animated,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { HomeStackParamList } from '../navigation/types';
import {
  useSessionStore,
  getCurrentAgendaItem,
  getCurrentContentType,
} from '../store/useSessionStore';
import { useAppStore } from '../store/useAppStore';
import { invalidatePlanCache } from '../services/studyPlanner';
import { buildSession } from '../services/sessionPlanner';
import { fetchContent, prefetchTopicContent } from '../services/aiService';
import { sendImmediateNag } from '../services/notificationService';
import { createSession, endSession, isSessionAlreadyFinalized } from '../db/queries/sessions';
import {
  updateTopicProgress,
  incrementWrongCount,
  markTopicNeedsAttention,
} from '../db/queries/topics';
import {
  flagTopicForReview,
  setContentFlagged,
  clearSpecificContentCache,
} from '../db/queries/aiCache';
import { profileRepository, dailyLogRepository } from '../db/repositories';
import { calculateAndAwardSessionXp } from '../services/xpService';
import LoadingOrb from '../components/LoadingOrb';
import ContentCard from './ContentCard';
import ErrorBoundary from '../components/ErrorBoundary';
import BreakScreen from './BreakScreen';
import BrainDumpFab from '../components/BrainDumpFab';
import type { Mood, SessionMode, AgendaItem } from '../types';
import { XP_REWARDS, STREAK_MIN_MINUTES } from '../constants/gamification';
import { CONTENT_TYPE_LABELS } from '../constants/contentTypes';
import { useIdleTimer } from '../hooks/useIdleTimer';
import { useGuruPresence } from '../hooks/useGuruPresence';
import { useAppStateTransition } from '../hooks/useAppStateTransition';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { theme } from '../constants/theme';
import { showToast } from '../components/Toast';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Session'>;
type Route = RouteProp<HomeStackParamList, 'Session'>;

/** Human-readable AI route for the session header (matches llmRouting modelUsed prefixes). */
function formatSessionModelLabel(modelUsed?: string | null): string {
  if (!modelUsed?.trim()) return 'AI · model not recorded';
  const m = modelUsed.replace(/^local-/, '');
  if (m.startsWith('groq/')) return `AI · Groq / ${m.slice(5)}`;
  if (m.startsWith('gemini/')) return `AI · Gemini / ${m.slice(7)}`;
  if (m.startsWith('github/')) return `AI · GitHub Models / ${m.slice(7)}`;
  if (m.startsWith('deepseek/')) return `AI · DeepSeek / ${m.slice(9)}`;
  if (m.startsWith('cf/')) return `AI · Cloudflare / ${m.slice(3)}`;
  if (modelUsed.startsWith('local-')) return `AI · On-device / ${m}`;
  if (m.includes('/')) return `AI · ${m.replace('/', ' / ')}`;
  return `AI · ${m}`;
}

export default function SessionScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const {
    mood,
    resume = false,
    mode: forcedMode,
    forcedMinutes,
    focusTopicId,
    focusTopicIds,
    preferredActionType,
  } = route.params as {
    mood: Mood;
    resume?: boolean;
    mode?: SessionMode;
    forcedMinutes?: number;
    focusTopicId?: number;
    focusTopicIds?: number[];
    preferredActionType?: 'study' | 'review' | 'deep_dive';
  };

  // ── Store State (Selective Subscriptions) ──
  const sessionId = useSessionStore((s) => s.sessionId);
  const sessionState = useSessionStore((s) => s.sessionState);
  const agenda = useSessionStore((s) => s.agenda);
  const currentItemIndex = useSessionStore((s) => s.currentItemIndex);
  const currentContentIndex = useSessionStore((s) => s.currentContentIndex);
  const currentContent = useSessionStore((s) => s.currentContent);
  const isLoadingContent = useSessionStore((s) => s.isLoadingContent);
  const completedTopicIds = useSessionStore((s) => s.completedTopicIds);
  const quizResults = useSessionStore((s) => s.quizResults);
  const startedAt = useSessionStore((s) => s.startedAt);
  const activeStudyDuration = useSessionStore((s) => s.activeStudyDuration);
  const isOnBreak = useSessionStore((s) => s.isOnBreak);
  const breakCountdown = useSessionStore((s) => s.breakCountdown);
  const isPaused = useSessionStore((s) => s.isPaused);

  // ── Store Actions (Stable) ──
  const setSessionId = useSessionStore((s) => s.setSessionId);
  const setSessionState = useSessionStore((s) => s.setSessionState);
  const setAgenda = useSessionStore((s) => s.setAgenda);
  const setCurrentContent = useSessionStore((s) => s.setCurrentContent);
  const setLoadingContent = useSessionStore((s) => s.setLoadingContent);
  const setPaused = useSessionStore((s) => s.setPaused);
  const nextContent = useSessionStore((s) => s.nextContent);
  const nextTopic = useSessionStore((s) => s.nextTopic);
  const markTopicComplete = useSessionStore((s) => s.markTopicComplete);
  const nextTopicNoBreak = useSessionStore((s) => s.nextTopicNoBreak);
  const addQuizResult = useSessionStore((s) => s.addQuizResult);
  const startBreak = useSessionStore((s) => s.startBreak);
  const endBreak = useSessionStore((s) => s.endBreak);
  const tickBreak = useSessionStore((s) => s.tickBreak);
  const resetSession = useSessionStore((s) => s.resetSession);
  const incrementActiveStudyDuration = useSessionStore((s) => s.incrementActiveStudyDuration);
  const downgradeSession = useSessionStore((s) => s.downgradeSession);

  // ── App Store ──
  const profile = useAppStore((s) => s.profile);
  const dailyAvailability = useAppStore((s) => s.dailyAvailability);
  const refreshProfile = useAppStore((s) => s.refreshProfile);

  // UI State
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeElapsedSeconds, setActiveElapsedSeconds] = useState(0);
  const [aiError, setAiError] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [showXp, setShowXp] = useState(0);
  const [sessionXpTotal, setSessionXpTotal] = useState(0);

  // Refs for stable timer/async access
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const agendaRevealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const xpAnim = useRef(new Animated.Value(0)).current;
  const isPausedRef = useRef(isPaused);
  const isManuallyPausedRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const finishSessionLockRef = useRef(false);

  // Sync ref with state
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const isStudying = sessionState === 'studying' && !isOnBreak && !isPaused;

  const topicNames = useMemo(() => agenda?.items?.map((i) => i.topic.name) ?? [], [agenda]);

  const { currentMessage, presencePulse, toastOpacity, triggerEvent } = useGuruPresence({
    topicNames,
    isActive: isStudying && (profile?.bodyDoublingEnabled ?? true),
    frequency: profile?.guruFrequency ?? 'normal',
  });

  const idleTimeout = (profile?.idleTimeoutMinutes ?? 2) * 60 * 1000;

  const { panHandlers } = useIdleTimer({
    timeout: idleTimeout,
    onIdle: () => {
      if (sessionState === 'studying' && !isOnBreak && !isPaused) {
        setPaused(true);
        sendImmediateNag(
          'Are you there, Doctor?',
          'Your study session is paused due to inactivity.',
        );
      }
    },
    onActive: () => {
      if (isPaused && !isManuallyPausedRef.current) {
        setPaused(false);
      }
    },
    disabled: sessionState !== 'studying' || isOnBreak,
  });

  const activeElapsedSecondsRef = useRef(activeElapsedSeconds);
  useEffect(() => {
    activeElapsedSecondsRef.current = activeElapsedSeconds;
  }, [activeElapsedSeconds]);

  const finishSession = useCallback(async () => {
    if (finishSessionLockRef.current) return;
    finishSessionLockRef.current = true;
    try {
      if (timerRef.current) clearInterval(timerRef.current);
      if (agendaRevealTimeoutRef.current) {
        clearTimeout(agendaRevealTimeoutRef.current);
        agendaRevealTimeoutRef.current = null;
      }

      // Read latest state from store directly for final persistence
      const s = useSessionStore.getState();
      if (!s.sessionId) {
        navigation.goBack();
        return;
      }
      if (await isSessionAlreadyFinalized(s.sessionId)) {
        return;
      }

      const durationMin = Math.round(activeElapsedSecondsRef.current / 60);
      const completedTopics = (s.agenda?.items ?? [])
        .filter((i: AgendaItem) => s.completedTopicIds.includes(i.topic.id))
        .map((i: AgendaItem) => i.topic);

      const dailyLog = await dailyLogRepository.getDailyLog();
      const isFirstToday = (dailyLog?.sessionCount ?? 0) === 0;
      const xpResult = await calculateAndAwardSessionXp(
        completedTopics,
        s.quizResults,
        isFirstToday,
      );

      await endSession(s.sessionId, s.completedTopicIds, xpResult.total, durationMin);
      await profileRepository.updateStreak(durationMin >= STREAK_MIN_MINUTES);

      setSessionXpTotal(xpResult.total);
      refreshProfile().catch((err) =>
        console.error('[Session] Post-session profile refresh failed:', err),
      );
      invalidatePlanCache();
      setSessionState('session_done');
    } catch (e: any) {
      console.error('[Session] finishSession error:', e);
      Alert.alert('Session Error', 'Could not save session progress properly: ' + e.message);
      navigation.navigate('Home');
    } finally {
      finishSessionLockRef.current = false;
    }
  }, [navigation, refreshProfile, setSessionState]);

  // Effect: Persist XP/end session when state hits done naturally
  useEffect(() => {
    if (sessionState === 'session_done') {
      void finishSession();
    }
  }, [sessionState, finishSession]);

  // Effect: Hardware back button handler
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert('Leave session?', 'Your progress will be saved.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: finishSession },
      ]);
      return true;
    });
    return () => handler.remove();
  }, [finishSession]);

  // Effect: App background nag
  useAppStateTransition({
    onBackground: () => {
      if (sessionState === 'studying' && profile?.strictModeEnabled) {
        sendImmediateNag('COME BACK! 😡', "Your session is still running. Don't break the flow!");
      }
    },
  });

  const startPlanning = useCallback(async () => {
    setAiError(null);
    setSessionState('planning');
    try {
      const isWarmup = forcedMode === 'warmup';
      const isMcqBlock = forcedMode === 'mcq_block';
      const sessionLength = forcedMinutes
        ? forcedMinutes
        : isWarmup
          ? 5
          : forcedMode === 'sprint'
            ? 10
            : dailyAvailability && dailyAvailability > 0
              ? dailyAvailability
              : (profile?.preferredSessionLength ?? 45);

      const agendaResult = await buildSession(
        mood,
        sessionLength,
        profile?.openrouterApiKey ?? '',
        profile?.openrouterKey,
        profile?.groqApiKey,
        { focusTopicId, focusTopicIds, preferredActionType, mode: forcedMode },
      );

      const sessId = await createSession(
        agendaResult.items.map((i) => i.topic.id),
        mood,
        agendaResult.mode,
      );

      setSessionId(sessId);
      setAgenda(agendaResult);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (isWarmup || isMcqBlock) {
        setSessionState('studying');
      } else {
        setSessionState('agenda_reveal');
        if (agendaRevealTimeoutRef.current) {
          clearTimeout(agendaRevealTimeoutRef.current);
        }
        agendaRevealTimeoutRef.current = setTimeout(() => {
          setSessionState('studying');
          agendaRevealTimeoutRef.current = null;
        }, 3000);
      }
    } catch (e: any) {
      setAiError(e?.message ?? 'Could not plan session');
    }
  }, [
    mood,
    forcedMinutes,
    forcedMode,
    dailyAvailability,
    profile,
    focusTopicId,
    focusTopicIds,
    preferredActionType,
    setSessionId,
    setSessionState,
    setAgenda,
  ]);

  // Main Initialization Effect
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    // Check if we should resume or start fresh
    const s = useSessionStore.getState();
    const hasResumableSession =
      Boolean(s.sessionId) && Boolean(s.agenda) && s.sessionState !== 'session_done';

    if (resume && hasResumableSession) {
      const elapsed = s.startedAt ? Math.max(0, Math.floor((Date.now() - s.startedAt) / 1000)) : 0;
      setElapsedSeconds(elapsed);
      setActiveElapsedSeconds(Math.floor(s.activeStudyDuration));
      if (s.sessionState === 'planning' || s.sessionState === 'agenda_reveal') {
        setSessionState('studying');
      }
    } else {
      resetSession();
      void startPlanning();
    }

    // Master Timer
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
      if (!isPausedRef.current && !useSessionStore.getState().isOnBreak) {
        setActiveElapsedSeconds((prev) => prev + 1);
        incrementActiveStudyDuration(1);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (agendaRevealTimeoutRef.current) clearTimeout(agendaRevealTimeoutRef.current);
    };
  }, [resume, resetSession, startPlanning, incrementActiveStudyDuration, setSessionState]);

  // Break Timer Effect
  useEffect(() => {
    if (!isOnBreak) return;
    const t = setInterval(() => tickBreak(), 1000);
    return () => clearInterval(t);
  }, [isOnBreak, tickBreak]);

  const handleContentDone = useCallback(() => {
    const s = useSessionStore.getState();
    const curItem = s.agenda?.items[s.currentItemIndex];
    if (!curItem) return;

    if (s.currentContentIndex < curItem.contentTypes.length - 1) {
      nextContent();
    } else {
      markTopicComplete();
      const isLast = s.currentItemIndex >= (s.agenda?.items.length ?? 1) - 1;
      if (isLast) {
        setSessionState('session_done');
      } else if (s.agenda?.skipBreaks) {
        nextTopicNoBreak();
      } else {
        startBreak((profile?.breakDurationMinutes ?? 5) * 60);
      }
    }
  }, [
    profile?.breakDurationMinutes,
    nextContent,
    markTopicComplete,
    setSessionState,
    nextTopicNoBreak,
    startBreak,
  ]);

  // Effect: Auto-load AI content
  useEffect(() => {
    if (sessionState !== 'studying' || isOnBreak || isPaused) return;
    if (currentContent || isLoadingContent || aiError) return;

    const s = useSessionStore.getState();
    const item = getCurrentAgendaItem(s);
    const cType = getCurrentContentType(s);
    if (!item || !cType) return;

    setAiError(null);
    setLoadingContent(true);
    fetchContent(item.topic, cType)
      .then((content) => {
        setCurrentContent(content);
        setLoadingContent(false);
      })
      .catch((e) => {
        setLoadingContent(false);
        setAiError(e?.message ?? 'AI content failed');
      });
  }, [
    sessionState,
    isOnBreak,
    isPaused,
    currentItemIndex,
    currentContentIndex,
    currentContent,
    isLoadingContent,
    aiError,
    setCurrentContent,
    setLoadingContent,
  ]);

  // Prefetch Effect
  useEffect(() => {
    if (!agenda) return;
    const nextItem = agenda.items[currentItemIndex + 1];
    if (nextItem) prefetchTopicContent(nextItem.topic, nextItem.contentTypes);
  }, [currentItemIndex, agenda]);

  const handleStartManualReview = useCallback(() => {
    setAiError(null);
    const item = getCurrentAgendaItem(useSessionStore.getState());
    if (item) {
      setCurrentContent({ type: 'manual', topicName: item.topic.name });
    } else {
      navigation.goBack();
    }
  }, [navigation, setCurrentContent]);

  const handleContinueWithoutAi = useCallback(() => {
    setAiError(null);
    if (!agenda) {
      handleStartManualReview();
      return;
    }
    handleContentDone();
  }, [agenda, handleStartManualReview, handleContentDone]);

  const handleBreakDone = useCallback(() => {
    endBreak();
    nextTopic();
    if (useSessionStore.getState().sessionState !== 'session_done') {
      setSessionState('studying');
    }
  }, [endBreak, nextTopic, setSessionState]);

  const handleConfidenceRating = useCallback(
    async (confidence: number) => {
      const s = useSessionStore.getState();
      const item = getCurrentAgendaItem(s);
      if (!item) return;

      const status = confidence >= 4 ? 'mastered' : confidence >= 2 ? 'reviewed' : 'seen';
      const xp =
        item.topic.progress.status === 'unseen' ? XP_REWARDS.TOPIC_UNSEEN : XP_REWARDS.TOPIC_REVIEW;

      await updateTopicProgress(item.topic.id, status, confidence, xp);
      setShowXp(xp);

      Animated.sequence([
        Animated.timing(xpAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(800),
        Animated.timing(xpAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();

      if (confidence === 1) triggerEvent('again_rated');
      else triggerEvent('card_done');

      const currentType = getCurrentContentType(s);
      if (currentType) {
        clearSpecificContentCache(item.topic.id, currentType).catch((err) =>
          console.error('[Session] Cache clear failed:', err),
        );
      }

      handleContentDone();
    },
    [xpAnim, triggerEvent, handleContentDone],
  );

  const handleDowngrade = useCallback(() => {
    Alert.alert('Having a tough time?', 'We can switch to Sprint Mode — shorter, easier content.', [
      { text: 'Keep Pushing', style: 'cancel' },
      {
        text: 'Downgrade',
        onPress: () => {
          downgradeSession();
          setLoadingContent(true);
          setCurrentContent(null);
          const s = useSessionStore.getState();
          const item = getCurrentAgendaItem(s);
          const cType = getCurrentContentType(s);
          if (item && cType) {
            fetchContent(item.topic, cType)
              .then((c) => {
                setCurrentContent(c);
                setLoadingContent(false);
              })
              .catch(() => setLoadingContent(false));
          }
        },
      },
    ]);
  }, [downgradeSession, setLoadingContent, setCurrentContent]);

  const handleMarkForReview = useCallback(() => {
    const s = useSessionStore.getState();
    const item = getCurrentAgendaItem(s);
    if (!item) return;
    Alert.alert(
      'Mark for Review?',
      `Flag "${item.topic.name}" to review later in Flagged Review.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Flag Topic',
          onPress: async () => {
            const st = useSessionStore.getState();
            let flaggedType: string;
            if (st.currentContent?.type === 'manual') {
              flaggedType = await flagTopicForReview(item.topic.id, item.topic.name);
            } else {
              const curType = st.currentContent?.type;
              if (curType) {
                await setContentFlagged(item.topic.id, curType, true);
                flaggedType = curType;
              } else {
                flaggedType = await flagTopicForReview(item.topic.id, item.topic.name);
              }
            }
            Alert.alert('Flagged', `Added to Flagged Review as ${flaggedType.replace('_', ' ')}.`);
          },
        },
      ],
    );
  }, []);

  const handleSkipToNextTopic = useCallback(() => {
    nextTopicNoBreak();
  }, [nextTopicNoBreak]);

  // ── Render Path ──

  if (aiError && sessionState !== 'session_done') {
    return (
      <SafeAreaView style={styles.safe}>
        <ResponsiveContainer style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitle}>AI Unavailable</Text>
          <Text style={styles.errorMsg}>{aiError}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              setAiError(null);
              if (!agenda) startPlanning();
              else setCurrentContent(null);
            }}
          >
            <Text style={styles.retryBtnText}>Retry AI</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.manualBtn} onPress={handleContinueWithoutAi}>
            <Text style={styles.manualBtnText}>
              {agenda ? 'Continue Without AI' : 'Start Manual Review'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.leaveBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.leaveBtnText}>Leave Session</Text>
          </TouchableOpacity>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  if (sessionState === 'planning') {
    return (
      <SafeAreaView style={styles.safe} testID="session-planning">
        <LoadingOrb message="Guru is planning your session..." />
      </SafeAreaView>
    );
  }

  if (sessionState === 'agenda_reveal' && agenda) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
        <ResponsiveContainer style={styles.revealContainer} testID="session-agenda-reveal">
          <Text style={styles.revealEmoji}>🎯</Text>
          <Text style={styles.revealFocus}>{agenda.focusNote}</Text>
          <Text style={styles.revealGuru}>"{agenda.guruMessage}"</Text>
          <Text style={styles.revealSub}>Starting in a moment...</Text>
          {agenda.items.map((i) => (
            <View key={i.topic.id} style={styles.revealTopic}>
              <View style={[styles.revealDot, { backgroundColor: i.topic.subjectColor }]} />
              <Text style={styles.revealTopicName} numberOfLines={2} ellipsizeMode="tail">
                {i.topic.name}
              </Text>
              <Text style={styles.revealTopicSub}>{i.topic.subjectCode}</Text>
            </View>
          ))}
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  if (isOnBreak) {
    const curItem = agenda?.items[currentItemIndex];
    return (
      <BreakScreen
        countdown={breakCountdown}
        totalSeconds={(profile?.breakDurationMinutes ?? 5) * 60}
        topicId={curItem?.topic.id}
        onDone={handleBreakDone}
        onEndSession={finishSession}
      />
    );
  }

  if (sessionState === 'session_done') {
    if (forcedMode === 'warmup') {
      const correctTotal = quizResults.reduce((s, r) => s + r.correct, 0);
      const answeredTotal = quizResults.reduce((s, r) => s + r.total, 0);
      return (
        <WarmUpMomentumScreen
          correctTotal={correctTotal}
          answeredTotal={answeredTotal}
          mood={mood}
          onMCQBlock={() => {
            resetSession();
            navigation.replace('Session', { mood, mode: 'mcq_block', forcedMinutes: 60 });
          }}
          onContinue={() => {
            resetSession();
            navigation.replace('Session', { mood });
          }}
          onLecture={() => {
            resetSession();
            navigation.navigate('LectureMode', {});
          }}
          onDone={() => {
            resetSession();
            try {
              navigation.popToTop();
            } catch {
              navigation.navigate('Home');
            }
          }}
        />
      );
    }
    return (
      <SessionDoneScreen
        completedCount={completedTopicIds.length}
        elapsedSeconds={elapsedSeconds}
        xpTotal={sessionXpTotal}
        onClose={() => {
          resetSession();
          try {
            navigation.popToTop();
          } catch {
            navigation.navigate('Home');
          }
        }}
      />
    );
  }

  if (sessionState === 'topic_done') {
    const curItem = agenda?.items[currentItemIndex];
    return (
      <SafeAreaView style={styles.safe}>
        <ResponsiveContainer style={styles.topicDoneContainer}>
          <Text style={styles.topicDoneEmoji}>✅</Text>
          <Text style={styles.topicDoneName} numberOfLines={2} ellipsizeMode="tail">
            {curItem?.topic.name}
          </Text>
          <Text style={styles.topicDoneSub}>
            Topic complete! Taking a {profile?.breakDurationMinutes ?? 5}-min break...
          </Text>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  const curItem = agenda?.items[currentItemIndex];
  const curContentType = curItem ? curItem.contentTypes[currentContentIndex] : null;

  if (!curItem || !curContentType) {
    return (
      <SafeAreaView style={styles.safe}>
        <ResponsiveContainer style={styles.errorContainer}>
          <LoadingOrb message="Loading..." />
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  const totalSessionSeconds =
    (forcedMinutes
      ? forcedMinutes
      : forcedMode === 'sprint'
        ? 10
        : (profile?.preferredSessionLength ?? 45)) * 60;
  const timeProgressPercent = Math.min(
    100,
    Math.round((activeElapsedSeconds / totalSessionSeconds) * 100),
  );
  const showPausedOverlay = isPaused && sessionState === 'studying' && !isOnBreak;

  return (
    <SafeAreaView style={styles.safe} {...panHandlers} testID="session-studying">
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ResponsiveContainer>
        <View style={styles.storyBarContainer}>
          <View style={[styles.storyBarFill, { width: `${timeProgressPercent}%` }]} />
        </View>

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.phaseRow}>
              <Text style={styles.phaseBadge}>
                {isPaused
                  ? '⏸️ Paused'
                  : isOnBreak
                    ? '☕ Break'
                    : sessionState === 'studying'
                      ? '📖 Studying'
                      : '💤 Done'}
              </Text>
              <Text style={styles.topicProgress}>
                Topic {currentItemIndex + 1}/{agenda?.items.length ?? 0}
              </Text>
            </View>
            <Text style={styles.topicName} numberOfLines={2} ellipsizeMode="tail">
              {curItem.topic.name}
            </Text>
            <Text style={styles.subjectTag}>{curItem.topic.subjectCode}</Text>
            <Text style={styles.aiSourceLine}>
              {isLoadingContent
                ? 'AI · fetching card…'
                : formatSessionModelLabel(currentContent?.modelUsed)}
            </Text>
          </View>
          <View style={styles.headerRight}>
            {isStudying && (
              <Animated.View style={[styles.guruDot, { transform: [{ scale: presencePulse }] }]} />
            )}
            <TouchableOpacity
              onPress={() => {
                const next = !isPaused;
                isManuallyPausedRef.current = next;
                setPaused(next);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              style={styles.pauseBtn}
            >
              <Text style={styles.pauseBtnText}>{isPaused ? '▶' : '⏸'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuBtn}>
              <Text style={styles.menuBtnText}>•••</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Menu overlay */}
        {menuVisible && (
          <View style={styles.menuOverlay}>
            <TouchableOpacity
              style={styles.menuBackdrop}
              onPress={() => setMenuVisible(false)}
              activeOpacity={1}
            />
            <View style={styles.menuDropdown}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  handleMarkForReview();
                }}
              >
                <Text style={styles.menuItemEmoji}>🚩</Text>
                <Text style={styles.menuItemText}>Mark for Review</Text>
              </TouchableOpacity>
              <View style={styles.menuDivider} />
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  handleDowngrade();
                }}
              >
                <Text style={styles.menuItemEmoji}>🆘</Text>
                <Text style={styles.menuItemText}>Downgrade to Sprint</Text>
              </TouchableOpacity>
              <View style={styles.menuDivider} />
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  finishSession();
                }}
              >
                <Text style={styles.menuItemEmoji}>🚪</Text>
                <Text style={[styles.menuItemText, { color: theme.colors.error }]}>
                  End Session
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {currentMessage && isStudying && !showPausedOverlay && (
          <Animated.View style={[styles.guruToast, { opacity: toastOpacity }]}>
            <Text style={styles.guruToastText}>{currentMessage}</Text>
          </Animated.View>
        )}

        <View style={styles.tabRowWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            <View style={styles.contentTypeTabs}>
              {curItem.contentTypes.map((ct, idx) => (
                <View
                  key={ct}
                  style={[
                    styles.contentTab,
                    idx === currentContentIndex && styles.contentTabActive,
                    idx < currentContentIndex && styles.contentTabDone,
                  ]}
                >
                  <Text style={styles.contentTabText}>{CONTENT_TYPE_LABELS[ct]}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
          <Text style={styles.cardCountText}>
            {currentContentIndex + 1}/{curItem.contentTypes.length}
          </Text>
        </View>

        {isLoadingContent ? (
          <LoadingOrb message="Fetching content..." />
        ) : currentContent ? (
          <ErrorBoundary>
            <ContentCard
              key={`${curItem.topic.id}-${currentContentIndex}-${curContentType}`}
              content={currentContent}
              topicId={curItem.topic.id}
              onDone={handleConfidenceRating}
              onSkip={handleContentDone}
              onQuizAnswered={(c) => {
                triggerEvent(c ? 'quiz_correct' : 'quiz_wrong');
                if (!c && curItem.topic.id) {
                  void Promise.allSettled([
                    incrementWrongCount(curItem.topic.id),
                    markTopicNeedsAttention(curItem.topic.id),
                    setContentFlagged(curItem.topic.id, 'quiz', true),
                  ]);
                }
              }}
              onQuizComplete={(correct, total) =>
                addQuizResult({ topicId: curItem.topic.id, correct, total })
              }
            />
          </ErrorBoundary>
        ) : (
          <LoadingOrb message="Loading..." />
        )}

        <Animated.View
          style={[
            styles.xpPop,
            {
              opacity: xpAnim,
              transform: [
                { translateY: xpAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }) },
              ],
            },
          ]}
        >
          <Text style={styles.xpPopText}>+{showXp} XP</Text>
        </Animated.View>

        {showPausedOverlay && (
          <View style={styles.pausedOverlay}>
            <Text style={styles.pausedText}>Session Paused</Text>
            <Text style={styles.pausedSubText}>Are you still studying, Doctor?</Text>
            <TouchableOpacity
              style={styles.resumeOverlayBtn}
              onPress={() => {
                isManuallyPausedRef.current = false;
                setPaused(false);
              }}
            >
              <Text style={styles.resumeOverlayBtnText}>Resume Session</Text>
            </TouchableOpacity>
          </View>
        )}
        <BrainDumpFab />
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

function WarmUpMomentumScreen({
  correctTotal,
  answeredTotal,
  mood,
  onMCQBlock,
  onContinue,
  onLecture,
  onDone,
}: {
  correctTotal: number;
  answeredTotal: number;
  mood: Mood;
  onMCQBlock: () => void;
  onContinue: () => void;
  onLecture: () => void;
  onDone: () => void;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <ResponsiveContainer style={styles.doneContainer}>
        <Text style={styles.doneEmoji}>⚡</Text>
        <Text style={styles.doneTitle}>Nice work, Doctor.</Text>
        <Text style={[styles.doneStat, { marginBottom: 8 }]}>
          {answeredTotal > 0 ? `${correctTotal}/${answeredTotal} correct` : 'Session complete'}
        </Text>
        <Text style={[styles.doneStat, { marginBottom: 32 }]}>What's next?</Text>
        <TouchableOpacity style={styles.doneBtn} onPress={onLecture}>
          <Text style={styles.doneBtnText}>🎥 Watch a lecture</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.doneBtn,
            {
              marginTop: 12,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
            },
          ]}
          onPress={onMCQBlock}
        >
          <Text style={[styles.doneBtnText, { color: theme.colors.textPrimary }]}>
            📝 50 MCQ Block
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.doneBtn,
            {
              marginTop: 12,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
            },
          ]}
          onPress={onContinue}
        >
          <Text style={[styles.doneBtnText, { color: theme.colors.textPrimary }]}>
            📚 Continue studying
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ paddingVertical: 20, marginTop: 4 }} onPress={onDone}>
          <Text style={styles.leaveBtnText}>✋ That&apos;s enough for now</Text>
        </TouchableOpacity>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

function SessionDoneScreen({
  completedCount,
  elapsedSeconds,
  xpTotal,
  onClose,
}: {
  completedCount: number;
  elapsedSeconds: number;
  xpTotal: number;
  onClose: () => void;
}) {
  const mins = Math.round(elapsedSeconds / 60);
  return (
    <SafeAreaView style={styles.safe}>
      <ResponsiveContainer style={styles.doneContainer} testID="session-done">
        <Text style={styles.doneEmoji}>🎉</Text>
        <Text style={styles.doneTitle}>Session Complete!</Text>
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{completedCount}</Text>
              <Text style={styles.summaryLabel}>Topics</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{mins}</Text>
              <Text style={styles.summaryLabel}>Minutes</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: theme.colors.warning }]}>+{xpTotal}</Text>
              <Text style={styles.summaryLabel}>XP</Text>
            </View>
          </View>
        </View>
        <Text style={styles.doneStat}>
          {completedCount} topics covered · {mins} min
        </Text>
        <TouchableOpacity style={styles.doneBtn} onPress={onClose} testID="back-to-home-btn">
          <Text style={styles.doneBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  storyBarContainer: { height: 3, backgroundColor: theme.colors.border },
  storyBarFill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 0 },
  topicProgressSection: { paddingHorizontal: theme.spacing.lg, marginBottom: 8 },
  topicProgressLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    textAlign: 'right',
    marginBottom: 4,
  },
  topicProgressTrack: {
    height: 3,
    backgroundColor: theme.colors.border,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  topicProgressFill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 1.5 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
  },
  headerLeft: { flex: 1, minWidth: 0 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  topicProgress: { color: theme.colors.textSecondary, fontSize: 11, marginBottom: 2 },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  phaseBadge: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: theme.colors.primaryTintSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  topicName: { color: theme.colors.textPrimary, fontWeight: '800', fontSize: 18, flex: 1 },
  subjectTag: { color: theme.colors.primary, fontSize: 12, marginTop: 2 },
  aiSourceLine: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 6,
    fontWeight: '600',
    lineHeight: 15,
  },
  pauseBtn: {
    backgroundColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },
  pauseBtnText: { color: theme.colors.primary, fontSize: 14, fontWeight: '700' },
  menuBtn: {
    backgroundColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
  },
  menuBtnText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
  },
  menuOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 },
  menuBackdrop: { flex: 1 },
  menuDropdown: {
    position: 'absolute',
    top: 60,
    right: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 4,
    minWidth: 200,
    elevation: 12,
    shadowColor: theme.colors.textInverse,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    shadowOpacity: 0.4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 12,
  },
  menuItemEmoji: { fontSize: 16, marginRight: 10 },
  menuItemText: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  menuDivider: { height: 1, backgroundColor: theme.colors.border, marginHorizontal: 12 },
  contentTypeTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: theme.colors.background,
  },
  contentTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: theme.colors.border,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  contentTabActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  contentTabDone: {
    backgroundColor: theme.colors.successSurface,
    borderColor: theme.colors.successTintSoft,
  },
  contentTabText: { color: theme.colors.textPrimary, fontSize: 12, fontWeight: '600' },
  revealContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xxl,
  },
  revealEmoji: { fontSize: 48, marginBottom: theme.spacing.lg },
  revealFocus: {
    color: theme.colors.textPrimary,
    fontWeight: '800',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 12,
  },
  revealGuru: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 24,
  },
  revealSub: { color: theme.colors.textSecondary, fontSize: 13 },
  revealTopic: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  revealDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  revealTopicName: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  revealTopicSub: { color: theme.colors.textSecondary, fontSize: 12 },
  topicDoneContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topicDoneEmoji: { fontSize: 64, marginBottom: theme.spacing.lg },
  topicDoneName: {
    color: theme.colors.textPrimary,
    fontWeight: '800',
    fontSize: 20,
    marginBottom: 8,
  },
  topicDoneSub: { color: theme.colors.textSecondary, fontSize: 14 },
  xpPop: {
    position: 'absolute',
    top: 16,
    right: theme.spacing.xl,
    backgroundColor: theme.colors.primary,
    borderRadius: 20,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 8,
  },
  xpPopText: { color: theme.colors.textPrimary, fontWeight: '900', fontSize: 18 },
  doneContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xxl,
  },
  doneEmoji: { fontSize: 64, marginBottom: theme.spacing.lg },
  doneTitle: {
    color: theme.colors.textPrimary,
    fontWeight: '900',
    fontSize: 28,
    marginBottom: theme.spacing.xl,
  },
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: theme.spacing.xl,
    width: '100%',
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center' },
  summaryValue: { color: theme.colors.textPrimary, fontSize: 28, fontWeight: '900' },
  summaryLabel: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 4 },
  summaryDivider: { width: 1, height: 40, backgroundColor: theme.colors.border },
  doneStat: { color: theme.colors.textSecondary, fontSize: 16, marginBottom: theme.spacing.xxl },
  doneBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    paddingHorizontal: 40,
    paddingVertical: theme.spacing.lg,
  },
  doneBtnText: { color: theme.colors.textPrimary, fontWeight: '800', fontSize: 18 },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xxl,
  },
  errorEmoji: { fontSize: 48, marginBottom: 12 },
  errorTitle: { color: theme.colors.textPrimary, fontWeight: '800', fontSize: 22, marginBottom: 8 },
  errorMsg: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  retryBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingHorizontal: 40,
    paddingVertical: 14,
    marginBottom: 10,
    width: '100%',
    alignItems: 'center',
  },
  retryBtnText: { color: theme.colors.textPrimary, fontWeight: '800', fontSize: 16 },
  manualBtn: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    paddingHorizontal: 40,
    paddingVertical: 14,
    marginBottom: 10,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  manualBtnText: { color: theme.colors.textPrimary, fontWeight: '800', fontSize: 16 },
  leaveBtn: { paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  leaveBtnText: { color: theme.colors.textMuted, fontSize: 14 },
  guruDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowRadius: 6,
    shadowOpacity: 0.9,
    elevation: 4,
    marginRight: 6,
  },
  guruToast: {
    position: 'absolute',
    top: 130,
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: theme.colors.primaryTintMedium,
    padding: 12,
    zIndex: 50,
    elevation: 8,
  },
  guruToastText: {
    color: theme.colors.primaryLight,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  pausedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  pausedText: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 10,
  },
  pausedSubText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 30,
  },
  resumeOverlayBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    paddingHorizontal: 40,
    paddingVertical: theme.spacing.lg,
  },
  resumeOverlayBtnText: { color: theme.colors.textPrimary, fontWeight: '800', fontSize: 18 },
  tabRowWrapper: { flexDirection: 'row', alignItems: 'center', flexGrow: 0, flexShrink: 0 },
  cardCountText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    paddingHorizontal: 10,
    fontVariant: ['tabular-nums'],
  },
});
