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
import { theme } from '../constants/theme';

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
  const [searchMatchIds, setSearchMatchIds] = useState<Set<number>>(new Set());
  const [searchMatchCounts, setSearchMatchCounts] = useState<Map<number, number>>(new Map());

  async function loadData() {
    const db = getDb();

    // Combine subject fetching, coverage, and metrics into a single query to eliminate N+1 processing and redundant group bys
    const [subs, combinedRows] = await Promise.all([
      getAllSubjects(),
      db.getAllAsync<{
        subjectId: number;
        total: number;
        seen: number;
        due: number;
        highYield: number;
        unseen: number;
        withNotes: number;
        weak: number;
      }>(
        `SELECT
           t.subject_id AS subjectId,
           COUNT(t.id) as total,
           SUM(CASE WHEN p.status IN ('seen','reviewed','mastered') THEN 1 ELSE 0 END) as seen,
           SUM(CASE WHEN COALESCE(p.status, 'unseen') != 'unseen' AND (p.fsrs_due IS NULL OR DATE(p.fsrs_due) <= DATE('now')) THEN 1 ELSE 0 END) AS due,
           SUM(CASE WHEN t.inicet_priority >= 8 THEN 1 ELSE 0 END) AS highYield,
           SUM(CASE WHEN COALESCE(p.status, 'unseen') = 'unseen' THEN 1 ELSE 0 END) AS unseen,
           SUM(CASE WHEN TRIM(COALESCE(p.user_notes, '')) <> '' THEN 1 ELSE 0 END) AS withNotes,
           SUM(CASE WHEN COALESCE(p.times_studied, 0) > 0 AND COALESCE(p.confidence, 0) < 3 THEN 1 ELSE 0 END) AS weak
         FROM topics t
         LEFT JOIN topic_progress p ON p.topic_id = t.id
         WHERE NOT EXISTS (
           SELECT 1 FROM topics c
           WHERE c.parent_topic_id = t.id
         )
         GROUP BY t.subject_id`
      )
    ]);

    const map = new Map<number, { total: number; seen: number }>();
    const metricMap = new Map<number, SubjectMetrics>();

    for (const row of combinedRows) {
      const sId = Number(row.subjectId);
      map.set(sId, { total: row.total ?? 0, seen: row.seen ?? 0 });
      metricMap.set(sId, {
        due: row.due ?? 0,
        highYield: row.highYield ?? 0,
        unseen: row.unseen ?? 0,
        withNotes: row.withNotes ?? 0,
        weak: row.weak ?? 0,
      });
    }

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

  useEffect(() => {
    const searchLower = searchQuery.trim().toLowerCase();
    if (!searchLower) {
      setSearchMatchIds(new Set());
      setSearchMatchCounts(new Map());
      return;
    }
    const db = getDb();
    void db.getAllAsync<{ subject_id: number; c: number }>(
      `SELECT subject_id, COUNT(*) as c FROM topics WHERE LOWER(name) LIKE ? GROUP BY subject_id`,
      [`%${searchLower}%`],
    ).then(rows => {
      setSearchMatchIds(new Set(rows.map(r => r.subject_id)));
      setSearchMatchCounts(new Map(rows.map(r => [r.subject_id, r.c])));
    });
  }, [searchQuery]);

  async function handleManualSync() {
    Alert.alert(
      'Re-check syllabus topics?',
      'This will safely sync new syllabus and vault topics without deleting your progress.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sync',
          onPress: async () => {
            setRefreshing(true);
            try {
              await syncVaultSeedTopics();
              await loadData();
              Alert.alert('Synced', 'Guru successfully re-checked your topics. 😏');
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

  async function runDiagnostics() {
    const db = getDb();
    const [countRow, subjects, coverage] = await Promise.all([
      db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM topics'),
      db.getAllAsync<any>('SELECT id, name FROM subjects'),
      db.getAllAsync<any>('SELECT subject_id, COUNT(*) as c FROM topics GROUP BY subject_id'),
    ]);
    const count = countRow?.c;
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

  const searchLower = searchQuery.trim().toLowerCase();
  const filteredSubjects = subjects.filter(subject =>
    subject.name.toLowerCase().includes(searchLower) ||
    subject.shortCode.toLowerCase().includes(searchLower) ||
    searchMatchIds.has(subject.id)
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
              <Text style={styles.subtitle}>Track exam prep through micro-topics, due reviews, and high-yield coverage.</Text>
            {seenTopics === 0 ? (
              <View style={styles.emptySummaryCard}>
                <Text style={styles.emptySummaryTitle}>You are starting fresh</Text>
                <Text style={styles.emptySummaryText}>
                  Open any subject to mark topics, capture lectures, and build coverage momentum.
                </Text>
              </View>
            ) : null}
            <View style={styles.statsRow}>
              <View style={styles.overallBadge}>
                <Text style={styles.overallPct}>{displayCount}</Text>
                <Text style={styles.overallLabel}>/{totalTopics} micro-topics</Text>
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
              matchingTopicsCount={searchMatchCounts.get(item.id)}
              onPress={() => navigation.navigate('TopicDetail', { subjectId: item.id, subjectName: item.name, initialSearchQuery: searchQuery.trim() })}
            />
          )}
        />
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16, paddingTop: 20 },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 8 },
  subtitle: { color: '#8E94A5', fontSize: 13, lineHeight: 19, marginBottom: 10 },
  emptySummaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    marginBottom: 12,
  },
  emptySummaryTitle: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: '800', marginBottom: 4 },
  emptySummaryText: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18 },
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
