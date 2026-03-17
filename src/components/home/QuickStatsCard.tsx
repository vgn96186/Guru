import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { theme } from '../../constants/theme';

interface QuickStatsCardProps {
  progressPercent: number;
  todayMinutes: number;
  dailyGoal: number;
  streak: number;
  level: number;
  completedSessions: number;
}

const RING_SIZE = 64;
const STROKE_WIDTH = 6;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = RADIUS * 2 * Math.PI;

export default function QuickStatsCard({
  progressPercent,
  todayMinutes,
  dailyGoal,
  streak,
  level,
  completedSessions,
}: QuickStatsCardProps) {
  const progressClamped = Math.min(100, Math.max(0, progressPercent));
  const strokeDashoffset = CIRCUMFERENCE - (CIRCUMFERENCE * progressClamped) / 100;

  return (
    <View
      style={styles.card}
      accessibilityRole="summary"
      accessibilityLabel={`Your progress today. ${progressClamped}% of daily goal. ${streak} day streak. Level ${level}. ${completedSessions} sessions.`}
    >
      <View style={styles.topRow}>
        <View style={styles.copy}>
          <Text style={styles.title}>Your Progress</Text>
          <Text style={styles.sub}>
            {progressClamped >= 100
              ? 'Daily goal complete. Stack one more high-yield block.'
              : `${Math.max(0, dailyGoal - todayMinutes)} min left to hit today target.`}
          </Text>
        </View>
        <View style={styles.ringWrap}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              stroke={theme.colors.border}
              strokeWidth={STROKE_WIDTH}
              fill="transparent"
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              stroke={progressClamped >= 100 ? theme.colors.success : theme.colors.primary}
              strokeWidth={STROKE_WIDTH}
              fill="transparent"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              rotation="-90"
              origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
            />
          </Svg>
          <View style={[StyleSheet.absoluteFill, styles.ringLabel]} pointerEvents="none">
            <Text style={styles.ringPercent}>{progressClamped}%</Text>
          </View>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipText}>{streak} day streak</Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipText}>Level {level}</Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipText}>
            {completedSessions} session{completedSessions === 1 ? '' : 's'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.panel,
    borderRadius: theme.radius.xxl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
    ...theme.shadows.card,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.lg },
  copy: { flex: 1 },
  title: { color: theme.colors.textPrimary, ...theme.typography.title },
  sub: { color: theme.colors.textSecondary, ...theme.typography.caption, lineHeight: 20, marginTop: theme.spacing.xs },
  ringWrap: { width: RING_SIZE, height: RING_SIZE },
  ringLabel: { alignItems: 'center', justifyContent: 'center' },
  ringPercent: { color: theme.colors.textPrimary, fontWeight: '800', fontSize: 11 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.xl },
  metaChip: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  metaChipText: { color: theme.colors.textSecondary, fontSize: 11, fontWeight: '700' },
});
