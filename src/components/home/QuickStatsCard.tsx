import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface QuickStatsCardProps {
  progressPercent: number;
  todayMinutes: number;
  dailyGoal: number;
  minutesLeft: number;
}

export default function QuickStatsCard({ progressPercent, todayMinutes, dailyGoal, minutesLeft }: QuickStatsCardProps) {
  return (
    <View style={styles.quickStatsCard}>
      <View style={styles.progressRingContainer}>
        <View style={styles.progressRing}>
          <View style={[styles.progressRingFill, { transform: [{ rotate: `${progressPercent * 3.6}deg` }] }]} />
          <View style={styles.progressRingCenter}>
            <Text style={styles.progressPercent}>{progressPercent}%</Text>
            <Text style={styles.progressLabel}>Goal</Text>
          </View>
        </View>
      </View>
      <View style={styles.quickStatsInfo}>
        <Text style={styles.quickStatsTitle}>Today's Progress</Text>
        <Text style={styles.quickStatsMinutes}>{todayMinutes} / {dailyGoal} min</Text>
        {minutesLeft > 0 ? (
          <Text style={styles.quickStatsLeft}>{minutesLeft} min left</Text>
        ) : (
          <Text style={styles.quickStatsDone}>🎉 Goal reached!</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  quickStatsCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A24', borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 16 },
  progressRingContainer: { width: 80, height: 80, marginRight: 16 },
  progressRing: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#2A2A38', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  progressRingFill: { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 6, borderColor: '#6C63FF', borderLeftColor: 'transparent', borderBottomColor: 'transparent' },
  progressRingCenter: { alignItems: 'center' },
  progressPercent: { color: '#fff', fontWeight: '900', fontSize: 18 },
  progressLabel: { color: '#9E9E9E', fontSize: 9 },
  quickStatsInfo: { flex: 1 },
  quickStatsTitle: { color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 4 },
  quickStatsMinutes: { color: '#9E9E9E', fontSize: 14, marginBottom: 2 },
  quickStatsLeft: { color: '#FF9800', fontSize: 12 },
  quickStatsDone: { color: '#4CAF50', fontSize: 12, fontWeight: '600' },
});
