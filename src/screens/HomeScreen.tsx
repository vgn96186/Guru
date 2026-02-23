import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import { useAppStore } from '../store/useAppStore';
import ExternalToolsRow from '../components/ExternalToolsRow';
import StartButton from '../components/StartButton';
import StreakBadge from '../components/StreakBadge';
import XPBar from '../components/XPBar';
import LoadingOrb from '../components/LoadingOrb';
import QuickStatsCard from '../components/home/QuickStatsCard';
import DailyAgendaSection from '../components/home/DailyAgendaSection';
import NemesisSection from '../components/home/NemesisSection';
import { getDailyLog, getDaysToExam, getUserProfile } from '../db/queries/progress';
import { getWeakestTopics, getTopicsDueForReview, getAllTopicsWithProgress, getSubjectCoverage } from '../db/queries/topics';
import { getTodaysAgendaWithTimes, type TodayTask } from '../services/studyPlanner';
import { connectToRoom, sendSyncMessage } from '../services/deviceSyncService';
import type { TopicWithProgress } from '../types';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { profile, levelInfo, refreshProfile } = useAppStore();
  const [weakTopics, setWeakTopics] = useState<TopicWithProgress[]>([]);
  const [dueTopics, setDueTopics] = useState<TopicWithProgress[]>([]);
  const [todayTasks, setTodayTasks] = useState<TodayTask[]>([]);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasIncompleteSession, setHasIncompleteSession] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [challengesExpanded, setChallengesExpanded] = useState(false);
  const [statsExpanded, setStatsExpanded] = useState(true);
  const [masteredCount, setMasteredCount] = useState(0);
  const [totalTopicCount, setTotalTopicCount] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await refreshProfile();
      setWeakTopics(getWeakestTopics(3));
      setDueTopics(getTopicsDueForReview(5));
      setTodayTasks(getTodaysAgendaWithTimes().slice(0, 4));
      const coverage = getSubjectCoverage();
      setMasteredCount(coverage.reduce((sum, s) => sum + s.mastered, 0));
      setTotalTopicCount(coverage.reduce((sum, s) => sum + s.total, 0));
      const log = getDailyLog();
      setTodayMinutes(log?.totalMinutes ?? 0);

      // Check if user has new topics to continue learning
      const user = getUserProfile();
      if (user.lastActiveDate === new Date().toISOString().slice(0, 10)) {
        const allTopics = getAllTopicsWithProgress();
        const newTopics = allTopics.filter(t => t.progress.status === 'unseen');
        setHasIncompleteSession(newTopics.length > 0);
      }

      setIsLoading(false);
    };
    loadData();
  }, []);

  useEffect(() => {
    if (profile?.syncCode) {
      const unsubscribe = connectToRoom(profile.syncCode, (msg: any) => {

        if (msg.type === 'BREAK_STARTED') {
          navigation.getParent()?.navigate('BreakEnforcer', { durationSeconds: msg.durationSeconds });
        }
        if (msg.type === 'LECTURE_STARTED') {
          // The other device started a lecture. The phone is now a hostage.
          Alert.alert('Lecture Detected', 'Your tablet just started a lecture. Your phone is now entering Hostage Mode.', [
            { text: 'Okay', onPress: () => navigation.navigate('LectureMode', { subjectId: msg.subjectId }) }
          ]);
          navigation.navigate('LectureMode', { subjectId: msg.subjectId });
        }
      });
      return unsubscribe;
    }
  }, [profile?.syncCode]);

  if (isLoading || !profile || !levelInfo) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <LoadingOrb message="Loading your progress..." />
      </SafeAreaView>
    );
  }

  const daysToInicet = getDaysToExam(profile.inicetDate);
  const hasApiKey = profile.openrouterApiKey.length > 0;
  const mood = getDailyLog()?.mood ?? 'good';

  // Micro-commitment ladder: dynamic start button text based on activity gap
  const daysSinceActive = (() => {
    if (!profile.lastActiveDate) return 999;
    const last = new Date(profile.lastActiveDate);
    const now = new Date();
    return Math.floor((now.getTime() - last.getTime()) / 86400000);
  })();
  const startLabel = daysSinceActive >= 4 ? 'JUST 1 QUESTION' : daysSinceActive >= 2 ? 'JUST 5 MINUTES' : 'START SESSION';
  const startSublabel = daysSinceActive >= 4 ? 'One question. That\'s it.' : daysSinceActive >= 2 ? 'A tiny win to get back on track' : `~${profile.preferredSessionLength} min · ${mood}`;

  // Low momentum = streak is 0 or long gap
  const isLowMomentum = profile.streakCurrent === 0 || daysSinceActive >= 2;

  // Exam readiness metric
  const readinessPercent = totalTopicCount > 0 ? Math.round((masteredCount / totalTopicCount) * 100) : 0;

  // Quick stats calculation
  const dailyGoal = profile.dailyGoalMinutes;
  const progressPercent = Math.min(100, Math.round((todayMinutes / dailyGoal) * 100));
  const minutesLeft = Math.max(0, dailyGoal - todayMinutes);

  function handleStartSession() {
    if (!hasApiKey) {
      Alert.alert('Set API Key', 'Add your Google AI Studio key in Settings to enable AI features.', [{ text: 'OK' }]);
      return;
    }
    navigation.navigate('Session', { mood });
  }

  function handleContinueLearning() {
    if (!hasApiKey) {
      Alert.alert('Set API Key', 'Add your API key in Settings first.', [{ text: 'OK' }]);
      return;
    }
    navigation.navigate('Session', { mood });
  }

  function handleLectureMode() {
    navigation.navigate('LectureMode', {});
  }

  function handleLogExternal(appId: string) {
    navigation.navigate('ManualLog', { appId });
  }

  const hasNewTopics = getAllTopicsWithProgress().some(t => t.progress.status === 'unseen');

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Section 1: Status ── */}

        {/* API key setup banner */}
        {!hasApiKey && (
          <TouchableOpacity
            style={styles.setupBanner}
            onPress={() => navigation.getParent()?.navigate('SettingsTab' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.setupBannerEmoji}>🔑</Text>
            <View style={styles.setupBannerText}>
              <Text style={styles.setupBannerTitle}>Set up your API key</Text>
              <Text style={styles.setupBannerSub}>Tap here → Settings to add your Gemini key and start studying</Text>
            </View>
            <Text style={styles.setupBannerArrow}>→</Text>
          </TouchableOpacity>
        )}

        {/* Header row */}
        <View style={styles.headerRow}>
          {!isLowMomentum && <StreakBadge streak={profile.streakCurrent} />}
          {isLowMomentum && (
            <View style={styles.readinessBadge}>
              <Text style={styles.readinessIcon}>📊</Text>
              <Text style={styles.readinessCount}>{masteredCount}</Text>
              <Text style={styles.readinessLabel}> mastered</Text>
            </View>
          )}
          <View style={styles.headerRight}>
            <Text style={styles.countdown}>⚡ {daysToInicet}d to INICET</Text>
            <Text style={styles.todayMin}>{todayMinutes}min today</Text>
          </View>
        </View>

        {/* Exam Readiness bar (replaces XP bar when low momentum) */}
        {isLowMomentum ? (
          <View style={styles.readinessBar}>
            <View style={styles.readinessBarRow}>
              <Text style={styles.readinessBarTitle}>Exam Readiness</Text>
              <Text style={styles.readinessBarPercent}>{readinessPercent}%</Text>
            </View>
            <View style={styles.readinessTrack}>
              <View style={[styles.readinessFill, { width: `${readinessPercent}%` }]} />
            </View>
            <Text style={styles.readinessBarSub}>{masteredCount}/{totalTopicCount} topics mastered</Text>
          </View>
        ) : (
          <XPBar levelInfo={levelInfo} totalXp={profile.totalXp} />
        )}

        {/* Quick Stats with Progress Ring */}
        <QuickStatsCard progressPercent={progressPercent} todayMinutes={todayMinutes} dailyGoal={dailyGoal} minutesLeft={minutesLeft} />

        {/* ── Section 2: Primary Action ── */}

        <View style={styles.startArea}>
          <StartButton
            onPress={handleStartSession}
            label={startLabel}
            sublabel={startSublabel}
            disabled={!hasApiKey}
          />
          {!hasApiKey && (
            <Text style={styles.noKeyWarning}>⚠️ Add API key in Settings</Text>
          )}
        </View>

        {/* Continue Learning Button */}
        {hasIncompleteSession && (
          <TouchableOpacity style={styles.continueBtn} onPress={handleContinueLearning} activeOpacity={0.8}>
            <Text style={styles.continueIcon}>▶️</Text>
            <View style={styles.continueInfo}>
              <Text style={styles.continueTitle}>Continue Learning</Text>
              <Text style={styles.continueSub}>Pick up where you left off</Text>
            </View>
            <Text style={styles.continueArrow}>→</Text>
          </TouchableOpacity>
        )}

        {/* Task Paralysis escape hatch */}
        <TouchableOpacity
          style={styles.inertiaBtn}
          onPress={() => navigation.navigate('Inertia')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Task Paralysis - break the cycle"
        >
          <Text style={styles.inertiaEmoji}>🐢</Text>
          <View>
            <Text style={styles.inertiaTitle}>Task Paralysis?</Text>
            <Text style={styles.inertiaSub}>Tap here to break the cycle</Text>
          </View>
        </TouchableOpacity>

        {/* ── Section 3: Quick Modes ── */}

        <Text style={styles.sectionHeader}>QUICK MODES</Text>

        <View style={styles.miniRow}>
          <TouchableOpacity
            style={[styles.miniBtn, { flex: 1, marginBottom: 0 }]}
            onPress={() => hasApiKey && navigation.navigate('Session', { mood, mode: 'sprint' })}
            activeOpacity={0.8}
          >
            <Text style={styles.miniBtnText}>⚡ 10m Sprint</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.miniBtn, { flex: 1, marginBottom: 0, borderColor: '#FF980044' }]}
            onPress={() => navigation.navigate('MockTest')}
            activeOpacity={0.8}
          >
            <Text style={[styles.miniBtnText, { color: '#FF9800' }]}>📝 Mock Test</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.challengeBtn}
          onPress={() => hasApiKey ? navigation.navigate('DailyChallenge') : Alert.alert('Set API Key', 'Add your API key in Settings first.', [{ text: 'OK' }])}
          activeOpacity={0.85}
        >
          <Text style={styles.challengeEmoji}>⚡</Text>
          <View style={styles.challengeInfo}>
            <Text style={styles.challengeTitle}>Daily Challenge</Text>
            <Text style={styles.challengeSub}>5 rapid-fire questions from weak topics</Text>
          </View>
          <Text style={styles.challengeXp}>+{5 * 60} XP</Text>
        </TouchableOpacity>

        {/* Lecture mode button */}
        <TouchableOpacity style={styles.lectureBtn} onPress={handleLectureMode} activeOpacity={0.8}>
          <Text style={styles.lectureBtnText}>📺 Watching a Lecture</Text>
        </TouchableOpacity>

        {/* ── Section 4: Review & Due ── */}

        {/* Review Due Button */}
        {dueTopics.length > 0 && (
          <TouchableOpacity style={styles.reviewBtn} onPress={() => navigation.navigate('Review')} activeOpacity={0.8}>
            <Text style={styles.reviewBtnText}>🔥 Review {dueTopics.length} Due Cards</Text>
          </TouchableOpacity>
        )}

        {/* Today's Schedule or Empty State */}
        <DailyAgendaSection
          todayTasks={todayTasks}
          hasNewTopics={hasNewTopics}
          onStartSession={handleStartSession}
        />

        {/* ── Section 5: Tools & Library (collapsible) ── */}

        <TouchableOpacity
          style={styles.toolsHeader}
          onPress={() => setToolsExpanded(prev => !prev)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Tools and Library, ${toolsExpanded ? 'collapse' : 'expand'}`}
        >
          <Text style={styles.sectionHeader}>TOOLS & LIBRARY</Text>
          <Text style={styles.toolsChevron}>{toolsExpanded ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {toolsExpanded && (
          <View>
            <TouchableOpacity style={styles.searchBtn} onPress={() => navigation.navigate('NotesSearch')}>
              <Text style={styles.searchBtnText}>🔍 Search My Notes</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.searchBtn} onPress={() => navigation.getParent()?.navigate('BrainDumpReview')}>
              <Text style={styles.searchBtnText}>🧠 Review Parked Thoughts</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.flaggedBtn} onPress={() => navigation.navigate('FlaggedReview')} activeOpacity={0.8}>
              <Text style={styles.flaggedBtnText}>🚩 Flagged for Review</Text>
            </TouchableOpacity>

            {/* External Apps Row */}
            <ExternalToolsRow onLogSession={handleLogExternal} />

            {/* Nightstand Mode */}
            <TouchableOpacity
              style={styles.nightstandBtn}
              onPress={() => navigation.getParent()?.navigate('SleepMode')}
              activeOpacity={0.8}
            >
              <Text style={styles.nightstandEmoji}>🌙</Text>
              <View style={styles.nightstandInfo}>
                <Text style={styles.nightstandTitle}>Nightstand Mode</Text>
                <Text style={styles.nightstandSub}>Track sleep cycles & intercept morning fog.</Text>
              </View>
            </TouchableOpacity>

            {/* App Hijack Mode */}
            <TouchableOpacity
              style={styles.hijackBtn}
              onPress={() => navigation.getParent()?.navigate('DoomscrollGuide')}
              activeOpacity={0.8}
            >
              <Text style={styles.hijackEmoji}>📱</Text>
              <View style={styles.hijackInfo}>
                <Text style={styles.hijackTitle}>App Hijack Mode</Text>
                <Text style={styles.hijackSub}>Learn how to force your phone to open this app instead of Instagram.</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Section 6: Challenges (collapsible) ── */}

        <TouchableOpacity
          style={styles.toolsHeader}
          onPress={() => setChallengesExpanded(prev => !prev)}
          activeOpacity={0.7}
        >
          <Text style={styles.sectionHeader}>CHALLENGES</Text>
          <Text style={styles.toolsChevron}>{challengesExpanded ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {challengesExpanded && (
          <View>
            <TouchableOpacity style={styles.bossBtn} onPress={() => navigation.navigate('BossBattle')} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel="Boss Battles - challenge a subject boss">
              <Text style={styles.bossBtnEmoji}>👹</Text>
              <View>
                <Text style={styles.bossBtnTitle}>BOSS BATTLES</Text>
                <Text style={styles.bossBtnSub}>Challenge a subject boss to earn epic XP</Text>
              </View>
            </TouchableOpacity>

            {/* Lockdown */}
            <TouchableOpacity
              style={styles.lockdownBtn}
              onPress={() => navigation.getParent()?.navigate('Lockdown', { duration: 300 })}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Force 5 minute lockdown"
            >
              <Text style={styles.lockdownEmoji}>⛓️</Text>
              <Text style={styles.lockdownTitle}>Force 5-Min Lockdown</Text>
              <Text style={styles.lockdownSub}>Blocks back button. Shames you if you try to leave.</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Nemesis */}
        <NemesisSection weakTopics={weakTopics} dueTopics={dueTopics} navigation={navigation} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  setupBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A2E', borderRadius: 14, padding: 16, margin: 16, marginBottom: 0, borderWidth: 1, borderColor: '#6C63FF66' },
  setupBannerEmoji: { fontSize: 24, marginRight: 12 },
  setupBannerText: { flex: 1 },
  setupBannerTitle: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 2 },
  setupBannerSub: { color: '#9E9E9E', fontSize: 12, lineHeight: 16 },
  setupBannerArrow: { color: '#6C63FF', fontSize: 18, fontWeight: '700', marginLeft: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, marginBottom: 8 },
  headerRight: { alignItems: 'flex-end' },
  countdown: { color: '#6C63FF', fontWeight: '700', fontSize: 15 },
  todayMin: { color: '#9E9E9E', fontSize: 12, marginTop: 2 },
  readinessBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0A1A2A', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  readinessIcon: { fontSize: 14 },
  readinessCount: { color: '#4CAF50', fontWeight: '700', fontSize: 14, marginLeft: 4 },
  readinessLabel: { color: '#4CAF50', fontSize: 12 },
  readinessBar: { paddingHorizontal: 16, paddingVertical: 8 },
  readinessBarRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  readinessBarTitle: { color: '#4CAF50', fontWeight: '700', fontSize: 13 },
  readinessBarPercent: { color: '#9E9E9E', fontSize: 12 },
  readinessTrack: { height: 6, backgroundColor: '#2A2A38', borderRadius: 3, overflow: 'hidden' },
  readinessFill: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 3 },
  readinessBarSub: { color: '#888', fontSize: 10, marginTop: 2, textAlign: 'right' },

  quickStatsCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A24', borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 16 },
  progressRingContainer: { width: 80, height: 80, marginRight: 16 },
  progressRing: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#2A2A38', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  progressRingFill: { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 6, borderColor: '#6C63FF', borderLeftColor: 'transparent', borderBottomColor: 'transparent' },
  progressRingCenter: { alignItems: 'center' },
  progressPercent: { color: '#fff', fontWeight: '900', fontSize: 18 },
  progressLabel: { color: '#9E9E9E', fontSize: 9 },
  quickStatsInfo: { flex: 1 },
  quickStatsTitle: { color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 4 },
  quickStatsMinutes: { color: '#9E9E9E', fontSize: 14, marginBottom: 2 },
  quickStatsLeft: { color: '#FF9800', fontSize: 12 },
  quickStatsDone: { color: '#4CAF50', fontSize: 12, fontWeight: '600' },

  continueBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A2A1A', borderRadius: 14, padding: 16, marginHorizontal: 16, marginBottom: 16, borderWidth: 1, borderColor: '#4CAF5044' },
  continueIcon: { fontSize: 24, marginRight: 12 },
  continueInfo: { flex: 1 },
  continueTitle: { color: '#4CAF50', fontWeight: '700', fontSize: 16 },
  continueSub: { color: '#9E9E9E', fontSize: 12 },
  continueArrow: { color: '#4CAF50', fontSize: 20 },

  startArea: { alignItems: 'center', paddingVertical: 32 },
  noKeyWarning: { color: '#FF9800', fontSize: 12, marginTop: 12 },
  cantStartText: { color: '#888', fontSize: 13, marginTop: 16, textDecorationLine: 'underline' },
  planBtn: { marginTop: 16, padding: 10 },
  planBtnText: { color: '#6C63FF', fontWeight: '700', fontSize: 13 },

  // Task Paralysis (was inline)
  inertiaBtn: { alignSelf: 'center', marginBottom: 16, backgroundColor: '#2A1A1A', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: '#FF572244', flexDirection: 'row', alignItems: 'center' },
  inertiaEmoji: { fontSize: 24, marginRight: 12 },
  inertiaTitle: { color: '#FF5722', fontWeight: '800', fontSize: 15 },
  inertiaSub: { color: '#9E9E9E', fontSize: 12, marginTop: 2 },

  // Section headers
  sectionHeader: { color: '#888', fontWeight: '800', fontSize: 11, letterSpacing: 1.5, paddingHorizontal: 16, marginTop: 24, marginBottom: 12 },

  lectureBtn: { marginHorizontal: 16, backgroundColor: '#0F0F14', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#2A2A38', marginBottom: 10 },
  lectureBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  miniRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 12 },
  miniBtn: { backgroundColor: '#0F0F14', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#6C63FF44', flex: 1, marginBottom: 0 },
  miniBtnText: { color: '#6C63FF', fontWeight: '700', fontSize: 14 },
  reviewBtn: { marginHorizontal: 16, backgroundColor: '#F44336', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 16, elevation: 4 },
  reviewBtnText: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },
  challengeBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F0F14', borderRadius: 14, padding: 16, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: '#6C63FF44' },
  challengeEmoji: { fontSize: 28, marginRight: 14 },
  challengeInfo: { flex: 1 },
  challengeTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  challengeSub: { color: '#9E9E9E', fontSize: 12, marginTop: 2 },
  challengeXp: { color: '#6C63FF', fontWeight: '800', fontSize: 14 },
  searchBtn: { alignItems: 'center', marginBottom: 8, padding: 10 },
  searchBtnText: { color: '#9E9E9E', fontWeight: '600', fontSize: 13 },
  flaggedBtn: { alignItems: 'center', marginBottom: 12, padding: 10 },
  flaggedBtnText: { color: '#FF9800', fontWeight: '600', fontSize: 13 },

  // Tools & Library collapsible header
  toolsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16, marginBottom: 0 },
  toolsChevron: { color: '#888', fontSize: 12 },

  // Nightstand Mode (was inline)
  nightstandBtn: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#0F0F14', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#6C63FF44', flexDirection: 'row', alignItems: 'center' },
  nightstandEmoji: { fontSize: 24, marginRight: 12 },
  nightstandInfo: { flex: 1 },
  nightstandTitle: { color: '#6C63FF', fontWeight: '800', fontSize: 14, textTransform: 'uppercase' },
  nightstandSub: { color: '#9E9E9E', fontSize: 11, marginTop: 2 },

  // App Hijack Mode (was inline)
  hijackBtn: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#1A1A24', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#FF9800', flexDirection: 'row', alignItems: 'center' },
  hijackEmoji: { fontSize: 24, marginRight: 12 },
  hijackInfo: { flex: 1 },
  hijackTitle: { color: '#FF9800', fontWeight: '800', fontSize: 14, textTransform: 'uppercase' },
  hijackSub: { color: '#9E9E9E', fontSize: 11, marginTop: 2 },

  // Lockdown (was inline)
  lockdownBtn: { marginHorizontal: 16, marginTop: 16, backgroundColor: '#2A0505', padding: 20, borderRadius: 16, borderWidth: 2, borderColor: '#F44336', alignItems: 'center' },
  lockdownEmoji: { fontSize: 32, marginBottom: 8 },
  lockdownTitle: { color: '#F44336', fontWeight: '900', fontSize: 18, textTransform: 'uppercase', letterSpacing: 1 },
  lockdownSub: { color: '#FF9800', fontSize: 12, marginTop: 8, textAlign: 'center' },

  bossBtn: { marginHorizontal: 16, marginTop: 24, marginBottom: 12, backgroundColor: '#2A0505', borderWidth: 2, borderColor: '#F44336', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center' },
  bossBtnEmoji: { fontSize: 32, marginRight: 16 },
  bossBtnTitle: { color: '#F44336', fontWeight: '900', fontSize: 18, letterSpacing: 1 },
  bossBtnSub: { color: '#9E9E9E', fontSize: 12 },
});
