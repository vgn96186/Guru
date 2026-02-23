import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, BackHandler, Alert, Animated, AppState, Dimensions, ScrollView } from 'react-native';
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
import { getDailyLog, updateStreak } from '../db/queries/progress';
import { calculateAndAwardSessionXp } from '../services/xpService';
import LoadingOrb from '../components/LoadingOrb';
import ContentCard from './ContentCard';
import BreakScreen from './BreakScreen';
import type { Mood, SessionMode } from '../types';
import { XP_REWARDS } from '../constants/gamification';
import { useIdleTimer } from '../hooks/useIdleTimer';
import { useGuruPresence } from '../hooks/useGuruPresence';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Session'>;
type Route = RouteProp<HomeStackParamList, 'Session'>;

export default function SessionScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { mood, mode: forcedMode, forcedMinutes } = route.params as { mood: Mood; mode?: SessionMode; forcedMinutes?: number };

  const store = useSessionStore();
  const storeRef = useRef(store);
  const profile = useAppStore(s => s.profile);
  const dailyAvailability = useAppStore(s => s.dailyAvailability);
  const refreshProfile = useAppStore(s => s.refreshProfile);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeElapsedSeconds, setActiveElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const xpAnim = useRef(new Animated.Value(0)).current;
  const [showXp, setShowXp] = useState(0);
  const [sessionXpTotal, setSessionXpTotal] = useState(0);
  const [aiError, setAiError] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const isPausedRef = useRef(store.isPaused);

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  const isStudying = store.sessionState === 'studying' && !store.isOnBreak && !store.isPaused;

  const { currentMessage, presencePulse, toastOpacity, triggerEvent } = useGuruPresence({
    topicNames: store.agenda?.items.map(i => i.topic.name) ?? [],
    apiKey: profile?.openrouterApiKey ?? '',
    orKey: profile?.openrouterKey ?? undefined,
    isActive: isStudying && (profile?.bodyDoublingEnabled ?? true),
  });

  const idleTimeout = (profile?.idleTimeoutMinutes ?? 2) * 60 * 1000;

  const { panHandlers } = useIdleTimer({
    timeout: idleTimeout,
    onIdle: () => {
      if (store.sessionState === 'studying' && !store.isOnBreak && !store.isPaused) {
        store.setPaused(true);
        sendImmediateNag("Are you there, Doctor?", "Your study session is paused due to inactivity.");
      }
    },
    onActive: () => {
      if (store.isPaused) store.setPaused(false);
    },
    disabled: store.sessionState !== 'studying' || store.isOnBreak,
  });

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

  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/active/) && nextAppState.match(/inactive|background/) && store.sessionState === 'studying' && profile?.strictModeEnabled) {
        sendImmediateNag("COME BACK! 😡", "Your session is still running. Don't break the flow!");
      }
      appState.current = nextAppState;
    });
    return () => subscription.remove();
  }, [store.sessionState, profile?.strictModeEnabled]);

  useEffect(() => {
    isPausedRef.current = store.isPaused;
  }, [store.isPaused]);

  const startPlanningRef = useRef<() => void>(() => {});

  useEffect(() => {
    startPlanningRef.current = startPlanning;
  }, [startPlanning]);

  useEffect(() => {
    storeRef.current.resetSession();
    startPlanningRef.current();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(s => s + 1);
      if (!isPausedRef.current) setActiveElapsedSeconds(s => s + 1);
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    if (!store.isOnBreak) return;
    const t = setInterval(() => store.tickBreak(), 1000);
    return () => clearInterval(t);
  }, [store.isOnBreak]);

  useEffect(() => {
    if (store.sessionState !== 'studying') return;
    const item = getCurrentAgendaItem(store);
    const contentType = getCurrentContentType(store);
    if (!item || !contentType || !profile?.openrouterApiKey || store.currentContent) return;
    setAiError(null);
    store.setLoadingContent(true);
    fetchContent(item.topic, contentType, profile.openrouterApiKey, profile.openrouterKey || undefined)
      .then(content => { store.setCurrentContent(content); store.setLoadingContent(false); })
      .catch(e => { store.setLoadingContent(false); setAiError(e?.message ?? 'AI content failed'); });
  }, [store.sessionState, store.currentItemIndex, store.currentContentIndex]);

  useEffect(() => {
    if (!store.agenda || !profile?.openrouterApiKey) return;
    const nextItem = store.agenda.items[store.currentItemIndex + 1];
    if (nextItem) prefetchTopicContent(nextItem.topic, nextItem.contentTypes, profile.openrouterApiKey, profile.openrouterKey || undefined);
  }, [store.currentItemIndex]);

  async function startPlanning() {
    if (!profile?.openrouterApiKey) return;
    setAiError(null);
    store.setSessionState('planning');
    try {
      const sessionLength = forcedMinutes ? forcedMinutes : (forcedMode === 'sprint' ? 10
        : (dailyAvailability && dailyAvailability > 0 ? dailyAvailability : (profile.preferredSessionLength ?? 45)));
      const agenda = await buildSession(mood, sessionLength, profile.openrouterApiKey, profile.openrouterKey || undefined);
      const sessionId = createSession(agenda.items.map(i => i.topic.id), mood, agenda.mode);
      store.setSessionId(sessionId);
      store.setAgenda(agenda);
      store.setSessionState('agenda_reveal');
      setTimeout(() => store.setSessionState('studying'), 3000);
    } catch (e: any) { setAiError(e?.message ?? 'Could not plan session'); }
  }

  function handleStartManualReview() {
    setAiError(null);
    const item = getCurrentAgendaItem(store);
    if (item) {
      store.setCurrentContent({ type: 'manual', topicName: item.topic.name });
    } else {
      // If we failed during planning, we need a basic agenda
      // This is more complex, for now just skip to home if no agenda
      navigation.goBack();
    }
  }

  function handleContentDone() {
    const item = getCurrentAgendaItem(store);
    const contentType = getCurrentContentType(store);
    if (!item || !contentType) return;
    if (store.currentContentIndex < item.contentTypes.length - 1) { store.nextContent(); }
    else {
      store.markTopicComplete();
      const isLast = store.currentItemIndex >= (store.agenda?.items.length ?? 1) - 1;
      if (isLast) store.nextTopic();
      else store.startBreak((profile?.breakDurationMinutes ?? 5) * 60);
    }
  }

  function handleBreakDone() {
    store.endBreak();
    store.nextTopic();
    // Only override to 'studying' if nextTopic didn't already set 'session_done'
    if (store.sessionState !== 'session_done') {
      store.setSessionState('studying');
    }
  }

  function handleConfidenceRating(confidence: number) {
    const item = getCurrentAgendaItem(store);
    if (!item) return;
    const status = confidence >= 4 ? 'mastered' : confidence >= 2 ? 'reviewed' : 'seen';
    const xp = item.topic.progress.status === 'unseen' ? XP_REWARDS.TOPIC_UNSEEN : XP_REWARDS.TOPIC_REVIEW;
    updateTopicProgress(item.topic.id, status, confidence, xp);
    setShowXp(xp);
    Animated.sequence([Animated.timing(xpAnim, { toValue: 1, duration: 200, useNativeDriver: true }), Animated.delay(800), Animated.timing(xpAnim, { toValue: 0, duration: 300, useNativeDriver: true })]).start();
    if (confidence === 1) triggerEvent('again_rated');
    else triggerEvent('card_done');
    handleContentDone();
  }

  function handleDowngrade() {
    Alert.alert('Having a tough time?', 'We can switch to Sprint Mode — shorter, easier content.', [
      { text: 'Keep Pushing', style: 'cancel' },
      { text: 'Downgrade', onPress: () => {
        store.downgradeSession();
        store.setLoadingContent(true);
        store.setCurrentContent(null);
        const item = getCurrentAgendaItem(store);
        const contentType = getCurrentContentType(store);
        if (item && contentType && profile?.openrouterApiKey) {
          fetchContent(item.topic, contentType, profile.openrouterApiKey, profile.openrouterKey || undefined)
            .then(c => { store.setCurrentContent(c); store.setLoadingContent(false); })
            .catch(() => store.setLoadingContent(false));
        }
      }}
    ]);
  }

  async function finishSession() {
    if (timerRef.current) clearInterval(timerRef.current);
    const { sessionId, completedTopicIds, quizResults, agenda } = store;
    if (!sessionId) { navigation.goBack(); return; }
    const durationMin = Math.round(activeElapsedSeconds / 60);
    const completedTopics = (agenda?.items ?? []).filter(i => completedTopicIds.includes(i.topic.id)).map(i => i.topic);
    const isFirstToday = (getDailyLog()?.sessionCount ?? 0) === 0;
    const xpResult = calculateAndAwardSessionXp(completedTopics, quizResults, isFirstToday);
    endSession(sessionId, completedTopicIds, xpResult.total, durationMin);
    updateStreak(durationMin >= 20);
    setSessionXpTotal(xpResult.total);
    refreshProfile();
    store.setSessionState('session_done');
  }

  if (aiError) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitle}>AI Unavailable</Text>
          <Text style={styles.errorMsg}>{aiError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setAiError(null); !store.agenda ? startPlanning() : store.setCurrentContent(null); }}>
            <Text style={styles.retryBtnText}>Retry AI</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.manualBtn} onPress={handleStartManualReview}>
            <Text style={styles.manualBtnText}>Manual Review (Offline)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={() => { setAiError(null); !store.agenda ? navigation.goBack() : handleContentDone(); }}>
            <Text style={styles.skipBtnText}>Skip to Next</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.leaveBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.leaveBtnText}>Leave Session</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (store.sessionState === 'planning') return <SafeAreaView style={styles.safe}><LoadingOrb message="Guru is planning your session..." /></SafeAreaView>;

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
    return <BreakScreen countdown={store.breakCountdown} totalSeconds={(profile?.breakDurationMinutes ?? 5) * 60} topicId={item?.topic.id} apiKey={profile?.openrouterApiKey} orKey={profile?.openrouterKey || undefined} onDone={handleBreakDone} />;
  }

  if (store.sessionState === 'session_done') return <SessionDoneScreen completedCount={store.completedTopicIds.length} elapsedSeconds={elapsedSeconds} xpTotal={sessionXpTotal} onClose={() => navigation.popToTop()} />;

  if (store.sessionState === 'topic_done') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.topicDoneContainer}>
          <Text style={styles.topicDoneEmoji}>✅</Text>
          <Text style={styles.topicDoneName}>{getCurrentAgendaItem(store)?.topic.name}</Text>
          <Text style={styles.topicDoneSub}>Topic complete! Taking a {profile?.breakDurationMinutes ?? 5}-min break...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const item = getCurrentAgendaItem(store);
  const contentType = getCurrentContentType(store);
  if (!item || !contentType) return null;

  const topicNum = store.currentItemIndex + 1;
  const totalTopics = store.agenda?.items.length ?? 1;
  const mins = Math.floor(activeElapsedSeconds / 60);
  const secs = activeElapsedSeconds % 60;
  const progressPercent = Math.round((store.currentItemIndex / totalTopics) * 100);
  const totalSessionSeconds = (forcedMinutes ? forcedMinutes : (forcedMode === 'sprint' ? 10 : (profile?.preferredSessionLength ?? 45))) * 60;
  const timeProgressPercent = Math.min(100, Math.round((activeElapsedSeconds / totalSessionSeconds) * 100));
  const showPausedOverlay = store.isPaused && store.sessionState === 'studying' && !store.isOnBreak;

  return (
    <SafeAreaView style={styles.safe} {...panHandlers}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />

      {/* Story-style time progress bar across top edge */}
      <View style={styles.storyBarContainer}>
        <View style={[styles.storyBarFill, { width: `${timeProgressPercent}%` }]} />
      </View>

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.topicProgress}>Topic {topicNum}/{totalTopics}</Text>
          <Text style={styles.topicName}>{item.topic.name}</Text>
          <Text style={styles.subjectTag}>{item.topic.subjectCode}</Text>
        </View>
        <View style={styles.headerRight}>
          {isStudying && (
            <Animated.View style={[styles.guruDot, { transform: [{ scale: presencePulse }] }]} />
          )}
          <TouchableOpacity
            onPress={() => setMenuVisible(true)}
            style={styles.menuBtn}
          >
            <Text style={styles.menuBtnText}>•••</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Menu overlay */}
      {menuVisible && (
        <View style={styles.menuOverlay}>
          <TouchableOpacity style={styles.menuBackdrop} onPress={() => setMenuVisible(false)} activeOpacity={1} />
          <View style={styles.menuDropdown}>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); handleDowngrade(); }}>
              <Text style={styles.menuItemEmoji}>🆘</Text>
              <Text style={styles.menuItemText}>Downgrade to Sprint</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); finishSession(); }}>
              <Text style={styles.menuItemEmoji}>🚪</Text>
              <Text style={[styles.menuItemText, { color: '#F44336' }]}>End Session</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {currentMessage && isStudying && !showPausedOverlay && (
        <Animated.View style={[styles.guruToast, { opacity: toastOpacity }]}>
          <Text style={styles.guruToastText}>{currentMessage}</Text>
        </Animated.View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.contentTypeTabs}>
          {item.contentTypes.map((ct, idx) => (
            <View key={ct} style={[styles.contentTab, idx === store.currentContentIndex && styles.contentTabActive, idx < store.currentContentIndex && styles.contentTabDone]}>
              <Text style={styles.contentTabText}>{CONTENT_LABELS[ct]}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {store.isLoadingContent ? <LoadingOrb message="Fetching content..." /> : store.currentContent ? (
        <ContentCard
          content={store.currentContent}
          topicId={item?.topic.id}
          onDone={handleConfidenceRating}
          onSkip={handleContentDone}
          onQuizAnswered={c => triggerEvent(c ? 'quiz_correct' : 'quiz_wrong')}
          onQuizComplete={(correct, total) => {
            if (item) store.addQuizResult({ topicId: item.topic.id, correct, total });
          }}
        />
      ) : <LoadingOrb message="Loading..." />}

      <Animated.View style={[styles.xpPop, { opacity: xpAnim, transform: [{ translateY: xpAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }) }] }]}>
        <Text style={styles.xpPopText}>+{showXp} XP</Text>
      </Animated.View>
      
      {showPausedOverlay && (
        <View style={styles.pausedOverlay}>
          <Text style={styles.pausedText}>Session Paused</Text>
          <Text style={styles.pausedSubText}>Are you still studying, Doctor?</Text>
          <TouchableOpacity style={styles.resumeOverlayBtn} onPress={() => store.setPaused(false)}><Text style={styles.resumeOverlayBtnText}>Resume Session</Text></TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const CONTENT_LABELS: Record<string, string> = { keypoints: 'Key Points', quiz: 'Quiz', story: 'Story', mnemonic: 'Mnemonic', teach_back: 'Teach', error_hunt: 'Hunt', detective: 'Case' };

function SessionDoneScreen({ completedCount, elapsedSeconds, xpTotal, onClose }: { completedCount: number; elapsedSeconds: number; xpTotal: number; onClose: () => void }) {
  const mins = Math.round(elapsedSeconds / 60);
  const xpEarned = xpTotal;
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.doneContainer}>
        <Text style={styles.doneEmoji}>🎉</Text>
        <Text style={styles.doneTitle}>Session Complete!</Text>
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}><Text style={styles.summaryValue}>{completedCount}</Text><Text style={styles.summaryLabel}>Topics</Text></View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}><Text style={styles.summaryValue}>{mins}</Text><Text style={styles.summaryLabel}>Minutes</Text></View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}><Text style={[styles.summaryValue, { color: '#FF9800' }]}>+{xpEarned}</Text><Text style={styles.summaryLabel}>XP</Text></View>
          </View>
        </View>
        <Text style={styles.doneStat}>{completedCount} topics covered · {mins} min</Text>
        <TouchableOpacity style={styles.doneBtn} onPress={onClose}><Text style={styles.doneBtnText}>Back to Home</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  storyBarContainer: { height: 3, backgroundColor: '#2A2A38' },
  storyBarFill: { height: '100%', backgroundColor: '#6C63FF', borderRadius: 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#1A1A24' },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  topicProgress: { color: '#9E9E9E', fontSize: 11, marginBottom: 2 },
  topicName: { color: '#fff', fontWeight: '800', fontSize: 18 },
  subjectTag: { color: '#6C63FF', fontSize: 12, marginTop: 2 },
  menuBtn: { backgroundColor: '#2A2A38', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 8 },
  menuBtnText: { color: '#9E9E9E', fontSize: 16, fontWeight: '700', letterSpacing: 2 },
  menuOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 },
  menuBackdrop: { flex: 1 },
  menuDropdown: { position: 'absolute', top: 60, right: 16, backgroundColor: '#1A1A24', borderRadius: 12, borderWidth: 1, borderColor: '#2A2A38', paddingVertical: 4, minWidth: 200, elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, shadowOpacity: 0.4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  menuItemEmoji: { fontSize: 16, marginRight: 10 },
  menuItemText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  menuDivider: { height: 1, backgroundColor: '#2A2A38', marginHorizontal: 12 },
  contentTypeTabs: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8, backgroundColor: '#0F0F14' },
  contentTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#2A2A38', borderWidth: 1, borderColor: '#333' },
  contentTabActive: { backgroundColor: '#6C63FF', borderColor: '#6C63FF' },
  contentTabDone: { backgroundColor: '#1A2A1A', borderColor: '#4CAF5044' },
  contentTabText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  revealContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  revealEmoji: { fontSize: 48, marginBottom: 16 },
  revealFocus: { color: '#fff', fontWeight: '800', fontSize: 20, textAlign: 'center', marginBottom: 12 },
  revealGuru: { color: '#9E9E9E', fontSize: 15, fontStyle: 'italic', textAlign: 'center', marginBottom: 24 },
  revealSub: { color: '#888', fontSize: 13 },
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
  doneTitle: { color: '#fff', fontWeight: '900', fontSize: 28, marginBottom: 24 },
  summaryCard: { backgroundColor: '#1A1A24', borderRadius: 16, padding: 20, marginBottom: 24, width: '100%' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center' },
  summaryValue: { color: '#fff', fontSize: 28, fontWeight: '900' },
  summaryLabel: { color: '#9E9E9E', fontSize: 12, marginTop: 4 },
  summaryDivider: { width: 1, height: 40, backgroundColor: '#333' },
  doneStat: { color: '#9E9E9E', fontSize: 16, marginBottom: 32 },
  doneBtn: { backgroundColor: '#6C63FF', borderRadius: 16, paddingHorizontal: 40, paddingVertical: 16 },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorEmoji: { fontSize: 48, marginBottom: 12 },
  errorTitle: { color: '#fff', fontWeight: '800', fontSize: 22, marginBottom: 8 },
  errorMsg: { color: '#9E9E9E', fontSize: 14, textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  retryBtn: { backgroundColor: '#6C63FF', borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14, marginBottom: 10, width: '100%', alignItems: 'center' },
  retryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  manualBtn: { backgroundColor: '#2A1A1A', borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14, marginBottom: 10, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: '#F4433644' },
  manualBtnText: { color: '#F44336', fontWeight: '800', fontSize: 16 },
  skipBtn: { backgroundColor: '#1A1A24', borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14, marginBottom: 10, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: '#FF9800' },
  skipBtnText: { color: '#FF9800', fontWeight: '700', fontSize: 16 },
  leaveBtn: { paddingVertical: 12 },
  leaveBtnText: { color: '#888', fontSize: 14 },
  guruDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#6C63FF', shadowColor: '#6C63FF', shadowRadius: 6, shadowOpacity: 0.9, elevation: 4, marginRight: 6 },
  guruToast: { position: 'absolute', top: 130, left: 16, right: 16, backgroundColor: '#1A1A2E', borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#6C63FF', borderWidth: 1, borderColor: '#6C63FF33', padding: 12, zIndex: 50, elevation: 8 },
  guruToastText: { color: '#D0C8FF', fontSize: 13, fontStyle: 'italic', lineHeight: 18 },
  pausedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  pausedText: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 10 },
  pausedSubText: { color: '#9E9E9E', fontSize: 15, textAlign: 'center', marginBottom: 30 },
  resumeOverlayBtn: { backgroundColor: '#6C63FF', borderRadius: 16, paddingHorizontal: 40, paddingVertical: 16 },
  resumeOverlayBtnText: { color: '#fff', fontWeight: '800', fontSize: 18 },
});
