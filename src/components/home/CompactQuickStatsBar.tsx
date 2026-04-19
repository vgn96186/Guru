import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import LinearSurface from '../primitives/LinearSurface';
import LinearText from '../primitives/LinearText';
import { linearTheme as n } from '../../theme/linearTheme';
import { useReducedMotion, motion } from '../../motion';
import { profileRepository } from '../../db/repositories';
import { PROFILE_QUERY_KEY } from '../../hooks/queries/useProfile';
import { queryClient } from '../../services/queryClient';

type CompactQuickStatsBarProps = {
  progressPercent: number;
  todayMinutes: number;
  dailyGoal: number;
  streak: number;
  level: number;
  completedSessions: number;
};

const GOAL_PRESETS = [30, 60, 90, 120, 180, 240];
const RING_SIZE = 50;
const STROKE_WIDTH = 5;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = RADIUS * 2 * Math.PI;
const GOAL_OVERLAY_WIDTH = 236;

export default function CompactQuickStatsBar({
  progressPercent,
  todayMinutes,
  dailyGoal,
  streak,
  level,
  completedSessions,
}: CompactQuickStatsBarProps) {
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [goalPillFrame, setGoalPillFrame] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [statsShellWidth, setStatsShellWidth] = useState(0);
  const flameScale = useRef(new Animated.Value(1)).current;
  const flameLift = useRef(new Animated.Value(0)).current;
  const emberScale = useRef(new Animated.Value(0.92)).current;
  const emberLift = useRef(new Animated.Value(1.4)).current;
  const emberOpacity = useRef(new Animated.Value(0.34)).current;
  const glowOpacity = useRef(new Animated.Value(0.72)).current;
  const glowScale = useRef(new Animated.Value(1)).current;
  const reducedMotion = useReducedMotion();
  const progressClamped = Math.min(100, Math.max(0, Math.round(progressPercent)));
  const goalOptions = GOAL_PRESETS.filter((minutes) => minutes !== dailyGoal);
  const goalOverlayPosition = useMemo(() => {
    if (!goalPillFrame) {
      return {
        left: Math.max(8, statsShellWidth - GOAL_OVERLAY_WIDTH - 12),
        top: 8,
      };
    }
    const maxLeft = Math.max(8, statsShellWidth - GOAL_OVERLAY_WIDTH - 8);
    const anchoredLeft = goalPillFrame.x + goalPillFrame.width - GOAL_OVERLAY_WIDTH;
    return {
      left: Math.max(8, Math.min(anchoredLeft, maxLeft)),
      top: Math.max(0, goalPillFrame.y - 6),
    };
  }, [goalPillFrame, statsShellWidth]);

  const handleGoalChange = useCallback(async (minutes: number) => {
    await profileRepository.updateProfile({ dailyGoalMinutes: minutes });
    await queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
    setShowGoalPicker(false);
  }, []);

  const handleStatsShellLayout = useCallback((event: LayoutChangeEvent) => {
    setStatsShellWidth(event.nativeEvent.layout.width);
  }, []);

  const handleGoalPillLayout = useCallback((event: LayoutChangeEvent) => {
    setGoalPillFrame(event.nativeEvent.layout);
  }, []);

  useEffect(() => {
    // Four-phase flame breath: IGNITE → DIP → RECOVER → SETTLE.
    // Tracks sourced from the original choreography 1:1; see git history
    // before 2025-XX-XX for the inline-timing version this replaced.
    const anim = motion.keyframes(
      {
        flameScale:  { value: flameScale,  rest: 1,    frames: [1.08, 0.97, 1.03, 1]    },
        flameLift:   { value: flameLift,   rest: 0,    frames: [-1.2, 0.4, -0.4, 0]     },
        emberScale:  { value: emberScale,  rest: 0.96, frames: [1.02, 0.88, 0.98, 0.92] },
        emberLift:   { value: emberLift,   rest: 1,    frames: [0.2,  1.8,  0.8,  1.4]  },
        emberOpacity:{ value: emberOpacity,rest: 0.38, frames: [0.5,  0.22, 0.42, 0.34] },
        glowOpacity: { value: glowOpacity, rest: 0.78, frames: [0.94, 0.62, 0.80, 0.72] },
        glowScale:   { value: glowScale,   rest: 1,    frames: [1.08, 0.94, 1.02, 1]    },
      },
      {
        durations: [240, 200, 260, 820],
        loop: true,
        reducedMotion,
      },
    );
    anim.start();
    return () => anim.stop();
  }, [
    emberLift,
    emberOpacity,
    emberScale,
    flameLift,
    flameScale,
    glowOpacity,
    glowScale,
    reducedMotion,
  ]);

  return (
    <View style={styles.statsShell} onLayout={handleStatsShellLayout}>
      <LinearSurface
        compact
        style={styles.statsBar}
        accessibilityRole="summary"
        accessibilityLabel={`Daily progress ${progressClamped} percent. ${todayMinutes} of ${dailyGoal} minutes completed. ${streak} day streak. Level ${level}. ${completedSessions} sessions done.`}
      >
        <View style={styles.statsBarContent}>
          <View style={styles.statsBarItemCenter}>
            <View style={styles.statsRingWrap}>
              <Svg width={RING_SIZE} height={RING_SIZE}>
                <Circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RADIUS}
                  stroke={n.colors.border}
                  strokeWidth={STROKE_WIDTH}
                  fill="none"
                />
                <Circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RADIUS}
                  stroke={n.colors.accent}
                  strokeWidth={STROKE_WIDTH}
                  fill="none"
                  strokeDasharray={`${CIRCUMFERENCE}`}
                  strokeDashoffset={CIRCUMFERENCE - (CIRCUMFERENCE * progressClamped) / 100}
                  strokeLinecap="round"
                  rotation="-90"
                  origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
                />
              </Svg>
              <LinearText variant="caption" tone="primary" style={styles.ringPercentText}>
                {progressClamped}%
              </LinearText>
            </View>
            <View style={styles.progressMeta}>
              <View style={styles.progressSummaryRow}>
                <LinearText variant="caption" tone="muted" style={styles.statsLabelStrong}>
                  {todayMinutes}/
                </LinearText>
                <Pressable
                  onLayout={handleGoalPillLayout}
                  style={({ pressed }) => [
                    styles.goalPill,
                    showGoalPicker && styles.goalPillActive,
                    pressed && styles.goalPillPressed,
                  ]}
                  onPress={() => setShowGoalPicker((value) => !value)}
                  hitSlop={6}
                >
                  <LinearText variant="chip" tone="accent" style={styles.goalPillText}>
                    {dailyGoal}m
                  </LinearText>
                  <Ionicons
                    name={showGoalPicker ? 'chevron-back' : 'chevron-down'}
                    size={11}
                    color={n.colors.accent}
                  />
                </Pressable>
              </View>
            </View>
          </View>
          <View style={styles.statsBarDivider} />
          <View style={styles.statsBarItemCenter}>
            <View style={styles.streakIconWrap}>
              <Animated.View
                style={[
                  styles.streakGlow,
                  {
                    opacity: glowOpacity,
                    transform: [{ scale: glowScale }],
                  },
                ]}
              />
              <Animated.View
                testID="streak-flame-ember"
                style={[
                  styles.emberLayer,
                  {
                    opacity: emberOpacity,
                    transform: [{ translateY: emberLift }, { scale: emberScale }],
                  },
                ]}
              >
                <Ionicons name="flame" size={24} color="#F59E0B" />
              </Animated.View>
              <Animated.View
                style={[
                  styles.flameLayer,
                  {
                    transform: [{ translateY: flameLift }, { scale: flameScale }],
                  },
                ]}
              >
                <Ionicons name="flame" size={30} color={n.colors.warning} />
              </Animated.View>
            </View>
            <View style={styles.streakReadout}>
              <LinearText variant="title" tone="primary" style={styles.streakValue}>
                {streak}
              </LinearText>
              <LinearText variant="caption" tone="warning" style={styles.streakUnit}>
                days
              </LinearText>
            </View>
            <LinearText variant="caption" tone="muted" style={styles.statsLabel}>
              streak
            </LinearText>
          </View>
          <View style={styles.statsBarDivider} />
          <View style={styles.statsBarItemCenter}>
            <LinearText variant="bodySmall" tone="primary" style={styles.statsValue}>
              Level {level}
            </LinearText>
            <LinearText variant="caption" tone="muted" style={styles.statsLabel}>
              {completedSessions} done
            </LinearText>
          </View>
        </View>
      </LinearSurface>
      {showGoalPicker && goalOverlayPosition ? (
        <View
          testID="goal-overlay"
          style={[
            styles.goalPickerRow,
            { left: goalOverlayPosition.left, top: goalOverlayPosition.top },
          ]}
        >
          {goalOptions.map((minutes) => (
            <Pressable
              key={minutes}
              style={({ pressed }) => [styles.goalChip, pressed && styles.goalChipPressed]}
              onPress={() => handleGoalChange(minutes)}
            >
              <LinearText variant="chip" tone="secondary" style={styles.goalChipText}>
                {minutes}m
              </LinearText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  statsShell: {
    position: 'relative',
    overflow: 'visible',
    zIndex: 4,
  },
  statsBar: {
    marginBottom: n.spacing.md,
    alignSelf: 'center',
    width: '85%',
    maxWidth: 360,
  },
  statsBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statsRingWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPercentText: {
    position: 'absolute',
    color: n.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  progressMeta: {
    marginTop: 2,
    alignItems: 'center',
    minHeight: 36,
    justifyContent: 'flex-start',
  },
  progressSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statsLabelStrong: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  goalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: n.radius.full,
    backgroundColor: n.colors.primaryTintSoft,
    borderWidth: 1,
    borderColor: `${n.colors.accent}44`,
  },
  goalPillActive: {
    borderColor: `${n.colors.accent}88`,
    backgroundColor: `${n.colors.accent}22`,
  },
  goalPillPressed: {
    opacity: 0.85,
  },
  goalPillText: {
    color: n.colors.accent,
    fontSize: 10,
    fontWeight: '800',
  },
  goalPickerRow: {
    position: 'absolute',
    width: GOAL_OVERLAY_WIDTH,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 4,
    zIndex: 12,
    elevation: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: n.radius.full,
    backgroundColor: 'rgba(6,6,6,0.99)',
    borderWidth: 1,
    borderColor: `${n.colors.accent}55`,
  },
  goalChip: {
    minWidth: 38,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: n.radius.full,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: n.colors.borderLight,
  },
  goalChipPressed: {
    opacity: 0.82,
  },
  goalChipText: {
    color: n.colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  streakIconWrap: {
    width: 38,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  streakGlow: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(217,119,6,0.16)',
  },
  emberLayer: {
    position: 'absolute',
  },
  flameLayer: {
    position: 'absolute',
  },
  streakReadout: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  streakValue: {
    color: n.colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  streakUnit: {
    color: n.colors.warning,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  statsBarItemCenter: {
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  statsValue: {
    color: n.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  statsLabel: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  statsBarDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});
