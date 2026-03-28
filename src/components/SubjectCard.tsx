import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, View, StyleSheet, Animated, Easing } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Subject } from '../types';
import { theme } from '../constants/theme';
import AppText from './AppText';

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
        <View
          style={[styles.backgroundFill, { backgroundColor: subject.colorHex, opacity: bgOpacity }]}
        />

        <View style={[styles.colorBar, { backgroundColor: subject.colorHex }]} />
        <View style={styles.content}>
          <View style={styles.topRow}>
            <View style={styles.nameWrap}>
              <View style={styles.metaRow}>
                <AppText style={styles.code} variant="caption" tone="secondary">
                  {subject.shortCode}
                </AppText>
                {matchingTopicsCount !== undefined && matchingTopicsCount > 0 ? (
                  <View style={styles.matchBadge}>
                    <AppText style={styles.matchBadgeText} variant="caption">
                      {matchingTopicsCount} matching topics
                    </AppText>
                  </View>
                ) : null}
              </View>
              <AppText style={styles.name} numberOfLines={3} ellipsizeMode="tail" variant="body">
                {subject.name}
              </AppText>
            </View>
            <View style={styles.pctContainer}>
              <AppText
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
                variant="title"
              >
                {pct}%
              </AppText>
              <AppText style={styles.pctLabel} variant="caption" tone="muted">
                {coverage.seen}/{coverage.total} micro
              </AppText>
            </View>
          </View>

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
            <AppText style={styles.weight} variant="caption" tone="muted">
              INICET x{subject.inicetWeight}
            </AppText>
            {pct === 100 ? (
              <AppText style={styles.completeBadge} variant="caption" tone="success">
                Complete
              </AppText>
            ) : null}
          </View>
          {metrics ? (
            <View style={styles.metricsRow}>
              <AppText
                style={[styles.metricBadge, metrics.due > 0 && styles.metricBadgeUrgent]}
                variant="caption"
              >
                Due {metrics.due}
              </AppText>
              <AppText style={styles.metricBadge} variant="caption">
                HY {metrics.highYield}
              </AppText>
              <AppText style={styles.metricBadge} variant="caption">
                Unseen {metrics.unseen}
              </AppText>
              <AppText style={styles.metricBadge} variant="caption">
                Notes {metrics.withNotes}
              </AppText>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    marginBottom: 10,
    overflow: 'hidden',
    elevation: 3,
    position: 'relative',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  backgroundFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  colorBar: { width: 5 },
  content: { flex: 1, padding: 12 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  code: { marginBottom: 2, letterSpacing: 0.2 },
  matchBadge: {
    backgroundColor: '#6C63FF22',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: '#6C63FF55',
  },
  matchBadgeText: {
    color: '#E7E4FF',
  },
  nameWrap: { flex: 1, minWidth: 0 },
  name: {
    marginBottom: 6,
    fontWeight: '700',
  },
  pctContainer: { alignItems: 'flex-end', marginLeft: 'auto', flexShrink: 0 },
  pct: { fontWeight: '900' },
  pctLabel: { marginTop: 2 },
  progressContainer: { marginVertical: 8 },
  progressTrack: {
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  weightRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  weight: {},
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  metricBadge: {
    color: theme.colors.textSecondary,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.cardHover,
  },
  metricBadgeUrgent: {
    color: '#FFD6D6',
    backgroundColor: theme.colors.errorSurface,
  },
  completeBadge: {
    marginLeft: 'auto',
    fontWeight: '700',
  },
});
