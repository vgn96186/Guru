import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateStudyPlan, type DailyPlan, type StudyPlanSummary } from '../services/studyPlanner';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import { useAppStore } from '../store/useAppStore';
import { updateUserProfile } from '../db/queries/progress';

type Nav = NativeStackNavigationProp<HomeStackParamList>;

export default function StudyPlanScreen() {
  const navigation = useNavigation<Nav>();
  const [plan, setPlan] = useState<DailyPlan[]>([]);
  const [summary, setSummary] = useState<StudyPlanSummary | null>(null);
  const { profile, refreshProfile } = useAppStore();

  useEffect(() => {
    refreshPlan();
  }, []);

  async function refreshPlan() {
    const { plan: p, summary: s } = await generateStudyPlan();
    setPlan(p);
    setSummary(s);
  }

  function toggleExamType() {
    const newType = profile?.examType === 'NEET' ? 'INICET' : 'NEET';
    updateUserProfile({ examType: newType });
    refreshProfile();
    // Re-generate plan after state update
    setTimeout(() => refreshPlan(), 50);
  }

  if (!summary) return null;

  const examLabel = summary.examType === 'NEET' ? 'NEET PG' : 'INICET';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Dynamic Plan</Text>
            <TouchableOpacity style={styles.examToggle} onPress={toggleExamType} activeOpacity={0.8}>
              <Text style={[styles.examToggleOption, summary.examType === 'INICET' && styles.examToggleActive]}>INICET</Text>
              <Text style={styles.examToggleDivider}>|</Text>
              <Text style={[styles.examToggleOption, summary.examType === 'NEET' && styles.examToggleActive]}>NEET PG</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>
            {summary.daysRemaining} days to {examLabel} · {summary.totalHoursLeft}h content left
          </Text>
        </View>

        {/* Stats Card */}
        <View style={[styles.card, !summary.feasible && styles.cardWarning]}>
          <Text style={styles.cardTitle}>Daily Target</Text>
          <View style={styles.cardRow}>
            <Text style={styles.cardValue}>{summary.requiredHoursPerDay}h</Text>
            <Text style={styles.cardLabel}>/ day needed</Text>
          </View>
          <Text style={styles.cardSub}>{summary.message}</Text>
          
          <View style={styles.progressContainer}>
            <View style={styles.progressBarBg}>
              <View 
                style={[
                  styles.progressBarFill, 
                  { width: `${Math.min(100, (profile?.dailyGoalMinutes || 120) / (summary.requiredHoursPerDay * 60) * 100)}%` },
                  !summary.feasible && { backgroundColor: '#FF9800' }
                ]} 
              />
            </View>
            <Text style={styles.progressLabel}>
              Current Goal: {Math.round((profile?.dailyGoalMinutes || 120) / 60)}h
            </Text>
          </View>
        </View>

        {/* Plan List */}
        <Text style={styles.sectionTitle}>Upcoming Schedule</Text>
        {plan.map((day, i) => (
          <View key={i} style={styles.dayBlock}>
            <View style={styles.dayHeader}>
              <Text style={[styles.dayLabel, i===0 && { color: '#6C63FF' }]}>{day.dayLabel}</Text>
              <Text style={styles.dayMeta}>
                {Math.round(day.totalMinutes / 60)}h · {day.items.length} tasks
              </Text>
            </View>
            
            {day.items.map((item, idx) => (
              <TouchableOpacity 
                key={item.id + idx} 
                style={[
                  styles.topicRow,
                  item.type === 'review' && styles.rowReview,
                  item.type === 'deep_dive' && styles.rowDeep
                ]}
                activeOpacity={0.7}
                onPress={() => {
                  navigation.navigate('Session', { mood: 'good', mode: 'deep' });
                }}
              >
                <View style={[styles.dot, { backgroundColor: item.topic.subjectColor }]} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {item.type === 'review' && <Text style={styles.tagReview}>REL</Text>}
                    {item.type === 'deep_dive' && <Text style={styles.tagDeep}>DEEP</Text>}
                    {item.type === 'study' && <Text style={styles.tagNew}>NEW</Text>}
                    <Text style={styles.topicName}>{item.topic.name}</Text>
                  </View>
                  <Text style={styles.topicSub}>{item.topic.subjectName}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.topicTime}>{item.duration}m</Text>
                  <Text style={styles.startHint}>Tap to start →</Text>
                </View>
              </TouchableOpacity>
            ))}
            
            {day.isRestDay && (
              <View style={styles.restBox}>
                <Text style={styles.restText}>🧘 Rest Day / Catch Up</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  content: { padding: 20, paddingBottom: 60 },
  header: { marginBottom: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { color: '#fff', fontSize: 28, fontWeight: '900' },
  subtitle: { color: '#9E9E9E', fontSize: 14 },
  examToggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A2E', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#6C63FF44', gap: 6 },
  examToggleOption: { color: '#555', fontSize: 12, fontWeight: '700' },
  examToggleActive: { color: '#6C63FF' },
  examToggleDivider: { color: '#333', fontSize: 12 },
  
  card: { backgroundColor: '#1A1A24', borderRadius: 16, padding: 20, marginBottom: 32, borderWidth: 1, borderColor: '#333' },
  cardWarning: { borderColor: '#F44336', backgroundColor: '#2A0A0A' },
  cardTitle: { color: '#9E9E9E', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  cardRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  cardValue: { color: '#fff', fontSize: 32, fontWeight: '900' },
  cardLabel: { color: '#666', fontSize: 14, fontWeight: '600' },
  cardSub: { color: '#CCC', fontSize: 14, marginBottom: 16, fontStyle: 'italic' },
  
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
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  topicName: { color: '#E0E0E0', fontSize: 14, fontWeight: '600' },
  topicSub: { color: '#666', fontSize: 11, marginTop: 2 },
  topicTime: { color: '#555', fontSize: 12, fontWeight: '600' },
  startHint: { color: '#6C63FF', fontSize: 10, marginTop: 2 },
  
  tagReview: { fontSize: 9, color: '#4CAF50', fontWeight: '900', backgroundColor: '#4CAF5022', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
  tagDeep: { fontSize: 9, color: '#F44336', fontWeight: '900', backgroundColor: '#F4433622', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
  tagNew: { fontSize: 9, color: '#6C63FF', fontWeight: '900', backgroundColor: '#6C63FF22', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },

  restBox: { padding: 12, alignItems: 'center', backgroundColor: '#1A2A1A', borderRadius: 10, borderStyle: 'dashed', borderWidth: 1, borderColor: '#4CAF5044' },
  restText: { color: '#4CAF50', fontWeight: '600' },
});
