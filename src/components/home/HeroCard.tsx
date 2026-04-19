import React from 'react';
import { View, StyleSheet } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';
import LinearText from '../primitives/LinearText';

interface HeroCardProps {
  daysToInicet: number;
  daysToNeetPg: number;
  entryComplete?: boolean;
}

export default React.memo(function HeroCard({
  daysToInicet,
  daysToNeetPg,
  entryComplete: _ec = false,
}: HeroCardProps) {
  // Pick the nearest exam as the hero number; the other becomes a stat line.
  const nearestInicet = daysToInicet <= daysToNeetPg;
  const heroName = nearestInicet ? 'INICET' : 'NEET-PG';
  const heroDays = nearestInicet ? daysToInicet : daysToNeetPg;
  const otherName = nearestInicet ? 'NEET-PG' : 'INICET';
  const otherDays = nearestInicet ? daysToNeetPg : daysToInicet;
  const isUrgent = heroDays <= 90;

  return (
    <View
      style={styles.card}
      accessibilityRole="summary"
      accessibilityLabel={`Exam countdown: INICET in ${daysToInicet} days, NEET-PG in ${daysToNeetPg} days.`}
    >
      <LinearText variant="label" tone="muted" style={styles.kicker}>
        Next · {heroName}
      </LinearText>
      <View style={styles.heroRow}>
        <LinearText style={styles.heroNumber}>{heroDays}</LinearText>
        <LinearText variant="body" tone="secondary" style={styles.heroUnit}>
          days
        </LinearText>
      </View>
      <View style={styles.footer}>
        <LinearText variant="bodySmall" tone="muted">
          {otherName} in {otherDays} days
        </LinearText>
        {isUrgent ? (
          <View style={styles.warnRow}>
            <View style={styles.warnDot} />
            <LinearText variant="bodySmall" tone="warning">
              within 90 days
            </LinearText>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0A0A0B',
    borderRadius: n.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: n.spacing.lg,
    marginBottom: n.spacing.lg,
  },
  kicker: { marginBottom: n.spacing.sm },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  heroNumber: {
    fontFamily: 'Inter_700Bold',
    fontSize: 72,
    lineHeight: 72,
    letterSpacing: -2.8,
    color: n.colors.textPrimary,
  },
  heroUnit: { marginLeft: 2 },
  footer: {
    marginTop: n.spacing.md,
    paddingTop: n.spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  warnDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: n.colors.warning },
});
