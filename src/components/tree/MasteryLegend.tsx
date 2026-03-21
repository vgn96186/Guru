import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';

export interface MasteryLegendProps {}

const LEVELS = [
  { label: '0', tone: '#2F3A52', note: 'Unseen' },
  { label: '3', tone: '#6E7DFF', note: 'BTR anchored' },
  { label: '6', tone: '#2BD39D', note: 'Question ready' },
  { label: '9', tone: '#FFB45C', note: 'Stable recall' },
];

export default function MasteryLegend(_props: MasteryLegendProps) {
  return (
    <View style={styles.card}>
      <View style={styles.accentRail} />
      <Text style={styles.eyebrow}>Mastery</Text>
      <Text style={styles.title}>Visible 10-level ladder</Text>
      <Text style={styles.body}>
        Early levels track exposure. Later levels reflect actual performance and retention.
      </Text>
      <View style={styles.row}>
        {LEVELS.map((level) => (
          <View key={level.label} style={styles.item}>
            <View style={[styles.ring, { borderColor: level.tone }]}>
              <View style={[styles.ringCore, { backgroundColor: `${level.tone}22` }]} />
              <Text style={styles.ringLabel}>{level.label}</Text>
            </View>
            <Text style={styles.note}>{level.note}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 240,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(10, 14, 24, 0.82)',
    padding: theme.spacing.lg,
    overflow: 'hidden',
  },
  accentRail: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(72, 184, 255, 0.55)',
  },
  eyebrow: {
    color: '#97A9FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginTop: theme.spacing.sm,
  },
  body: {
    color: '#9BA7BF',
    fontSize: 13,
    lineHeight: 19,
    marginTop: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  item: {
    width: 72,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  ring: {
    width: 54,
    height: 54,
    borderRadius: 999,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  ringCore: {
    position: 'absolute',
    inset: 8,
    borderRadius: 999,
  },
  ringLabel: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  note: {
    color: '#8EA2C1',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
  },
});
