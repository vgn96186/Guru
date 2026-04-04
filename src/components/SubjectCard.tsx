import React, { useEffect } from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { Subject } from '../types';
import { linearTheme as n } from '../theme/linearTheme';
import AppText from './AppText';
import LinearSurface from './primitives/LinearSurface';

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
  // Press-scale runs entirely on the Reanimated UI thread.
  // JS side only sets the target value; Reanimated drives every frame natively.
  const pressScale = useSharedValue(1);
  const pressOpacity = useSharedValue(1);
  const pressAnimStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ scale: pressScale.value }],
      opacity: pressOpacity.value,
    };
  });

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Softer timing curve feels smoother than spring snap on lower-end Android GPUs.
    pressScale.value = withTiming(0.99, { duration: 110 }, () => {
      'worklet';
      pressScale.value = withTiming(1, { duration: 180 });
    });
    pressOpacity.value = withTiming(0.9, { duration: 110 }, () => {
      'worklet';
      pressOpacity.value = withTiming(1, { duration: 180 });
    });
    onPress();
  }

  const pct = coverage.total === 0 ? 0 : Math.round((coverage.seen / coverage.total) * 100);

  const progressWidth = useSharedValue(pct);

  useEffect(() => {
    progressWidth.value = withTiming(pct, {
      duration: 600,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [pct, progressWidth]);

  const progressAnimatedStyle = useAnimatedStyle(() => {
    return {
      width: `${Math.min(100, Math.max(0, progressWidth.value))}%`,
    };
  });

  const hasDue = metrics && metrics.due > 0;

  return (
    // ReAnimated wrapper carries the UI-thread press-scale animation.
    // When tapped, the card briefly shrinks (scale 0.96) then springs back
    // while the detail screen zooms open — together they read as "card expands".
    <ReAnimated.View style={pressAnimStyle}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${subject.name} subject`}
        accessibilityHint={`Coverage: ${coverage.seen} of ${coverage.total} topics (${pct}%).`}
      >
        <LinearSurface compact padded={false}>
          <View style={styles.row}>
            <View style={styles.leftHalf}>
              <View style={[styles.dot, { backgroundColor: subject.colorHex }]} />
              <View style={styles.body}>
                <View style={styles.mainLine}>
                  <AppText
                    style={styles.name}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    variant="body"
                  >
                    {subject.name}
                  </AppText>
                </View>
                {/* Metric Badges — organized for instant scannability */}
                <View style={styles.labelRow}>
                  <View style={styles.badgeShortCode}>
                    <AppText style={styles.labelShortCode}>{subject.shortCode}</AppText>
                  </View>
                  <View style={styles.coveragePill}>
                    <AppText style={styles.coverageSeen}>{coverage.seen}</AppText>
                    <AppText style={styles.coverageSlash}>/</AppText>
                    <AppText style={styles.coverageTotal}>{coverage.total}</AppText>
                  </View>
                  {hasDue ? (
                    <View style={styles.badgeDue}>
                      <AppText style={styles.labelDue}>Due {metrics!.due}</AppText>
                    </View>
                  ) : null}
                  {metrics && metrics.highYield > 0 ? (
                    <View style={styles.badgeHY}>
                      <AppText style={styles.labelHY}>HY {metrics.highYield}</AppText>
                    </View>
                  ) : null}
                  {metrics && metrics.unseen > 0 ? (
                    <View style={styles.badgeUnseen}>
                      <AppText style={styles.labelUnseen}>Unseen {metrics.unseen}</AppText>
                    </View>
                  ) : null}
                  {metrics && metrics.withNotes > 0 ? (
                    <View style={styles.badgeNotes}>
                      <AppText style={styles.labelNotes}>Notes {metrics.withNotes}</AppText>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={styles.rightHalf}>
              <View style={styles.trailing}>
                {matchingTopicsCount !== undefined && matchingTopicsCount > 0 ? (
                  <View style={styles.matchCountContainer}>
                    <AppText style={styles.matchCount} variant="caption">
                      {matchingTopicsCount} match
                    </AppText>
                  </View>
                ) : null}
                <View style={styles.pctRow}>
                  <View style={styles.rightProgressTrack}>
                    <ReAnimated.View
                      style={[
                        styles.rightProgressFill,
                        progressAnimatedStyle,
                        { backgroundColor: subject.colorHex },
                      ]}
                    />
                  </View>
                  <AppText
                    style={[
                      styles.pct,
                      {
                        color:
                          pct >= 80
                            ? n.colors.success
                            : pct >= 50
                              ? n.colors.warning
                              : n.colors.textPrimary,
                      },
                    ]}
                    variant="caption"
                  >
                    {pct}%
                  </AppText>
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={n.colors.textMuted}
                    style={styles.chevron}
                  />
                </View>
              </View>
            </View>
          </View>
        </LinearSurface>
      </TouchableOpacity>
    </ReAnimated.View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    width: '100%',
  },
  leftHalf: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingVertical: 12,
  },
  rightHalf: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
    paddingVertical: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 12, flexShrink: 0 },
  body: { flex: 1, minWidth: 0 },
  mainLine: { flexDirection: 'row', alignItems: 'center' },
  name: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: n.colors.textPrimary,
    marginRight: 4,
  },
  trailing: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 4,
    minWidth: 0,
  },
  matchCountContainer: { width: '100%', alignItems: 'flex-end' },
  pctRow: { flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%' },
  chevron: { marginLeft: 0 },
  matchCount: {
    fontSize: 11,
    fontWeight: '700',
    color: n.colors.accent,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 6,
  },
  coveragePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: n.colors.surfaceHover,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  coverageSeen: { fontSize: 10, color: n.colors.textPrimary, fontWeight: '800' },
  coverageSlash: { fontSize: 9, color: n.colors.textMuted, fontWeight: '800' },
  coverageTotal: { fontSize: 10, color: n.colors.textMuted, fontWeight: '500' },
  badgeDue: {
    backgroundColor: 'rgba(255, 75, 75, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeHY: {
    backgroundColor: 'rgba(250, 173, 20, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeUnseen: {
    backgroundColor: 'rgba(139, 156, 247, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeNotes: {
    backgroundColor: n.colors.primaryTintSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeShortCode: {
    backgroundColor: n.colors.surfaceHover,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
  },
  labelDue: { fontSize: 10, color: n.colors.error, fontWeight: '800' },
  labelHY: { fontSize: 10, color: n.colors.warning, fontWeight: '800' },
  labelUnseen: { fontSize: 10, color: '#8B9CF7', fontWeight: '800' },
  labelNotes: { fontSize: 10, color: n.colors.accent, fontWeight: '800' },
  labelShortCode: { fontSize: 10, color: n.colors.textMuted, fontWeight: '700' },
  pct: { fontSize: 12, fontWeight: '800', textAlign: 'right', minWidth: 26 },
  rightProgressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: n.colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  rightProgressFill: { height: '100%', borderRadius: 3 },
});
