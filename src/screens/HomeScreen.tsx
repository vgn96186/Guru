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
import { getDailyLog, getDaysToExam, getUserProfile } from '../db/queries/progress';
import { getWeakestTopics, getTopicsDueForReview, getAllTopicsWithProgress } from '../db/queries/topics';
import { getTodaysAgendaWithTimes, type TodayTask } from '../services/studyPlanner';
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

  const nemesisCount = weakTopics.length;
  const hasNewTopics = getAllTopicsWithProgress().some(t => t.progress.status === 'unseen');

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

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
        <View style={styles.quickStatsCard}>
          <View style={styles.progressRingContainer}>
            <View style={styles.progressRing}>
              <View style={[styles.progressRingFill, { transform: [{ rotate: `${progressPercent * 3.6}deg` }] }]} />
              <View style={styles.progressRingCenter}>
                <Text style={styles.progressPercent}>{progressPercent}%</Text>
                <Text style={styles.progressLabel}>Goal</Text>
              </View>
            </View>
          </View>
          <View style={styles.quickStatsInfo}>
            <Text style={styles.quickStatsTitle}>Today's Progress</Text>
            <Text style={styles.quickStatsMinutes}>{todayMinutes} / {dailyGoal} min</Text>
            {minutesLeft > 0 ? (
              <Text style={styles.quickStatsLeft}>{minutesLeft} min left</Text>
            ) : (
              <Text style={styles.quickStatsDone}>🎉 Goal reached!</Text>
            )}
          </View>
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

        {/* External Apps Row */}
        <ExternalToolsRow onLogSession={handleLogExternal} />

        {/* Today's Schedule or Empty State */}
        {todayTasks.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📅 Today's Agenda</Text>
            {todayTasks.map((task, i) => (
              <View key={i} style={styles.taskRow}>
                <View style={styles.timeBox}>
                  <Text style={styles.timeText}>{task.timeLabel.split(' - ')[0]}</Text>
                </View>
                <View style={[styles.taskCard, task.type === 'review' && styles.taskReview, task.type === 'deep_dive' && styles.taskDeep]}>
                  <Text style={styles.taskTitle} numberOfLines={1}>{task.topic.name}</Text>
                  <Text style={styles.taskSub}>
                    {task.type === 'review' ? 'REL' : task.type === 'deep_dive' ? 'DEEP' : 'NEW'} · {task.topic.subjectName}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyStateCard}>
            <Text style={styles.emptyEmoji}>✨</Text>
            <Text style={styles.emptyTitle}>
              {hasNewTopics ? "Ready to learn something new!" : "All caught up!"}
            </Text>
            <Text style={styles.emptySub}>
              {hasNewTopics 
                ? "You have new topics to explore. Start a session to begin learning!"
                : "Great work! You've covered your due reviews. Keep the momentum going!"}
            </Text>
            {hasNewTopics && (
              <TouchableOpacity style={styles.emptyBtn} onPress={handleStartSession}>
                <Text style={styles.emptyBtnText}>Start New Topic</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Nemesis warning */}
        {nemesisCount > 0 && (
          <TouchableOpacity style={styles.nemesisBar} activeOpacity={0.8}>
            <Text style={styles.nemesisText}>
              ⚔️ {nemesisCount} nemesis topic{nemesisCount > 1 ? 's' : ''} still own you
            </Text>
          </TouchableOpacity>
        )}

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
          
          <TouchableOpacity onPress={() => navigation.navigate('Inertia')}>
            <Text style={styles.cantStartText}>Can't start? 🐢 Tap here.</Text>
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

        <TouchableOpacity style={styles.searchBtn} onPress={() => navigation.navigate('NotesSearch')}>
          <Text style={styles.searchBtnText}>🔍 Search My Notes</Text>
        </TouchableOpacity>

        {/* Boss Battle Entry */}
        <TouchableOpacity style={styles.bossBtn} onPress={() => navigation.navigate('BossBattle')} activeOpacity={0.9}>
          <Text style={styles.bossBtnEmoji}>👹</Text>
          <View>
            <Text style={styles.bossBtnTitle}>BOSS BATTLES</Text>
            <Text style={styles.bossBtnSub}>Challenge a subject boss to earn epic XP</Text>
          </View>
        </TouchableOpacity>

        {/* Due for review list */}
        {dueTopics.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📅 Due for Review ({dueTopics.length})</Text>
            {dueTopics.map(t => (
              <View key={t.id} style={[styles.weakRow, { borderLeftWidth: 3, borderLeftColor: '#6C63FF' }]}>
                <View style={[styles.weakDot, { backgroundColor: t.subjectColor }]} />
                <View style={styles.weakInfo}>
                  <Text style={styles.weakName}>{t.name}</Text>
                  <Text style={styles.weakSub}>{t.subjectCode} · {t.progress.timesStudied}× studied</Text>
                </View>
                <View style={styles.confidenceRow}>
                  {[1,2,3,4,5].map(i => (
                    <View key={i} style={[styles.star, { backgroundColor: i <= t.progress.confidence ? '#6C63FF' : '#333' }]} />
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Weak topics */}
        {weakTopics.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🎯 Your Weak Spots</Text>
            {weakTopics.map(t => (
              <View key={t.id} style={styles.weakRow}>
                <View style={[styles.weakDot, { backgroundColor: t.subjectColor }]} />
                <View style={styles.weakInfo}>
                  <Text style={styles.weakName}>{t.name}</Text>
                  <Text style={styles.weakSub}>{t.subjectName}</Text>
                </View>
                <View style={styles.confidenceRow}>
                  {[1,2,3,4,5].map(i => (
                    <View key={i} style={[styles.star, { backgroundColor: i <= t.progress.confidence ? '#FF9800' : '#333' }]} />
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
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
  
  emptyStateCard: { backgroundColor: '#1A1A24', borderRadius: 16, padding: 24, marginHorizontal: 16, marginBottom: 16, alignItems: 'center' },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: '#fff', fontWeight: '700', fontSize: 18, marginBottom: 8, textAlign: 'center' },
  emptySub: { color: '#9E9E9E', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  emptyBtn: { backgroundColor: '#6C63FF', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  
  nemesisBar: { marginHorizontal: 16, marginVertical: 8, backgroundColor: '#2A0A0A', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#F44336' },
  nemesisText: { color: '#F44336', fontWeight: '600', fontSize: 13 },
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
  searchBtn: { alignItems: 'center', marginBottom: 24, padding: 10 },
  searchBtnText: { color: '#666', fontWeight: '600', fontSize: 13 },
  bossBtn: { marginHorizontal: 16, marginBottom: 24, backgroundColor: '#2A0505', borderWidth: 2, borderColor: '#F44336', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center' },
  bossBtnEmoji: { fontSize: 32, marginRight: 16 },
  bossBtnTitle: { color: '#F44336', fontWeight: '900', fontSize: 18, letterSpacing: 1 },
  bossBtnSub: { color: '#9E9E9E', fontSize: 12 },
  section: { paddingHorizontal: 16 },
  sectionTitle: { color: '#9E9E9E', fontWeight: '700', fontSize: 13, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  weakRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A24', borderRadius: 12, padding: 12, marginBottom: 8 },
  weakDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  weakInfo: { flex: 1 },
  weakName: { color: '#fff', fontWeight: '600', fontSize: 14 },
  weakSub: { color: '#9E9E9E', fontSize: 11, marginTop: 2 },
  confidenceRow: { flexDirection: 'row', gap: 3 },
  star: { width: 8, height: 8, borderRadius: 2 },
  taskRow: { flexDirection: 'row', marginBottom: 10, alignItems: 'center' },
  timeBox: { width: 50, alignItems: 'flex-end', marginRight: 12 },
  timeText: { color: '#666', fontSize: 12, fontWeight: '700' },
  taskCard: { flex: 1, backgroundColor: '#1A1A24', padding: 12, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#6C63FF' },
  taskReview: { borderLeftColor: '#4CAF50' },
  taskDeep: { borderLeftColor: '#F44336' },
  taskTitle: { color: '#fff', fontSize: 13, fontWeight: '600' },
  taskSub: { color: '#9E9E9E', fontSize: 10, marginTop: 2, textTransform: 'uppercase' },
});
