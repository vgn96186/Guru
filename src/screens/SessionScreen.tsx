import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, BackHandler, Alert, Animated, AppState
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useFaceTracking } from '../hooks/useFaceTracking';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { HomeStackParamList } from '../navigation/types';
import { useSessionStore, getCurrentAgendaItem, getCurrentContentType } from '../store/useSessionStore';
import { useAppStore } from '../store/useAppStore';
import { buildSession, buildPYQSprint } from '../services/sessionPlanner';
import { fetchContent, prefetchTopicContent } from '../services/aiService';
import { sendImmediateNag } from '../services/notificationService';
import { createSession, endSession } from '../db/queries/sessions';
import { updateTopicProgress } from '../db/queries/topics';
import { checkinToday, getDailyLog, updateStreak } from '../db/queries/progress';
import { getBrainDumps } from '../db/queries/brainDumps';
import { calculateAndAwardSessionXp, type SessionXpResult } from '../services/xpService';
import LoadingOrb from '../components/LoadingOrb';
import ContentCard from './ContentCard';
import BreakScreen from './BreakScreen';
import FocusAudioPlayer from '../components/FocusAudioPlayer';
import VisualTimer from '../components/VisualTimer';
import BrainDumpFab from '../components/BrainDumpFab';
import type { Mood, SessionMode } from '../types';
import { XP_REWARDS } from '../constants/gamification';
import { useIdleTimer } from '../hooks/useIdleTimer';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Session'>;
type Route = RouteProp<HomeStackParamList, 'Session'>;

