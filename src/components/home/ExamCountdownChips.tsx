import React, { useEffect, useRef } from 'react';
import { Animated, Text, View, StyleSheet } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';

type ExamCountdownChipsProps = {
  daysToInicet: number;
  daysToNeetPg: number;
};

export default function ExamCountdownChips({
  daysToInicet,
  daysToNeetPg,
}: ExamCountdownChipsProps) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  const urgentStyle = { color: n.colors.warning, opacity: pulseAnim };

  return (
    <View
      style={styles.container}
      testID="inicet-countdown"
      accessibilityRole="text"
      accessibilityLabel={`INICET in ${daysToInicet} days, NEET-PG in ${daysToNeetPg} days.`}
    >
      <Text style={styles.label}>INICET </Text>
      <Animated.Text style={[styles.days, urgentStyle]}>{daysToInicet}</Animated.Text>
      <Text style={styles.label}> days · NEET-PG </Text>
      <Animated.Text style={[styles.days, urgentStyle]}>{daysToNeetPg}</Animated.Text>
      <Text style={styles.label}> days</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 6,
    gap: 2,
  },
  label: {
    color: n.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  days: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
});
