import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
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

  const pct = coverage.total > 0 ? Math.round((coverage.seen / coverage.total) * 100) : 0;
  const progressTransitionStyle = {
    width: `${pct}%`,
    transitionProperty: 'width',
    transitionDuration: 560,
    transitionTimingFunction: 'ease-in-out',
  } as const;

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
      <LinearSurface compact padded={false} style={styles.row}>
      <View style={[styles.dot, { backgroundColor: subject.colorHex }]} />
      <View style={styles.body}>
        <View style={styles.mainLine}>
          <AppText style={styles.name} numberOfLines={1} ellipsizeMode="tail" variant="body">
            {subject.name}
          </AppText>
          <View style={styles.trailing}>
            {matchingTopicsCount !== undefined && matchingTopicsCount > 0 ? (
              <AppText style={styles.matchCount} variant="caption">
                {matchingTopicsCount} match
              </AppText>
            ) : null}
            <AppText
              style={[
                styles.pct,
                {
                  color:
                    pct >= 80
                      ? n.colors.success
                      : pct >= 50
                        ? n.colors.warning
                        : n.colors.textMuted,
                },
              ]}
              variant="caption"
            >
              {pct}%
            </AppText>
            <Ionicons name="chevron-forward" size={14} color={n.colors.textMuted} />
          </View>
        </View>
        {/* Inline labels — each with its own color for scannability */}
        <View style={styles.labelRow}>
          <AppText style={styles.labelDim}>{subject.shortCode}</AppText>
          <AppText style={styles.sep}>·</AppText>
          <View style={styles.coveragePill}>
            <AppText style={styles.coverageSeen}>{coverage.seen}</AppText>
            <View style={styles.coverageBarTrack}>
              <View
                style={[
                  styles.coverageBarFill,
                  {
                    width: `${pct}%`,
                    backgroundColor: subject.colorHex,
                  },
                ]}
              />
            </View>
            <AppText style={styles.coverageTotal}>{coverage.total}</AppText>
          </View>
          {hasDue ? (
            <>
              <AppText style={styles.sep}>·</AppText>
              <AppText style={styles.labelDue}>Due {metrics!.due}</AppText>
            </>
          ) : null}
          {metrics && metrics.highYield > 0 ? (
            <>
              <AppText style={styles.sep}>·</AppText>
              <AppText style={styles.labelHY}>HY {metrics.highYield}</AppText>
            </>
          ) : null}
          {metrics && metrics.unseen > 0 ? (
            <>
              <AppText style={styles.sep}>·</AppText>
              <AppText style={styles.labelUnseen}>Unseen {metrics.unseen}</AppText>
            </>
          ) : null}
          {metrics && metrics.withNotes > 0 ? (
            <>
              <AppText style={styles.sep}>·</AppText>
              <AppText style={styles.labelNotes}>Notes {metrics.withNotes}</AppText>
            </>
          ) : null}
        </View>
        <View style={styles.progressTrack}>
          <ReAnimated.View
            style={[
              styles.progressFill,
              progressTransitionStyle,
              { backgroundColor: subject.colorHex },
            ]}
          />
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
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 12, flexShrink: 0 },
  body: { flex: 1, minWidth: 0 },
  mainLine: { flexDirection: 'row', alignItems: 'center' },
  name: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: n.colors.textPrimary,
    marginRight: 8,
  },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  matchCount: {
    fontSize: 11,
    fontWeight: '700',
    color: n.colors.accent,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 3,
    gap: 3,
  },
  sep: { fontSize: 10, color: n.colors.border, marginHorizontal: 1 },
  labelDim: { fontSize: 11, color: n.colors.textMuted, fontWeight: '500' },
  coveragePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: n.colors.surface,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
    paddingHorizontal: 5,
    paddingVertical: 2,
    gap: 4,
  },
  coverageSeen: { fontSize: 10, color: n.colors.textPrimary, fontWeight: '800' },
  coverageBarTrack: {
    width: 24,
    height: 3,
    backgroundColor: n.colors.border,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  coverageBarFill: { height: '100%', borderRadius: 1.5 },
  coverageTotal: { fontSize: 10, color: n.colors.textMuted, fontWeight: '500' },
  labelDue: { fontSize: 11, color: n.colors.error, fontWeight: '700' },
  labelHY: { fontSize: 11, color: n.colors.warning, fontWeight: '700' },
  labelUnseen: { fontSize: 11, color: '#8B9CF7', fontWeight: '600' },
  labelNotes: { fontSize: 11, color: n.colors.accent, fontWeight: '600' },
  pct: { fontSize: 12, fontWeight: '700', minWidth: 30, textAlign: 'right' },
  progressTrack: {
    height: 2,
    backgroundColor: n.colors.border,
    borderRadius: 1,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: { height: '100%', borderRadius: 1 },
});
