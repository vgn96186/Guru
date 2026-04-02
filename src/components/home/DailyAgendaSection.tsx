import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import type { TodayTask } from '../../services/studyPlanner';
import { linearTheme as n } from '../../theme/linearTheme';
import AppText from '../AppText';

interface Props {
  todayTasks: TodayTask[];
  hasNewTopics: boolean;
  onStartSession: () => void;
}

export default React.memo(function DailyAgendaSection({
  todayTasks,
  hasNewTopics,
  onStartSession,
}: Props) {
  if (todayTasks.length > 0) {
    return (
      <View style={styles.section}>
        <AppText style={styles.sectionTitle} variant="label" tone="muted">
          Today's Agenda
        </AppText>
        {todayTasks.map((task, i) => (
          <View key={i} style={styles.taskRow}>
            <View style={styles.timeBox}>
              <AppText style={styles.timeText} variant="caption" tone="muted">
                {task.timeLabel.split(' - ')[0]}
              </AppText>
            </View>
            <View
              style={[
                styles.taskCard,
                task.type === 'review' && styles.taskReview,
                task.type === 'deep_dive' && styles.taskDeep,
              ]}
            >
              <AppText style={styles.taskTitle} variant="bodySmall">
                {task.topic.name}
              </AppText>
              <AppText style={styles.taskSub} variant="caption" tone="muted">
                {task.type === 'review' ? 'REL' : task.type === 'deep_dive' ? 'DEEP' : 'NEW'} -{' '}
                {task.topic.subjectName}
              </AppText>
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.emptyStateCard}>
      <AppText style={styles.emptyEyebrow} variant="label" tone="accent">
        Next Move
      </AppText>
      <AppText style={styles.emptyTitle} variant="sectionTitle">
        {hasNewTopics ? 'Ready to learn something new!' : 'All caught up!'}
      </AppText>
      <AppText style={styles.emptySub} variant="bodySmall" tone="muted">
        {hasNewTopics
          ? 'You have new topics to explore. Start a session to begin learning!'
          : "Great work! You've covered your due reviews. Keep the momentum going!"}
      </AppText>
      {hasNewTopics && (
        <TouchableOpacity style={styles.emptyBtn} onPress={onStartSession}>
          <AppText style={styles.emptyBtnText} variant="bodySmall">
            Start New Topic
          </AppText>
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  section: { paddingHorizontal: 16 },
  sectionTitle: {
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  taskRow: { flexDirection: 'row', marginBottom: 10, alignItems: 'flex-start' },
  timeBox: { width: 58, alignItems: 'flex-end', marginRight: 12, paddingTop: 12 },
  timeText: { textAlign: 'right' },
  taskCard: {
    flex: 1,
    backgroundColor: n.colors.surface,
    padding: 12,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: n.colors.accent,
  },
  taskReview: { borderLeftColor: n.colors.success },
  taskDeep: { borderLeftColor: n.colors.error },
  taskTitle: { marginBottom: 4, fontWeight: '600' },
  taskSub: {
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  emptyStateCard: {
    backgroundColor: n.colors.surface,
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  emptyEyebrow: { marginBottom: 12, letterSpacing: 0.6, textTransform: 'uppercase' },
  emptyTitle: {
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySub: {
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyBtn: {
    backgroundColor: n.colors.accent,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  emptyBtnText: { textAlign: 'center', fontWeight: '700' },
});
