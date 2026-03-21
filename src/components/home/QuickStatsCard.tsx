import React, { useCallback, useState } from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { theme } from '../../constants/theme';
import { profileRepository } from '../../db/repositories';
import { useAppStore } from '../../store/useAppStore';

const GOAL_PRESETS = [30, 60, 90, 120, 180, 240];

interface QuickStatsCardProps {
  progressPercent: number;
  todayMinutes: number;
  dailyGoal: number;
  streak: number;
  level: number;
  completedSessions: number;
}

const RING_SIZE = 64;
const STROKE_WIDTH = 5;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = RADIUS * 2 * Math.PI;

export default React.memo(function QuickStatsCard({
  progressPercent,
  todayMinutes,
  dailyGoal,
  streak,
  level,
  completedSessions,
}: QuickStatsCardProps) {
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const progressClamped = Math.min(100, Math.max(0, progressPercent));
  const strokeDashoffset = CIRCUMFERENCE - (CIRCUMFERENCE * progressClamped) / 100;
  const done = progressClamped >= 100;
  const ringColor = done ? theme.colors.success : theme.colors.primary;
  const minutesLeft = Math.max(0, dailyGoal - todayMinutes);

  const handleGoalChange = useCallback(async (minutes: number) => {
    await profileRepository.updateProfile({ dailyGoalMinutes: minutes });
    useAppStore.getState().refreshProfile?.();
    setShowGoalPicker(false);
  }, []);

  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.topRow}>
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
              stroke={ringColor}
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
            <Text style={[styles.ringPercent, done && { color: theme.colors.success }]}>
              {progressClamped}%
            </Text>
          </View>
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{done ? 'Goal reached' : `${minutesLeft} min left`}</Text>
          <Pressable onPress={() => setShowGoalPicker((v) => !v)} hitSlop={6}>
            <Text style={styles.sub}>
              {done ? 'Stack one more high-yield block.' : `${todayMinutes} of `}
              {!done && <Text style={styles.goalTappable}>{dailyGoal} min</Text>}
              {!done && ' today'}
            </Text>
          </Pressable>
        </View>
      </View>

      {showGoalPicker && (
        <View style={styles.goalRow}>
          {GOAL_PRESETS.map((m) => (
            <Pressable
              key={m}
              style={[styles.goalChip, m === dailyGoal && styles.goalChipActive]}
              onPress={() => handleGoalChange(m)}
            >
              <Text style={[styles.goalChipText, m === dailyGoal && styles.goalChipTextActive]}>
                {m >= 60 ? `${m / 60}h` : `${m}m`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.metaRow}>
        <MetaChip label={`${streak}d streak`} />
        <MetaChip label={`Lv ${level}`} />
        <MetaChip label={`${completedSessions} session${completedSessions === 1 ? '' : 's'}`} />
      </View>
    </View>
  );
});

function MetaChip({ label }: { label: string }) {
  return (
    <View style={styles.metaChip}>
      <Text style={styles.metaChipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  ringWrap: { width: RING_SIZE, height: RING_SIZE },
  ringLabel: { alignItems: 'center', justifyContent: 'center' },
  ringPercent: {
    color: theme.colors.textPrimary,
    fontWeight: '800',
    fontSize: 13,
  },
  copy: { flex: 1 },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  sub: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 3,
  },
  goalTappable: {
    color: theme.colors.primary,
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
  },
  goalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  goalChip: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  goalChipActive: {
    backgroundColor: `${theme.colors.primary}22`,
    borderColor: theme.colors.primary,
  },
  goalChipText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  goalChipTextActive: {
    color: theme.colors.primary,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  metaChip: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  metaChipText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
});
