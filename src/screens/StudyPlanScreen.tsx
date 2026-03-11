import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateStudyPlan, type DailyPlan, type StudyPlanSummary, type PlanMode } from '../services/studyPlanner';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import { useAppStore } from '../store/useAppStore';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { Ionicons } from '@expo/vector-icons';
import { getCompletedTopicIdsBetween } from '../db/queries/sessions';
import { getTopicsDueForReview } from '../db/queries/topics';
import type { TopicWithProgress, StudyResourceMode } from '../types';

type Nav = NativeStackNavigationProp<HomeStackParamList>;

const PLAN_MODES: Array<{ key: PlanMode; label: string }> = [
  { key: 'balanced', label: 'Balanced' },
  { key: 'high_yield', label: 'High Yield Only' },
  { key: 'exam_crunch', label: 'Exam Crunch' },
];

const RESOURCE_MODES: Array<{ key: StudyResourceMode; label: string }> = [
  { key: 'standard', label: 'Standard' },
  { key: 'btr', label: 'BTR' },
  { key: 'dbmci_live', label: 'DBMCI Live' },
  { key: 'hybrid', label: 'Hybrid' },
];

export default function StudyPlanScreen() {
  const navigation = useNavigation<Nav>();
  const [plan, setPlan] = useState<DailyPlan[]>([]);
  const [summary, setSummary] = useState<StudyPlanSummary | null>(null);
  const [planMode, setPlanMode] = useState<PlanMode>('balanced');
  const [completedTodayIds, setCompletedTodayIds] = useState<Set<number>>(new Set());
  const [completedWeekIds, setCompletedWeekIds] = useState<Set<number>>(new Set());
  const [missedTopics, setMissedTopics] = useState<TopicWithProgress[]>([]);
  const { profile, setStudyResourceMode } = useAppStore();
  const resourceMode = profile?.studyResourceMode ?? 'hybrid';

  useFocusEffect(
    useCallback(() => {
      refreshPlan();
    }, [planMode, resourceMode]),
  );

  function refreshPlan() {
    const { plan: p, summary: s } = generateStudyPlan({ mode: planMode, resourceMode });
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfWeek = startOfToday - mondayOffset * 86400000;
    const todayStr = now.toISOString().slice(0, 10);
    const overdue = getTopicsDueForReview(1000).filter(topic => {
      const dueDate = topic.progress.fsrsDue?.slice(0, 10);
      if (!dueDate || dueDate >= todayStr) return false;
      if (planMode === 'high_yield') return topic.inicetPriority >= 8;
      if (planMode === 'exam_crunch') return topic.inicetPriority >= 7 || topic.progress.confidence < 3;
      return true;
    });

    setPlan(p);
    setSummary(s);
    setCompletedTodayIds(new Set(getCompletedTopicIdsBetween(startOfToday)));
    setCompletedWeekIds(new Set(getCompletedTopicIdsBetween(startOfWeek)));
    setMissedTopics(overdue.slice(0, 8));
  }

  function handleStartPlannedTopic(day: DailyPlan, index: number) {
    const item = day.items[index];
    if (!item) return;
    (navigation as any).navigate('HomeTab', {
      screen: 'Session',
      params: {
        mood: item.type === 'deep_dive' ? 'energetic' : 'good',
        mode: item.type === 'deep_dive' ? 'deep' : undefined,
        focusTopicId: item.topic.id,
        preferredActionType: item.type,
      },
    });
  }

  function handleStartTopicSet(topics: TopicWithProgress[], actionType: 'study' | 'review' | 'deep_dive') {
    const ids = topics.slice(0, actionType === 'review' ? 4 : 3).map(topic => topic.id);
    if (ids.length === 0) return;
    (navigation as any).navigate('HomeTab', {
      screen: 'Session',
      params: {
        mood: actionType === 'deep_dive' ? 'energetic' : 'good',
        mode: actionType === 'deep_dive' ? 'deep' : undefined,
        focusTopicIds: ids,
        preferredActionType: actionType,
      },
    });
  }

  function renderReasonPills(reasonLabels: string[]) {
    return (
      <View style={styles.reasonRow}>
        {reasonLabels.map((label) => (
          <Text key={label} style={styles.reasonPill}>{label}</Text>
        ))}
      </View>
    );
  }

  function renderPlanRow(day: DailyPlan, index: number, completedIds: Set<number>) {
    const item = day.items[index];
    if (!item) return null;
    const isCompleted = completedIds.has(item.topic.id);

    return (
      <TouchableOpacity
        key={`${day.date}-${item.id}-${index}`}
        style={[
          styles.topicRow,
          item.type === 'review' && styles.rowReview,
          item.type === 'deep_dive' && styles.rowDeep,
          isCompleted && styles.rowCompleted,
        ]}
        activeOpacity={0.7}
        onPress={() => handleStartPlannedTopic(day, index)}
      >
        <View style={[styles.dot, { backgroundColor: item.topic.subjectColor }]} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {item.type === 'review' && <Text style={styles.tagReview}>REL</Text>}
            {item.type === 'deep_dive' && <Text style={styles.tagDeep}>DEEP</Text>}
            {item.type === 'study' && <Text style={styles.tagNew}>NEW</Text>}
            {item.topic.inicetPriority >= 8 && <Text style={styles.tagHighYield}>HY</Text>}
            <Text style={[styles.topicName, isCompleted && styles.topicNameCompleted]}>{item.topic.name}</Text>
          </View>
          <Text style={styles.topicSub}>
            {item.topic.subjectName} · Priority {item.topic.inicetPriority}/10
          </Text>
          {renderReasonPills(item.reasonLabels)}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.topicTime}>{item.duration}m</Text>
          {isCompleted ? (
            <Text style={styles.completedLabel}>Completed</Text>
          ) : (
            <View style={styles.startHintRow}>
              <Text style={styles.startHint}>Start planned topic</Text>
              <Ionicons name="chevron-forward" size={12} color="#6C63FF" />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  if (!summary) return null;

  const todayPlan = plan[0];
  const weekPlans = plan.slice(1, 7);

  return (
    <SafeAreaView style={styles.safe} testID="plan-screen">
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <ScrollView contentContainerStyle={styles.content}>
        <ResponsiveContainer>
        <View style={styles.header}>
          <Text style={styles.title}>Dynamic Plan</Text>
          <Text style={styles.subtitle}>
            {summary.daysRemaining} days to INICET · {summary.totalHoursLeft}h content left
          </Text>
          <View style={styles.modeRow}>
            {PLAN_MODES.map(mode => (
              <TouchableOpacity
                key={mode.key}
                style={[styles.modeChip, planMode === mode.key && styles.modeChipActive]}
                onPress={() => setPlanMode(mode.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.modeChipText, planMode === mode.key && styles.modeChipTextActive]}>
                  {mode.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.resourceRow}>
            {RESOURCE_MODES.map(mode => (
              <TouchableOpacity
                key={mode.key}
                style={[styles.resourceChip, resourceMode === mode.key && styles.resourceChipActive]}
                onPress={() => setStudyResourceMode(mode.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.resourceChipText, resourceMode === mode.key && styles.resourceChipTextActive]}>
                  {mode.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Stats Card */}
        <View style={[styles.card, !summary.feasible && styles.cardWarning]}>
          <Text style={styles.cardTitle}>Daily Target</Text>
          <Text style={styles.cardEyebrow}>{summary.resourceLabel}</Text>
          <View style={styles.cardRow}>
            <Text style={styles.cardValue}>{summary.requiredHoursPerDay}h</Text>
            <Text style={styles.cardLabel}>/ day needed</Text>
          </View>
          <Text style={styles.cardSub}>{summary.message}</Text>
          <Text style={styles.cardMeta}>{summary.workloadAssumption}</Text>
          {summary.subjectLoadHighlights.length > 0 && (
            <View style={styles.loadHighlightBox}>
              <Text style={styles.loadHighlightLabel}>Heavier subject blocks</Text>
              <Text style={styles.loadHighlightValue}>{summary.subjectLoadHighlights.join(' · ')}</Text>
            </View>
          )}
          <View style={styles.forecastRow}>
            <View style={styles.forecastCard}>
              <Text style={styles.forecastLabel}>Projected finish</Text>
              <Text style={styles.forecastValue}>{summary.projectedFinishDate ?? 'Not enough data'}</Text>
            </View>
            <View style={styles.forecastCard}>
              <Text style={styles.forecastLabel}>Buffer</Text>
              <Text style={styles.forecastValue}>{summary.bufferDays} day{summary.bufferDays === 1 ? '' : 's'}</Text>
            </View>
          </View>
          
          <View style={styles.progressContainer}>
            <View style={styles.progressBarBg}>
              <View 
                style={[
                  styles.progressBarFill, 
                  { width: `${summary.requiredHoursPerDay > 0 ? Math.min(100, (profile?.dailyGoalMinutes || 120) / (summary.requiredHoursPerDay * 60) * 100) : 100}%` },
                  !summary.feasible && { backgroundColor: '#FF9800' }
                ]} 
              />
            </View>
            <Text style={styles.progressLabel}>
              Current Goal: {Math.round((profile?.dailyGoalMinutes || 120) / 60)}h
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Today</Text>
        {todayPlan && todayPlan.items.length > 0 ? (
          <View style={styles.dayBlock}>
            <View style={styles.dayHeader}>
              <Text style={[styles.dayLabel, { color: '#6C63FF' }]}>{todayPlan.dayLabel}</Text>
              <Text style={styles.dayMeta}>
                {Math.round(todayPlan.totalMinutes / 60)}h · {todayPlan.items.length} tasks
              </Text>
            </View>
            {todayPlan.items.map((_, idx) => renderPlanRow(todayPlan, idx, completedTodayIds))}
            {todayPlan.isRestDay && (
              <View style={styles.restBox}>
                <Text style={styles.restText}>🧘 Rest Day / Catch Up</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.emptySection}>
            <Text style={styles.emptySectionTitle}>Nothing queued for today</Text>
            <Text style={styles.emptySectionSub}>Use the syllabus filters or switch plan modes to generate a tighter target.</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>This Week</Text>
        {weekPlans.map((day, i) => (
          <View key={i} style={styles.dayBlock}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayLabel}>{day.dayLabel}</Text>
              <Text style={styles.dayMeta}>
                {Math.round(day.totalMinutes / 60)}h · {day.items.length} tasks
              </Text>
            </View>
            {day.items.map((_, idx) => renderPlanRow(day, idx, completedWeekIds))}
            {day.isRestDay && (
              <View style={styles.restBox}>
                <Text style={styles.restText}>🧘 Rest Day / Catch Up</Text>
              </View>
            )}
          </View>
        ))}

        <Text style={styles.sectionTitle}>Missed</Text>
        {missedTopics.length > 0 ? (
          <View style={styles.dayBlock}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayLabel}>Overdue reviews</Text>
              <Text style={styles.dayMeta}>{missedTopics.length} items</Text>
            </View>
            {missedTopics.map((topic) => (
              <TouchableOpacity
                key={`missed-${topic.id}`}
                style={[styles.topicRow, styles.rowReview]}
                activeOpacity={0.7}
                onPress={() => handleStartTopicSet([topic], 'review')}
              >
                <View style={[styles.dot, { backgroundColor: topic.subjectColor }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.topicName}>{topic.name}</Text>
                  <Text style={styles.topicSub}>{topic.subjectName}</Text>
                  {renderReasonPills([
                    topic.progress.fsrsDue?.slice(0, 10) ? `Overdue since ${topic.progress.fsrsDue.slice(0, 10)}` : 'Overdue',
                    topic.inicetPriority >= 8 ? 'High yield' : 'Review',
                  ])}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.topicTime}>Review</Text>
                  <View style={styles.startHintRow}>
                    <Text style={styles.startHint}>Recover now</Text>
                    <Ionicons name="chevron-forward" size={12} color="#6C63FF" />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptySection}>
            <Text style={styles.emptySectionTitle}>No overdue tasks</Text>
            <Text style={styles.emptySectionSub}>Your review queue is under control right now.</Text>
          </View>
        )}
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  content: { padding: 20, paddingBottom: 60 },
  header: { marginBottom: 24 },
  title: { color: '#fff', fontSize: 28, fontWeight: '900', marginBottom: 4 },
  subtitle: { color: '#9E9E9E', fontSize: 14 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  resourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  modeChip: {
    backgroundColor: '#171722',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2A2A38',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modeChipActive: {
    backgroundColor: '#262145',
    borderColor: '#6C63FF66',
  },
  modeChipText: { color: '#A5ADBE', fontSize: 12, fontWeight: '800' },
  modeChipTextActive: { color: '#ECE9FF' },
  resourceChip: {
    backgroundColor: '#141824',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#243148',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resourceChipActive: {
    backgroundColor: '#0F2B3A',
    borderColor: '#49B6FF66',
  },
  resourceChipText: { color: '#9AC5DF', fontSize: 12, fontWeight: '800' },
  resourceChipTextActive: { color: '#E7F6FF' },
  
  card: { backgroundColor: '#1A1A24', borderRadius: 16, padding: 20, marginBottom: 32, borderWidth: 1, borderColor: '#333' },
  cardWarning: { borderColor: '#F44336', backgroundColor: '#2A0A0A' },
  cardTitle: { color: '#9E9E9E', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  cardEyebrow: { color: '#7CC7FF', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 6 },
  cardRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  cardValue: { color: '#fff', fontSize: 32, fontWeight: '900' },
  cardLabel: { color: '#666', fontSize: 14, fontWeight: '600' },
  cardSub: { color: '#CCC', fontSize: 14, marginBottom: 16, fontStyle: 'italic' },
  cardMeta: { color: '#97A2B8', fontSize: 12, lineHeight: 18, marginTop: -8, marginBottom: 16 },
  loadHighlightBox: {
    backgroundColor: '#141A22',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#243148',
    padding: 12,
    marginBottom: 16,
  },
  loadHighlightLabel: { color: '#7BA5C8', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  loadHighlightValue: { color: '#E6F1F8', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  forecastRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  forecastCard: {
    flex: 1,
    backgroundColor: '#16161C',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A38',
    padding: 12,
  },
  forecastLabel: { color: '#7E8496', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  forecastValue: { color: '#F2F4F8', fontSize: 14, fontWeight: '800' },
  
  progressContainer: { marginTop: 8 },
  progressBarBg: { height: 6, backgroundColor: '#333', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  progressBarFill: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 3 },
  progressLabel: { color: '#555', fontSize: 11 },
  
  sectionTitle: { color: '#9E9E9E', fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 },
  
  dayBlock: { marginBottom: 24 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 8 },
  dayLabel: { color: '#fff', fontSize: 18, fontWeight: '700' },
  dayMeta: { color: '#666', fontSize: 12 },
  
  topicRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#16161C', padding: 12, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#222' },
  rowReview: { borderColor: '#4CAF5044', borderLeftWidth: 3, borderLeftColor: '#4CAF50' },
  rowDeep: { borderColor: '#F4433644', borderLeftWidth: 3, borderLeftColor: '#F44336' },
  rowCompleted: { opacity: 0.7, backgroundColor: '#132017', borderColor: '#2C5A36' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  topicName: { color: '#E0E0E0', fontSize: 14, fontWeight: '600' },
  topicNameCompleted: { textDecorationLine: 'line-through', color: '#A8D9B2' },
  topicSub: { color: '#666', fontSize: 11, marginTop: 2 },
  topicTime: { color: '#555', fontSize: 12, fontWeight: '600' },
  startHint: { color: '#6C63FF', fontSize: 10, marginTop: 2 },
  completedLabel: { color: '#63C27D', fontSize: 11, fontWeight: '800', marginTop: 4 },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  reasonPill: {
    color: '#CBD3E2',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#252734',
  },
  
  tagReview: { fontSize: 9, color: '#4CAF50', fontWeight: '900', backgroundColor: '#4CAF5022', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
  tagDeep: { fontSize: 9, color: '#F44336', fontWeight: '900', backgroundColor: '#F4433622', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
  tagNew: { fontSize: 9, color: '#6C63FF', fontWeight: '900', backgroundColor: '#6C63FF22', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
  tagHighYield: { fontSize: 9, color: '#2C1800', fontWeight: '900', backgroundColor: '#FFC857', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
  startHintRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  emptySection: {
    backgroundColor: '#171722',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A38',
    padding: 16,
    marginBottom: 20,
  },
  emptySectionTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  emptySectionSub: { color: '#8A91A3', fontSize: 12, lineHeight: 18, marginTop: 6 },

  restBox: { padding: 12, alignItems: 'center', backgroundColor: '#1A2A1A', borderRadius: 10, borderStyle: 'dashed', borderWidth: 1, borderColor: '#4CAF5044' },
  restText: { color: '#4CAF50', fontWeight: '600' },
});
