import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { decorativeIdleDelayMs, useReducedMotion } from '../../motion';
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
  entryComplete = false,
}: HeroCardProps) {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  const isInicetUrgent = daysToInicet <= 60;
  const isNeetUrgent = daysToNeetPg <= 60;
  const isAnyUrgent = isInicetUrgent || isNeetUrgent;

  useEffect(() => {
    if (!entryComplete || !isAnyUrgent || reducedMotion) {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(0);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    const timer = setTimeout(() => animation.start(), decorativeIdleDelayMs);
    return () => {
      clearTimeout(timer);
      animation.stop();
    };
  }, [entryComplete, isAnyUrgent, pulseAnim, reducedMotion]);

  const urgentColor = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [n.colors.textPrimary, n.colors.warning],
  });
  const getUrgentDayStyle = (isUrgent: boolean) =>
    isUrgent
      ? entryComplete && !reducedMotion
        ? { color: urgentColor }
        : { color: n.colors.warning }
      : undefined;

  return (
    <View
      style={styles.card}
      accessibilityRole="summary"
      accessibilityLabel={`Exam countdown: INICET in ${daysToInicet} days, NEET-PG in ${daysToNeetPg} days.`}
    >
      <LinearText variant="chip" tone="muted" style={styles.label}>
        EXAM COUNTDOWN
      </LinearText>
      <View style={styles.row}>
        <View style={styles.examBlock}>
          <LinearText variant="caption" tone="muted" style={styles.examLabel}>
            INICET
          </LinearText>
          <Animated.Text style={[styles.examDays, getUrgentDayStyle(isInicetUrgent)]}>
            {daysToInicet}
          </Animated.Text>
          <LinearText variant="caption" tone="muted" style={styles.examUnit}>
            days
          </LinearText>
        </View>
        <View style={styles.divider} />
        <View style={styles.examBlock}>
          <LinearText variant="caption" tone="muted" style={styles.examLabel}>
            NEET-PG
          </LinearText>
          <Animated.Text style={[styles.examDays, getUrgentDayStyle(isNeetUrgent)]}>
            {daysToNeetPg}
          </Animated.Text>
          <LinearText variant="caption" tone="muted" style={styles.examUnit}>
            days
          </LinearText>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: n.colors.surface,
    borderRadius: n.radius.lg,
    borderWidth: 1,
    borderColor: n.colors.border,
    padding: n.spacing.lg,
    marginBottom: n.spacing.lg,
  },
  label: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: n.spacing.md,
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
    color: n.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  examDays: {
    color: n.colors.textPrimary,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
  },
  examUnit: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 48,
    backgroundColor: n.colors.border,
  },
});