export default function SessionScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { mood, mode: forcedMode } = route.params as { mood: Mood; mode?: SessionMode };

  const store = useSessionStore();
  const profile = useAppStore(s => s.profile);
  const refreshProfile = useAppStore(s => s.refreshProfile);

  const [elapsedSeconds, setElapsedSeconds] = useState(0); // This will now represent total time in session (active + paused)
  const [activeElapsedSeconds, setActiveElapsedSeconds] = useState(0); // This is the time actually counted
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const xpAnim = useRef(new Animated.Value(0)).current;
  const [showXp, setShowXp] = useState(0);
  const [aiError, setAiError] = useState<string | null>(null);
  const [sessionXpResult, setSessionXpResult] = useState<SessionXpResult | null>(null);
  const [streakUpdated, setStreakUpdated] = useState(false);
  const agendaRevealTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // PYQ Sprint score tracking (cumulative across all topics)
  const sprintCorrectRef = useRef(0);
  const sprintTotalRef = useRef(0);
  const [sprintResult, setSprintResult] = useState<{ correct: number; total: number } | null>(null);

  const idleTimeout = 1 * 60 * 1000; // 1 minute of inactivity

  const { panResponder } = useIdleTimer({
    timeout: idleTimeout,
    onIdle: () => {
      if (store.sessionState === 'studying' && !store.isOnBreak && !store.isPaused) {
        store.setPaused(true);
        sendImmediateNag("Are you there, Doctor?", "Your study session is paused due to inactivity. Tap to resume!");
      }
    },
    onActive: () => {
      if (store.isPaused) {
        store.setPaused(false);
      }
    },
    disabled: store.sessionState !== 'studying' || store.isOnBreak,
  });

  // ── Face Tracking ─────────────────────────────────────────────
  const faceTrackingEnabled = profile?.faceTrackingEnabled ?? false;
  const { hasPermission, requestPermission } = useCameraPermission();
  const frontCamera = useCameraDevice('front');
  const isFaceTrackingActive = faceTrackingEnabled &&
    hasPermission &&
    !!frontCamera &&
    store.sessionState === 'studying' &&
    !store.isOnBreak &&
    !store.isPaused;

  // Request camera permission when face tracking is first enabled
  useEffect(() => {
    if (faceTrackingEnabled && !hasPermission) {
      requestPermission();
    }
  }, [faceTrackingEnabled]);

  const { focusState, frameProcessor } = useFaceTracking({
    onAbsent: useCallback(() => {
      if (store.sessionState === 'studying' && !store.isOnBreak && !store.isPaused) {
        store.setPaused(true);
        sendImmediateNag("Where are you, Doctor? 👀", "Your session is paused — face not detected. Come back!");
      }
    }, [store.sessionState, store.isOnBreak, store.isPaused]),
    onDrowsy: useCallback(() => {
      if (store.sessionState === 'studying' && !store.isPaused) {
        Alert.alert('😴 Drowsy Alert', "You look sleepy, Doctor. Take a quick 2-min break or splash water on your face!", [
          { text: 'I\'m Fine', style: 'cancel' },
          { text: 'Take a Break', onPress: () => store.startBreak(120) },
        ]);
      }
    }, [store.sessionState, store.isPaused]),
    onDistracted: useCallback(() => {
      if (store.sessionState === 'studying' && !store.isPaused) {
        sendImmediateNag("Eyes on the screen! 📱", "You've been looking away. Stay focused, Doctor!");
      }
    }, [store.sessionState, store.isPaused]),
    onFocused: useCallback(() => {
      // Auto-resume if paused by face tracking
      if (store.isPaused) store.setPaused(false);
    }, [store.isPaused]),
  });

  // Block hardware back during session
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert('Leave session?', 'Your progress will be saved.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: finishSession },
      ]);
      return true;
    });
    return () => handler.remove();
  }, []);

  // Strict Mode: Monitor leaving app
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/active/) &&
        nextAppState.match(/inactive|background/) &&
        store.sessionState === 'studying' &&
        profile?.strictModeEnabled
      ) {
        sendImmediateNag("COME BACK! 😡", "Your session is still running. Don't break the flow!");
      }
      appState.current = nextAppState;
    });
    return () => subscription.remove();
  }, [store.sessionState, profile?.strictModeEnabled]);

  // Start planning on mount
  useEffect(() => {
    store.resetSession();
    startPlanning();
  }, []); // Only run once on mount

  // Timer loop
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsedSeconds(s => s + 1); // Total time since session started
      if (!store.isPaused) {
        setActiveElapsedSeconds(s => s + 1);
      }
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [store.isPaused]); // Adjust timer when pause state changes

  // Break countdown
  useEffect(() => {
    if (!store.isOnBreak) return;
    const t = setInterval(() => store.tickBreak(), 1000);
    return () => clearInterval(t);
  }, [store.isOnBreak]);

  // Load content when state changes to 'studying'
  useEffect(() => {
    if (store.sessionState !== 'studying') return;
    const item = getCurrentAgendaItem(store);
    const contentType = getCurrentContentType(store);
    if (!item || !contentType || !profile?.openrouterApiKey) return;
    if (store.currentContent !== null) return; // already loaded

    setAiError(null);
    store.setLoadingContent(true);
    fetchContent(item.topic, contentType, profile.openrouterApiKey)
      .then(content => {
        store.setCurrentContent(content);
        store.setLoadingContent(false);
      })
      .catch((e) => {
        store.setLoadingContent(false);
        setAiError(e?.message ?? 'AI content failed to load');
      });
  }, [store.sessionState, store.currentItemIndex, store.currentContentIndex]);

  // Prefetch next topic when on first content of current topic
  useEffect(() => {
    if (!store.agenda || !profile?.openrouterApiKey) return;
    const nextItem = store.agenda.items[store.currentItemIndex + 1];
    if (!nextItem) return;
    prefetchTopicContent(nextItem.topic, nextItem.contentTypes, profile.openrouterApiKey);
  }, [store.currentItemIndex]);

  async function startPlanning() {
    if (!profile?.openrouterApiKey) return;
    setAiError(null);
    store.setSessionState('planning');

    try {
      let agenda;
      if (forcedMode === 'sprint') {
        agenda = buildPYQSprint();
        sprintCorrectRef.current = 0;
        sprintTotalRef.current = 0;
      } else {
        const dailyAvailability = useAppStore.getState().dailyAvailability;
        const baseLength = dailyAvailability && dailyAvailability > 0 ? dailyAvailability : (profile.preferredSessionLength ?? 45);
        agenda = await buildSession(mood, baseLength, profile.openrouterApiKey);
      }
      const sessionId = createSession(agenda.items.map(i => i.topic.id), mood, agenda.mode);
      store.setSessionId(sessionId);
      store.setAgenda(agenda);
      store.setSessionState('agenda_reveal');

      // Auto-advance agenda reveal after 4s (but user can tap to skip)
      agendaRevealTimeout.current = setTimeout(() => {
        store.setSessionState('studying');
      }, 4000);
    } catch (e: any) {
      setAiError(e?.message ?? 'Could not plan session');
    }
  }

  function handleContentDone() {
    const item = getCurrentAgendaItem(store);
    const contentType = getCurrentContentType(store);
    if (!item || !contentType) return;

    // If more content types for this topic
    if (store.currentContentIndex < item.contentTypes.length - 1) {
      store.nextContent();
    } else {
      // Topic done — take a break or move to next
      store.markTopicComplete();
      const isLast = store.currentItemIndex >= (store.agenda?.items.length ?? 1) - 1;
      if (isLast) {
        store.nextTopic(); // triggers session_done
      } else if (forcedMode === 'sprint') {
        // Sprint mode: no breaks, go directly to next topic
        store.nextTopic();
        store.setSessionState('studying');
      } else {
        store.startBreak(300); // 5-min active break
      }
    }
  }

  function handleBreakDone() {
    store.endBreak();
    store.nextTopic();
    store.setSessionState('studying');
  }

  function handleConfidenceRating(confidence: number) {
    const item = getCurrentAgendaItem(store);
    if (!item) return;
    const status = confidence >= 4 ? 'mastered' : confidence >= 2 ? 'reviewed' : 'seen';
    const xp = item.topic.progress.status === 'unseen' ? XP_REWARDS.TOPIC_UNSEEN : XP_REWARDS.TOPIC_REVIEW;

    // Write progress to DB without XP. XP is now handled exclusively at session end to avoid double-counting.
    updateTopicProgress(item.topic.id, status, confidence);

    // Show XP pop
    setShowXp(xp);
    Animated.sequence([
      Animated.timing(xpAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(800),
      Animated.timing(xpAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();

    handleContentDone();
  }

  function handleDowngrade() {
    Alert.alert(
      'Having a tough time?',
      'It happens. We can switch to "Sprint Mode" — shorter, easier content to help you finish.',
      [
        { text: 'Keep Pushing', style: 'cancel' },
        {
          text: 'Downgrade Session',
          style: 'default',
          onPress: () => {
            store.downgradeSession();
            // Reload content for current item if needed
            store.setLoadingContent(true);
            store.setCurrentContent(null);
            // Trigger effect to reload
            const item = getCurrentAgendaItem(store);
            const contentType = getCurrentContentType(store);
            if (item && contentType && profile?.openrouterApiKey) {
              fetchContent(item.topic, contentType, profile.openrouterApiKey)
                .then(c => {
                  store.setCurrentContent(c);
                  store.setLoadingContent(false);
                })
                .catch(() => store.setLoadingContent(false));
            }
          }
        }
      ]
    );
  }

  async function finishSession() {
    if (timerRef.current) clearInterval(timerRef.current);

    const { sessionId, completedTopicIds, quizResults, agenda, startedAt } = store;
    if (!sessionId) { navigation.goBack(); return; }

    const durationMin = Math.round(activeElapsedSeconds / 60);
    const completedTopics = (agenda?.items ?? [])
      .filter(i => completedTopicIds.includes(i.topic.id))
      .map(i => i.topic);

    const isFirstToday = (getDailyLog()?.sessionCount ?? 0) === 0;
    const xpResult = calculateAndAwardSessionXp(completedTopics, quizResults, isFirstToday);
    setSessionXpResult(xpResult);

    const didStreakUpdate = durationMin >= 20;
    setStreakUpdated(didStreakUpdate);
    endSession(sessionId, completedTopicIds, xpResult.total, durationMin);
    updateStreak(didStreakUpdate);
    refreshProfile();

    // Capture sprint score before transitioning to session_done
    if (forcedMode === 'sprint') {
      setSprintResult({ correct: sprintCorrectRef.current, total: sprintTotalRef.current });
    }

    store.setSessionState('session_done');
  }

  // ── Render states ─────────────────────────────────────────────

  // AI error state — show retry/skip UI
  if (aiError) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitle}>AI Unavailable</Text>
          <Text style={styles.errorMsg}>{aiError}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              setAiError(null);
              if (store.sessionState === 'planning' || !store.agenda) {
                startPlanning();
              } else {
                // Retry content load by clearing current content
                store.setCurrentContent(null);
              }
            }}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={() => {
              setAiError(null);
              if (!store.agenda) {
                navigation.goBack();
              } else {
                // Skip this content type and continue
                handleContentDone();
              }
            }}
          >
            <Text style={styles.skipBtnText}>Skip to Next</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.leaveBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.leaveBtnText}>Leave Session</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (store.sessionState === 'planning') {
    return (
      <SafeAreaView style={styles.safe}>
        <LoadingOrb message="Guru is planning your session..." />
      </SafeAreaView>
    );
  }

  if (store.sessionState === 'agenda_reveal' && store.agenda) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <TouchableOpacity
          style={styles.revealContainer}
          activeOpacity={1}
          onPress={() => {
            if (agendaRevealTimeout.current) clearTimeout(agendaRevealTimeout.current);
            store.setSessionState('studying');
          }}
        >
          <Text style={styles.revealEmoji}>🎯</Text>
          <Text style={styles.revealFocus}>{store.agenda.focusNote}</Text>
          <Text style={styles.revealGuru}>"{store.agenda.guruMessage}"</Text>
          <Text style={styles.revealSub}>Tap anywhere to begin...</Text>
          {store.agenda.items.map(item => (
            <View key={item.topic.id} style={styles.revealTopic}>
              <View style={[styles.revealDot, { backgroundColor: item.topic.subjectColor }]} />
              <Text style={styles.revealTopicName}>{item.topic.name}</Text>
              <Text style={styles.revealTopicSub}>{item.topic.subjectCode}</Text>
            </View>
          ))}
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (store.isOnBreak) {
    const item = getCurrentAgendaItem(store);
    return (
      <BreakScreen
        countdown={store.breakCountdown}
        topicId={item?.topic.id}
        apiKey={profile?.openrouterApiKey}
        onDone={handleBreakDone}
      />
    );
  }

  if (store.sessionState === 'session_done') {
    if (forcedMode === 'sprint' && sprintResult) {
      return <PYQDoneScreen
        correct={sprintResult.correct}
        total={sprintResult.total}
        topicsCount={store.completedTopicIds.length}
        elapsedSeconds={elapsedSeconds}
        onClose={() => {
          const dumps = getBrainDumps();
          if (dumps.length > 0) {
            (navigation as any).navigate('BrainDumpReview');
          } else {
            navigation.popToTop();
          }
        }}
      />;
    }
    return <SessionDoneScreen
      completedCount={store.completedTopicIds.length}
      elapsedSeconds={elapsedSeconds}
      xpResult={sessionXpResult}
      streakUpdated={streakUpdated}
      onClose={() => {
        const dumps = getBrainDumps();
        if (dumps.length > 0) {
          (navigation as any).navigate('BrainDumpReview');
        } else {
          navigation.popToTop();
        }
    }} />;
  }

  if (store.sessionState === 'topic_done') {
    // Brief "topic done" before break or next topic
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.topicDoneContainer}>
          <Text style={styles.topicDoneEmoji}>✅</Text>
          <Text style={styles.topicDoneName}>{getCurrentAgendaItem(store)?.topic.name}</Text>
          <Text style={styles.topicDoneSub}>Topic complete! Taking a 5-min break...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Main studying state
  const item = getCurrentAgendaItem(store);
  const contentType = getCurrentContentType(store);
  if (!item || !contentType) return null;

  const topicNum = store.currentItemIndex + 1;
  const totalTopics = store.agenda?.items.length ?? 1;
  const mins = Math.floor(activeElapsedSeconds / 60);
  const secs = activeElapsedSeconds % 60;

  // Paused Overlay (if not in a terminal state)
  const showPausedOverlay = store.isPaused && store.sessionState === 'studying' && !store.isOnBreak;

  return (
    <SafeAreaView style={styles.safe} {...panResponder.panHandlers}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.topicProgress}>Topic {topicNum}/{totalTopics}</Text>
          <Text style={styles.topicName}>{item.topic.name}</Text>
          <Text style={styles.subjectTag}>{item.topic.subjectCode}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.audioWrapper}>
            <FocusAudioPlayer />
          </View>
          <TouchableOpacity onPress={handleDowngrade} style={styles.sosBtn}>
            <Text style={styles.sosBtnText}>🆘</Text>
          </TouchableOpacity>
          {profile?.visualTimersEnabled ? (
            <View style={styles.visualTimerWrap}>
              <VisualTimer
                totalSeconds={Math.max(1, profile.preferredSessionLength * 60)}
                remainingSeconds={Math.max(0, profile.preferredSessionLength * 60 - activeElapsedSeconds)}
                size={52}
                strokeWidth={6}
              />
            </View>
          ) : (
            <Text style={styles.timer}>{mins}:{secs.toString().padStart(2, '0')}</Text>
          )}
          {faceTrackingEnabled && hasPermission && (
            <View style={[styles.focusDot, { backgroundColor: FOCUS_DOT_COLOR[focusState] }]} />
          )}
          <TouchableOpacity onPress={finishSession} style={styles.endBtn}>
            <Text style={styles.endBtnText}>End</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content tabs */}
      <View style={styles.contentTypeTabs}>
        {item.contentTypes.map((ct, idx) => (
          <View
            key={ct}
            style={[
              styles.contentTab,
              idx === store.currentContentIndex && styles.contentTabActive,
              idx < store.currentContentIndex && styles.contentTabDone,
            ]}
          >
            <Text style={styles.contentTabText}>{CONTENT_LABELS[ct]}</Text>
          </View>
        ))}
      </View>

      {/* Content */}
      {store.isLoadingContent ? (
        <LoadingOrb message="Fetching content..." />
      ) : store.currentContent ? (
        <ContentCard
          content={store.currentContent}
          onDone={handleConfidenceRating}
          onSkip={handleContentDone}
          timePerQuestion={forcedMode === 'sprint' ? 90 : undefined}
          onQuizComplete={(correct, total) => {
            sprintCorrectRef.current += correct;
            sprintTotalRef.current += total;
          }}
        />
      ) : (
        <LoadingOrb message="Loading..." />
      )}

      {/* XP pop animation */}
      <Animated.View
        style={[
          styles.xpPop,
          { opacity: xpAnim, transform: [{ translateY: xpAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }) }] },
        ]}
      >
        <Text style={styles.xpPopText}>+{showXp} XP</Text>
      </Animated.View>

      {showPausedOverlay && (
        <View style={styles.pausedOverlay}>
          <Text style={styles.pausedText}>Session Paused</Text>
          <Text style={styles.pausedSubText}>Are you still studying, Doctor?</Text>
          <TouchableOpacity style={styles.resumeOverlayBtn} onPress={() => store.setPaused(false)}>
            <Text style={styles.resumeOverlayBtnText}>Resume Session</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Hidden camera for face tracking — 1x1, invisible */}
      {isFaceTrackingActive && frontCamera && (
        <Camera
          style={styles.faceCamera}
          device={frontCamera}
          isActive={isFaceTrackingActive}
          frameProcessor={frameProcessor}
          pixelFormat="yuv"
        />
      )}

      <BrainDumpFab />
    </SafeAreaView>
  );
}

