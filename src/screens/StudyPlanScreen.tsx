import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, StatusBar, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateStudyPlan, type DailyPlan, type StudyPlanSummary } from '../services/studyPlanner';
import { useAppStore } from '../store/useAppStore';

export default function StudyPlanScreen() {
  const [plan, setPlan] = useState<DailyPlan[]>([]);
  const [summary, setSummary] = useState<StudyPlanSummary | null>(null);
  const { profile } = useAppStore();

  useEffect(() => {
    refreshPlan();
  }, []);

  function refreshPlan() {
    const { plan: p, summary: s } = generateStudyPlan();
    setPlan(p);
    setSummary(s);
  }

  if (!summary) return null;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Dynamic Plan</Text>
          <Text style={styles.subtitle}>
            {summary.daysRemaining} days to INICET · {summary.totalHoursLeft}h content left
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
                <Text style={styles.topicTime}>{item.duration}m</Text>
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
  title: { color: '#fff', fontSize: 28, fontWeight: '900', marginBottom: 4 },
  subtitle: { color: '#9E9E9E', fontSize: 14 },
  
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
  
  tagReview: { fontSize: 9, color: '#4CAF50', fontWeight: '900', backgroundColor: '#4CAF5022', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
  tagDeep: { fontSize: 9, color: '#F44336', fontWeight: '900', backgroundColor: '#F4433622', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
  tagNew: { fontSize: 9, color: '#6C63FF', fontWeight: '900', backgroundColor: '#6C63FF22', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },

  restBox: { padding: 12, alignItems: 'center', backgroundColor: '#1A2A1A', borderRadius: 10, borderStyle: 'dashed', borderWidth: 1, borderColor: '#4CAF5044' },
  restText: { color: '#4CAF50', fontWeight: '600' },
});
