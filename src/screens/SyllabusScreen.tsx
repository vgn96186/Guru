import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SyllabusStackParamList } from '../navigation/types';
import { getAllSubjects, getSubjectStatsAggregated } from '../db/queries/topics';
import { syncVaultSeedTopics, getDb } from '../db/database';
import { dbEvents, DB_EVENT_KEYS } from '../services/databaseEvents';
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

interface TopicSearchResult {
  id: number;
  name: string;
  subject_id: number;
  subject_name: string;
  color_hex: string;
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
  const [topicResults, setTopicResults] = useState<TopicSearchResult[]>([]);

  const loadData = useCallback(async () => {
    const [subs, combinedRows] = await Promise.all([getAllSubjects(), getSubjectStatsAggregated()]);

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
      const aMetrics = metricMap.get(a.id) ?? {
        due: 0,
        highYield: 0,
        unseen: 0,
        withNotes: 0,
        weak: 0,
      };
      const bMetrics = metricMap.get(b.id) ?? {
        due: 0,
        highYield: 0,
        unseen: 0,
        withNotes: 0,
        weak: 0,
      };
      const aPct = aCoverage.total > 0 ? aCoverage.seen / aCoverage.total : 0;
      const bPct = bCoverage.total > 0 ? bCoverage.seen / bCoverage.total : 0;

      switch (sortMode) {
        case 'due':
          return (
            bMetrics.due - aMetrics.due ||
            bMetrics.weak - aMetrics.weak ||
            b.inicetWeight - a.inicetWeight
          );
        case 'coverage':
          return (
            aPct - bPct || bMetrics.unseen - aMetrics.unseen || b.inicetWeight - a.inicetWeight
          );
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
  }, [sortMode]);

  useEffect(() => {
    if (isFocused) {
      loadData();
    }
  }, [isFocused, sortMode, loadData]);

  useEffect(() => {
    const onProgressOrLecture = () => void loadData();
    dbEvents.on(DB_EVENT_KEYS.PROGRESS_UPDATED, onProgressOrLecture);
    dbEvents.on(DB_EVENT_KEYS.LECTURE_SAVED, onProgressOrLecture);
    return () => {
      dbEvents.off(DB_EVENT_KEYS.PROGRESS_UPDATED, onProgressOrLecture);
      dbEvents.off(DB_EVENT_KEYS.LECTURE_SAVED, onProgressOrLecture);
    };
  }, [loadData]);

  useEffect(() => {
    const searchLower = searchQuery.trim().toLowerCase();
    if (!searchLower) {
      setSearchMatchIds(new Set());
      setSearchMatchCounts(new Map());
      setTopicResults([]);
      return;
    }
    const db = getDb();
    void Promise.all([
      db.getAllAsync<{
        subject_id: number;
        c: number;
      }>(
        `SELECT subject_id, COUNT(*) as c FROM topics WHERE LOWER(name) LIKE ? GROUP BY subject_id`,
        [`%${searchLower}%`],
      ),
      db.getAllAsync<TopicSearchResult>(
        `SELECT t.id, t.name, t.subject_id, s.name as subject_name, s.color_hex
         FROM topics t
         JOIN subjects s ON t.subject_id = s.id
         WHERE LOWER(t.name) LIKE ?
         ORDER BY t.inicet_priority DESC, t.name ASC
         LIMIT 24`,
        [`%${searchLower}%`],
      ),
    ]).then(([rows, topics]) => {
      setSearchMatchIds(new Set(rows.map((r) => r.subject_id)));
      setSearchMatchCounts(new Map(rows.map((r) => [r.subject_id, r.c])));
      setTopicResults(topics);
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
    const summary = coverage
      .map(
        (c: any) =>
          `${subjectMap.get(c.subject_id) || `ID ${c.subject_id} (NOT IN SUBJECTS)`}: ${c.c} topics`,
      )
      .join('\n');

    const diag =
      `Total topics: ${count}\n\n` +
      `--- Topics Per Subject ---\n${summary}\n\n` +
      `--- Subjects Map ---\n${subjects.map((s: any) => `${s.id}: ${s.name}`).join('\n')}`;

    Alert.alert('Database State', diag);
  }

  const totalTopics = Array.from(coverage.values()).reduce((s, v) => s + v.total, 0);
  const seenTopics = Array.from(coverage.values()).reduce((s, v) => s + v.seen, 0);
  const overallPct = totalTopics > 0 ? Math.round((seenTopics / totalTopics) * 100) : 0;
  const totalDue = Array.from(subjectMetrics.values()).reduce((sum, item) => sum + item.due, 0);
  const totalHighYield = Array.from(subjectMetrics.values()).reduce(
    (sum, item) => sum + item.highYield,
    0,
  );
  const totalWithNotes = Array.from(subjectMetrics.values()).reduce(
    (sum, item) => sum + item.withNotes,
    0,
  );

  const searchLower = searchQuery.trim().toLowerCase();
  const filteredSubjects = subjects.filter(
    (subject) =>
      subject.name.toLowerCase().includes(searchLower) ||
      subject.shortCode.toLowerCase().includes(searchLower) ||
      searchMatchIds.has(subject.id),
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
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ResponsiveContainer>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Syllabus</Text>
            <Text style={styles.subtitle}>
              Track exam prep through micro-topics, due reviews, and high-yield coverage.
            </Text>
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
                <Text style={[styles.pctText, overallPct >= 50 && { color: theme.colors.success }]}>
                  {overallPct}%
                </Text>
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
            accessibilityRole="button"
            accessibilityLabel={refreshing ? 'Syncing' : 'Refresh syllabus'}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Text style={styles.syncBtnText}>🔄</Text>
            )}
          </TouchableOpacity>
        </View>
        <View style={styles.controls}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search subjects or topics..."
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
          />
          <View style={styles.sortRow}>
            {SORT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[styles.sortChip, sortMode === option.key && styles.sortChipActive]}
                onPress={() => setSortMode(option.key)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${option.label}`}
                accessibilityState={{ selected: sortMode === option.key }}
              >
                <Text
                  style={[
                    styles.sortChipText,
                    sortMode === option.key && styles.sortChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <FlatList
          data={filteredSubjects}
          keyExtractor={(s) => s.id.toString()}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            searchLower.length >= 2 && topicResults.length > 0 ? (
              <View style={styles.topicResultsSection}>
                <Text style={styles.topicResultsLabel}>Direct Topic Matches</Text>
                {topicResults.map((topic) => (
                  <TouchableOpacity
                    key={`topic-${topic.id}`}
                    style={styles.topicResultCard}
                    activeOpacity={0.8}
                    onPress={() =>
                      navigation.navigate('TopicDetail', {
                        subjectId: topic.subject_id,
                        subjectName: topic.subject_name,
                        initialTopicId: topic.id,
                        initialSearchQuery: topic.name,
                      })
                    }
                  >
                    <View style={[styles.topicResultDot, { backgroundColor: topic.color_hex }]} />
                    <View style={styles.topicResultCopy}>
                      <Text style={styles.topicResultName} numberOfLines={2}>
                        {topic.name}
                      </Text>
                      <Text style={styles.topicResultSubject}>{topic.subject_name}</Text>
                    </View>
                    <Text style={styles.topicResultAction}>Open</Text>
                  </TouchableOpacity>
                ))}
                <Text style={styles.topicResultsDivider}>Matching Subjects</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {searchLower.length >= 2 ? 'No subjects or topics matched' : 'No subjects matched'}
              </Text>
              <Text style={styles.emptySub}>
                Try a different subject name, short code, or topic keyword.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <SubjectCard
              subject={item}
              coverage={coverage.get(item.id) ?? { total: 0, seen: 0 }}
              metrics={subjectMetrics.get(item.id)}
              matchingTopicsCount={searchMatchCounts.get(item.id)}
              onPress={() =>
                navigation.navigate('TopicDetail', {
                  subjectId: item.id,
                  subjectName: item.name,
                  initialSearchQuery: searchQuery.trim(),
                })
              }
            />
          )}
        />
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: theme.spacing.lg,
    paddingTop: 20,
  },
  title: { color: theme.colors.textPrimary, fontSize: 26, fontWeight: '900', marginBottom: 8 },
  subtitle: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 10 },
  emptySummaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    marginBottom: 12,
  },
  emptySummaryTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptySummaryText: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  overallBadge: { flexDirection: 'row', alignItems: 'baseline' },
  overallPct: { color: theme.colors.primary, fontWeight: '900', fontSize: 24 },
  overallLabel: { color: theme.colors.textSecondary, fontSize: 14, marginLeft: 2 },
  pctBadge: {
    backgroundColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 12,
  },
  pctBadgeGood: { backgroundColor: theme.colors.successSurface },
  pctText: { color: theme.colors.textSecondary, fontWeight: '800', fontSize: 14 },
  progressTrack: {
    height: 6,
    backgroundColor: theme.colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 3 },
  snapshotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  snapshotPill: {
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '700',
  },
  syncBtn: {
    backgroundColor: theme.colors.surface,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.primaryTintMedium,
  },
  syncBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 18 },
  controls: { paddingHorizontal: theme.spacing.lg, paddingBottom: 8, gap: 10 },
  searchInput: {
    backgroundColor: theme.colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.textPrimary,
    fontSize: 14,
  },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.panel,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sortChipActive: {
    backgroundColor: theme.colors.primaryTint,
    borderColor: theme.colors.primaryTintMedium,
  },
  sortChipText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '700' },
  sortChipTextActive: { color: theme.colors.textPrimary, fontSize: 12, fontWeight: '700' },
  list: { paddingHorizontal: theme.spacing.lg, paddingBottom: 40 },
  topicResultsSection: { marginBottom: 20 },
  topicResultsLabel: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  topicResultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    marginBottom: 8,
  },
  topicResultDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  topicResultCopy: { flex: 1, marginRight: 12 },
  topicResultName: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  topicResultSubject: { color: theme.colors.textSecondary, fontSize: 12 },
  topicResultAction: {
    color: theme.colors.primaryLight,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  topicResultsDivider: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 6,
  },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: '700' },
  emptySub: { color: theme.colors.textMuted, fontSize: 13, marginTop: 6 },
});
