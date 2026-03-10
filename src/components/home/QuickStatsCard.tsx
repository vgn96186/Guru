import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface QuickStatsCardProps {
  progressPercent: number;
  todayMinutes: number;
  dailyGoal: number;
  minutesLeft: number;
  examType?: 'INICET' | 'NEET';
}

const RING_SIZE = 72;
const STROKE_WIDTH = 7;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = RADIUS * 2 * Math.PI;

export default function QuickStatsCard({ progressPercent, todayMinutes, dailyGoal, minutesLeft, examType }: QuickStatsCardProps) {
  const clamped = Math.min(100, Math.max(0, progressPercent));
  const strokeDashoffset = CIRCUMFERENCE - (CIRCUMFERENCE * clamped) / 100;

  return (
    <View style={styles.quickStatsCard}>
      <View style={styles.progressRingContainer}>
        <Svg width={RING_SIZE} height={RING_SIZE}>
          {/* Background track */}
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke="#2A2A38"
            strokeWidth={STROKE_WIDTH}
            fill="transparent"
          />
          {/* Progress arc */}
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke="#6C63FF"
            strokeWidth={STROKE_WIDTH}
            fill="transparent"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
          />
        </Svg>
        <View style={[styles.ringTextOverlay, StyleSheet.absoluteFill]}>
          <Text style={styles.progressPercent}>{clamped}%</Text>
          <Text style={styles.progressLabel}>Goal</Text>
        </View>
      </View>
      <View style={styles.quickStatsInfo}>
        <View style={styles.titleRow}>
          <Text style={styles.quickStatsTitle}>Today's Progress</Text>
          {examType && (
            <View style={[styles.examBadge, examType === 'NEET' && styles.examBadgeNeet]}>
              <Text style={[styles.examBadgeText, examType === 'NEET' && styles.examBadgeTextNeet]}>
                {examType === 'NEET' ? 'NEET PG' : 'INICET'}
              </Text>
            </View>
          )}
        </View>
        {todayMinutes > 0 && (
          <Text style={styles.quickStatsMinutes}>{todayMinutes} / {dailyGoal} min</Text>
        )}
        {minutesLeft > 0 ? (
          <Text style={styles.quickStatsLeft}>
            {todayMinutes === 0 ? `${dailyGoal} min goal` : `${minutesLeft} min left`}
          </Text>
        ) : (
          <Text style={styles.quickStatsDone}>Goal reached!</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  quickStatsCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A24', borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 16 },
  progressRingContainer: { width: RING_SIZE, height: RING_SIZE, marginRight: 16 },
  ringTextOverlay: { alignItems: 'center', justifyContent: 'center' },
  progressPercent: { color: '#fff', fontWeight: '900', fontSize: 16 },
  progressLabel: { color: '#9E9E9E', fontSize: 9 },
  quickStatsInfo: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  quickStatsTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  examBadge: { backgroundColor: '#6C63FF22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#6C63FF44' },
  examBadgeNeet: { backgroundColor: '#FF980022', borderColor: '#FF980044' },
  examBadgeText: { color: '#6C63FF', fontSize: 9, fontWeight: '800' },
  examBadgeTextNeet: { color: '#FF9800' },
  quickStatsMinutes: { color: '#9E9E9E', fontSize: 14, marginBottom: 2 },
  quickStatsLeft: { color: '#FF9800', fontSize: 12 },
  quickStatsDone: { color: '#4CAF50', fontSize: 12, fontWeight: '600' },
});
