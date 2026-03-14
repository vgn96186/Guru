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

export default React.memo(function AgendaItem({ time, title, type, subjectName, priority, onPress }: AgendaItemProps) {
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
      <View style={[
        styles.card,
        type === 'review' && styles.review,
        type === 'deep_dive' && styles.deep
      ]}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{type.toUpperCase().replace('_', ' ')} · {subjectName}</Text>
        <View style={styles.badgeRow}>
          {type === 'review' && <Text style={styles.badge}>Due now</Text>}
          {type === 'deep_dive' && <Text style={styles.badge}>Weak topic</Text>}
          {priority >= 8 && <Text style={styles.badge}>High yield</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: 8, alignItems: 'center' },
  timeWrap: { width: 44, alignItems: 'flex-end', marginRight: 10 },
  timeText: { color: '#B1B7C5', fontSize: 11, fontWeight: '700' },
  card: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    padding: 12,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary
  },
  review: { borderLeftColor: theme.colors.success },
  deep: { borderLeftColor: theme.colors.error },
  title: { color: theme.colors.textPrimary, fontSize: 13, fontWeight: '600' },
  sub: { color: theme.colors.textSecondary, fontSize: 10, marginTop: 2, textTransform: 'uppercase' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  badge: {
    color: '#D7DEEC',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: theme.colors.card,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
});
