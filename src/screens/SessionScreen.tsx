import LinearBadge from '../components/primitives/LinearBadge';
import LinearButton from '../components/primitives/LinearButton';
import LinearDivider from '../components/primitives/LinearDivider';
import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  StatusBar,
  BackHandler,
  Alert,
  ScrollView,
  InteractionManager,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
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
import { getCachedUnseenQuestionsForSessionFallback } from '../db/queries/questionBank';
import { profileRepository, dailyLogRepository } from '../db/repositories';
import { calculateAndAwardSessionXp } from '../services/xpService';
import LoadingOrb from '../components/LoadingOrb';
import { showDialog } from '../components/dialogService';
import { MarkdownRender } from '../components/MarkdownRender';
import { showToast } from '../components/Toast';
import ContentCard from './ContentCard';
import ErrorBoundary from '../components/ErrorBoundary';
import BreakScreen from './BreakScreen';
import BrainDumpFab from '../components/BrainDumpFab';
import type { AIContent, Mood, QuestionBankItem, SessionMode, AgendaItem } from '../types';
import { XP_REWARDS, STREAK_MIN_MINUTES } from '../constants/gamification';
import { CONTENT_TYPE_LABELS } from '../constants/contentTypes';
import { useIdleTimer } from '../hooks/useIdleTimer';
import { useGuruPresence } from '../hooks/useGuruPresence';
import { useAppStateTransition } from '../hooks/useAppStateTransition';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { theme } from '../constants/theme';
import { linearTheme as n } from '../theme/linearTheme';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Session'>;
type Route = RouteProp<HomeStackParamList, 'Session'>;

// ── Shared UI helpers ──

function IconCircle({ name, color, size = 56 }: { name: string; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: n.colors.card,
        borderWidth: 1,
        borderColor: `${color}44`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={name as keyof typeof Ionicons.glyphMap} size={size * 0.5} color={color} />
    </View>
  );
}

function useEntranceAnimation(duration = 400) {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(24)).current;
  useEffect(() => {
    fade.setValue(0);
    slide.setValue(24);
    InteractionManager.runAfterInteractions(() => {
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(slide, { toValue: 0, duration, useNativeDriver: true }),
      ]).start();
    });
  }, [duration, fade, slide]);
  return { fade, slide };
}
const SESSION_PREFETCH_LOOKAHEAD = 3;
const CONTENT_AUTO_RETRY_DELAYS_MS = [2000, 5000] as const;
const PLANNING_AUTO_RETRY_DELAYS_MS = [1500, 4000] as const;

/** Human-readable AI route for the session header (matches llmRouting modelUsed prefixes). */
function formatSessionModelLabel(modelUsed?: string | null): string {
  if (!modelUsed?.trim()) return 'AI · model not recorded';
  const m = modelUsed.replace(/^local-/, '');
  if (m.startsWith('groq/')) return `AI · Groq / ${m.slice(5)}`;
  if (m.startsWith('gemini/')) return `AI · Gemini / ${m.slice(7)}`;
  if (m.startsWith('github/')) return `AI · GitHub Models / ${m.slice(7)}`;
  if (m.startsWith('github_copilot/'))
    return `AI · GitHub Copilot / ${m.slice('github_copilot/'.length)}`;
  if (m.startsWith('gitlab_duo/')) return `AI · GitLab Duo / ${m.slice('gitlab_duo/'.length)}`;
  if (m.startsWith('poe/')) return `AI · Poe / ${m.slice(4)}`;
  if (m.startsWith('deepseek/')) return `AI · DeepSeek / ${m.slice(9)}`;
  if (m.startsWith('cf/')) return `AI · Cloudflare / ${m.slice(3)}`;
  if (modelUsed.startsWith('local-')) return `AI · On-device / ${m}`;
  if (m.includes('/')) return `AI · ${m.replace('/', ' / ')}`;
  return `AI · ${m}`;
}

function buildCachedQuestionFallbackContent(
  topicName: string,
  questions: QuestionBankItem[],
): AIContent {
  return {
    type: 'quiz',
    topicName,
    questions: questions.map((question) => ({
      question: question.question,
      options: question.options,
      correctIndex: question.correctIndex,
      explanation: question.explanation,
      imageUrl: question.imageUrl ?? undefined,
    })),
    modelUsed: 'cache/question_bank',
  };
}

