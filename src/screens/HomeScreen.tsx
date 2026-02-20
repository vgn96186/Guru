import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, Alert, Modal, Pressable, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import { useAppStore } from '../store/useAppStore';
import StartButton from '../components/StartButton';
import StreakBadge from '../components/StreakBadge';
import ExternalToolsRow from '../components/ExternalToolsRow';
import { getDailyLog, getDaysToExam } from '../db/queries/progress';
import { getDueReviewCount } from '../db/queries/topics';
import { getTodaysAgendaWithTimes, type TodayTask } from '../services/studyPlanner';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { profile, levelInfo, refreshProfile } = useAppStore();
  const [todayTasks, setTodayTasks] = useState<TodayTask[]>([]);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [showMore, setShowMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dueReviewCount, setDueReviewCount] = useState(0);

  const loadData = useCallback(() => {
    refreshProfile();
    setTodayTasks(getTodaysAgendaWithTimes().slice(0, 4));
    const log = getDailyLog();
    setTodayMinutes(log?.totalMinutes ?? 0);
    setDueReviewCount(getDueReviewCount());
  }, []);

  // Refresh data when screen comes into focus (e.g. returning from session)
  useFocusEffect(
    useCallback(() => { loadData(); }, [loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    loadData();
    // Small delay so the spinner feels tangible
    setTimeout(() => setRefreshing(false), 400);
  }, [loadData]);

  if (!profile || !levelInfo) return null;

  const daysToInicet = getDaysToExam(profile.inicetDate);
  const daysToNeet = getDaysToExam(profile.neetDate);
  const hasApiKey = profile.openrouterApiKey.length > 0;
  const mood = getDailyLog()?.mood ?? 'good';

  function handleStartSession() {
    if (!hasApiKey) {
      Alert.alert(
        'Set API Key',
        'Add your Google AI Studio key in Settings to enable AI features.',
        [{ text: 'OK' }],
      );
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

  const nextTask = todayTasks[0];
  const dailyAvailability = useAppStore(s => s.dailyAvailability);
  const effectiveSessionLength = dailyAvailability && dailyAvailability > 0 ? dailyAvailability : profile.preferredSessionLength;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6C63FF"
            colors={['#6C63FF']}
            progressBackgroundColor="#1A1A24"
          />
        }
      >

        {/* Header row */}
        <View style={styles.headerRow}>
          <StreakBadge streak={profile.streakCurrent} />
          <View style={styles.headerRight}>
            <View style={styles.examBadgesRow}>
              <View style={styles.examBadge}>
                <Text style={styles.examBadgeLabel}>INICET</Text>
                <Text style={styles.examBadgeDays}>{daysToInicet}d</Text>
              </View>
              <View style={[styles.examBadge, { borderColor: '#FF980055' }]}>
                <Text style={[styles.examBadgeLabel, { color: '#FF9800' }]}>NEET-PG</Text>
                <Text style={[styles.examBadgeDays, { color: '#FF9800' }]}>{daysToNeet}d</Text>
              </View>
            </View>
            <Text style={styles.todayMin}>{todayMinutes}min today</Text>
          </View>
        </View>

        <Text style={styles.levelLine}>Level {levelInfo.level} · {levelInfo.name}</Text>

        {/* Streak at risk warning */}
        {(() => {
          const hour = new Date().getHours();
          const streakActive = profile.streakCurrent > 0;
          const notEnoughToday = todayMinutes < 20;
          const isAfternoon = hour >= 14;
          if (streakActive && notEnoughToday && isAfternoon) {
            return (
              <View style={styles.streakWarning}>
                <Text style={styles.streakWarningText}>
                  ⚠️ {20 - todayMinutes} min to keep your {profile.streakCurrent}-day streak!
                </Text>
              </View>
            );
          }
          return null;
        })()}

        {/* Daily Goal Progress */}
        {(() => {
          const goalMin = profile.dailyGoalMinutes || 120;
          const pct = Math.min(100, Math.round((todayMinutes / goalMin) * 100));
          const goalMet = todayMinutes >= goalMin;
          return (
            <View style={styles.goalContainer}>
              <View style={styles.goalHeader}>
                <Text style={styles.goalLabel}>
                  {goalMet ? '🎉 Daily goal reached!' : `${todayMinutes}/${goalMin} min today`}
                </Text>
                <Text style={[styles.goalPct, goalMet && { color: '#4CAF50' }]}>{pct}%</Text>
              </View>
              <View style={styles.goalBarTrack}>
                <View style={[
                  styles.goalBarFill,
                  { width: `${pct}%` },
                  goalMet && { backgroundColor: '#4CAF50' },
                ]} />
              </View>
            </View>
          );
        })()}

        {/* PRIMARY CTA — lecture launchers */}
        <ExternalToolsRow onLogSession={handleLogExternal} />

        {/* Divider */}
        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>or start a session</Text>
          <View style={styles.orLine} />
        </View>

        <View style={styles.startArea}>
          <StartButton
            onPress={handleStartSession}
            label="START NOW"
            sublabel={`~${effectiveSessionLength} min · ${mood}`}
            disabled={!hasApiKey}
          />
          {!hasApiKey && (
            <Text style={styles.noKeyWarning}>⚠️ Add API key in Settings</Text>
          )}
        </View>

        <View style={styles.miniRow}>
          <TouchableOpacity
            style={[styles.miniBtn, { flex: 1, marginBottom: 0, borderColor: '#FF980044' }]}
            onPress={() => hasApiKey && navigation.navigate('Session', { mood, mode: 'sprint' })}
            activeOpacity={0.8}
          >
            <Text style={[styles.miniBtnText, { color: '#FF9800' }]}>🎯 PYQ Sprint</Text>
          </TouchableOpacity>
        </View>

        {/* Review Due Banner */}
        {dueReviewCount > 0 && (
          <TouchableOpacity
            style={styles.reviewBanner}
            onPress={() => navigation.navigate('Review')}
            activeOpacity={0.8}
          >
            <Text style={styles.reviewBannerText}>
              🔥 {dueReviewCount} review{dueReviewCount !== 1 ? 's' : ''} due — tap to revise
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.timetableCard}
          onPress={() => navigation.getParent()?.navigate('PlanTab' as never)}
          activeOpacity={0.8}
        >
          <View style={styles.timetableHeader}>
            <Text style={styles.timetableEmoji}>🎯</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.timetableTitle}>Today's Focus</Text>
              {nextTask ? (
                <Text style={styles.timetableSub}>
                  {nextTask.topic.name} · {nextTask.duration}m {nextTask.type === 'review' ? 'review' : 'study'}
                </Text>
              ) : (
                <Text style={styles.timetableSub}>Open Plan tab to generate your first task</Text>
              )}
            </View>
            <Text style={styles.timetableArrow}>→</Text>
          </View>
        </TouchableOpacity>

        {/* Bottom actions row */}
        <View style={styles.bottomActionsRow}>
          <TouchableOpacity
            style={[styles.cantStartBtn, { flex: 1 }]}
            onPress={() => navigation.push('Inertia')}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.cantStartText}>Can't start? 🐢</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.moreBtn, { flex: 1, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center', marginTop: 0, marginBottom: 0, borderRadius: 12, paddingVertical: 12 }]}
            onPress={() => setShowMore(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.moreBtnText}>More ···</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      <Modal
        visible={showMore}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMore(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowMore(false)} />
        <View style={styles.sheetContainer}>
          <Text style={styles.sheetTitle}>More Actions</Text>

          <TouchableOpacity
            style={styles.sheetAction}
            onPress={() => {
              setShowMore(false);
              navigation.navigate('Review');
            }}
          >
            <Text style={styles.sheetActionText}>🔥 Review Due Cards</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sheetAction}
            onPress={() => {
              setShowMore(false);
              navigation.navigate('NotesSearch');
            }}
          >
            <Text style={styles.sheetActionText}>🔍 Search Notes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sheetAction}
            onPress={() => {
              setShowMore(false);
              navigation.navigate('MockTest');
            }}
          >
            <Text style={styles.sheetActionText}>📝 Mock Test</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sheetAction}
            onPress={() => {
              setShowMore(false);
              navigation.navigate('BossBattle');
            }}
          >
            <Text style={styles.sheetActionText}>👹 Boss Battle</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sheetAction}
            onPress={() => {
              setShowMore(false);
              navigation.navigate('ManualLog', {});
            }}
          >
            <Text style={styles.sheetActionText}>📌 Manual Log</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setShowMore(false)}>
            <Text style={styles.sheetCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  scroll: { flex: 1 },
  content: { paddingBottom: 40, paddingTop: 8 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    marginBottom: 8,
  },
  headerRight: { alignItems: 'flex-end' },
  examBadgesRow: { flexDirection: 'row', gap: 8 },
  examBadge: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6C63FF55',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#12121C',
  },
  examBadgeLabel: { color: '#6C63FF', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  examBadgeDays: { color: '#6C63FF', fontSize: 15, fontWeight: '900', lineHeight: 19 },
  todayMin: { color: '#9E9E9E', fontSize: 12, marginTop: 6, textAlign: 'right' },
  goalContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    marginTop: -4,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  goalLabel: { color: '#9E9E9E', fontSize: 12, fontWeight: '600' },
  goalPct: { color: '#6C63FF', fontSize: 12, fontWeight: '800' },
  goalBarTrack: {
    height: 6,
    backgroundColor: '#2A2A38',
    borderRadius: 3,
    overflow: 'hidden',
  },
  goalBarFill: {
    height: '100%',
    backgroundColor: '#6C63FF',
    borderRadius: 3,
  },
  reviewBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: '#2A1A0A',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#FF980044',
    alignItems: 'center',
  },
  reviewBannerText: {
    color: '#FF9800',
    fontSize: 14,
    fontWeight: '700',
  },
  levelLine: {
    color: '#777',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 2,
  },
  streakWarning: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#2A1A0A',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#F4433644',
  },
  streakWarningText: {
    color: '#F44336',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  startArea: { alignItems: 'center', paddingVertical: 18 },
  noKeyWarning: { color: '#FF9800', fontSize: 12, marginTop: 12 },
  bottomActionsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  cantStartBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A38',
    backgroundColor: '#14141D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cantStartText: { color: '#8E8E8E', fontSize: 13, textAlign: 'center', fontWeight: '600' },
  timetableCard: {
    marginHorizontal: 16,
    marginTop: 18,
    backgroundColor: '#1A1A2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#6C63FF44',
  },
  timetableHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timetableEmoji: { fontSize: 28 },
  timetableTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  timetableSub: { color: '#9E9E9E', fontSize: 12, marginTop: 2 },
  timetableArrow: { color: '#6C63FF', fontSize: 20, fontWeight: '700' },
  miniRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginTop: 10, marginBottom: 8 },
  orRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 20, marginBottom: 4 },
  orLine: { flex: 1, height: 1, backgroundColor: '#2A2A38' },
  orText: { color: '#555', fontSize: 11, fontWeight: '600', marginHorizontal: 10, letterSpacing: 0.5 },
  miniBtn: {
    backgroundColor: '#0F1A2E',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6C63FF44',
  },
  miniBtnText: { color: '#6C63FF', fontWeight: '700', fontSize: 14 },
  moreBtn: {
    borderWidth: 1,
    borderColor: '#2A2A38',
    backgroundColor: '#14141D',
  },
  moreBtnText: { color: '#9E9E9E', fontSize: 13, fontWeight: '600' },
  sheetOverlay: {
    flex: 1,
    backgroundColor: '#00000088',
  },
  sheetContainer: {
    backgroundColor: '#1A1A24',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#2A2A38',
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  sheetAction: {
    backgroundColor: '#14141D',
    borderWidth: 1,
    borderColor: '#2A2A38',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  sheetActionText: {
    color: '#E0E0E0',
    fontSize: 14,
    fontWeight: '600',
  },
  sheetCloseBtn: {
    alignItems: 'center',
    marginTop: 4,
    paddingVertical: 12,
  },
  sheetCloseText: {
    color: '#9E9E9E',
    fontSize: 14,
    fontWeight: '600',
  },
});
