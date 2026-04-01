import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';

interface AgendaItemProps {
  time: string;
  title: string;
  type: 'review' | 'deep_dive' | 'new';
  subjectName: string;
  priority: number;
  rationale?: string;
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
  rationale,
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
        {rationale ? (
          <View style={styles.rationaleChip}>
            <Text style={styles.rationaleText}>{rationale}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'stretch',
  },
  timeWrap: {
    width: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  timeText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  card: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  yieldBadge: {
    backgroundColor: theme.colors.warningTintSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  yieldText: {
    color: theme.colors.warning,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 5,
  },
  typeBadge: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  dot: {
    color: theme.colors.textMuted,
    fontSize: 10,
  },
  subject: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  rationaleChip: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: theme.colors.primaryTintSoft,
    borderWidth: 1,
    borderColor: theme.colors.primaryTintMedium,
  },
  rationaleText: {
    color: theme.colors.primary,
    fontSize: 10,
    fontWeight: '700',
  },
});
