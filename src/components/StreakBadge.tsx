import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  streak: number;
  size?: 'sm' | 'lg';
}

export default function StreakBadge({ streak, size = 'sm' }: Props) {
  const isLg = size === 'lg';
  return (
    <View style={[styles.badge, isLg && styles.badgeLg]}>
      <Text style={[styles.emoji, isLg && styles.emojiLg]}>🔥</Text>
      <Text style={[styles.count, isLg && styles.countLg]}>{streak}</Text>
      {isLg && <Text style={styles.label}> day streak</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A1A00',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeLg: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  emoji: { fontSize: 14 },
  emojiLg: { fontSize: 22 },
  count: { color: '#FF9800', fontWeight: '700', fontSize: 14, marginLeft: 2 },
  countLg: { fontSize: 24 },
  label: { color: '#FF9800', fontSize: 16, fontWeight: '600' },
});
