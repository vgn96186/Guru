import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import type { Subject } from '../types';

interface Props {
  subject: Subject;
  coverage: { total: number; seen: number };
  onPress: () => void;
}

export default function SubjectCard({ subject, coverage, onPress }: Props) {
  const pct = coverage.total > 0 ? Math.round((coverage.seen / coverage.total) * 100) : 0;
  const circumference = 2 * Math.PI * 20;
  const dashOffset = circumference * (1 - pct / 100);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.colorBar, { backgroundColor: subject.colorHex }]} />
      <View style={styles.content}>
        <Text style={styles.code}>{subject.shortCode}</Text>
        <Text style={styles.name} numberOfLines={2}>{subject.name}</Text>
        <View style={styles.weightRow}>
          <View style={[styles.dot, { backgroundColor: subject.colorHex }]} />
          <Text style={styles.weight}>INICET ×{subject.inicetWeight}</Text>
        </View>
      </View>
      <View style={styles.ring}>
        <Text style={styles.pct}>{pct}%</Text>
        <Text style={styles.pctLabel}>{coverage.seen}/{coverage.total}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#1A1A24',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
    elevation: 3,
  },
  colorBar: { width: 5 },
  content: { flex: 1, padding: 12 },
  code: { color: '#9E9E9E', fontSize: 11, fontWeight: '600', marginBottom: 2 },
  name: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 6 },
  weightRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  weight: { color: '#9E9E9E', fontSize: 11 },
  ring: { padding: 12, alignItems: 'center', justifyContent: 'center', minWidth: 60 },
  pct: { color: '#fff', fontWeight: '800', fontSize: 16 },
  pctLabel: { color: '#9E9E9E', fontSize: 10 },
});
