import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LinearText from '../primitives/LinearText';
import { linearTheme as n } from '../../theme/linearTheme';
import { useReducedMotion, motion } from '../../motion';
import { profileRepository } from '../../db/repositories';
import { PROFILE_QUERY_KEY } from '../../hooks/queries/useProfile';
import { queryClient } from '../../services/queryClient';

export type CompactQuickStatsBarProps = {
  progressPercent: number;
  todayMinutes: number;
  dailyGoal: number;
  streak: number;
  level: number;
  completedSessions: number;
  /** Optional hook after a goal preset is chosen (DB still updated by this component). */
  onGoalChange?: (minutes: number) => void;
};

const GOAL_PRESETS = [30, 60, 90, 120, 180, 240];
const SHELL_RADIUS = 22;
const PROGRESS_TRACK_H = 4;
const FILL_ANIM_MS = 700;
/** Glass base between app black and e1 */
const GLASS_BG = 'rgba(8, 10, 14, 0.88)';

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
  const [showFraction, setShowFraction] = useState(false);
  const [currentGoal, setCurrentGoal] = useState(dailyGoal);
  const [trackWidth, setTrackWidth] = useState(0);

  const progressClamped = Math.min(100, Math.max(0, Math.round(progressPercent)));
  /** Start at real progress so the bar is not empty on first paint (Android layout). */
  const fillAnim = useRef(new Animated.Value(progressClamped)).current;
  const glowOpacity = useRef(new Animated.Value(0.72)).current;
  const glowScale = useRef(new Animated.Value(1)).current;
  const flameScale = useRef(new Animated.Value(1)).current;

  const reducedMotion = useReducedMotion();
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

  useEffect(() => {
    if (streak < 3) {
      glowOpacity.setValue(0);
      glowScale.setValue(1);
      flameScale.setValue(1);
      return;
    }
    const anim = motion.keyframes(
      {
        glowOpacity: { value: glowOpacity, rest: 0.78, frames: [0.94, 0.62, 0.8, 0.72] },
        glowScale: { value: glowScale, rest: 1, frames: [1.08, 0.94, 1.02, 1] },
        flameScale: { value: flameScale, rest: 1, frames: [1.06, 0.96, 1.02, 1] },
      },
      {
        durations: [380, 380, 380, 380],
        loop: true,
        reducedMotion,
      },
    );
    anim.start();
    return () => anim.stop();
  }, [flameScale, glowOpacity, glowScale, reducedMotion, streak]);

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

  const fillWidthStyle =
    trackWidth > 0
      ? {
          width: fillAnim.interpolate({
            inputRange: [0, 100],
            outputRange: [0, trackWidth],
          }),
        }
      : { width: 0 };

  const summaryLabel = `Daily progress ${progressClamped} percent. ${todayMinutes} of ${currentGoal} minutes completed. ${streak} day streak. Level ${level}. ${completedSessions} sessions done.`;

  return (
    <View
      testID="compact-quick-stats-bar"
      style={styles.statsShell}
      collapsable={Platform.OS === 'android' ? false : undefined}
    >
      <View accessibilityRole="summary" accessibilityLabel={summaryLabel} style={styles.glassOuter}>
        <View pointerEvents="none" style={styles.topHighlight} />
        <View style={styles.row}>
          <View style={styles.progressCol}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                showFraction
                  ? `${todayMinutes} of ${currentGoal} minutes. Tap to show percent. Long press to change goal.`
                  : `${progressClamped} percent of daily goal. Tap to show minutes. Long press to change goal.`
              }
              accessibilityState={{ expanded: showGoalPicker }}
              onPress={() => setShowFraction((v) => !v)}
              onLongPress={() => setShowGoalPicker((v) => !v)}
              delayLongPress={320}
              style={({ pressed }) => [styles.progressPressable, pressed && styles.pressed]}
            >
              <View style={styles.progressHeader}>
                <LinearText variant="label" tone="secondary" style={styles.progressEyebrow}>
                  Today
                </LinearText>
                {showFraction ? (
                  <Text style={styles.progressValueText}>{`${todayMinutes}/${currentGoal}m`}</Text>
                ) : (
                  <Text style={styles.progressValueText}>
                    {progressClamped}
                    <Text style={styles.progressValueSuffix}>%</Text>
                  </Text>
                )}
              </View>
              <View
                style={styles.trackWrap}
                onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
              >
                <View style={styles.trackBg}>
                  <Animated.View pointerEvents="none" style={[styles.trackFill, fillWidthStyle]} />
                  {trackWidth > 0 && progressClamped > 0 && progressClamped < 100 ? (
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.leadingEdge,
                        {
                          left: fillAnim.interpolate({
                            inputRange: [0, 100],
                            outputRange: [0, trackWidth],
                          }),
                        },
                      ]}
                    />
                  ) : null}
                </View>
              </View>
            </Pressable>
          </View>

          <View style={styles.divider} />

          <View style={styles.streakCol}>
            <LinearText variant="badge" tone="muted" style={styles.sectionLabel}>
              Streak
            </LinearText>
            <View style={styles.streakInner} testID="streak-burn">
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.streakGlow,
                  {
                    opacity: glowOpacity,
                    transform: [{ scale: glowScale }],
                  },
                ]}
              />
              <Animated.View style={{ transform: [{ scale: flameScale }] }}>
                <Text style={streak > 0 ? styles.streakValue : styles.streakIdle}>{`${Math.max(
                  0,
                  streak,
                )}d`}</Text>
              </Animated.View>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.metaCol}>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>{`LV ${level}`}</Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>{`${completedSessions} SES`}</Text>
            </View>
          </View>
        </View>
      </View>

      {showGoalPicker ? (
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
                    styles.goalChip,
                    active && styles.goalChipActive,
                    pressed && styles.goalChipPressed,
                  ]}
                  onPress={() => handleGoalChange(minutes)}
                >
                  <Text style={[styles.goalChipText, active && styles.goalChipTextActive]}>
                    {minutes}
                    <Text style={[styles.goalChipUnit, active && styles.goalChipTextActive]}>
                      m
                    </Text>
                  </Text>
                </Pressable>
              );
            })}
          </View>
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
    alignSelf: 'center',
    width: '89%',
    maxWidth: 392,
    marginBottom: n.spacing.md,
  },
  glassOuter: {
    borderRadius: SHELL_RADIUS,
    borderWidth: 1,
    borderColor: n.colors.border,
    backgroundColor: GLASS_BG,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 6,
  },
  topHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: n.colors.borderHighlight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressCol: {
    flex: 1.65,
    minWidth: 0,
  },
  progressPressable: {
    gap: 10,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  progressEyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  progressValueText: {
    color: n.colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
  progressValueSuffix: {
    fontSize: 20,
    color: n.colors.textSecondary,
  },
  trackWrap: {
    width: '100%',
  },
  trackBg: {
    height: PROGRESS_TRACK_H,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: n.colors.accent,
    opacity: 1,
  },
  leadingEdge: {
    position: 'absolute',
    top: -3,
    bottom: -3,
    width: 14,
    marginLeft: -10,
    borderRadius: 999,
    backgroundColor: `${n.colors.accent}44`,
    opacity: 0.7,
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  streakCol: {
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  streakInner: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 52,
    paddingHorizontal: 4,
  },
  streakGlow: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(63, 185, 80, 0.18)',
  },
  streakValue: {
    color: n.colors.success,
    fontSize: 19,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
    textShadowColor: 'rgba(63, 185, 80, 0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  streakIdle: {
    color: n.colors.textMuted,
    fontSize: 19,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  metaCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  metaChipText: {
    color: n.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.4,
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
  goalChip: {
    width: '31%',
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalChipActive: {
    backgroundColor: n.colors.accent,
    borderColor: n.colors.accent,
    shadowColor: n.colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  },
  goalChipPressed: {
    opacity: 0.75,
  },
  goalChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: n.colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  goalChipTextActive: {
    color: '#fff',
  },
  goalChipUnit: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  pressed: {
    opacity: 0.92,
  },
});
