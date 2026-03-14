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

export default React.memo(function SubjectCard({ subject, coverage, metrics, matchingTopicsCount, onPress }: Props) {
  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }
  const pct = coverage.total > 0 ? Math.round((coverage.seen / coverage.total) * 100) : 0;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const prevPct = useRef(0);

  useEffect(() => {
    const increased = pct > prevPct.current;
    prevPct.current = pct;
    
    // Animate progress bar fill
    Animated.timing(progressAnim, {
      toValue: pct,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    
    // Pulse animation when progress increases
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
  }, [pct]);

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
          style={[
            styles.backgroundFill, 
            { backgroundColor: subject.colorHex, opacity: bgOpacity }
          ]} 
        />
        
        <View style={[styles.colorBar, { backgroundColor: subject.colorHex }]} />
        <View style={styles.content}>
          <View style={styles.topRow}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.code}>{subject.shortCode}</Text>
                {matchingTopicsCount !== undefined && matchingTopicsCount > 0 && (
                  <View style={styles.matchBadge}>
                    <Text style={styles.matchBadgeText}>{matchingTopicsCount} matching topics</Text>
                  </View>
                )}
              </View>
              <Text style={styles.name}>{subject.name}</Text>
            </View>
            <View style={styles.pctContainer}>
              <Text style={[styles.pct, { color: pct >= 80 ? theme.colors.success : pct >= 50 ? theme.colors.warning : theme.colors.textPrimary }]}>
                {pct}%
              </Text>
              <Text style={styles.pctLabel}>{coverage.seen}/{coverage.total} micro</Text>
            </View>
          </View>
          
          {/* Progress bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <Animated.View 
                style={[
                  styles.progressFill, 
                  { width: progressWidth, backgroundColor: subject.colorHex }
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
}

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
  topRow: { flexDirection: 'row', alignItems: 'flex-start' },
  code: { color: theme.colors.textSecondary, fontSize: 11, fontWeight: '600', marginBottom: 2 },
  matchBadge: {
    backgroundColor: '#6C63FF22',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: '#6C63FF55'
  },
  matchBadgeText: {
    color: '#E7E4FF',
    fontSize: 9,
    fontWeight: '700'
  },
  name: { color: theme.colors.textPrimary, fontWeight: '700', fontSize: 15, marginBottom: 6 },
  pctContainer: { alignItems: 'flex-end', marginLeft: 12 },
  pct: { fontWeight: '900', fontSize: 20 },
  pctLabel: { color: theme.colors.textMuted, fontSize: 10, marginTop: 2 },
  progressContainer: { marginVertical: 8 },
  progressTrack: { 
    height: 4, 
    backgroundColor: theme.colors.border, 
    borderRadius: 2, 
    overflow: 'hidden' 
  },
  progressFill: { 
    height: '100%', 
    borderRadius: 2 
  },
  weightRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  weight: { color: theme.colors.textMuted, fontSize: 11 },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  metricBadge: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
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
    color: theme.colors.success, 
    fontSize: 11, 
    fontWeight: '700' 
  },
});
