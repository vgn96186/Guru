import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { theme } from '../../constants/theme';

interface HeroCardProps {
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
    <View
      style={styles.card}
      accessibilityRole="summary"
      accessibilityLabel={`Exam countdown: INICET in ${daysToInicet} days, NEET-PG in ${daysToNeetPg} days.`}
    >
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
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: theme.spacing.md,
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
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  examDays: {
    color: theme.colors.textPrimary,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
  },
  examUnit: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 48,
    backgroundColor: theme.colors.border,
  },
});
