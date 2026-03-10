import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, StatusBar, FlatList, TouchableOpacity, Alert, ActivityIndicator, Animated, Easing, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SyllabusStackParamList } from '../navigation/types';
import { getAllSubjects, getSubjectCoverage } from '../db/queries/topics';
import { syncVaultSeedTopics, getDb } from '../db/database';
import SubjectCard from '../components/SubjectCard';
import type { Subject } from '../types';
import { ResponsiveContainer } from '../hooks/useResponsive';
import * as Haptics from 'expo-haptics';

type Nav = NativeStackNavigationProp<SyllabusStackParamList, 'Syllabus'>;

type SubjectSortMode = 'weight' | 'due' | 'coverage' | 'high_yield';

interface SubjectMetrics {
  due: number;
  highYield: number;
  unseen: number;
  withNotes: number;
  weak: number;
}

const SORT_OPTIONS: Array<{ key: SubjectSortMode; label: string }> = [
  { key: 'weight', label: 'Weight' },
  { key: 'due', label: 'Due' },
  { key: 'coverage', label: 'Coverage' },
  { key: 'high_yield', label: 'High Yield' },
];

export default function SyllabusScreen() {
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [coverage, setCoverage] = useState<Map<number, { total: number; seen: number }>>(new Map());
  const [subjectMetrics, setSubjectMetrics] = useState<Map<number, SubjectMetrics>>(new Map());
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SubjectSortMode>('weight');

  async function loadData() {
    const subs = getAllSubjects();
    const cov = getSubjectCoverage();
    // Force numeric keys in the map to prevent string/number mismatch
    const map = new Map(cov.map(c => [Number(c.subjectId), { total: c.total, seen: c.seen }]));
    const db = getDb();
    const metricRows = db.getAllSync<{
      subjectId: number;
      due: number;
      highYield: number;
      unseen: number;
      withNotes: number;
      weak: number;
    }>(
      `SELECT
         t.subject_id AS subjectId,
         SUM(CASE WHEN COALESCE(p.status, 'unseen') != 'unseen' AND (p.fsrs_due IS NULL OR DATE(p.fsrs_due) <= DATE('now')) THEN 1 ELSE 0 END) AS due,
         SUM(CASE WHEN t.inicet_priority >= 8 THEN 1 ELSE 0 END) AS highYield,
         SUM(CASE WHEN COALESCE(p.status, 'unseen') = 'unseen' THEN 1 ELSE 0 END) AS unseen,
         SUM(CASE WHEN TRIM(COALESCE(p.user_notes, '')) <> '' THEN 1 ELSE 0 END) AS withNotes,
         SUM(CASE WHEN COALESCE(p.times_studied, 0) > 0 AND COALESCE(p.confidence, 0) < 3 THEN 1 ELSE 0 END) AS weak
       FROM topics t
       LEFT JOIN topic_progress p ON p.topic_id = t.id
       GROUP BY t.subject_id`,
    );
    const metricMap = new Map(
      metricRows.map((row) => [
        Number(row.subjectId),
        {
          due: row.due ?? 0,
          highYield: row.highYield ?? 0,
          unseen: row.unseen ?? 0,
          withNotes: row.withNotes ?? 0,
          weak: row.weak ?? 0,
        },
      ]),
    );

    const sortedSubjects = [...subs].sort((a, b) => {
      const aCoverage = map.get(a.id) ?? { total: 0, seen: 0 };
      const bCoverage = map.get(b.id) ?? { total: 0, seen: 0 };
      const aMetrics = metricMap.get(a.id) ?? { due: 0, highYield: 0, unseen: 0, withNotes: 0, weak: 0 };
      const bMetrics = metricMap.get(b.id) ?? { due: 0, highYield: 0, unseen: 0, withNotes: 0, weak: 0 };
      const aPct = aCoverage.total > 0 ? aCoverage.seen / aCoverage.total : 0;
      const bPct = bCoverage.total > 0 ? bCoverage.seen / bCoverage.total : 0;

      switch (sortMode) {
        case 'due':
          return bMetrics.due - aMetrics.due || bMetrics.weak - aMetrics.weak || b.inicetWeight - a.inicetWeight;
        case 'coverage':
          return aPct - bPct || bMetrics.unseen - aMetrics.unseen || b.inicetWeight - a.inicetWeight;
        case 'high_yield':
          return bMetrics.highYield - aMetrics.highYield || b.inicetWeight - a.inicetWeight;
        case 'weight':
        default:
          return b.inicetWeight - a.inicetWeight || bMetrics.due - aMetrics.due;
      }
    });

    setSubjects(sortedSubjects);
    setCoverage(map);
    setSubjectMetrics(metricMap);
  }

  useEffect(() => {
    if (isFocused) {
      loadData();
    }
  }, [isFocused, sortMode]);

  async function handleManualSync() {
    Alert.alert(
      'Re-check vault topics?',
      'This will safely sync new vault topics without deleting your progress.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sync',
          onPress: async () => {
            setRefreshing(true);
            try {
              await syncVaultSeedTopics();
              await loadData();
              Alert.alert('Synced', 'Guru re-checked your vault topics. 😏');
            } catch (e: any) {
              Alert.alert('Sync failed', e.message);
            } finally {
              setRefreshing(false);
            }
          },
        },
      ],
    );
  }

  function runDiagnostics() {
    const db = getDb();
    const count = db.getFirstSync<{ c: number }>('SELECT COUNT(*) as c FROM topics')?.c;
    const subjects = db.getAllSync<any>('SELECT id, name FROM subjects');
    const coverage = db.getAllSync<any>('SELECT subject_id, COUNT(*) as c FROM topics GROUP BY subject_id');
    
    // Create a readable summary of topics per subject
    const subjectMap = new Map(subjects.map((s: any) => [s.id, s.name]));
    const summary = coverage.map((c: any) => `${subjectMap.get(c.subject_id) || `ID ${c.subject_id} (NOT IN SUBJECTS)`}: ${c.c} topics`).join('\n');

    const diag = `Total topics: ${count}\n\n` +
                 `--- Topics Per Subject ---\n${summary}\n\n` +
                 `--- Subjects Map ---\n${subjects.map((s:any) => `${s.id}: ${s.name}`).join('\n')}`;
    
// console.log('--- DB DIAGNOSTICS ---');
// console.log(diag);
    Alert.alert('Database State', diag);
  }

  const totalTopics = Array.from(coverage.values()).reduce((s, v) => s + v.total, 0);
  const seenTopics = Array.from(coverage.values()).reduce((s, v) => s + v.seen, 0);
  const overallPct = totalTopics > 0 ? Math.round((seenTopics / totalTopics) * 100) : 0;
  const totalDue = Array.from(subjectMetrics.values()).reduce((sum, item) => sum + item.due, 0);
  const totalHighYield = Array.from(subjectMetrics.values()).reduce((sum, item) => sum + item.highYield, 0);
  const totalWithNotes = Array.from(subjectMetrics.values()).reduce((sum, item) => sum + item.withNotes, 0);
  const filteredSubjects = subjects.filter(subject =>
    subject.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
    subject.shortCode.toLowerCase().includes(searchQuery.trim().toLowerCase()),
  );
  
  // Animated progress
  const progressAnim = useRef(new Animated.Value(0)).current;
  const prevPct = useRef(0);
  const countAnim = useRef(new Animated.Value(0)).current;
  const [displayCount, setDisplayCount] = useState(seenTopics);
  
  useEffect(() => {
    const increased = overallPct > prevPct.current;
    prevPct.current = overallPct;
    
    // Animate progress bar
    Animated.timing(progressAnim, {
      toValue: overallPct,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    
    // Animate count
    Animated.timing(countAnim, {
      toValue: seenTopics,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    
    const listener = countAnim.addListener(({ value }) => {
      setDisplayCount(Math.round(value));
    });
    
    // Haptic on milestone
    if (increased && overallPct > 0 && overallPct % 10 === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    
    return () => countAnim.removeListener(listener);
  }, [overallPct, seenTopics]);
  
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={styles.safe} testID="syllabus-screen">
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <ResponsiveContainer>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Syllabus</Text>
            <Text style={styles.subtitle}>Break the exam down by subject, yield, due reviews, and note coverage.</Text>
            <View style={styles.statsRow}>
              <View style={styles.overallBadge}>
                <Text style={styles.overallPct}>{displayCount}</Text>
                <Text style={styles.overallLabel}>/{totalTopics} topics</Text>
              </View>
              <View style={[styles.pctBadge, overallPct >= 50 && styles.pctBadgeGood]}>
                <Text style={[styles.pctText, overallPct >= 50 && { color: '#4CAF50' }]}>{overallPct}%</Text>
              </View>
            </View>
            {/* Progress bar */}
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
            </View>
            <View style={styles.snapshotRow}>
              <Text style={styles.snapshotPill}>Due {totalDue}</Text>
              <Text style={styles.snapshotPill}>High yield {totalHighYield}</Text>
              <Text style={styles.snapshotPill}>Notes {totalWithNotes}</Text>
            </View>
          </View>
          <TouchableOpacity 
            onPress={handleManualSync} 
            disabled={refreshing}
            style={styles.syncBtn}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#6C63FF" />
            ) : (
              <Text style={styles.syncBtnText}>🔄</Text>
            )}
          </TouchableOpacity>
        </View>
        <View style={styles.controls}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search subjects..."
            placeholderTextColor="#666"
            style={styles.searchInput}
          />
          <View style={styles.sortRow}>
            {SORT_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.key}
                style={[styles.sortChip, sortMode === option.key && styles.sortChipActive]}
                onPress={() => setSortMode(option.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.sortChipText, sortMode === option.key && styles.sortChipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <FlatList
          data={filteredSubjects}
          keyExtractor={s => s.id.toString()}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No subjects matched</Text>
              <Text style={styles.emptySub}>Try a different subject name or short code.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <SubjectCard
              subject={item}
              coverage={coverage.get(item.id) ?? { total: 0, seen: 0 }}
              metrics={subjectMetrics.get(item.id)}
              onPress={() => navigation.navigate('TopicDetail', { subjectId: item.id, subjectName: item.name })}
            />
          )}
        />
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16, paddingTop: 20 },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 8 },
  subtitle: { color: '#8E94A5', fontSize: 13, lineHeight: 19, marginBottom: 10 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  overallBadge: { flexDirection: 'row', alignItems: 'baseline' },
  overallPct: { color: '#6C63FF', fontWeight: '900', fontSize: 24 },
  overallLabel: { color: '#9E9E9E', fontSize: 14, marginLeft: 2 },
  pctBadge: { backgroundColor: '#2A2A38', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginLeft: 12 },
  pctBadgeGood: { backgroundColor: '#1A2A1A' },
  pctText: { color: '#888', fontWeight: '800', fontSize: 14 },
  progressTrack: { height: 6, backgroundColor: '#2A2A38', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#6C63FF', borderRadius: 3 },
  snapshotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  snapshotPill: {
    color: '#D5DBE8',
    backgroundColor: '#1A1A24',
    borderColor: '#2A2A38',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '700',
  },
  syncBtn: { backgroundColor: '#1A1A24', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#6C63FF33' },
  syncBtnText: { color: '#6C63FF', fontWeight: '700', fontSize: 18 },
  controls: { paddingHorizontal: 16, paddingBottom: 8, gap: 10 },
  searchInput: {
    backgroundColor: '#171722',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A38',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
  },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#171722',
    borderWidth: 1,
    borderColor: '#2A2A38',
  },
  sortChipActive: {
    backgroundColor: '#252144',
    borderColor: '#6C63FF66',
  },
  sortChipText: { color: '#A9AFBC', fontSize: 12, fontWeight: '700' },
  sortChipTextActive: { color: '#E7E4FF' },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  emptySub: { color: '#80869A', fontSize: 13, marginTop: 6 },
});
