import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DailyPlan } from '../../../services/studyPlanner';
import { linearTheme as n } from '../../../theme/linearTheme';
import LinearText from '../../../components/primitives/LinearText';

interface PlanRowItemProps {
  day: DailyPlan;
  index: number;
  completedIds: Set<number>;
  onStart: (day: DailyPlan, index: number) => void;
}

export function PlanRowItem({ day, index, completedIds, onStart }: PlanRowItemProps) {
  const item = day.items[index];
  if (!item) return null;
  const isCompleted = completedIds.has(item.topic.id);

  return (
    <Pressable
      key={`${day.date}-${item.id}-${index}`}
      onPress={() => onStart(day, index)}
      accessibilityRole="button"
      accessibilityLabel={`${item.topic.name}, ${
        item.type === 'review' ? 'review' : item.type === 'deep_dive' ? 'deep dive' : 'study'
      }${isCompleted ? ', completed' : ''}`}
      style={[
        styles.topicRow,
        item.type === 'review' && styles.rowReview,
        item.type === 'deep_dive' && styles.rowDeep,
        isCompleted && styles.rowCompleted,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: item.topic.subjectColor }]} />
      <View style={{ flex: 1 }}>
        <View style={styles.topicNameRow}>
          {item.type === 'review' ? <LinearText style={styles.tagReview}>REV</LinearText> : null}
          {item.type === 'deep_dive' ? <LinearText style={styles.tagDeep}>DEEP</LinearText> : null}
          {item.type === 'study' ? <LinearText style={styles.tagNew}>NEW</LinearText> : null}
          {item.topic.inicetPriority >= 8 ? (<LinearText style={styles.tagHighYield}>HY</LinearText>) : null}
          <LinearText
            style={[styles.topicName, isCompleted && styles.topicNameCompleted]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {item.topic.name}
          </LinearText>
        </View>
        <LinearText style={styles.topicSub}>
          {item.topic.subjectName} · P{item.topic.inicetPriority} · {item.duration}m
        </LinearText>
      </View>
      {isCompleted ? (
        <Ionicons name="checkmark-circle" size={16} color={n.colors.success} />
      ) : (
        <Ionicons name="chevron-forward" size={14} color={n.colors.textMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: n.spacing.sm,
    paddingVertical: n.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: n.colors.border,
  },
  rowReview: {
    backgroundColor: `${n.colors.accent}05`,
  },
  rowDeep: {
    backgroundColor: `${n.colors.warning}05`,
  },
  rowCompleted: {
    opacity: 0.6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  topicNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  tagReview: {
    ...n.typography.meta,
    color: n.colors.accent,
    backgroundColor: `${n.colors.accent}15`,
    paddingHorizontal: 4,
    borderRadius: n.radius.sm,
    fontSize: 9,
    overflow: 'hidden',
  },
  tagDeep: {
    ...n.typography.meta,
    color: n.colors.warning,
    backgroundColor: `${n.colors.warning}15`,
    paddingHorizontal: 4,
    borderRadius: n.radius.sm,
    fontSize: 9,
    overflow: 'hidden',
  },
  tagNew: {
    ...n.typography.meta,
    color: n.colors.roles.brand,
    backgroundColor: `${n.colors.roles.brand}15`,
    paddingHorizontal: 4,
    borderRadius: n.radius.sm,
    fontSize: 9,
    overflow: 'hidden',
  },
  tagHighYield: {
    ...n.typography.meta,
    color: n.colors.error,
    backgroundColor: `${n.colors.error}15`,
    paddingHorizontal: 4,
    borderRadius: n.radius.sm,
    fontSize: 9,
    overflow: 'hidden',
  },
  topicName: {
    ...n.typography.bodySmall,
    color: n.colors.textPrimary,
    fontWeight: '600',
    flexShrink: 1,
  },
  topicNameCompleted: {
    textDecorationLine: 'line-through',
    color: n.colors.textSecondary,
  },
  topicSub: {
    ...n.typography.meta,
    color: n.colors.textSecondary,
  },
});
