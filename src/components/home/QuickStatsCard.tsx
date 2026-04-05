import React, { useCallback, useState } from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme as n } from '../../theme/linearTheme';
import LinearSurface from '../primitives/LinearSurface';
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

const RING_SIZE = 88;
const STROKE_WIDTH = 8;
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
  const ringColor = done ? n.colors.success : n.colors.accent;
  const minutesLeft = Math.max(0, Math.min(dailyGoal, dailyGoal - todayMinutes));

  const handleGoalChange = useCallback(async (minutes: number) => {
    await profileRepository.updateProfile({ dailyGoalMinutes: minutes });
    useAppStore.getState().refreshProfile?.();
    setShowGoalPicker(false);
  }, []);

  return (
    <LinearSurface
      style={[styles.card, done && styles.cardDone]}
      borderColor={done ? `${n.colors.success}55` : 'rgba(255,255,255,0.10)'}
      accessibilityRole="summary"
      accessibilityLabel={`Daily progress: ${progressClamped} percent. ${
        done ? 'Goal reached' : `${minutesLeft} minutes left`
      }. ${streak} day streak, level ${level}, ${completedSessions} sessions completed.`}
    >
      <View style={styles.headerRow}>
        <Ionicons
          name="speedometer-outline"
          size={18}
          color={done ? n.colors.success : n.colors.accent}
        />
        <Text style={[styles.label, done && { color: n.colors.success }]}>DAILY PROGRESS</Text>
      </View>

      <View style={styles.progressRow}>
        <View style={styles.ringWrap}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              stroke={done ? 'rgba(63,185,80,0.08)' : n.colors.primaryTintSoft}
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
            <Text style={[styles.ringPercent, done && { color: n.colors.success }]}>
              {progressClamped}%
            </Text>
          </View>
        </View>

        <View style={styles.copy}>
          <Text style={styles.minutesBig}>
            {todayMinutes}
            <Text style={styles.minutesUnit}> min</Text>
          </Text>
          <View style={styles.goalToggle}>
            {done ? (
              <View style={styles.doneRow}>
                <Ionicons name="checkmark-circle" size={14} color={n.colors.success} />
                <Text style={styles.doneLabel}>Goal reached</Text>
              </View>
            ) : (
              <View style={styles.goalInline}>
                <Text style={styles.minutesLeft}>{minutesLeft} min left</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.goalBadge,
                    pressed && styles.goalBadgePressed,
                    showGoalPicker && styles.goalBadgeActive,
                  ]}
                  onPress={() => setShowGoalPicker((v) => !v)}
                  hitSlop={6}
                >
                  <Ionicons name="flag" size={11} color={n.colors.accent} />
                  <Text style={styles.goalBadgeText}>{dailyGoal}m</Text>
                </Pressable>
                {showGoalPicker &&
                  GOAL_PRESETS.filter((m) => m !== dailyGoal).map((m) => (
                    <Pressable
                      key={m}
                      style={({ pressed }) => [styles.goalChip, pressed && styles.goalChipPressed]}
                      onPress={() => handleGoalChange(m)}
                    >
                      <Text style={styles.goalChipText}>{m >= 60 ? `${m / 60}h` : `${m}m`}</Text>
                    </Pressable>
                  ))}
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <MetaChip
          label={`${streak}d streak`}
          icon="flame"
          color={n.colors.warning}
          bgColor={'rgba(217,119,6,0.08)'}
        />
        <MetaChip
          label={`Lv ${level}`}
          icon="flash"
          color={n.colors.accent}
          bgColor={n.colors.primaryTintSoft}
        />
        <MetaChip
          label={`${completedSessions} session${completedSessions === 1 ? '' : 's'}`}
          icon="checkmark-done"
          color={n.colors.accent}
          bgColor="rgba(33, 150, 243, 0.13)"
        />
      </View>
    </LinearSurface>
  );
});

function MetaChip({
  label,
  icon,
  color,
  bgColor,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bgColor: string;
}) {
  return (
    <View style={[styles.metaChip, { backgroundColor: bgColor }]}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.metaChipText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    marginBottom: n.spacing.lg,
    width: '100%',
    justifyContent: 'space-between',
  },
  cardDone: {
    backgroundColor: 'transparent',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: n.spacing.md,
  },
  label: {
    color: n.colors.textMuted,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.5,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: n.spacing.md,
  },
  ringWrap: { width: RING_SIZE, height: RING_SIZE },
  ringLabel: { alignItems: 'center', justifyContent: 'center' },
  ringPercent: {
    color: n.colors.textPrimary,
    fontWeight: '900',
    fontSize: 18,
  },
  copy: { flex: 1 },
  minutesBig: {
    color: n.colors.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  minutesUnit: {
    fontSize: 15,
    fontWeight: '600',
    color: n.colors.textMuted,
  },
  minutesLeft: {
    color: n.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  doneLabel: {
    color: n.colors.success,
    fontSize: 13,
    fontWeight: '700',
  },
  goalInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  goalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: n.colors.primaryTintSoft,
    borderRadius: n.radius.full,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  goalToggle: {
    alignSelf: 'flex-start',
  },
  goalBadgeActive: {
    borderWidth: 1.5,
    borderColor: n.colors.accent,
  },
  goalBadgePressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  goalBadgeText: {
    color: n.colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  goalChip: {
    backgroundColor: n.colors.surface,
    borderRadius: n.radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  goalChipPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  goalChipText: {
    color: n.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: n.spacing.md,
    paddingTop: n.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  metaChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: n.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
  },
  metaChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
