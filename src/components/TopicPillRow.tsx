import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { theme } from '../constants/theme';

interface Props {
  topics: string[];
  /** If true, wraps onto multiple lines instead of horizontal scroll */
  wrap?: boolean;
}

export default React.memo(function TopicPillRow({ topics, wrap = false }: Props) {
  if (topics.length === 0) return null;

  const pills = topics.map((t, i) => (
    <View key={i} style={styles.pill}>
      <Text style={styles.pillText}>{t}</Text>
    </View>
  ));

  if (wrap) {
    return <View style={styles.wrapRow}>{pills}</View>;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
      <View style={styles.scrollRow}>{pills}</View>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroll: { maxHeight: 48 },
  scrollRow: { flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'nowrap' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  pill: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: theme.minTouchSize,
    justifyContent: 'center',
  },
  pillText: {
    color: theme.colors.textPrimary,
    ...theme.typography.bodySmall,
    fontWeight: '500',
  },
});
