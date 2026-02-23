import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAllSubjects, getAllTopicsWithProgress } from '../db/queries/topics';
import { getDailyLog, getDaysToExam } from '../db/queries/progress';
import { useAppStore } from '../store/useAppStore';
import LoadingOrb from '../components/LoadingOrb';

export default function StatsScreen() {
  const profile = useAppStore(s => s.profile);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalCovered: 0,
    totalTopics: 0,
    masteredCount: 0,
    coveragePercent: 0,
    projectedScore: 0,
    subjectBreakdown: [] as any[],
    masteredTopics: [] as string[]
  });

  useEffect(() => {
    loadStats();
  }, []);

  function loadStats() {
    const subjects = getAllSubjects();
    const allTopics = getAllTopicsWithProgress();

    let covered = 0;
    let mastered = 0;
    const masteredNames: string[] = [];
    let highYieldCovered = 0;
    let totalHighYield = 0;

    const breakdown = subjects.map(sub => {
      const subTopics = allTopics.filter(t => t.subjectId === sub.id);
      let subCovered = 0;

      subTopics.forEach(t => {
        if (t.progress.status !== 'unseen') {
          covered++;
          subCovered++;
        }
        if (t.progress.status === 'mastered') {
          mastered++;
          masteredNames.push(t.name);
        }
        if (t.inicetPriority >= 4) {
          totalHighYield++;
          if (t.progress.status !== 'unseen') highYieldCovered++;
        }
      });

      return {
        id: sub.id,
        name: sub.name,
        shortCode: sub.shortCode,
        color: sub.colorHex,
        covered: subCovered,
        total: subTopics.length,
        percent: subTopics.length > 0 ? Math.round((subCovered / subTopics.length) * 100) : 0
      };
    });

    const highYieldPercent = totalHighYield > 0 ? Math.round((highYieldCovered / totalHighYield) * 100) : 0;
    
    // Rough projection logic: Base 50 + (High Yield coverage * 2.5) -> max ~300
    const projectedScore = Math.min(300, Math.round(50 + (highYieldPercent * 2.5)));

    setStats({
      totalCovered: covered,
      totalTopics: allTopics.length,
      masteredCount: mastered,
      coveragePercent: highYieldPercent,
      projectedScore,
      subjectBreakdown: breakdown.sort((a, b) => b.percent - a.percent),
      masteredTopics: masteredNames.slice(0, 10) // Show a sample
    });

    setLoading(false);
  }

  if (loading) return <LoadingOrb message="Calculating your progress..." />;

  const daysToInicet = profile?.inicetDate ? getDaysToExam(profile.inicetDate) : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Exam Readiness</Text>
          <Text style={styles.headerSub}>Focus on how far you've come.</Text>
        </View>

        {/* The Big Projection Card */}
        <View style={styles.projectionCard}>
          <View style={styles.projectionRow}>
            <View style={styles.projectionStat}>
              <Text style={styles.projectionVal}>{stats.coveragePercent}%</Text>
              <Text style={styles.projectionLabel}>High-Yield Covered</Text>
            </View>
            <View style={styles.projectionDivider} />
            <View style={styles.projectionStat}>
              <Text style={[styles.projectionVal, { color: '#FF9800' }]}>~{stats.projectedScore}/300</Text>
              <Text style={styles.projectionLabel}>Projected INICET Score</Text>
            </View>
          </View>
          <Text style={styles.projectionNote}>
            You can answer questions on {stats.coveragePercent}% of historically tested topics. Keep pushing.
          </Text>
        </View>

        {/* Absolute Progress (Anti-Guilt) */}
        <View style={styles.absoluteCard}>
          <Text style={styles.absoluteTitle}>Total Knowledge Acquired</Text>
          <Text style={styles.absoluteBig}>{stats.totalCovered} / {stats.totalTopics}</Text>
          <Text style={styles.absoluteSub}>topics seen at least once</Text>
          
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${(stats.totalCovered / Math.max(1, stats.totalTopics)) * 100}%` }]} />
          </View>
        </View>

        {/* Mastered Topics Boost */}
        {stats.masteredCount > 0 && (
          <View style={styles.masteredCard}>
            <Text style={styles.masteredEmoji}>🔥</Text>
            <View style={styles.masteredInfo}>
              <Text style={styles.masteredTitle}>You know {stats.masteredCount} topics cold.</Text>
              <Text style={styles.masteredSub}>Including: {stats.masteredTopics.join(', ')}{stats.masteredCount > 10 ? '...' : '.'}</Text>
            </View>
          </View>
        )}

        {/* Subject Breakdown */}
        <Text style={styles.sectionTitle}>Subject Coverage</Text>
        <View style={styles.subjectGrid}>
          {stats.subjectBreakdown.map(sub => (
            <View key={sub.id} style={styles.subjectRow}>
              <View style={styles.subjectHeader}>
                <View style={styles.subjectNameRow}>
                  <View style={[styles.subjectDot, { backgroundColor: sub.color }]} />
                  <Text style={styles.subjectName}>{sub.name}</Text>
                </View>
                <Text style={styles.subjectPercent}>{sub.percent}%</Text>
              </View>
              <View style={styles.subProgressBar}>
                <View style={[styles.subProgressFill, { width: `${sub.percent}%`, backgroundColor: sub.color }]} />
              </View>
              <Text style={styles.subjectFraction}>{sub.covered} / {sub.total} topics</Text>
            </View>
          ))}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  container: { padding: 16 },
  header: { marginBottom: 24, marginTop: 16 },
  headerTitle: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 0.5 },
  headerSub: { color: '#9E9E9E', fontSize: 14, marginTop: 4 },
  
  projectionCard: { backgroundColor: '#1A1A2E', borderRadius: 20, padding: 24, marginBottom: 20, borderWidth: 1, borderColor: '#6C63FF66' },
  projectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 20 },
  projectionStat: { alignItems: 'center', flex: 1 },
  projectionVal: { color: '#6C63FF', fontSize: 36, fontWeight: '900' },
  projectionLabel: { color: '#9E9E9E', fontSize: 12, marginTop: 4, fontWeight: '600', textTransform: 'uppercase', textAlign: 'center' },
  projectionDivider: { width: 1, height: 40, backgroundColor: '#333344' },
  projectionNote: { color: '#C5C5D2', fontSize: 13, textAlign: 'center', lineHeight: 20, backgroundColor: '#12121A', padding: 12, borderRadius: 12 },

  absoluteCard: { backgroundColor: '#1A1A24', borderRadius: 20, padding: 24, marginBottom: 20 },
  absoluteTitle: { color: '#9E9E9E', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  absoluteBig: { color: '#fff', fontSize: 40, fontWeight: '900' },
  absoluteSub: { color: '#666', fontSize: 14, marginBottom: 16 },
  progressBar: { height: 8, backgroundColor: '#2A2A38', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 4 },

  masteredCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2A1A0A', borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#FF980066' },
  masteredEmoji: { fontSize: 32, marginRight: 16 },
  masteredInfo: { flex: 1 },
  masteredTitle: { color: '#FF9800', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  masteredSub: { color: '#D29D52', fontSize: 13, lineHeight: 18 },

  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 16, marginTop: 8 },
  subjectGrid: { gap: 16 },
  subjectRow: { backgroundColor: '#1A1A24', borderRadius: 16, padding: 16 },
  subjectHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  subjectNameRow: { flexDirection: 'row', alignItems: 'center' },
  subjectDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  subjectName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  subjectPercent: { color: '#fff', fontSize: 16, fontWeight: '900' },
  subProgressBar: { height: 6, backgroundColor: '#2A2A38', borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  subProgressFill: { height: '100%', borderRadius: 3 },
  subjectFraction: { color: '#666', fontSize: 11, textAlign: 'right' },
  
  bottomSpacer: { height: 60 }
});
