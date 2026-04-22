import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import LinearText from '../primitives/LinearText';
import { linearTheme as n } from '../../theme/linearTheme';
import { profileRepository } from '../../db/repositories';
import { PROFILE_QUERY_KEY } from '../../hooks/queries/useProfile';
import { queryClient } from '../../services/queryClient';
import { LinearGradient } from 'expo-linear-gradient';

export type CompactQuickStatsBarProps = {
  progressPercent: number;
  todayMinutes: number;
  dailyGoal: number;
  streak: number;
  level: number;
  completedSessions: number;
  onGoalChange?: (minutes: number) => void;
};

const GOAL_PRESETS = [30, 60, 90, 120, 180, 240];
const FILL_ANIM_MS = 700;

export default function CompactQuickStatsBar({
  progressPercent,
  todayMinutes,
  dailyGoal,
  streak,
  level,
  completedSessions,
  onGoalChange,
}: CompactQuickStatsBarProps) {
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [currentGoal, setCurrentGoal] = useState(dailyGoal);

  const progressClamped = Math.min(100, Math.max(0, Math.round(progressPercent)));
  const fillAnim = useRef(new Animated.Value(progressClamped)).current;

  const goalOptions = GOAL_PRESETS;

  useEffect(() => {
    setCurrentGoal(dailyGoal);
  }, [dailyGoal]);

  useEffect(() => {
    fillAnim.stopAnimation();
    Animated.timing(fillAnim, {
      toValue: progressClamped,
      duration: FILL_ANIM_MS,
      useNativeDriver: false,
    }).start();
  }, [progressClamped, fillAnim]);

  const handleGoalChange = useCallback(
    async (minutes: number) => {
      await profileRepository.updateProfile({ dailyGoalMinutes: minutes });
      await queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
      setCurrentGoal(minutes);
      onGoalChange?.(minutes);
      setShowGoalPicker(false);
    },
    [onGoalChange],
  );

  const summaryLabel = `Daily progress ${progressClamped} percent. ${todayMinutes} of ${currentGoal} minutes completed. ${streak} day streak. Level ${level}. ${completedSessions} sessions done.`;

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      style={styles.container}
      collapsable={Platform.OS === 'android' ? false : undefined}
      testID="compact-quick-stats-bar"
      accessibilityRole="summary"
      accessibilityLabel={summaryLabel}
    >
      <View style={styles.ticker}>
        <Pressable
          style={styles.tickerCell}
          onPress={() => setShowGoalPicker((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Change daily goal"
        >
          <Text style={styles.tickerLabel}>TODAY</Text>
          <Text style={[styles.tickerVal, styles.tickerValAccent]}>{progressClamped}%</Text>
          <Text style={[styles.tickerSub, styles.tickerSubAccent]}>
            {todayMinutes} / {currentGoal}m
          </Text>
          <View style={styles.barMini}>
            <Animated.View style={[styles.barMiniFill, { width: fillWidth }]}>
              <LinearGradient
                colors={[n.colors.accent, '#8b95eb']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.barMiniGradient}
              />
            </Animated.View>
          </View>
        </Pressable>

        <View style={styles.tickerCell}>
          <Text style={styles.tickerLabel}>STREAK</Text>
          <Text style={[styles.tickerVal, styles.tickerValWarn]}>{streak}</Text>
          <Text style={[styles.tickerSub, styles.tickerSubWarn]}>days</Text>
          <View style={styles.barMini} />
        </View>

        <View style={styles.tickerCell}>
          <Text style={styles.tickerLabel}>LEVEL</Text>
          <Text style={styles.tickerVal}>{level}</Text>
          <Text style={styles.tickerSub}>·</Text>
          <View style={styles.barMini} />
        </View>

        <View style={[styles.tickerCell, styles.tickerCellLast]}>
          <Text style={styles.tickerLabel}>SESSIONS</Text>
          <Text style={styles.tickerVal}>{completedSessions}</Text>
          <Text style={styles.tickerSub}>done</Text>
          <View style={styles.barMini} />
        </View>
      </View>

      {/* Goal Picker Overlay */}
      {showGoalPicker && (
        <View testID="goal-overlay" style={styles.goalPickerRow}>
          <LinearText variant="badge" tone="muted" style={styles.goalPickerTitle}>
            Daily Goal
          </LinearText>
          <View style={styles.goalChipsRow}>
            {goalOptions.map((minutes) => {
              const active = minutes === currentGoal;
              return (
                <Pressable
                  key={minutes}
                  style={({ pressed }) => [
                    styles.goalChipLarge,
                    active && styles.goalChipLargeActive,
                    pressed && styles.goalChipLargePressed,
                  ]}
                  onPress={() => handleGoalChange(minutes)}
                >
                  <Text
                    style={[styles.goalChipLargeText, active && styles.goalChipLargeTextActive]}
                  >
                    {minutes}
                    <Text
                      style={[styles.goalChipLargeUnit, active && styles.goalChipLargeTextActive]}
                    >
                      m
                    </Text>
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'visible',
    zIndex: 4,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 392,
    marginBottom: n.spacing.md,
  },
  ticker: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(9, 11, 18, 0.88)',
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tickerCell: {
    flex: 1,
    paddingHorizontal: 6,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.07)',
  },
  tickerCellLast: {
    borderRightWidth: 0,
  },
  tickerLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.08,
    color: n.colors.textMuted,
    textTransform: 'uppercase',
  },
  tickerVal: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.48,
    lineHeight: 18,
    color: n.colors.textPrimary,
  },
  tickerValAccent: {
    color: '#c7cdf7',
  },
  tickerValWarn: {
    color: '#fbbf24',
  },
  tickerSub: {
    fontSize: 10,
    fontWeight: '600',
    color: n.colors.textSecondary,
    lineHeight: 12,
  },
  tickerSubAccent: {
    color: 'rgba(167, 176, 245, 0.85)',
  },
  tickerSubWarn: {
    color: 'rgba(251, 191, 36, 0.75)',
  },
  barMini: {
    width: '100%',
    maxWidth: 72,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 2,
    overflow: 'hidden',
  },
  barMiniFill: {
    height: '100%',
    borderRadius: 999,
  },
  barMiniGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  goalPickerRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '100%',
    marginBottom: 10,
    zIndex: 20,
    elevation: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(6, 8, 12, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
  },
  goalPickerTitle: {
    marginBottom: 8,
    paddingHorizontal: 4,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  goalChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  goalChipLarge: {
    width: '31%',
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalChipLargeActive: {
    backgroundColor: n.colors.accent,
    borderColor: n.colors.accent,
    shadowColor: n.colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  },
  goalChipLargePressed: {
    opacity: 0.75,
  },
  goalChipLargeText: {
    fontSize: 12,
    fontWeight: '800',
    color: n.colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  goalChipLargeTextActive: {
    color: '#fff',
  },
  goalChipLargeUnit: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
