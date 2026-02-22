import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { TodayTask } from '../../services/studyPlanner';

interface Props {
  todayTasks: TodayTask[];
  hasNewTopics: boolean;
  onStartSession: () => void;
}

export default function DailyAgendaSection({ todayTasks, hasNewTopics, onStartSession }: Props) {
  if (todayTasks.length > 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📅 Today's Agenda</Text>
        {todayTasks.map((task, i) => (
          <View key={i} style={styles.taskRow}>
            <View style={styles.timeBox}>
              <Text style={styles.timeText}>{task.timeLabel.split(' - ')[0]}</Text>
            </View>
            <View style={[
              styles.taskCard,
              task.type === 'review' && styles.taskReview,
              task.type === 'deep_dive' && styles.taskDeep,
            ]}>
              <Text style={styles.taskTitle} numberOfLines={1}>{task.topic.name}</Text>
              <Text style={styles.taskSub}>
                {task.type === 'review' ? 'REL' : task.type === 'deep_dive' ? 'DEEP' : 'NEW'} · {task.topic.subjectName}
              </Text>
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.emptyStateCard}>
      <Text style={styles.emptyEmoji}>✨</Text>
      <Text style={styles.emptyTitle}>
        {hasNewTopics ? 'Ready to learn something new!' : 'All caught up!'}
      </Text>
      <Text style={styles.emptySub}>
        {hasNewTopics
          ? 'You have new topics to explore. Start a session to begin learning!'
          : 'Great work! You\'ve covered your due reviews. Keep the momentum going!'}
      </Text>
      {hasNewTopics && (
        <TouchableOpacity style={styles.emptyBtn} onPress={onStartSession}>
          <Text style={styles.emptyBtnText}>Start New Topic</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16 },
  sectionTitle: { color: '#9E9E9E', fontWeight: '700', fontSize: 13, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  taskRow: { flexDirection: 'row', marginBottom: 10, alignItems: 'center' },
  timeBox: { width: 50, alignItems: 'flex-end', marginRight: 12 },
  timeText: { color: '#666', fontSize: 12, fontWeight: '700' },
  taskCard: { flex: 1, backgroundColor: '#1A1A24', padding: 12, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#6C63FF' },
  taskReview: { borderLeftColor: '#4CAF50' },
  taskDeep: { borderLeftColor: '#F44336' },
  taskTitle: { color: '#fff', fontSize: 13, fontWeight: '600' },
  taskSub: { color: '#9E9E9E', fontSize: 10, marginTop: 2, textTransform: 'uppercase' },
  emptyStateCard: { backgroundColor: '#1A1A24', borderRadius: 16, padding: 24, marginHorizontal: 16, marginBottom: 16, alignItems: 'center' },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: '#fff', fontWeight: '700', fontSize: 18, marginBottom: 8, textAlign: 'center' },
  emptySub: { color: '#9E9E9E', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  emptyBtn: { backgroundColor: '#6C63FF', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
