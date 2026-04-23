import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '../../store/useAppStore';
import {
  useSessionStore,
  getCurrentAgendaItem,
  getCurrentContentType,
} from '../../store/useSessionStore';
import { buildSession } from '../../services/sessionPlanner';
import { invalidatePlanCache } from '../../services/studyPlanner';
import { fetchContent, prefetchTopicContent } from '../../services/ai';
import { createSession, endSession, isSessionAlreadyFinalized } from '../../db/queries/sessions';
import { getCachedUnseenQuestionsForSessionFallback } from '../../db/queries/questionBank';
import { calculateAndAwardSessionXp } from '../../services/xpService';
import { updateTopicProgress } from '../../db/queries/topics';
import {
  flagTopicForReview,
  setContentFlagged,
  clearSpecificContentCache,
} from '../../db/queries/aiCache';
import { dailyLogRepository, profileRepository } from '../../db/repositories';
import { XP_REWARDS, STREAK_MIN_MINUTES } from '../../constants/gamification';
import { useProfileQuery, useRefreshProfile } from '../../hooks/queries/useProfile';
import { useGuruPresence } from '../../hooks/useGuruPresence';
import { useIdleTimer } from '../../hooks/useIdleTimer';
import { useAppStateTransition } from '../../hooks/useAppStateTransition';
import { sendImmediateNag } from '../../services/notificationService';
import { confirm, confirmDestructive, showDialog } from '../../components/dialogService';
import { showToast } from '../../components/Toast';
import { showError } from '../../components/dialogService';
import { motion } from '../../motion/presets';
import {
  buildCachedQuestionFallbackContent,
  deriveSessionProgressStatus,
} from '../../services/session/sessionFormatters';
import {
  CONTENT_AUTO_RETRY_DELAYS_MS,
  PLANNING_AUTO_RETRY_DELAYS_MS,
  SESSION_PREFETCH_LOOKAHEAD,
} from '../../services/session/sessionConstants';
import type { AgendaItem, Mood, SessionMode } from '../../types';

export interface UseSessionControllerProps {
  navigation: any;
  routeParams: {
    mood: Mood;
    resume?: boolean;
    mode?: SessionMode;
    forcedMinutes?: number;
    focusTopicId?: number;
    focusTopicIds?: number[];
    preferredActionType?: 'study' | 'review' | 'deep_dive';
  };
}

