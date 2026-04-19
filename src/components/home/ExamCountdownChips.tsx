import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, StyleSheet, TouchableOpacity } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';
import LinearText from '../primitives/LinearText';
import { Ionicons } from '@expo/vector-icons';

type ExamCountdownChipsProps = {
  daysToInicet: number;
  daysToNeetPg: number;
  onRefreshExamDates?: () => Promise<void>;
};

export default function ExamCountdownChips({
  daysToInicet,
  daysToNeetPg,
  onRefreshExamDates,
}: ExamCountdownChipsProps) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const [refreshing, setRefreshing] = useState(false);

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

  const handleRefresh = async () => {
    if (!onRefreshExamDates || refreshing) return;
    setRefreshing(true);
    try {
      await onRefreshExamDates();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View
      style={styles.container}
      testID="inicet-countdown"
      accessibilityRole="text"
      accessibilityLabel={`INICET in ${daysToInicet} days, NEET-PG in ${daysToNeetPg} days.`}
    >
      <LinearText variant="bodySmall" tone="muted" style={styles.label}>
        INICET{' '}
      </LinearText>
      <Animated.Text style={[styles.days, urgentStyle]}>{daysToInicet}</Animated.Text>
      <LinearText variant="bodySmall" tone="muted" style={styles.label}>
        {' '}
        days · NEET-PG{' '}
      </LinearText>
      <Animated.Text style={[styles.days, urgentStyle]}>{daysToNeetPg}</Animated.Text>
      <LinearText variant="bodySmall" tone="muted" style={styles.label}>
        {' '}
        days
      </LinearText>
      {onRefreshExamDates && (
        <TouchableOpacity
          onPress={handleRefresh}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel="Refresh exam dates from web"
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={styles.refreshBtn}
        >
          <Ionicons
            name={refreshing ? 'sync-outline' : 'refresh-outline'}
            size={14}
            color={n.colors.textSecondary}
          />
        </TouchableOpacity>
      )}
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
  refreshBtn: {
    marginLeft: 6,
    padding: 2,
  },
});
