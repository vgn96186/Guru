import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { theme } from '../../constants/theme';

interface HeroCardProps {
  greeting: string;
  firstName: string;
  daysToInicet: number;
  daysToNeetPg: number;
}

export default React.memo(function HeroCard({ daysToInicet, daysToNeetPg }: HeroCardProps) {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  const urgentColor = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.textPrimary, theme.colors.warning],
  });

  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.label}>EXAM COUNTDOWN</Text>
      <View style={styles.row}>
        <View style={styles.examBlock}>
          <Text style={styles.examLabel}>INICET</Text>
          <Animated.Text style={[styles.examDays, daysToInicet <= 60 && { color: urgentColor }]}>
            {daysToInicet}
          </Animated.Text>
          <Text style={styles.examUnit}>days</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.examBlock}>
          <Text style={styles.examLabel}>NEET-PG</Text>
          <Animated.Text style={[styles.examDays, daysToNeetPg <= 60 && { color: urgentColor }]}>
            {daysToNeetPg}
          </Animated.Text>
          <Text style={styles.examUnit}>days</Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  label: {
    color: theme.colors.textMuted,
    ...theme.typography.caption,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: theme.spacing.md,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  examBlock: {
    flex: 1,
    alignItems: 'center',
  },
  examLabel: {
    color: theme.colors.textMuted,
    ...theme.typography.caption,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
    textTransform: 'uppercase',
  },
  examDays: {
    color: theme.colors.textPrimary,
    ...theme.typography.h1,
    letterSpacing: -1,
  },
  examUnit: {
    color: theme.colors.textMuted,
    ...theme.typography.caption,
    fontWeight: '600',
    marginTop: theme.spacing.sm,
  },
  divider: {
    width: 1,
    height: 56,
    backgroundColor: theme.colors.border,
  },
});
