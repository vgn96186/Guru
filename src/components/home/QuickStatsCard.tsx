import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface QuickStatsCardProps {
  progressPercent: number;
  todayMinutes: number;
  dailyGoal: number;
  minutesLeft: number;
}

const RING_SIZE = 72;
const STROKE_WIDTH = 7;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = RADIUS * 2 * Math.PI;

export default function QuickStatsCard({ progressPercent, todayMinutes, dailyGoal, minutesLeft }: QuickStatsCardProps) {
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
        <Text style={styles.quickStatsTitle}>Today's Progress</Text>
        <Text style={styles.quickStatsMinutes}>{todayMinutes} / {dailyGoal} min</Text>
        {minutesLeft > 0 ? (
          <Text style={styles.quickStatsLeft}>{minutesLeft} min left</Text>
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
  quickStatsTitle: { color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 4 },
  quickStatsMinutes: { color: '#9E9E9E', fontSize: 14, marginBottom: 2 },
  quickStatsLeft: { color: '#FF9800', fontSize: 12 },
  quickStatsDone: { color: '#4CAF50', fontSize: 12, fontWeight: '600' },
});