export function useSessionController({ navigation, routeParams }: UseSessionControllerProps) {
  const {
    mood,
    resume = false,
    mode: forcedMode,
    forcedMinutes,
    focusTopicId,
    focusTopicIds,
    preferredActionType,
  } = routeParams;

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
  const { data: profile } = useProfileQuery();
  const dailyAvailability = useAppStore((s) => s.dailyAvailability);
  const refreshProfile = useRefreshProfile();

  // UI State
  const [, setElapsedSeconds] = useState(0);
  const [activeElapsedSeconds, setActiveElapsedSeconds] = useState(0);
  const [aiError, setAiError] = useState<string | null>(null);
  const [contentRetryPending, setContentRetryPending] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [showXp, setShowXp] = useState(0);
  const [sessionXpTotal, setSessionXpTotal] = useState(0);
  const [planningOverlayVisible, setPlanningOverlayVisible] = useState(false);
  const planningOverlayTimerRef = useRef<number | null>(null);

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
  const currentTopic = agenda?.items?.[currentItemIndex]?.topic;
  const currentTopicName = currentTopic?.name ?? null;
  const currentTopicIdentity = currentTopic
    ? `${currentTopic.subjectName}::${currentTopic.id}`
    : null;

  const { currentMessage, presencePulse, toastOpacity, triggerEvent } = useGuruPresence({
    currentTopicIdentity,
    currentTopicName,
    allTopicNames: topicNames,
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
      void showError('Could not save session progress properly: ' + message);
      navigation.navigate('Home');
    } finally {
      finishSessionLockRef.current = false;
    }
  }, [navigation, refreshProfile, setSessionState]);

  useEffect(() => {
    if (sessionState === 'session_done') {
      void finishSession();
    }
  }, [sessionState, finishSession]);

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      void confirmDestructive('Leave session?', 'Your progress will be saved.', {
        confirmLabel: 'Leave',
        cancelLabel: 'Stay',
      }).then((ok) => {
        if (ok) finishSession();
      });
      return true;
    });
    return () => handler.remove();
  }, [finishSession]);

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
    if (planningOverlayTimerRef.current !== null) clearTimeout(planningOverlayTimerRef.current);
    planningOverlayTimerRef.current = +setTimeout(() => setPlanningOverlayVisible(true), 200);

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
        const agendaResult = await buildSession({
          mood,
          preferredMinutes: sessionLength,
          apiKey: profile?.openrouterApiKey ?? '',
          orKey: profile?.openrouterKey,
          groqKey: profile?.groqApiKey,
          options: { focusTopicId, focusTopicIds, preferredActionType, mode: forcedMode },
        });

        const sessId = await createSession(
          agendaResult.items.map((i) => i.topic.id),
          mood,
          agendaResult.mode,
        );

        setSessionId(sessId);
        if (agendaResult.items.length > 0) {
          void prefetchTopicContent(
            agendaResult.items[0].topic,
            agendaResult.items[0].contentTypes,
            'groq',
          );
        }
        setAgenda(agendaResult);
        if (planningOverlayTimerRef.current !== null) clearTimeout(planningOverlayTimerRef.current);
        planningOverlayTimerRef.current = null;
        setPlanningOverlayVisible(false);
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
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        setAiError(e instanceof Error ? e.message : 'Could not plan session');
        if (planningOverlayTimerRef.current !== null) clearTimeout(planningOverlayTimerRef.current);
        planningOverlayTimerRef.current = null;
        setPlanningOverlayVisible(false);
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

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

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
  }, [resume, resetSession, startPlanning, setSessionState]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
      const state = useSessionStore.getState();
      const isStudyingState =
        state.sessionState === 'studying' || state.sessionState === 'topic_done';
      if (!isPausedRef.current && !state.isOnBreak && !state.isLoadingContent && isStudyingState) {
        setActiveElapsedSeconds((prev) => prev + 1);
        incrementActiveStudyDuration(1);
      }
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [incrementActiveStudyDuration]);

  useEffect(() => {
    return () => {
      if (agendaRevealTimeoutRef.current) {
        clearTimeout(agendaRevealTimeoutRef.current);
        agendaRevealTimeoutRef.current = null;
      }
    };
  }, []);

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

    if (aiError) return;

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
        const useGroqFast = startIndex === 0 && i === 0 ? ('groq' as const) : undefined;
        void prefetchTopicContent(item.topic, item.contentTypes, useGroqFast);
      });
    },
    [agenda],
  );

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
          motion.to(xpAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.delay(800),
          motion.to(xpAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
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

      handleContentDone();
    },
    [xpAnim, triggerEvent, handleContentDone],
  );

  const handleDowngrade = useCallback(async () => {
    const ok = await confirm(
      'Having a tough time?',
      'We can switch to Sprint Mode — shorter, easier content.',
      {
        confirmLabel: 'Downgrade',
        cancelLabel: 'Keep Pushing',
      },
    );
    if (ok) {
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
                setAiError(e?.message ?? 'AI content failed');
              })
              .finally(() => {
                setLoadingContent(false);
              });
          });
      }
    }
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

  return {
    sessionState,
    agenda,
    currentItemIndex,
    currentContentIndex,
    maxUnlockedContentIndex,
    currentContent,
    isLoadingContent,
    completedTopicIds,
    quizResults,
    isOnBreak,
    breakCountdown,
    isPaused,
    setPaused,
    jumpToContent,
    addQuizResult,
    handleContentDone,
    handleConfidenceRating,
    handleDowngrade,
    handleMarkForReview,
    handleBreakDone,
    finishSession,
    startPlanning,
    handleContinueWithoutAi,
    aiError,
    setAiError,
    contentRetryPending,
    setContentRetryPending,
    contentRetryTimer,
    contentRetryCount,
    menuVisible,
    setMenuVisible,
    showXp,
    setShowXp,
    sessionXpTotal,
    setSessionXpTotal,
    planningOverlayVisible,
    activeElapsedSeconds,
    xpAnim,
    panHandlers,
    currentMessage,
    presencePulse,
    toastOpacity,
    isStudying,
    triggerEvent,
    isManuallyPausedRef,
    setCurrentContent,
    resetSession,
  };
}