const FOCUS_DOT_COLOR: Record<string, string> = {
  focused: '#4CAF50',
  distracted: '#FF9800',
  drowsy: '#FF9800',
  absent: '#F44336',
};

const CONTENT_LABELS: Record<string, string> = {
  keypoints: 'Key Points', quiz: 'Quiz', story: 'Story',
  mnemonic: 'Mnemonic', teach_back: 'Teach', error_hunt: 'Hunt', detective: 'Case',
};

// ── Session Done Screen ───────────────────────────────────────────

interface SessionDoneProps {
  completedCount: number;
  elapsedSeconds: number;
  xpResult: SessionXpResult | null;
  streakUpdated: boolean;
  onClose: () => void;
}
function SessionDoneScreen({ completedCount, elapsedSeconds, xpResult, streakUpdated, onClose }: SessionDoneProps) {
  const mins = Math.round(elapsedSeconds / 60);
  const profile = useAppStore(s => s.profile);
  const levelInfo = useAppStore(s => s.levelInfo);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.doneContainer}>
        <Text style={styles.doneEmoji}>{xpResult?.leveledUp ? '🏆' : '🎉'}</Text>
        <Text style={styles.doneTitle}>
          {xpResult?.leveledUp ? 'Level Up!' : 'Session Complete!'}
        </Text>
        {xpResult?.leveledUp && (
          <Text style={styles.doneLevelUp}>
            You're now {xpResult.newLevelName}!
          </Text>
        )}
        <Text style={styles.doneStat}>
          {completedCount} topic{completedCount !== 1 ? 's' : ''} covered · {mins} min
        </Text>

        {/* Streak update */}
        {streakUpdated && profile && (
          <View style={styles.doneStreakBadge}>
            <Text style={styles.doneStreakText}>🔥 {profile.streakCurrent}-day streak!</Text>
          </View>
        )}

        {/* XP Breakdown */}
        {xpResult && xpResult.breakdown.length > 0 && (
          <View style={styles.xpBreakdownContainer}>
            <Text style={styles.xpBreakdownTitle}>XP Earned</Text>
            {xpResult.breakdown.map((item, i) => (
              <View key={i} style={styles.xpBreakdownRow}>
                <Text style={styles.xpBreakdownLabel} numberOfLines={1}>{item.label}</Text>
                <Text style={styles.xpBreakdownAmount}>+{item.amount}</Text>
              </View>
            ))}
            <View style={styles.xpBreakdownDivider} />
            <View style={styles.xpBreakdownRow}>
              <Text style={styles.xpBreakdownTotalLabel}>Total</Text>
              <Text style={styles.xpBreakdownTotal}>+{xpResult.total} XP</Text>
            </View>
          </View>
        )}

        {/* Level progress */}
        {levelInfo && (
          <View style={styles.doneLevelProgress}>
            <Text style={styles.doneLevelLabel}>Level {levelInfo.level} · {levelInfo.name}</Text>
            <View style={styles.doneLevelBarTrack}>
              <View style={[styles.doneLevelBarFill, { width: `${Math.round(levelInfo.progress * 100)}%` }]} />
            </View>
            <Text style={styles.doneLevelSub}>
              {Math.round(levelInfo.progress * 100)}% to next level
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
          <Text style={styles.doneBtnText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── PYQ Sprint Done Screen ────────────────────────────────────────

interface PYQDoneProps {
  correct: number;
  total: number;
  topicsCount: number;
  elapsedSeconds: number;
  onClose: () => void;
}
function PYQDoneScreen({ correct, total, topicsCount, elapsedSeconds, onClose }: PYQDoneProps) {
  const mins = Math.round(elapsedSeconds / 60);
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
  const grade = percent >= 80 ? '🏆 Excellent' : percent >= 60 ? '👍 Good' : percent >= 40 ? '📈 Improving' : '📚 Keep Practicing';
  const gradeColor = percent >= 80 ? '#4CAF50' : percent >= 60 ? '#8BC34A' : percent >= 40 ? '#FF9800' : '#F44336';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.doneContainer}>
        <Text style={styles.doneEmoji}>🎯</Text>
        <Text style={styles.doneTitle}>PYQ Sprint Done!</Text>

        {/* Big score */}
        <View style={pyqStyles.scoreBox}>
          <Text style={pyqStyles.scoreMain}>{correct}</Text>
          <Text style={pyqStyles.scoreSlash}>/{total}</Text>
        </View>
        <Text style={[pyqStyles.gradeText, { color: gradeColor }]}>{grade}</Text>

        {/* Stats row */}
        <View style={pyqStyles.statsRow}>
          <View style={pyqStyles.statItem}>
            <Text style={pyqStyles.statValue}>{percent}%</Text>
            <Text style={pyqStyles.statLabel}>Accuracy</Text>
          </View>
          <View style={pyqStyles.statDivider} />
          <View style={pyqStyles.statItem}>
            <Text style={pyqStyles.statValue}>{topicsCount}</Text>
            <Text style={pyqStyles.statLabel}>Topics</Text>
          </View>
          <View style={pyqStyles.statDivider} />
          <View style={pyqStyles.statItem}>
            <Text style={pyqStyles.statValue}>{mins}m</Text>
            <Text style={pyqStyles.statLabel}>Time</Text>
          </View>
        </View>

        {/* NEET-PG style mark breakdown */}
        <View style={pyqStyles.marksBox}>
          <Text style={pyqStyles.marksTitle}>NEET-PG Marks Estimate</Text>
          <View style={pyqStyles.marksRow}>
            <Text style={pyqStyles.marksLabel}>Correct  (+1 each)</Text>
            <Text style={[pyqStyles.marksValue, { color: '#4CAF50' }]}>+{correct}</Text>
          </View>
          <View style={pyqStyles.marksRow}>
            <Text style={pyqStyles.marksLabel}>Wrong  (−⅓ each)</Text>
            <Text style={[pyqStyles.marksValue, { color: '#F44336' }]}>−{((total - correct) * 0.33).toFixed(1)}</Text>
          </View>
          <View style={[pyqStyles.marksRow, pyqStyles.marksTotalRow]}>
            <Text style={pyqStyles.marksTotalLabel}>Net Score</Text>
            <Text style={[pyqStyles.marksTotalValue, { color: gradeColor }]}>
              {(correct - (total - correct) * 0.33).toFixed(1)}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
          <Text style={styles.doneBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const pyqStyles = StyleSheet.create({
  scoreBox: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 8 },
  scoreMain: { color: '#fff', fontWeight: '900', fontSize: 72, lineHeight: 80 },
  scoreSlash: { color: '#9E9E9E', fontWeight: '700', fontSize: 32, marginBottom: 12 },
  gradeText: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 24 },
  statsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A24', borderRadius: 16, padding: 16, marginBottom: 20, width: '100%' },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { color: '#fff', fontWeight: '800', fontSize: 22 },
  statLabel: { color: '#9E9E9E', fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: '#2A2A38' },
  marksBox: { backgroundColor: '#1A1A24', borderRadius: 16, padding: 16, width: '100%', marginBottom: 24 },
  marksTitle: { color: '#9E9E9E', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12 },
  marksRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  marksLabel: { color: '#E0E0E0', fontSize: 14 },
  marksValue: { fontWeight: '700', fontSize: 14 },
  marksTotalRow: { borderTopWidth: 1, borderTopColor: '#2A2A38', paddingTop: 8, marginTop: 4 },
  marksTotalLabel: { color: '#fff', fontWeight: '800', fontSize: 16 },
  marksTotalValue: { fontWeight: '900', fontSize: 18 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    paddingTop: 20,
    backgroundColor: '#1A1A24',
  },
  headerLeft: { flex: 1 },
  headerRight: { alignItems: 'flex-end', flexDirection: 'row' },
  audioWrapper: { marginRight: 12 },
  visualTimerWrap: { marginRight: 12 },
  topicProgress: { color: '#9E9E9E', fontSize: 11, marginBottom: 2 },
  topicName: { color: '#fff', fontWeight: '800', fontSize: 18 },
  subjectTag: { color: '#6C63FF', fontSize: 12, marginTop: 2 },
  timer: { color: '#4CAF50', fontWeight: '700', fontSize: 18, marginBottom: 4 },
  sosBtn: { marginRight: 12, padding: 4 },
  sosBtnText: { fontSize: 18 },
  endBtn: { backgroundColor: '#2A0A0A', borderRadius: 8, padding: 6, paddingHorizontal: 12 },
  endBtnText: { color: '#F44336', fontSize: 12, fontWeight: '600' },
  contentTypeTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: '#0F0F14',
  },
  contentTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#2A2A38',
    borderWidth: 1,
    borderColor: '#333',
  },
  contentTabActive: { backgroundColor: '#6C63FF', borderColor: '#6C63FF' },
  contentTabDone: { backgroundColor: '#1A2A1A', borderColor: '#4CAF5044' },
  contentTabText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  revealContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  revealEmoji: { fontSize: 48, marginBottom: 16 },
  revealFocus: { color: '#fff', fontWeight: '800', fontSize: 20, textAlign: 'center', marginBottom: 12 },
  revealGuru: { color: '#9E9E9E', fontSize: 15, fontStyle: 'italic', textAlign: 'center', marginBottom: 24 },
  revealSub: { color: '#555', fontSize: 13 },
  revealTopic: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  revealDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  revealTopicName: { color: '#fff', fontSize: 16, fontWeight: '600', marginRight: 8 },
  revealTopicSub: { color: '#9E9E9E', fontSize: 12 },
  topicDoneContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topicDoneEmoji: { fontSize: 64, marginBottom: 16 },
  topicDoneName: { color: '#fff', fontWeight: '800', fontSize: 20, marginBottom: 8 },
  topicDoneSub: { color: '#9E9E9E', fontSize: 14 },
  xpPop: { position: 'absolute', bottom: 100, right: 24, backgroundColor: '#6C63FF', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  xpPopText: { color: '#fff', fontWeight: '900', fontSize: 18 },
  doneContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24, paddingBottom: 60 },
  doneEmoji: { fontSize: 64, marginBottom: 16 },
  doneTitle: { color: '#fff', fontWeight: '900', fontSize: 28, marginBottom: 4 },
  doneLevelUp: { color: '#FFD700', fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  doneStat: { color: '#9E9E9E', fontSize: 16, marginBottom: 16 },
  doneStreakBadge: {
    backgroundColor: '#2A1A0A',
    borderWidth: 1,
    borderColor: '#FF980055',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 20,
  },
  doneStreakText: { color: '#FF9800', fontSize: 15, fontWeight: '700' },
  xpBreakdownContainer: {
    backgroundColor: '#1A1A24',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2A2A38',
  },
  xpBreakdownTitle: { color: '#9E9E9E', fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  xpBreakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  xpBreakdownLabel: { color: '#ccc', fontSize: 14, flex: 1, marginRight: 8 },
  xpBreakdownAmount: { color: '#6C63FF', fontSize: 14, fontWeight: '700' },
  xpBreakdownDivider: { height: 1, backgroundColor: '#2A2A38', marginVertical: 8 },
  xpBreakdownTotalLabel: { color: '#fff', fontSize: 16, fontWeight: '800' },
  xpBreakdownTotal: { color: '#6C63FF', fontSize: 18, fontWeight: '900' },
  doneLevelProgress: { width: '100%', marginBottom: 24 },
  doneLevelLabel: { color: '#9E9E9E', fontSize: 13, fontWeight: '600', marginBottom: 6, textAlign: 'center' },
  doneLevelBarTrack: { height: 8, backgroundColor: '#2A2A38', borderRadius: 4, overflow: 'hidden' },
  doneLevelBarFill: { height: '100%', backgroundColor: '#6C63FF', borderRadius: 4 },
  doneLevelSub: { color: '#555', fontSize: 11, textAlign: 'center', marginTop: 4 },
  doneBtn: { backgroundColor: '#6C63FF', borderRadius: 16, paddingHorizontal: 40, paddingVertical: 16 },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorEmoji: { fontSize: 48, marginBottom: 12 },
  errorTitle: { color: '#fff', fontWeight: '800', fontSize: 22, marginBottom: 8 },
  errorMsg: { color: '#9E9E9E', fontSize: 14, textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  retryBtn: { backgroundColor: '#6C63FF', borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14, marginBottom: 10, width: '100%', alignItems: 'center' },
  retryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  skipBtn: { backgroundColor: '#1A1A24', borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14, marginBottom: 10, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: '#FF9800' },
  skipBtnText: { color: '#FF9800', fontWeight: '700', fontSize: 16 },
  leaveBtn: { paddingVertical: 12 },
  leaveBtnText: { color: '#555', fontSize: 14 },

  faceCamera: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  focusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
    marginBottom: 4,
    alignSelf: 'center',
  },
  pausedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  pausedText: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 10 },
  pausedSubText: { color: '#9E9E9E', fontSize: 15, textAlign: 'center', marginBottom: 30 },
  resumeOverlayBtn: { backgroundColor: '#6C63FF', borderRadius: 16, paddingHorizontal: 40, paddingVertical: 16 },
  resumeOverlayBtnText: { color: '#fff', fontWeight: '800', fontSize: 18 },
});
