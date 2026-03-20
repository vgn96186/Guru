import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Animated, Easing } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Subject } from '../types';
import { theme } from '../constants/theme';

interface Props {
  subject: Subject;
  coverage: { total: number; seen: number };
  metrics?: {
    due: number;
    highYield: number;
    unseen: number;
    withNotes: number;
    weak: number;
  };
  matchingTopicsCount?: number;
  onPress: () => void;
}

export default React.memo(function SubjectCard({
  subject,
  coverage,
  metrics,
  matchingTopicsCount,
  onPress,
}: Props) {
  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }
  const pct = coverage.total > 0 ? Math.round((coverage.seen / coverage.total) * 100) : 0;
  const progressAnim = useRef(new Animated.Value(pct)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const prevPct = useRef(pct);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      progressAnim.setValue(pct);
      prevPct.current = pct;
      return;
    }

    const increased = pct > prevPct.current;
    prevPct.current = pct;

    Animated.timing(progressAnim, {
      toValue: pct,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    if (increased && pct > 0) {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.02,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          tension: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [pct, progressAnim, scaleAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  // Color intensity based on progress
  const bgOpacity = pct > 0 ? 0.1 + (pct / 100) * 0.15 : 0;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={styles.card}
        onPress={handlePress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${subject.name} subject`}
        accessibilityHint={`Coverage: ${coverage.seen} of ${coverage.total} topics (${pct}%).`}
      >
        {/* Subtle background fill based on progress */}
        <View
          style={[styles.backgroundFill, { backgroundColor: subject.colorHex, opacity: bgOpacity }]}
        />

        <View style={[styles.colorBar, { backgroundColor: subject.colorHex }]} />
        <View style={styles.content}>
          <View style={styles.topRow}>
            <View style={styles.nameWrap}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.code}>{subject.shortCode}</Text>
                {matchingTopicsCount !== undefined && matchingTopicsCount > 0 && (
                  <View style={styles.matchBadge}>
                    <Text style={styles.matchBadgeText}>{matchingTopicsCount} matching topics</Text>
                  </View>
                )}
              </View>
              <Text style={styles.name} numberOfLines={2} ellipsizeMode="tail">
                {subject.name}
              </Text>
            </View>
            <View style={styles.pctContainer}>
              <Text
                style={[
                  styles.pct,
                  {
                    color:
                      pct >= 80
                        ? theme.colors.success
                        : pct >= 50
                          ? theme.colors.warning
                          : theme.colors.textPrimary,
                  },
                ]}
              >
                {pct}%
              </Text>
              <Text style={styles.pctLabel}>
                {coverage.seen}/{coverage.total} micro
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  { width: progressWidth, backgroundColor: subject.colorHex },
                ]}
              />
            </View>
          </View>

          <View style={styles.weightRow}>
            <View style={[styles.dot, { backgroundColor: subject.colorHex }]} />
            <Text style={styles.weight}>INICET ×{subject.inicetWeight}</Text>
            {pct === 100 && <Text style={styles.completeBadge}>✓ Complete</Text>}
          </View>
          {metrics && (
            <View style={styles.metricsRow}>
              <Text style={[styles.metricBadge, metrics.due > 0 && styles.metricBadgeUrgent]}>
                Due {metrics.due}
              </Text>
              <Text style={styles.metricBadge}>HY {metrics.highYield}</Text>
              <Text style={styles.metricBadge}>Unseen {metrics.unseen}</Text>
              <Text style={styles.metricBadge}>Notes {metrics.withNotes}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  backgroundFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  colorBar: { width: 6 },
  content: { flex: 1, padding: theme.spacing.lg },
  topRow: { flexDirection: 'row', alignItems: 'flex-start' },
  code: {
    color: theme.colors.textMuted,
    ...theme.typography.caption,
    fontWeight: '600',
    marginBottom: theme.spacing.xs,
    letterSpacing: 0.5,
  },
  matchBadge: {
    backgroundColor: theme.colors.primaryTintSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    marginLeft: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.primaryTint,
  },
  matchBadgeText: {
    color: theme.colors.primaryLight,
    ...theme.typography.caption,
    fontWeight: '700',
  },
  nameWrap: { flex: 1, minWidth: 0 },
  name: {
    color: theme.colors.textPrimary,
    ...theme.typography.bodySmall,
    fontWeight: '600',
    marginBottom: theme.spacing.md,
    lineHeight: 20,
  },
  pctContainer: { alignItems: 'flex-end', marginLeft: theme.spacing.lg },
  pct: { fontWeight: '700', fontSize: 20, color: theme.colors.textPrimary },
  pctLabel: { color: theme.colors.textMuted, ...theme.typography.caption, marginTop: theme.spacing.xs },
  progressContainer: { marginVertical: theme.spacing.lg },
  progressTrack: {
    height: 6,
    backgroundColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: theme.borderRadius.sm,
  },
  weightRow: { flexDirection: 'row', alignItems: 'center', marginTop: theme.spacing.md },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: theme.spacing.sm },
  weight: { color: theme.colors.textMuted, ...theme.typography.caption },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  metricBadge: {
    color: theme.colors.textSecondary,
    ...theme.typography.caption,
    fontWeight: '600',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.cardHover,
  },
  metricBadgeUrgent: {
    color: '#FFD6D6',
    backgroundColor: theme.colors.errorSurface,
  },
  completeBadge: {
    marginLeft: 'auto',
    color: theme.colors.success,
    ...theme.typography.caption,
    fontWeight: '700',
  },
});
