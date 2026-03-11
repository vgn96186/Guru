import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Animated, Easing } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Subject } from '../types';

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
  onPress: () => void;
}

export default function SubjectCard({ subject, coverage, metrics, onPress }: Props) {
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
      <TouchableOpacity style={styles.card} onPress={handlePress} activeOpacity={0.8}>
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
              <Text style={styles.code}>{subject.shortCode}</Text>
              <Text style={styles.name} numberOfLines={2}>{subject.name}</Text>
            </View>
            <View style={styles.pctContainer}>
              <Text style={[styles.pct, { color: pct >= 80 ? '#4CAF50' : pct >= 50 ? '#FF9800' : '#fff' }]}>
                {pct}%
              </Text>
              <Text style={styles.pctLabel}>{coverage.seen}/{coverage.total}</Text>
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
    backgroundColor: '#1A1A24',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
    elevation: 3,
    position: 'relative',
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
  code: { color: '#B8B8CC', fontSize: 11, fontWeight: '600', marginBottom: 2 },
  name: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 6 },
  pctContainer: { alignItems: 'flex-end', marginLeft: 12 },
  pct: { fontWeight: '900', fontSize: 20 },
  pctLabel: { color: '#8888A4', fontSize: 10, marginTop: 2 },
  progressContainer: { marginVertical: 8 },
  progressTrack: { 
    height: 4, 
    backgroundColor: '#2A2A38', 
    borderRadius: 2, 
    overflow: 'hidden' 
  },
  progressFill: { 
    height: '100%', 
    borderRadius: 2 
  },
  weightRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  weight: { color: '#9E9E9E', fontSize: 11 },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  metricBadge: {
    color: '#B9C0D0',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#232433',
  },
  metricBadgeUrgent: {
    color: '#FFD6D6',
    backgroundColor: '#4A1F26',
  },
  completeBadge: { 
    marginLeft: 'auto', 
    color: '#4CAF50', 
    fontSize: 11, 
    fontWeight: '700' 
  },
});
