import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';

interface AgendaItemProps {
  time: string;
  title: string;
  type: 'review' | 'deep_dive' | 'new';
  subjectName: string;
  priority: number;
  onPress: () => void;
}

const TYPE_COLORS = {
  new: theme.colors.primary,
  review: theme.colors.success,
  deep_dive: theme.colors.error,
} as const;

const TYPE_LABELS = {
  new: 'NEW',
  review: 'REVIEW',
  deep_dive: 'DEEP DIVE',
} as const;

export default React.memo(function AgendaItem({
  time,
  title,
  type,
  subjectName,
  priority,
  onPress,
}: AgendaItemProps) {
  const accent = TYPE_COLORS[type];

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
      accessibilityHint={`${type} task for ${subjectName}`}
    >
      <View style={styles.timeWrap}>
        <Text style={styles.timeText}>{time}</Text>
      </View>
      <View style={[styles.card, { borderLeftColor: accent }]}>
        <View style={styles.cardTop}>
          <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
            {title}
          </Text>
          {priority >= 8 && (
            <View style={styles.yieldBadge}>
              <Text style={styles.yieldText}>HY</Text>
            </View>
          )}
        </View>
        <View style={styles.meta}>
          <Text style={[styles.typeBadge, { color: accent }]}>{TYPE_LABELS[type]}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.subject}>{subjectName}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
    alignItems: 'stretch',
  },
  timeWrap: {
    width: 48,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginRight: theme.spacing.lg,
  },
  timeText: {
    color: theme.colors.textMuted,
    ...theme.typography.caption,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  card: {
    flex: 1,
    backgroundColor: theme.colors.card,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
    ...theme.shadows.sm,
    minHeight: theme.minTouchSize,
    justifyContent: 'center',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  title: {
    flex: 1,
    color: theme.colors.textPrimary,
    ...theme.typography.bodySmall,
    fontWeight: '600',
    lineHeight: 20,
  },
  yieldBadge: {
    backgroundColor: theme.colors.warningTintSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
  },
  yieldText: {
    color: theme.colors.warning,
    ...theme.typography.caption,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  typeBadge: {
    ...theme.typography.caption,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dot: {
    color: theme.colors.textMuted,
    ...theme.typography.caption,
  },
  subject: {
    color: theme.colors.textMuted,
    ...theme.typography.caption,
    fontWeight: '500',
  },
});
