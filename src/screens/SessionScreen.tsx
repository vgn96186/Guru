import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, BackHandler, Alert, Animated, AppState
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { HomeStackParamList } from '../navigation/types';
import { useSessionStore, getCurrentAgendaItem, getCurrentContentType } from '../store/useSessionStore';
import { useAppStore } from '../store/useAppStore';
import { buildSession } from '../services/sessionPlanner';
import { fetchContent, prefetchTopicContent } from '../services/aiService';
import { sendImmediateNag } from '../services/notificationService';
import { createSession, endSession } from '../db/queries/sessions';
import { updateTopicProgress } from '../db/queries/topics';
import { checkinToday, getDailyLog, updateStreak } from '../db/queries/progress';
import { calculateAndAwardSessionXp } from '../services/xpService';
import LoadingOrb from '../components/LoadingOrb';
import ContentCard from './ContentCard';
import BreakScreen from './BreakScreen';
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
  const [showStruggle, setShowStruggle] = useState(false); // To show emergency button? No, just put it in header

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

    timerRef.current = setInterval(() => {
      setElapsedSeconds(s => s + 1); // Total time since session started
      if (!store.isPaused) {
        setActiveElapsedSeconds(s => s + 1);
      }
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [store.isPaused]); // Re-run effect if paused state changes to adjust timer

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
    fetchContent(item.topic, contentType, profile.openrouterApiKey, profile.openrouterKey || undefined)
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
    prefetchTopicContent(nextItem.topic, nextItem.contentTypes, profile.openrouterApiKey, profile.openrouterKey || undefined);
  }, [store.currentItemIndex]);

  async function startPlanning() {
    if (!profile?.openrouterApiKey) return;
    setAiError(null);
    store.setSessionState('planning');

    try {
      const sessionLength = forcedMode === 'sprint' ? 10 : (profile.preferredSessionLength ?? 45);
      const agenda = await buildSession(mood, sessionLength, profile.openrouterApiKey, profile.openrouterKey || undefined);
      const sessionId = createSession(agenda.items.map(i => i.topic.id), mood, agenda.mode);
      store.setSessionId(sessionId);
      store.setAgenda(agenda);
      store.setSessionState('agenda_reveal');

      // Auto-advance agenda reveal after 3s
      setTimeout(() => {
        store.setSessionState('studying');
      }, 3000);
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
    updateTopicProgress(item.topic.id, status, confidence, xp);

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
               fetchContent(item.topic, contentType, profile.openrouterApiKey, profile.openrouterKey || undefined)
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

    endSession(sessionId, completedTopicIds, xpResult.total, durationMin);
    updateStreak(durationMin >= 20);
    refreshProfile();

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
        <View style={styles.revealContainer}>
          <Text style={styles.revealEmoji}>🎯</Text>
          <Text style={styles.revealFocus}>{store.agenda.focusNote}</Text>
          <Text style={styles.revealGuru}>"{store.agenda.guruMessage}"</Text>
          <Text style={styles.revealSub}>Starting in a moment...</Text>
          {store.agenda.items.map(item => (
            <View key={item.topic.id} style={styles.revealTopic}>
              <View style={[styles.revealDot, { backgroundColor: item.topic.subjectColor }]} />
              <Text style={styles.revealTopicName}>{item.topic.name}</Text>
              <Text style={styles.revealTopicSub}>{item.topic.subjectCode}</Text>
            </View>
          ))}
        </View>
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
        orKey={profile?.openrouterKey || undefined}
        onDone={handleBreakDone}
      />
    );
  }

  if (store.sessionState === 'session_done') {
    return <SessionDoneScreen completedCount={store.completedTopicIds.length} elapsedSeconds={elapsedSeconds} onClose={() => navigation.popToTop()} />;
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
          <TouchableOpacity onPress={handleDowngrade} style={styles.sosBtn}>
            <Text style={styles.sosBtnText}>🆘</Text>
          </TouchableOpacity>
          <Text style={styles.timer}>{mins}:{secs.toString().padStart(2, '0')}</Text>
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
    </SafeAreaView>
  );
}

const CONTENT_LABELS: Record<string, string> = {
  keypoints: 'Key Points', quiz: 'Quiz', story: 'Story',
  mnemonic: 'Mnemonic', teach_back: 'Teach', error_hunt: 'Hunt', detective: 'Case',
};

// ── Session Done Screen ───────────────────────────────────────────

interface SessionDoneProps {
  completedCount: number;
  elapsedSeconds: number;
  onClose: () => void;
}
function SessionDoneScreen({ completedCount, elapsedSeconds, onClose }: SessionDoneProps) {
  const mins = Math.round(elapsedSeconds / 60);
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.doneContainer}>
        <Text style={styles.doneEmoji}>🎉</Text>
        <Text style={styles.doneTitle}>Session Complete!</Text>
        <Text style={styles.doneStat}>{completedCount} topics covered · {mins} min</Text>
        <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
          <Text style={styles.doneBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

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
  headerRight: { alignItems: 'flex-end' },
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
  doneContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  doneEmoji: { fontSize: 64, marginBottom: 16 },
  doneTitle: { color: '#fff', fontWeight: '900', fontSize: 28, marginBottom: 8 },
  doneStat: { color: '#9E9E9E', fontSize: 16, marginBottom: 32 },
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
