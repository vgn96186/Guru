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
import { getWeakestTopics, getTopicsDueForReview, getAllTopicsWithProgress } from '../db/queries/topics';
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

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await refreshProfile();
      setWeakTopics(getWeakestTopics(3));
      setDueTopics(getTopicsDueForReview(5));
      setTodayTasks(getTodaysAgendaWithTimes().slice(0, 4));
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
  
  // Quick stats calculation
  const dailyGoal = profile.dailyGoalMinutes;
  const progressPercent = Math.min(100, Math.round((todayMinutes / dailyGoal) * 100));
  const minutesLeft = Math.max(0, dailyGoal - todayMinutes);

  
  useEffect(() => {
    if (profile?.syncCode) {
      const unsubscribe = connectToRoom(profile.syncCode, (msg) => {
        
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
          <StreakBadge streak={profile.streakCurrent} />
          <View style={styles.headerRight}>
            <Text style={styles.countdown}>⚡ {daysToInicet}d to INICET</Text>
            <Text style={styles.todayMin}>{todayMinutes}min today</Text>
          </View>
        </View>

        {/* XP bar */}
        <XPBar levelInfo={levelInfo} totalXp={profile.totalXp} />

        {/* Quick Stats with Progress Ring */}
        <QuickStatsCard progressPercent={progressPercent} todayMinutes={todayMinutes} dailyGoal={dailyGoal} minutesLeft={minutesLeft} />

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

        {/* External Apps Row */}
        <ExternalToolsRow onLogSession={handleLogExternal} />

        {/* Today's Schedule or Empty State */}
        <DailyAgendaSection
          todayTasks={todayTasks}
          hasNewTopics={hasNewTopics}
          onStartSession={handleStartSession}
        />

        {/* Big START button */}
        <View style={styles.startArea}>
          <StartButton
            onPress={handleStartSession}
            label="START SESSION"
            sublabel={`~${profile.preferredSessionLength} min · ${mood}`}
            disabled={!hasApiKey}
          />
          {!hasApiKey && (
            <Text style={styles.noKeyWarning}>⚠️ Add API key in Settings</Text>
          )}
          
          <TouchableOpacity 
            style={{ marginTop: 16, backgroundColor: '#2A1A1A', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: '#FF572244', flexDirection: 'row', alignItems: 'center' }} 
            onPress={() => navigation.navigate('Inertia')}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 24, marginRight: 12 }}>🐢</Text>
            <View>
              <Text style={{ color: '#FF5722', fontWeight: '800', fontSize: 15 }}>Task Paralysis?</Text>
              <Text style={{ color: '#9E9E9E', fontSize: 12, marginTop: 2 }}>Tap here to break the cycle</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.planBtn} onPress={() => navigation.navigate('StudyPlan')}>
            <Text style={styles.planBtnText}>📅 View Dynamic Plan</Text>
          </TouchableOpacity>
        </View>

        {/* Review Due Button */}
        {dueTopics.length > 0 && (
          <TouchableOpacity style={styles.reviewBtn} onPress={() => navigation.navigate('Review')} activeOpacity={0.8}>
            <Text style={styles.reviewBtnText}>🔥 Review {dueTopics.length} Due Cards</Text>
          </TouchableOpacity>
        )}

        {/* Lecture mode button */}
        <TouchableOpacity style={styles.lectureBtn} onPress={handleLectureMode} activeOpacity={0.8}>
          <Text style={styles.lectureBtnText}>📺 Watching a Lecture</Text>
        </TouchableOpacity>

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

        <TouchableOpacity style={styles.searchBtn} onPress={() => navigation.navigate('NotesSearch')}>
          <Text style={styles.searchBtnText}>🔍 Search My Notes</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.flaggedBtn} onPress={() => navigation.navigate('FlaggedReview')} activeOpacity={0.8}>
          <Text style={styles.flaggedBtnText}>🚩 Flagged for Review</Text>
        </TouchableOpacity>

        
        <TouchableOpacity 
          style={{ marginHorizontal: 16, marginTop: 16, backgroundColor: '#2A0505', padding: 20, borderRadius: 16, borderWidth: 2, borderColor: '#F44336', alignItems: 'center' }} 
          onPress={() => navigation.getParent()?.navigate('Lockdown', { duration: 300 })}
          activeOpacity={0.9}
        >
          <Text style={{ fontSize: 32, marginBottom: 8 }}>⛓️</Text>
          <Text style={{ color: '#F44336', fontWeight: '900', fontSize: 18, textTransform: 'uppercase', letterSpacing: 1 }}>Force 5-Min Lockdown</Text>
          <Text style={{ color: '#FF9800', fontSize: 12, marginTop: 8, textAlign: 'center' }}>Blocks back button. Shames you if you try to leave.</Text>
        </TouchableOpacity>
\n        {/* Boss Battle Entry */}

        <TouchableOpacity 
          style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: '#1A1A24', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#FF9800', flexDirection: 'row', alignItems: 'center' }} 
          onPress={() => navigation.getParent()?.navigate('DoomscrollGuide')}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 24, marginRight: 12 }}>📱</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#FF9800', fontWeight: '800', fontSize: 14, textTransform: 'uppercase' }}>App Hijack Mode</Text>
            <Text style={{ color: '#9E9E9E', fontSize: 11, marginTop: 2 }}>Learn how to force your phone to open this app instead of Instagram.</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.bossBtn} onPress={() => navigation.navigate('BossBattle')} activeOpacity={0.9}>
          <Text style={styles.bossBtnEmoji}>👹</Text>
          <View>
            <Text style={styles.bossBtnTitle}>BOSS BATTLES</Text>
            <Text style={styles.bossBtnSub}>Challenge a subject boss to earn epic XP</Text>
          </View>
        </TouchableOpacity>

        {/* Due for review + Weak topics + Nemesis */}
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
  cantStartText: { color: '#555', fontSize: 13, marginTop: 16, textDecorationLine: 'underline' },
  planBtn: { marginTop: 16, padding: 10 },
  planBtnText: { color: '#6C63FF', fontWeight: '700', fontSize: 13 },
  lectureBtn: { marginHorizontal: 16, backgroundColor: '#1A1A24', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#2A2A38', marginBottom: 10 },
  lectureBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  miniRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 12 },
  miniBtn: { backgroundColor: '#0F1A2E', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#6C63FF44', flex: 1, marginBottom: 0 },
  miniBtnText: { color: '#6C63FF', fontWeight: '700', fontSize: 14 },
  reviewBtn: { marginHorizontal: 16, backgroundColor: '#F44336', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 16, elevation: 4 },
  reviewBtnText: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },
  challengeBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A2E', borderRadius: 14, padding: 16, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: '#6C63FF44' },
  challengeEmoji: { fontSize: 28, marginRight: 14 },
  challengeInfo: { flex: 1 },
  challengeTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  challengeSub: { color: '#9E9E9E', fontSize: 12, marginTop: 2 },
  challengeXp: { color: '#6C63FF', fontWeight: '800', fontSize: 14 },
  searchBtn: { alignItems: 'center', marginBottom: 8, padding: 10 },
  searchBtnText: { color: '#666', fontWeight: '600', fontSize: 13 },
  flaggedBtn: { alignItems: 'center', marginBottom: 24, padding: 10 },
  flaggedBtnText: { color: '#FF9800', fontWeight: '600', fontSize: 13 },
  bossBtn: { marginHorizontal: 16, marginBottom: 24, backgroundColor: '#2A0505', borderWidth: 2, borderColor: '#F44336', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center' },
  bossBtnEmoji: { fontSize: 32, marginRight: 16 },
  bossBtnTitle: { color: '#F44336', fontWeight: '900', fontSize: 18, letterSpacing: 1 },
  bossBtnSub: { color: '#9E9E9E', fontSize: 12 },
});
