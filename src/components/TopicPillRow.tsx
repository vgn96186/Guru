import React from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import AppText from './AppText';
import { theme } from '../constants/theme';

interface Props {
  topics: string[];
  /** If true, wraps onto multiple lines instead of horizontal scroll */
  wrap?: boolean;
  truncate?: boolean;
  maxVisible?: number;
  rowStyle?: StyleProp<ViewStyle>;
  pillStyle?: StyleProp<TextStyle>;
  moreBadgeStyle?: StyleProp<TextStyle>;
}

export default React.memo(function TopicPillRow({
  topics,
  wrap = false,
  truncate = false,
  maxVisible,
  rowStyle,
  pillStyle,
  moreBadgeStyle,
}: Props) {
  if (topics.length === 0) return null;

  const visibleTopics = typeof maxVisible === 'number' ? topics.slice(0, maxVisible) : topics;
  const hiddenCount = topics.length - visibleTopics.length;

  const pills = visibleTopics.map((topic, index) => (
    <AppText
      key={`${topic}-${index}`}
      variant="chip"
      truncate={truncate}
      style={[styles.pill, pillStyle]}
    >
      {topic}
    </AppText>
  ));

  if (hiddenCount > 0) {
    pills.push(
      <AppText key="__more" variant="badge" tone="muted" style={[styles.moreBadge, moreBadgeStyle]}>
        +{hiddenCount}
      </AppText>,
    );
  }

  if (wrap) {
    return <View style={[styles.wrapRow, rowStyle]}>{pills}</View>;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
      <View style={[styles.scrollRow, rowStyle]}>{pills}</View>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroll: { maxHeight: 44, minWidth: 0 },
  scrollRow: { flexDirection: 'row', gap: 8, flexWrap: 'nowrap', minWidth: 0 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, minWidth: 0 },
  pill: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
    alignSelf: 'flex-start',
    flexShrink: 1,
    maxWidth: '100%',
  },
  moreBadge: {
    alignSelf: 'center',
    paddingHorizontal: 4,
  },
});
