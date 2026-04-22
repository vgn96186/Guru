import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import LinearText from '../primitives/LinearText';
import { linearTheme as n } from '../../theme/linearTheme';
import { useReducedMotion, motion } from '../../motion';
import { profileRepository } from '../../db/repositories';
import { PROFILE_QUERY_KEY } from '../../hooks/queries/useProfile';
import { queryClient } from '../../services/queryClient';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';

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
const RING_SIZE = 56;
const RING_STROKE = 7;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = RING_RADIUS * 2 * Math.PI;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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

  const strokeDashoffset = fillAnim.interpolate({
    inputRange: [0, 100],
    outputRange: [RING_CIRCUMFERENCE, 0],
  });

  return (
    <View style={styles.container} collapsable={Platform.OS === 'android' ? false : undefined}>
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.14)', 'rgba(255, 255, 255, 0.04)', 'rgba(255, 255, 255, 0.02)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.railBorder}
      >
        <View style={styles.railInner}>
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.06)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 0.42 }}
            style={styles.railInnerGradient}
          >
            <View style={styles.topRow}>
              {/* Ring Block */}
              <View style={styles.ringBlock}>
                <View style={styles.ring}>
                  <Svg width={RING_SIZE} height={RING_SIZE}>
                    <Circle
                      cx={RING_SIZE / 2}
                      cy={RING_SIZE / 2}
                      r={RING_RADIUS}
                      stroke="rgba(255, 255, 255, 0.06)"
                      strokeWidth={RING_STROKE}
                      fill="transparent"
                    />
                    <AnimatedCircle
                      cx={RING_SIZE / 2}
                      cy={RING_SIZE / 2}
                      r={RING_RADIUS}
                      stroke={n.colors.accent}
                      strokeWidth={RING_STROKE}
                      fill="transparent"
                      strokeDasharray={RING_CIRCUMFERENCE}
                      strokeDashoffset={strokeDashoffset}
                      transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                    />
                    <Circle
                      cx={RING_SIZE / 2}
                      cy={RING_SIZE / 2}
                      r={21}
                      fill="rgba(6, 8, 14, 0.96)"
                      stroke="rgba(255, 255, 255, 0.05)"
                      strokeWidth={1}
                    />
                  </Svg>
                  <View style={styles.ringTextWrap}>
                    <Text style={styles.ringText}>{progressClamped}%</Text>
                  </View>
                </View>
              </View>

              {/* Ratio Block */}
              <View style={styles.ratioBlock}>
                <View style={styles.ratioRow}>
                  <Text style={styles.ratioBig}>
                    {todayMinutes}
                    <Text style={styles.ratioBigEm}> / {currentGoal}</Text>
                  </Text>
                  <Pressable
                    style={styles.goalChip}
                    onPress={() => setShowGoalPicker((v) => !v)}
                  >
                    <Text style={styles.goalChipText}>Goal {currentGoal}m</Text>
                    <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
                      <Path d="M3 4.5L6 7.5L9 4.5" stroke="#b4bbf5" strokeWidth={1.4} strokeLinecap="round" />
                    </Svg>
                  </Pressable>
                </View>
                <Text style={styles.ratioSub}>minutes logged today</Text>
              </View>

              {/* Divider */}
              <LinearGradient
                colors={['transparent', 'rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.08)', 'transparent']}
                locations={[0, 0.2, 0.8, 1]}
                style={styles.divider}
              />

              {/* Streak Block */}
              <View style={styles.streakBlock}>
                <View style={styles.streakPill}>
                  <Animated.View
                    style={[
                      styles.streakGlow,
                      { opacity: glowOpacity, transform: [{ scale: glowScale }] },
                    ]}
                  />
                  <Animated.View style={[styles.flameWrap, { transform: [{ scale: flameScale }, { rotate: '-4deg' }] }]}>
                    <Svg width={22} height={22} viewBox="0 0 22 22">
                      <Defs>
                        <RadialGradient id="flameGrad1" cx="40%" cy="20%" r="55%" fx="40%" fy="20%">
                          <Stop offset="0%" stopColor="#fde68a" stopOpacity="1" />
                          <Stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
                        </RadialGradient>
                        <RadialGradient id="flameGrad2" cx="50%" cy="100%" r="100%" fx="50%" fy="100%">
                          <Stop offset="0%" stopColor={n.colors.warning} stopOpacity="1" />
                          <Stop offset="100%" stopColor="#b45309" stopOpacity="1" />
                        </RadialGradient>
                      </Defs>
                      <Path
                        d="M11 1 C16 1 21 6.5 21 12.5 C21 17.5 16 21 11 21 C6 21 1 17.5 1 12.5 C1 6.5 6 1 11 1 Z"
                        fill="url(#flameGrad2)"
                      />
                      <Path
                        d="M11 1 C16 1 21 6.5 21 12.5 C21 17.5 16 21 11 21 C6 21 1 17.5 1 12.5 C1 6.5 6 1 11 1 Z"
                        fill="url(#flameGrad1)"
                      />
                    </Svg>
                  </Animated.View>
                  <View style={styles.streakTextCol}>
                    <Text style={styles.streakNum}>{streak}</Text>
                    <Text style={styles.streakMeta}>day streak</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Footer */}
            <View style={styles.railFooter}>
              <View style={styles.badgeLv}>
                <Text style={styles.badgeLvText}>Level {level}</Text>
              </View>
              <Text style={styles.sessions}>
                <Text style={styles.sessionsStrong}>{completedSessions}</Text> sessions done
              </Text>
            </View>
          </LinearGradient>
        </View>
      </LinearGradient>

      {/* Goal Picker Overlay */}
      {showGoalPicker && (
        <View style={styles.goalPickerRow}>
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
                  <Text style={[styles.goalChipLargeText, active && styles.goalChipLargeTextActive]}>
                    {minutes}
                    <Text style={[styles.goalChipLargeUnit, active && styles.goalChipLargeTextActive]}>
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
    // Add box shadow from .rail
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.55,
    shadowRadius: 48,
    elevation: 10,
  },
  railBorder: {
    borderRadius: 16,
    padding: 1,
  },
  railInner: {
    borderRadius: 15, // var(--radius) - 1px
    backgroundColor: 'rgba(12, 14, 22, 0.72)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  railInnerGradient: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  ringBlock: {
    alignItems: 'center',
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringTextWrap: {
    position: 'absolute',
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: -0.36,
    color: n.colors.textPrimary,
  },
  ratioBlock: {
    flex: 1,
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  ratioRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: 6,
    columnGap: 10,
  },
  ratioBig: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1.12,
    lineHeight: 28,
    color: n.colors.textPrimary,
  },
  ratioBigEm: {
    fontSize: 15.4, // 0.55em
    fontWeight: '700',
    color: n.colors.textMuted,
  },
  goalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    paddingLeft: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(94, 106, 210, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(94, 106, 210, 0.45)',
  },
  goalChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b4bbf5',
    letterSpacing: 0.22,
  },
  ratioSub: {
    fontSize: 12,
    fontWeight: '600',
    color: n.colors.textSecondary,
  },
  divider: {
    width: 1,
    height: 52,
    alignSelf: 'center',
  },
  streakBlock: {
    alignItems: 'flex-end',
    gap: 6,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12, // var(--radius-sm)
    backgroundColor: 'rgba(217, 119, 6, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.28)',
  },
  streakGlow: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -25,
    marginTop: -25,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(217, 119, 6, 0.35)',
  },
  flameWrap: {
    width: 22,
    height: 22,
  },
  streakTextCol: {
    alignItems: 'flex-end',
  },
  streakNum: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.66,
    lineHeight: 22,
    color: n.colors.textPrimary,
  },
  streakMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: n.colors.warning,
    letterSpacing: 0.44,
    textTransform: 'uppercase',
  },
  railFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  badgeLv: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(94, 106, 210, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(94, 106, 210, 0.25)',
  },
  badgeLvText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#c7cdf7',
  },
  sessions: {
    fontSize: 12,
    fontWeight: '600',
    color: n.colors.textMuted,
  },
  sessionsStrong: {
    color: n.colors.textPrimary,
    fontWeight: '800',
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