function deriveSessionProgressStatus(
  previousStatus: AgendaItem['topic']['progress']['status'],
  confidence: number,
): 'seen' | 'reviewed' {
  if (confidence <= 1) return 'seen';
  if (previousStatus === 'unseen') return 'seen';
  return 'reviewed';
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
  const sessionState = useSessionStore((s) => s.sessionState);
  const agenda = useSessionStore((s) => s.agenda);
  const currentItemIndex = useSessionStore((s) => s.currentItemIndex);
  const currentContentIndex = useSessionStore((s) => s.currentContentIndex);
  const maxUnlockedContentIndex = useSessionStore((s) => s.maxUnlockedContentIndex);
  const currentContent = useSessionStore((s) => s.currentContent);
  const isLoadingContent = useSessionStore((s) => s.isLoadingContent);
  const completedTopicIds = useSessionStore((s) => s.completedTopicIds);
  const quizResults = useSessionStore((s) => s.quizResults);
  const isOnBreak = useSessionStore((s) => s.isOnBreak);
  const breakCountdown = useSessionStore((s) => s.breakCountdown);
  const isPaused = useSessionStore((s) => s.isPaused);

  // ── Store Actions (Stable) ──
  const setSessionId = useSessionStore((s) => s.setSessionId);
  const setSessionState = useSessionStore((s) => s.setSessionState);
  const setAgenda = useSessionStore((s) => s.setAgenda);
  const setCurrentContent = useSessionStore((s) => s.setCurrentContent);
  const setLoadingContent = useSessionStore((s) => s.setLoadingContent);
  const jumpToContent = useSessionStore((s) => s.jumpToContent);
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
  const [, setElapsedSeconds] = useState(0);
  const [activeElapsedSeconds, setActiveElapsedSeconds] = useState(0);
  const [aiError, setAiError] = useState<string | null>(null);
  const [contentRetryPending, setContentRetryPending] = useState(false);
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
  const contentRetryCount = useRef(0);
  const contentRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // No auto-resume on activity — user must explicitly tap Resume or the pause button.
    // The old onActive handler raced with the pause button's onPress via PanResponder capture.
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
      // Use cumulative daily total (not single-session) for streak threshold.
      // Sprint/warmup sessions are 5-10 min each; requiring 20 min per session
      // meant ADHD users doing short sessions could never build a streak.
      const dailyTotalMinutes = (dailyLog?.totalMinutes ?? 0) + durationMin;
      await profileRepository.updateStreak(dailyTotalMinutes >= STREAK_MIN_MINUTES);

      setSessionXpTotal(xpResult.total);
      refreshProfile().catch((err) =>
        console.error('[Session] Post-session profile refresh failed:', err),
      );
      invalidatePlanCache();
      setSessionState('session_done');
    } catch (e: unknown) {
      console.error('[Session] finishSession error:', e);
      const message = e instanceof Error ? e.message : 'Unknown session error';
      Alert.alert('Session Error', 'Could not save session progress properly: ' + message);
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

    for (let attempt = 0; attempt <= PLANNING_AUTO_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
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
        // Eagerly prefetch first item with Groq (fastest) before state transitions
        if (agendaResult.items.length > 0) {
          void prefetchTopicContent(
            agendaResult.items[0].topic,
            agendaResult.items[0].contentTypes,
            'groq',
          );
        }
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
        return;
      } catch (e: unknown) {
        if (attempt < PLANNING_AUTO_RETRY_DELAYS_MS.length) {
          const delay = PLANNING_AUTO_RETRY_DELAYS_MS[attempt];
          if (__DEV__) {
            console.warn(
              `[Session] Planning failed (attempt ${attempt + 1}/${
                PLANNING_AUTO_RETRY_DELAYS_MS.length + 1
              }), retrying in ${delay}ms:`,
              e instanceof Error ? e.message : String(e),
            );
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        setAiError(e instanceof Error ? e.message : 'Could not plan session');
      }
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
      const state = useSessionStore.getState();
      const isStudyingState =
        state.sessionState === 'studying' || state.sessionState === 'topic_done';
      if (!isPausedRef.current && !state.isOnBreak && isStudyingState) {
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
        // Only break when switching to a different topic (interleaved items
        // mean the same topic can appear in consecutive slots)
        const nextItem = s.agenda?.items[s.currentItemIndex + 1];
        const sameTopic = nextItem && nextItem.topic.id === curItem.topic.id;
        if (sameTopic) {
          nextTopicNoBreak();
        } else {
          startBreak((profile?.breakDurationMinutes ?? 5) * 60);
        }
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

  const tryUseCachedQuestionFallback = useCallback(
    async (topic: AgendaItem['topic']): Promise<boolean> => {
      const fallbackQuestions = await getCachedUnseenQuestionsForSessionFallback(
        topic.id,
        topic.subjectName,
        3,
      );
      if (!fallbackQuestions.length) return false;

      if (__DEV__) {
        console.info('[Session] Using cached unseen questions fallback', {
          topicId: topic.id,
          subjectName: topic.subjectName,
          count: fallbackQuestions.length,
        });
      }

      setCurrentContent(buildCachedQuestionFallbackContent(topic.name, fallbackQuestions));
      setAiError(null);
      return true;
    },
    [setCurrentContent],
  );

  useEffect(() => {
    if ((sessionState !== 'studying' && sessionState !== 'agenda_reveal') || isOnBreak || isPaused)
      return;
    if (contentRetryPending) return;
    if (currentContent || isLoadingContent) return;

    const s = useSessionStore.getState();
    const item = getCurrentAgendaItem(s);
    const cType = getCurrentContentType(s);
    if (!item || !cType) return;

    // If there's an active aiError, don't auto-load (user must tap retry or skip)
    if (aiError) return;

    // First card only: prefer Groq first in the chain (fast gpt-oss-120b); fallbacks still follow
    // full provider order (Copilot, GitLab, etc.) — see generate.ts forceProvider === 'groq'.
    const forceGroqForFirstCard =
      currentItemIndex === 0 && currentContentIndex === 0 ? ('groq' as const) : undefined;
    setLoadingContent(true);
    fetchContent(item.topic, cType, forceGroqForFirstCard)
      .then((content) => {
        setCurrentContent(content);
        setLoadingContent(false);
        contentRetryCount.current = 0;
        setContentRetryPending(false);
      })
      .catch((e) => {
        const attempt = contentRetryCount.current;
        if (attempt < CONTENT_AUTO_RETRY_DELAYS_MS.length) {
          setLoadingContent(false);
          contentRetryCount.current = attempt + 1;
          const delay = CONTENT_AUTO_RETRY_DELAYS_MS[attempt];
          setContentRetryPending(true);
          if (__DEV__) {
            console.warn(
              `[Session] AI content failed (attempt ${attempt + 1}/${
                CONTENT_AUTO_RETRY_DELAYS_MS.length + 1
              }), retrying in ${delay}ms:`,
              e?.message,
            );
          }
          if (contentRetryTimer.current) clearTimeout(contentRetryTimer.current);
          contentRetryTimer.current = setTimeout(() => {
            contentRetryTimer.current = null;
            setContentRetryPending(false);
          }, delay);
        } else {
          void tryUseCachedQuestionFallback(item.topic)
            .then((usedFallback) => {
              contentRetryCount.current = 0;
              setContentRetryPending(false);
              if (!usedFallback) {
                setAiError(e?.message ?? 'AI content failed');
              }
            })
            .catch((fallbackError) => {
              contentRetryCount.current = 0;
              setContentRetryPending(false);
              if (__DEV__) {
                console.warn('[Session] Cached question fallback failed:', fallbackError);
              }
              setAiError(e?.message ?? 'AI content failed');
            })
            .finally(() => {
              setLoadingContent(false);
            });
          return;
        }
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
    contentRetryPending,
    setCurrentContent,
    setLoadingContent,
    tryUseCachedQuestionFallback,
  ]);

  // Cleanup retry timer on unmount
  useEffect(() => {
    return () => {
      if (contentRetryTimer.current) clearTimeout(contentRetryTimer.current);
    };
  }, []);

  useEffect(() => {
    contentRetryCount.current = 0;
    setContentRetryPending(false);
    if (contentRetryTimer.current) {
      clearTimeout(contentRetryTimer.current);
      contentRetryTimer.current = null;
    }
  }, [currentItemIndex, currentContentIndex]);

  const prefetchAgendaWindow = useCallback(
    (startIndex: number) => {
      if (!agenda) return;
      const items = agenda.items.slice(startIndex, startIndex + SESSION_PREFETCH_LOOKAHEAD);
      items.forEach((item, i) => {
        // Force Groq (fastest) for the very first agenda item so content appears instantly
        const useGroqFast = startIndex === 0 && i === 0 ? ('groq' as const) : undefined;
        void prefetchTopicContent(item.topic, item.contentTypes, useGroqFast);
      });
    },
    [agenda],
  );

  // Prefetch Effect
  useEffect(() => {
    if (!agenda) return;
    prefetchAgendaWindow(currentItemIndex);
  }, [currentItemIndex, agenda, prefetchAgendaWindow]);

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
      if (!item) {
        // Safety: if agenda item is missing, still advance the session
        handleContentDone();
        return;
      }

      try {
        const status = deriveSessionProgressStatus(item.topic.progress.status, confidence);
        const xp =
          item.topic.progress.status === 'unseen'
            ? XP_REWARDS.TOPIC_UNSEEN
            : XP_REWARDS.TOPIC_REVIEW;

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
      } catch (err) {
        console.error('[Session] handleConfidenceRating error (continuing):', err);
      }

      // Always advance the session, even if DB operations above failed
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
              .catch((e) => {
                void tryUseCachedQuestionFallback(item.topic)
                  .then((usedFallback) => {
                    if (!usedFallback) {
                      setAiError(e?.message ?? 'AI content failed');
                    }
                  })
                  .catch((fallbackError) => {
                    if (__DEV__) {
                      console.warn(
                        '[Session] Cached question fallback failed after downgrade:',
                        fallbackError,
                      );
                    }
                    setAiError(e?.message ?? 'AI content failed');
                  })
                  .finally(() => {
                    setLoadingContent(false);
                  });
              });
          }
        },
      },
    ]);
  }, [downgradeSession, setLoadingContent, setCurrentContent, tryUseCachedQuestionFallback]);

  const handleMarkForReview = useCallback(() => {
    const s = useSessionStore.getState();
    const item = getCurrentAgendaItem(s);
    if (!item) return;
    void (async () => {
      const result = await showDialog({
        title: 'Mark for Review?',
        message: `Flag "${item.topic.name}" to review later in Flagged Review.`,
        variant: 'focus',
        actions: [
          { id: 'cancel', label: 'Cancel', variant: 'secondary' },
          { id: 'flag-topic', label: 'Flag Topic', variant: 'primary' },
        ],
        allowDismiss: true,
      });

      if (result !== 'flag-topic') return;

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

      showToast({
        title: 'Flagged',
        message: `Added to Flagged Review as ${flaggedType.replace('_', ' ')}.`,
        variant: 'success',
      });
    })();
  }, []);

  // ── Render Path ──

  if (aiError && sessionState !== 'session_done') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer style={styles.errorContainer}>
          <IconCircle name="alert-circle" color={theme.colors.error} size={56} />
          <LinearText variant="title" centered style={styles.errorTitle}>
            AI Unavailable
          </LinearText>
          <LinearSurface style={styles.errorMsgCard} padded={false}>
            <LinearText variant="body" tone="secondary" centered style={styles.errorMsg}>
              {aiError}
            </LinearText>
          </LinearSurface>
          <LinearButton
            label="Retry AI"
            variant="primary"
            style={styles.retryBtn}
            onPress={() => {
              if (contentRetryTimer.current) {
                clearTimeout(contentRetryTimer.current);
                contentRetryTimer.current = null;
              }
              contentRetryCount.current = 0;
              setContentRetryPending(false);
              setAiError(null);
              if (!agenda) startPlanning();
              else setCurrentContent(null);
            }}
            leftIcon={<Ionicons name="reload" size={16} color={n.colors.textInverse} />}
          />
          <LinearButton
            label={agenda ? 'Continue Without AI' : 'Start Manual Review'}
            variant="glass"
            style={styles.manualBtn}
            textStyle={styles.manualBtnText}
            onPress={handleContinueWithoutAi}
            leftIcon={<Ionicons name="book-outline" size={16} color={n.colors.textPrimary} />}
          />
          <TouchableOpacity style={styles.leaveBtn} onPress={() => navigation.goBack()}>
            <View style={styles.btnRow}>
              <Ionicons name="arrow-back" size={14} color={theme.colors.textMuted} />
              <LinearText variant="bodySmall" tone="muted" style={styles.leaveBtnText}>
                Leave Session
              </LinearText>
            </View>
          </TouchableOpacity>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  if (sessionState === 'planning') {
    return (
      <SafeAreaView style={styles.safe} testID="session-planning">
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <View style={styles.planningContainer}>
          <LoadingOrb message="Guru is planning your session..." />
        </View>
      </SafeAreaView>
    );
  }

  if (sessionState === 'agenda_reveal' && agenda) {
    const uniqueTopicCount = new Set(agenda.items.map((i) => i.topic.id)).size;
    const totalCards = agenda.items.reduce((sum, i) => sum + (i.contentTypes?.length ?? 0), 0);
    const minutes = forcedMinutes ?? agenda.totalMinutes;
    const sanitizedFocusNote = (agenda.focusNote || '')
      .replace(/deep_dive/gi, 'deep dive')
      .replace(/_/g, ' ')
      .trim();
    const title = sanitizedFocusNote.length > 0 ? sanitizedFocusNote : 'Your session is ready';
    const modeChip =
      /\bdeep dive\b/i.test(sanitizedFocusNote) || agenda.mode === 'deep'
        ? {
            label: 'DEEP',
            bg: `${n.colors.error}22`,
            border: `${n.colors.error}55`,
            fg: n.colors.error,
          }
        : agenda.mode === 'sprint'
          ? {
              label: 'SPRINT',
              bg: `${n.colors.warning}22`,
              border: `${n.colors.warning}55`,
              fg: n.colors.warning,
            }
          : {
              label: 'STUDY',
              bg: `${n.colors.success}22`,
              border: `${n.colors.success}55`,
              fg: n.colors.success,
            };

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ScrollView
          contentContainerStyle={styles.revealScroll}
          showsVerticalScrollIndicator={false}
        >
          <ResponsiveContainer style={styles.revealContainer} testID="session-agenda-reveal">
            {/* Header */}
            <View style={styles.revealHeader}>
              <Ionicons name="sparkles" size={40} color={n.colors.accent} />
              <View style={styles.revealHeaderText}>
                <View style={styles.revealTitleRow}>
                  <LinearText variant="title" style={styles.revealFocus}>
                    {title}
                  </LinearText>
                  <View
                    style={[
                      styles.revealModeChip,
                      { backgroundColor: modeChip.bg, borderColor: modeChip.border },
                    ]}
                  >
                    <LinearText
                      variant="chip"
                      style={[styles.revealModeChipText, { color: modeChip.fg }]}
                    >
                      {modeChip.label}
                    </LinearText>
                  </View>
                </View>
                <LinearText variant="bodySmall" tone="secondary" style={styles.revealMeta}>
                  {uniqueTopicCount} topics · {totalCards} cards · {minutes}m
                </LinearText>
              </View>
            </View>

            {/* Guru message */}
            <LinearSurface style={styles.revealGuruCard} padded={false}>
              <View style={styles.revealGuruHeader}>
                <LinearText variant="chip" tone="muted" style={styles.revealGuruLabel}>
                  GURU’S PLAN
                </LinearText>
              </View>
              <View style={styles.revealGuru}>
                <MarkdownRender content={agenda.guruMessage} compact />
              </View>
            </LinearSurface>

            {/* Topic list */}
            <LinearText variant="chip" tone="muted" style={styles.revealSectionLabel}>
              TOPICS
            </LinearText>
            <View style={styles.revealTopicList}>
              {agenda.items.map((i, idx) => {
                const topicColor = i.topic.subjectColor || n.colors.accent;
                return (
                  <LinearSurface
                    key={`${i.topic.id}-${idx}`}
                    style={[styles.revealTopic, { borderLeftColor: topicColor }]}
                  >
                    <View style={styles.revealTopicRow}>
                      <View style={[styles.revealInitial, { backgroundColor: `${topicColor}22` }]}>
                        <LinearText
                          variant="chip"
                          style={[styles.revealInitialText, { color: topicColor }]}
                        >
                          {idx + 1}
                        </LinearText>
                      </View>
                      <View style={styles.revealTopicInfo}>
                        <LinearText variant="label" style={styles.revealTopicName} truncate>
                          {i.topic.name}
                        </LinearText>
                        <View style={styles.revealTopicMeta}>
                          <LinearText variant="meta" tone="secondary" style={styles.revealTopicSub}>
                            {i.topic.subjectCode}
                          </LinearText>
                          {i.contentTypes?.length > 0 && (
                            <LinearText variant="meta" tone="muted" style={styles.revealTopicCards}>
                              {i.contentTypes.length} card{i.contentTypes.length !== 1 ? 's' : ''}
                            </LinearText>
                          )}
                        </View>
                      </View>
                    </View>
                  </LinearSurface>
                );
              })}
            </View>

            {/* Footer */}
            <View style={styles.revealLiveRow}>
              <View style={styles.revealLiveDot} />
              <LinearText variant="caption" tone="secondary" style={styles.revealSub}>
                Auto-starting…
              </LinearText>
            </View>
          </ResponsiveContainer>
        </ScrollView>
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
            try {
              navigation.popToTop();
            } catch {
              navigation.navigate('Home');
            }
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
        elapsedSeconds={activeElapsedSeconds}
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
    const nextItem = agenda?.items[currentItemIndex + 1];
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer style={styles.topicDoneContainer}>
          <IconCircle name="checkmark-circle" color={n.colors.success} size={64} />
          <LinearText variant="title" centered style={styles.topicDoneName}>
            {curItem?.topic.name}
          </LinearText>
          <View style={styles.topicDoneDivider} />
          <LinearText variant="body" tone="secondary" centered style={styles.topicDoneSub}>
            Topic complete! Taking a {profile?.breakDurationMinutes ?? 5}-min break...
          </LinearText>
          {nextItem && (
            <LinearText variant="caption" tone="muted" centered style={styles.topicDoneNext}>
              Up next: {nextItem.topic.name}
            </LinearText>
          )}
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
    <SafeAreaView style={styles.safe} testID="session-studying">
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer>
        <View style={styles.storyBarContainer}>
          <View style={[styles.storyBarFill, { width: `${timeProgressPercent}%` }]} />
        </View>

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.phaseRow}>
              <LinearBadge
                label={
                  isPaused
                    ? 'Paused'
                    : isOnBreak
                      ? 'Break'
                      : sessionState === 'studying'
                        ? 'Studying'
                        : 'Done'
                }
                variant={
                  isPaused
                    ? 'warning'
                    : isOnBreak
                      ? 'accent'
                      : sessionState === 'studying'
                        ? 'default'
                        : 'success'
                }
                style={styles.phaseBadge}
              />
              <LinearText variant="meta" tone="secondary" style={styles.topicProgress}>
                Topic {currentItemIndex + 1}/{agenda?.items.length ?? 0}
              </LinearText>
            </View>
            <LinearText
              variant="sectionTitle"
              style={styles.topicName}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {curItem.topic.name}
            </LinearText>
            <LinearText variant="caption" tone="accent" style={styles.subjectTag}>
              {curItem.topic.subjectCode}
            </LinearText>
            <LinearText variant="meta" tone="muted" style={styles.aiSourceLine}>
              {isLoadingContent
                ? 'AI · fetching card'
                : formatSessionModelLabel(currentContent?.modelUsed)}
            </LinearText>
          </View>
          <View style={styles.headerRight}>
            {isStudying && (
              <Animated.View style={[styles.guruDot, { transform: [{ scale: presencePulse }] }]} />
            )}
            <Pressable
              onPress={() => {
                const next = !isPaused;
                isManuallyPausedRef.current = next;
                setPaused(next);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              style={styles.headerIconButton}
              accessibilityRole="button"
              accessibilityLabel={isPaused ? 'Resume session' : 'Pause session'}
            >
              <Ionicons name={isPaused ? 'play' : 'pause'} size={18} color={n.colors.accent} />
            </Pressable>
            <Pressable
              onPress={() => setMenuVisible(true)}
              style={styles.headerIconButton}
              accessibilityRole="button"
              accessibilityLabel="Session menu"
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={n.colors.textSecondary} />
            </Pressable>
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
            <LinearSurface style={styles.menuDropdown} padded={false}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  handleMarkForReview();
                }}
              >
                <LinearText style={styles.menuItemEmoji}>🚩</LinearText>
                <LinearText variant="bodySmall" style={styles.menuItemText}>
                  Mark for Review
                </LinearText>
              </TouchableOpacity>
              <LinearDivider style={styles.menuDivider} />
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  handleDowngrade();
                }}
              >
                <LinearText style={styles.menuItemEmoji}>🆘</LinearText>
                <LinearText variant="bodySmall" style={styles.menuItemText}>
                  Downgrade to Sprint
                </LinearText>
              </TouchableOpacity>
              <LinearDivider style={styles.menuDivider} />
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  finishSession();
                }}
              >
                <LinearText style={styles.menuItemEmoji}>🚪</LinearText>
                <LinearText variant="bodySmall" tone="error" style={styles.menuItemText}>
                  End Session
                </LinearText>
              </TouchableOpacity>
            </LinearSurface>
          </View>
        )}

        {currentMessage && isStudying && !showPausedOverlay && (
          <Animated.View style={{ opacity: toastOpacity }}>
            <LinearSurface style={styles.guruToast} padded={false}>
              <LinearText variant="bodySmall" tone="accent" style={styles.guruToastText}>
                {currentMessage}
              </LinearText>
            </LinearSurface>
          </Animated.View>
        )}

        <View style={styles.tabRowWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            <View style={styles.contentTypeTabs}>
              {curItem.contentTypes.map((ct, idx) => {
                const isActive = idx === currentContentIndex;
                const isUnlocked = idx <= maxUnlockedContentIndex;
                return (
                  <TouchableOpacity
                    key={ct}
                    onPress={() => {
                      if (!isUnlocked || isActive) return;
                      jumpToContent(idx);
                    }}
                    disabled={!isUnlocked || isActive}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !isUnlocked, selected: isActive }}
                    style={[
                      styles.contentTab,
                      isActive && styles.contentTabActive,
                      !isActive && isUnlocked && styles.contentTabDone,
                      !isUnlocked && styles.contentTabLocked,
                    ]}
                  >
                    <LinearText variant="chip" style={styles.contentTabText}>
                      {CONTENT_TYPE_LABELS[ct]}
                    </LinearText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          <LinearText variant="meta" tone="muted" style={styles.cardCountText}>
            {currentContentIndex + 1}/{curItem.contentTypes.length}
          </LinearText>
        </View>

        <View style={styles.contentArea} {...panHandlers}>
          {isLoadingContent ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <LoadingOrb message="Fetching content..." />
            </View>
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
            <LinearSurface style={styles.xpPopSurface} padded={false}>
              <LinearText variant="label" style={styles.xpPopText}>
                +{showXp} XP
              </LinearText>
            </LinearSurface>
          </Animated.View>
        </View>

        {showPausedOverlay && (
          <View style={styles.pausedOverlay}>
            <LinearSurface style={styles.pausedContent}>
              <Ionicons
                name="pause-circle"
                size={64}
                color={n.colors.accent}
                style={{ marginBottom: 16 }}
              />
              <LinearText variant="title" centered style={styles.pausedText}>
                Study Session Paused
              </LinearText>
              <LinearText variant="body" tone="secondary" centered style={styles.pausedSubText}>
                Keep the momentum going, Doctor!{'\n'}Ready to dive back in?
              </LinearText>
              <View style={styles.pausedActions}>
                <LinearButton
                  label="Resume Studying"
                  variant="primary"
                  style={styles.resumeOverlayBtn}
                  onPress={() => {
                    isManuallyPausedRef.current = false;
                    setPaused(false);
                  }}
                  leftIcon={<Ionicons name="play" size={18} color={n.colors.textInverse} />}
                />
                <LinearButton
                  label="End Session"
                  variant="glassTinted"
                  style={[styles.resumeOverlayBtn, styles.endBtn]}
                  textStyle={styles.resumeOverlayBtnText}
                  onPress={() => {
                    Alert.alert(
                      'End Session?',
                      'This will finalize your current study session and award XP.',
                      [
                        { text: 'Keep Studying', style: 'cancel' },
                        {
                          text: 'End Session',
                          style: 'destructive',
                          onPress: () => {
                            finishSession();
                          },
                        },
                      ],
                    );
                  }}
                  leftIcon={<Ionicons name="stop" size={18} color={n.colors.textPrimary} />}
                />
              </View>
            </LinearSurface>
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
  mood: _mood,
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
  const { fade, slide } = useEntranceAnimation();
  const pct = answeredTotal > 0 ? Math.round((correctTotal / answeredTotal) * 100) : 0;
  const scoreColor =
    pct >= 70 ? theme.colors.success : pct >= 40 ? theme.colors.warning : theme.colors.error;
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <Animated.View
        style={[styles.doneContainer, { opacity: fade, transform: [{ translateY: slide }] }]}
      >
        <IconCircle name="flash" color={theme.colors.accentAlt} size={64} />
        <LinearText variant="title" centered style={styles.doneTitle}>
          Nice work, Doctor.
        </LinearText>
        {answeredTotal > 0 ? (
          <LinearSurface style={styles.warmupScoreCard}>
            <LinearText
              variant="display"
              centered
              style={[styles.warmupScoreNumber, { color: scoreColor }]}
            >
              {pct}%
            </LinearText>
            <LinearText
              variant="bodySmall"
              tone="secondary"
              centered
              style={styles.warmupScoreFraction}
            >
              {correctTotal}/{answeredTotal} correct
            </LinearText>
          </LinearSurface>
        ) : (
          <LinearText variant="body" tone="secondary" centered style={styles.doneStat}>
            Session complete
          </LinearText>
        )}
        <LinearText
          variant="body"
          tone="secondary"
          centered
          style={[styles.doneStat, { marginBottom: 24 }]}
        >
          What&apos;s next?
        </LinearText>
        <LinearButton
          label="Watch a lecture"
          variant="primary"
          style={styles.doneBtn}
          onPress={onLecture}
          leftIcon={<Ionicons name="videocam-outline" size={18} color={n.colors.textInverse} />}
        />
        <LinearButton
          label="50 MCQ Block"
          variant="glass"
          style={styles.doneSecondaryBtn}
          textStyle={styles.doneSecondaryBtnText}
          onPress={onMCQBlock}
          leftIcon={<Ionicons name="list-outline" size={18} color={n.colors.textPrimary} />}
        />
        <LinearButton
          label="Continue studying"
          variant="glass"
          style={styles.doneSecondaryBtn}
          textStyle={styles.doneSecondaryBtnText}
          onPress={onContinue}
          leftIcon={<Ionicons name="book-outline" size={18} color={n.colors.textPrimary} />}
        />
        <TouchableOpacity style={styles.leaveBtn} onPress={onDone}>
          <View style={styles.btnRow}>
            <Ionicons name="hand-left-outline" size={14} color={theme.colors.textMuted} />
            <LinearText variant="bodySmall" tone="muted" style={styles.leaveBtnText}>
              That&apos;s enough for now
            </LinearText>
          </View>
        </TouchableOpacity>
      </Animated.View>
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
  const { fade, slide } = useEntranceAnimation();
  const mins = Math.round(elapsedSeconds / 60);
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <Animated.View
        style={[styles.doneContainer, { opacity: fade, transform: [{ translateY: slide }] }]}
        testID="session-done"
      >
        <IconCircle name="trophy" color={theme.colors.accentAlt} size={64} />
        <LinearText variant="title" centered style={styles.doneTitle}>
          Session Complete!
        </LinearText>
        <LinearSurface style={styles.summaryCard} padded={false}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Ionicons
                name="book-outline"
                size={18}
                color={theme.colors.textMuted}
                style={{ marginBottom: 4 }}
              />
              <LinearText variant="display" centered style={styles.summaryValue}>
                {completedCount}
              </LinearText>
              <LinearText variant="caption" tone="secondary" centered style={styles.summaryLabel}>
                Topics
              </LinearText>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Ionicons
                name="time-outline"
                size={18}
                color={theme.colors.textMuted}
                style={{ marginBottom: 4 }}
              />
              <LinearText variant="display" centered style={styles.summaryValue}>
                {mins}
              </LinearText>
              <LinearText variant="caption" tone="secondary" centered style={styles.summaryLabel}>
                Minutes
              </LinearText>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Ionicons
                name="star-outline"
                size={18}
                color={theme.colors.accentAlt}
                style={{ marginBottom: 4 }}
              />
              <LinearText
                variant="display"
                centered
                style={[styles.summaryValue, { color: theme.colors.accentAlt }]}
              >
                +{xpTotal}
              </LinearText>
              <LinearText variant="caption" tone="secondary" centered style={styles.summaryLabel}>
                XP
              </LinearText>
            </View>
          </View>
        </LinearSurface>
        <LinearButton
          label="Back to Home"
          variant="primary"
          style={styles.doneBtn}
          onPress={onClose}
          testID="back-to-home-btn"
        />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  contentArea: { flex: 1, minHeight: 0 },
  storyBarContainer: { height: 3, backgroundColor: n.colors.border },
  storyBarFill: { height: '100%', backgroundColor: n.colors.accent, borderRadius: 0 },
  topicProgressSection: { paddingHorizontal: n.spacing.lg, marginBottom: 8 },
  topicProgressLabel: {
    color: n.colors.textMuted,
    fontSize: 11,
    textAlign: 'right',
    marginBottom: 4,
  },
  topicProgressTrack: {
    height: 3,
    backgroundColor: n.colors.border,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  topicProgressFill: { height: '100%', backgroundColor: n.colors.accent, borderRadius: 1.5 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: n.spacing.lg,
    paddingVertical: 10,
  },
  headerLeft: { flex: 1, minWidth: 0, marginRight: 12 },
  headerRight: { flexDirection: 'row', alignItems: 'center', paddingTop: 4 },
  topicProgress: { color: n.colors.textSecondary, fontSize: 11, marginBottom: 2 },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  phaseBadge: { marginRight: 2 },
  topicName: { color: n.colors.textPrimary, fontSize: 18, lineHeight: 24, fontWeight: '800' },
  subjectTag: { color: n.colors.accent, fontSize: 12, marginTop: 2 },
  aiSourceLine: {
    color: n.colors.textMuted,
    fontSize: 11,
    marginTop: 6,
    fontWeight: '600',
    lineHeight: 15,
  },
  headerIconButton: {
    backgroundColor: n.colors.card,
    borderRadius: n.radius.md,
    borderWidth: 1,
    borderColor: n.colors.border,
    marginLeft: 6,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 },
  menuBackdrop: { flex: 1 },
  menuDropdown: {
    position: 'absolute',
    top: 60,
    right: 16,
    borderRadius: n.radius.md,
    paddingVertical: 4,
    minWidth: 200,
    backgroundColor: n.colors.card,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: n.spacing.lg,
    paddingVertical: 12,
  },
  menuItemEmoji: { fontSize: 16, marginRight: 10 },
  menuItemText: { color: n.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  menuDivider: { height: 1, backgroundColor: n.colors.border, marginHorizontal: 12 },
  contentTypeTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: n.spacing.lg,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: n.colors.background,
  },
  contentTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: n.colors.border,
    borderWidth: 1,
    borderColor: n.colors.borderHighlight,
  },
  contentTabActive: { backgroundColor: n.colors.accent, borderColor: n.colors.accent },
  contentTabDone: {
    backgroundColor: n.colors.successSurface,
    borderColor: `${n.colors.success}33`,
  },
  contentTabLocked: {
    opacity: 0.55,
  },
  contentTabText: { color: n.colors.textPrimary, fontSize: 12, fontWeight: '600' },
  revealScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  revealContainer: {
    padding: n.spacing.xl,
  },
  revealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  revealHeaderText: {
    flex: 1,
  },
  revealTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  revealFocus: {
    flex: 1,
  },
  revealMeta: {
    marginTop: 4,
  },
  revealModeChip: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 2,
  },
  revealModeChipText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  revealGuruCard: {
    borderRadius: n.radius.md,
    padding: n.spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: n.colors.accent,
    width: '100%',
    marginBottom: 20,
  },
  revealGuruHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  revealGuruLabel: {
    letterSpacing: 1,
  },
  revealGuru: {
    alignSelf: 'stretch',
  },
  revealSectionLabel: {
    letterSpacing: 1,
    marginBottom: 10,
  },
  revealTopicList: { width: '100%', marginBottom: 20 },
  revealTopic: {
    borderRadius: n.radius.sm,
    borderLeftWidth: 3,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  revealTopicRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  revealInitial: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  revealInitialText: { fontSize: 13, fontWeight: '800' },
  revealTopicInfo: { flex: 1 },
  revealTopicName: {},
  revealTopicMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  revealTopicSub: {},
  revealTopicCards: {},
  revealLiveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  revealLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: n.colors.success,
  },
  revealSub: {},
  topicDoneContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: n.spacing.xl,
  },
  topicDoneName: {
    marginTop: n.spacing.lg,
    marginBottom: 12,
    paddingHorizontal: n.spacing.md,
  },
  topicDoneDivider: {
    width: 40,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: n.colors.success,
    marginBottom: 12,
  },
  topicDoneSub: {},
  topicDoneNext: {
    marginTop: 16,
    fontStyle: 'italic',
  },
  xpPop: {
    position: 'absolute',
    top: 16,
    right: n.spacing.xl,
  },
  xpPopSurface: {
    borderRadius: n.radius.full,
    paddingHorizontal: n.spacing.lg,
    paddingVertical: 8,
    borderColor: `${n.colors.accent}55`,
  },
  xpPopText: { color: n.colors.textPrimary, fontWeight: '900', fontSize: 18 },
  doneContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: n.spacing.xl,
  },
  doneTitle: {
    color: n.colors.textPrimary,
    marginTop: n.spacing.lg,
    marginBottom: n.spacing.xl,
    textAlign: 'center',
  },
  summaryCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: n.spacing.xl,
    width: '100%',
    borderWidth: 1,
    borderColor: n.colors.border,
    backgroundColor: n.colors.card,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center' },
  summaryValue: { color: n.colors.textPrimary, fontSize: 28, fontWeight: '900' },
  summaryLabel: { color: n.colors.textSecondary, fontSize: 12, marginTop: 4 },
  summaryDivider: { width: 1, height: 40, backgroundColor: n.colors.border },
  doneStat: {
    marginBottom: n.spacing.xl,
    textAlign: 'center',
  },
  doneBtn: {
    backgroundColor: n.colors.accent,
    borderRadius: 16,
    paddingHorizontal: 40,
    paddingVertical: n.spacing.lg,
  },
  doneBtnText: {
    color: theme.colors.textPrimary,
    fontWeight: '800',
    fontSize: 18,
    lineHeight: 24,
    includeFontPadding: false,
  },
  doneSecondaryBtn: {
    borderRadius: 16,
    paddingHorizontal: 40,
    paddingVertical: n.spacing.lg,
    marginTop: 12,
    borderWidth: 1,
    borderColor: n.colors.border,
    width: '100%',
    alignItems: 'center',
  },
  doneSecondaryBtnText: {
    color: n.colors.textPrimary,
  },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warmupScoreCard: {
    alignItems: 'center',
    marginBottom: 16,
    borderRadius: n.radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  warmupScoreNumber: { fontSize: 42, fontWeight: '900' },
  warmupScoreFraction: {
    marginTop: 4,
  },
  planningContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: n.colors.background,
  },
  planningSubtext: { color: n.colors.textMuted, fontSize: 12, marginTop: 8 },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: n.spacing.xl,
  },
  errorTitle: {
    color: n.colors.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  errorMsgCard: {
    backgroundColor: n.colors.errorSurface,
    borderRadius: n.radius.md,
    borderTopWidth: 3,
    borderTopColor: n.colors.error,
    padding: n.spacing.lg,
    width: '100%',
    marginBottom: 24,
  },
  errorMsg: {
    lineHeight: 20,
  },
  retryBtn: {
    backgroundColor: n.colors.accent,
    borderRadius: 14,
    paddingHorizontal: 40,
    paddingVertical: 14,
    marginBottom: 10,
    width: '100%',
    alignItems: 'center',
  },
  retryBtnText: { color: n.colors.textInverse, fontWeight: '800', fontSize: 16 },
  manualBtn: {
    borderRadius: 14,
    paddingHorizontal: 40,
    paddingVertical: 14,
    marginBottom: 10,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  manualBtnText: { color: n.colors.textPrimary, fontWeight: '800', fontSize: 16 },
  leaveBtn: { paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  leaveBtnText: { color: n.colors.textMuted, fontSize: 14 },
  guruDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: n.colors.accent,
    shadowColor: n.colors.accent,
    shadowRadius: 6,
    shadowOpacity: 0.9,
    elevation: 4,
    marginRight: 6,
  },
  guruToast: {
    position: 'absolute',
    top: 130,
    left: n.spacing.lg,
    right: n.spacing.lg,
    borderRadius: 12,
    padding: 12,
    zIndex: 50,
  },
  guruToastText: {},
  pausedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  pausedContent: {
    alignItems: 'center',
    paddingHorizontal: 32,
    width: '100%',
    maxWidth: 420,
  },
  pausedText: {
    marginBottom: 12,
    textAlign: 'center',
  },
  pausedSubText: {
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  pausedActions: {
    flexDirection: 'row',
    gap: 16,
  },
  resumeOverlayBtn: {
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: n.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 140,
    justifyContent: 'center',
  },
  resumeBtn: {
    backgroundColor: n.colors.accent,
  },
  endBtn: {
    backgroundColor: n.colors.error,
  },
  resumeOverlayBtnText: { color: n.colors.textInverse, fontWeight: '700', fontSize: 16 },
  tabRowWrapper: { flexDirection: 'row', alignItems: 'center', flexGrow: 0, flexShrink: 0 },
  cardCountText: {
    paddingHorizontal: 10,
    fontVariant: ['tabular-nums'],
  },
});
