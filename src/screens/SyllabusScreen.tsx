import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  InteractionManager,
  ScrollView,
} from 'react-native';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing as ReanimatedEasing,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SyllabusStackParamList } from '../navigation/types';
import {
  approveTopicSuggestion,
  getAllSubjects,
  getPendingTopicSuggestions,
  getSubjectStatsAggregated,
  rejectTopicSuggestion,
  type TopicSuggestion,
} from '../db/queries/topics';
import { syncVaultSeedTopics, getDb } from '../db/database';
import { dbEvents, DB_EVENT_KEYS } from '../services/databaseEvents';
import SubjectCard from '../components/SubjectCard';
import type { Subject } from '../types';
import { ResponsiveContainer } from '../hooks/useResponsive';
import * as Haptics from 'expo-haptics';
import BannerIconButton from '../components/BannerIconButton';
import BannerSearchBar from '../components/BannerSearchBar';
import { linearTheme as n } from '../theme/linearTheme';
import ScreenHeader from '../components/ScreenHeader';
import LinearSurface from '../components/primitives/LinearSurface';
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

const EMPTY_COVERAGE = { total: 0, seen: 0 };
const EMPTY_METRICS: SubjectMetrics = { due: 0, highYield: 0, unseen: 0, withNotes: 0, weak: 0 };
const SYLLABUS_FOCUS_RELOAD_THROTTLE_MS = 15_000;

/** Premium skeleton matching the split SubjectCard layout */
function SyllabusSkeleton() {
  return (
    <View style={skeletonStyles.container}>
      {/* Header Skeleton */}
      <View style={skeletonStyles.headerRow}>
        <View style={skeletonStyles.headerTitle} />
        <View style={skeletonStyles.headerActions} />
      </View>

      {/* Hero Surface Skeleton */}
      <View style={skeletonStyles.heroSurface}>
        <View style={[skeletonStyles.bar, { width: '40%', marginBottom: 12 }]} />
        <View style={skeletonStyles.heroMain}>
          <View style={skeletonStyles.heroStats} />
          <View style={skeletonStyles.heroTrack} />
        </View>
      </View>

      {/* Grid Controls Skeleton */}
      <View style={skeletonStyles.controls}>
        <View
          style={{
            width: 80,
            height: 28,
            backgroundColor: n.colors.border,
            borderRadius: 8,
            opacity: 0.3,
          }}
        />
        <View
          style={{
            width: 80,
            height: 28,
            backgroundColor: n.colors.border,
            borderRadius: 8,
            opacity: 0.2,
          }}
        />
        <View
          style={{
            width: 80,
            height: 28,
            backgroundColor: n.colors.border,
            borderRadius: 8,
            opacity: 0.2,
          }}
        />
      </View>

      {/* Cards List Skeleton */}
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={skeletonStyles.card}>
          {/* 50/50 Split Matching SubjectCard */}
          <View style={skeletonStyles.leftHalf}>
            <View style={[skeletonStyles.bar, { width: `${60 + (i % 2) * 20}%` }]} />
            <View style={[skeletonStyles.barSmall, { width: '40%', marginTop: 6 }]} />
          </View>
          <View style={skeletonStyles.rightHalf}>
            <View style={skeletonStyles.thickProgressBar} />
          </View>
        </View>
      ))}
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: n.colors.background,
    paddingHorizontal: n.spacing.md,
    paddingTop: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  headerTitle: {
    width: 120,
    height: 24,
    backgroundColor: n.colors.border,
    borderRadius: 4,
    opacity: 0.5,
  },
  headerActions: {
    width: 80,
    height: 32,
    backgroundColor: n.colors.border,
    borderRadius: 16,
    opacity: 0.3,
  },

  heroSurface: {
    height: 100,
    backgroundColor: n.colors.surface,
    borderRadius: n.radius.md,
    borderWidth: 1,
    borderColor: n.colors.border,
    padding: 16,
    marginBottom: 20,
    opacity: 0.6,
  },
  heroMain: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroStats: {
    width: 80,
    height: 36,
    backgroundColor: n.colors.border,
    borderRadius: 6,
    opacity: 0.4,
  },
  heroTrack: {
    flex: 1,
    height: 12,
    backgroundColor: n.colors.border,
    borderRadius: 6,
    opacity: 0.3,
  },

  controls: { flexDirection: 'row', gap: 8, marginBottom: 16 },

  card: {
    flexDirection: 'row',
    height: 90,
    backgroundColor: n.colors.surface,
    borderRadius: n.radius.md,
    borderWidth: 1,
    borderColor: n.colors.border,
    marginBottom: 10,
    overflow: 'hidden',
    opacity: 0.8,
  },
  leftHalf: { flex: 1, padding: 14, justifyContent: 'center' },
  rightHalf: { flex: 1, padding: 14, justifyContent: 'center' },

  bar: {
    height: 12,
    borderRadius: 4,
    backgroundColor: n.colors.border,
    opacity: 0.5,
  },
  barSmall: {
    height: 8,
    borderRadius: 3,
    backgroundColor: n.colors.border,
    opacity: 0.3,
  },
  thickProgressBar: {
    height: 12,
    backgroundColor: n.colors.border,
    borderRadius: 6,
    opacity: 0.2,
    width: '100%',
  },
});
/**
 * Shell wrapper — renders only a lightweight skeleton during the tab-switch
 * animation, then mounts the full SyllabusScreen content after the transition
 * settles. This prevents heavy hook/component initialization from competing
 * with React Navigation's animation frames.
 */
export default function SyllabusScreen() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setReady(true);
    });
    return () => task.cancel();
  }, []);

  if (!ready) {
    return (
      <SafeAreaView style={styles.safe} testID="syllabus-screen">
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <SyllabusSkeleton />
      </SafeAreaView>
    );
  }

  return <SyllabusScreenContent />;
}

function SyllabusScreenContent() {
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [coverage, setCoverage] = useState<Map<number, { total: number; seen: number }>>(new Map());
  const [subjectMetrics, setSubjectMetrics] = useState<Map<number, SubjectMetrics>>(new Map());
  const [refreshing, setRefreshing] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SubjectSortMode>('weight');
  const [searchMatchIds, setSearchMatchIds] = useState<Set<number>>(new Set());
  const [searchMatchCounts, setSearchMatchCounts] = useState<Map<number, number>>(new Map());
  const [topicResults, setTopicResults] = useState<TopicSearchResult[]>([]);
  const [pendingSuggestions, setPendingSuggestions] = useState<TopicSuggestion[]>([]);
  const [suggestionBusyId, setSuggestionBusyId] = useState<number | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const isFocusedRef = useRef(isFocused);
  const lastLoadedAtRef = useRef(0);
  const lastLoadedSortModeRef = useRef<SubjectSortMode>(sortMode);
  const navLockRef = useRef(false);
  const navUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unlockNavigation = useCallback(() => {
    navLockRef.current = false;
    if (navUnlockTimerRef.current) {
      clearTimeout(navUnlockTimerRef.current);
      navUnlockTimerRef.current = null;
    }
  }, []);

  const scheduleNavUnlock = useCallback((ms: number) => {
    if (navUnlockTimerRef.current) {
      clearTimeout(navUnlockTimerRef.current);
    }
    navUnlockTimerRef.current = setTimeout(() => {
      navLockRef.current = false;
      navUnlockTimerRef.current = null;
    }, ms);
  }, []);

  useEffect(() => {
    isFocusedRef.current = isFocused;
  }, [isFocused]);

  const loadData = useCallback(async () => {
    const [subs, combinedRows, suggestions] = await Promise.all([
      getAllSubjects(),
      getSubjectStatsAggregated(),
      getPendingTopicSuggestions(),
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
      const aMetrics = metricMap.get(a.id) ?? EMPTY_METRICS;
      const bMetrics = metricMap.get(b.id) ?? EMPTY_METRICS;
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

    if (!isFocusedRef.current) return;
    setSubjects(sortedSubjects);
    setCoverage(map);
    setSubjectMetrics(metricMap);
    setPendingSuggestions(suggestions);
    setIsInitialLoad(false);
    lastLoadedAtRef.current = Date.now();
    lastLoadedSortModeRef.current = sortMode;
  }, [sortMode]);

  useEffect(() => {
    if (isFocused) {
      unlockNavigation();
      const shouldReload =
        isInitialLoad ||
        lastLoadedSortModeRef.current !== sortMode ||
        Date.now() - lastLoadedAtRef.current > SYLLABUS_FOCUS_RELOAD_THROTTLE_MS;
      if (!shouldReload) {
        return;
      }
      const task = InteractionManager.runAfterInteractions(() => {
        void loadData();
      });
      return () => task.cancel();
    }
  }, [isFocused, sortMode, loadData, unlockNavigation]);

  useEffect(() => {
    return () => {
      if (navUnlockTimerRef.current) {
        clearTimeout(navUnlockTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onProgressOrLecture = () => {
      const task = InteractionManager.runAfterInteractions(() => {
        void loadData();
      });
      return task;
    };
    dbEvents.on(DB_EVENT_KEYS.PROGRESS_UPDATED, onProgressOrLecture);
    dbEvents.on(DB_EVENT_KEYS.LECTURE_SAVED, onProgressOrLecture);
    return () => {
      dbEvents.off(DB_EVENT_KEYS.PROGRESS_UPDATED, onProgressOrLecture);
      dbEvents.off(DB_EVENT_KEYS.LECTURE_SAVED, onProgressOrLecture);
    };
  }, [loadData]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 180);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const searchLower = searchQuery.trim().toLowerCase();
    if (!searchLower) {
      setSearchMatchIds(new Set());
      setSearchMatchCounts(new Map());
      setTopicResults([]);
      return;
    }
    // Debounce search queries to avoid LIKE spam on every keystroke
    const timer = setTimeout(() => {
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
        if (!isFocusedRef.current) return;
        setSearchMatchIds(new Set(rows.map((r) => r.subject_id)));
        setSearchMatchCounts(new Map(rows.map((r) => [r.subject_id, r.c])));
        setTopicResults(topics);
      });
    }, 250);
    return () => clearTimeout(timer);
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

  async function handleApproveSuggestion(suggestion: TopicSuggestion) {
    setSuggestionBusyId(suggestion.id);
    try {
      const topicId = await approveTopicSuggestion(suggestion.id);
      await loadData();
      Alert.alert(
        'Topic approved',
        topicId
          ? `"${suggestion.name}" is now part of ${suggestion.subjectName}.`
          : `"${suggestion.name}" was already available.`,
      );
    } catch (e: any) {
      Alert.alert('Approval failed', e?.message ?? 'Unknown error');
    } finally {
      setSuggestionBusyId(null);
    }
  }

  async function handleRejectSuggestion(suggestion: TopicSuggestion) {
    setSuggestionBusyId(suggestion.id);
    try {
      await rejectTopicSuggestion(suggestion.id);
      await loadData();
    } catch (e: any) {
      Alert.alert('Reject failed', e?.message ?? 'Unknown error');
    } finally {
      setSuggestionBusyId(null);
    }
  }

  async function _runDiagnostics() {
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
  const filteredSubjects = useMemo(
    () =>
      subjects.filter(
        (subject) =>
          subject.name.toLowerCase().includes(searchLower) ||
          subject.shortCode.toLowerCase().includes(searchLower) ||
          searchMatchIds.has(subject.id),
      ),
    [subjects, searchLower, searchMatchIds],
  );

  const handleTopicResultPress = useCallback(
    (topic: TopicSearchResult) => {
      if (navLockRef.current) return;
      navLockRef.current = true;
      scheduleNavUnlock(700);
      navigation.push('TopicDetail', {
        subjectId: topic.subject_id,
        subjectName: topic.subject_name,
        initialTopicId: topic.id,
        initialSearchQuery: topic.name,
      });
    },
    [navigation, scheduleNavUnlock],
  );

  const handleSubjectPress = useCallback(
    (item: Subject) => {
      if (navLockRef.current) return;
      navLockRef.current = true;
      scheduleNavUnlock(700);
      navigation.push('TopicDetail', {
        subjectId: item.id,
        subjectName: item.name,
        initialSearchQuery: searchQuery.trim(),
      });
    },
    [navigation, searchQuery, scheduleNavUnlock],
  );

  const keyExtractor = useCallback((s: Subject) => s.id.toString(), []);

  // Stable refs for maps — lets renderSubjectItem's useCallback deps stay empty
  const coverageRef = useRef(coverage);
  coverageRef.current = coverage;
  const subjectMetricsRef = useRef(subjectMetrics);
  subjectMetricsRef.current = subjectMetrics;
  const searchMatchCountsRef = useRef(searchMatchCounts);
  searchMatchCountsRef.current = searchMatchCounts;
  const handleSubjectPressRef = useRef(handleSubjectPress);
  handleSubjectPressRef.current = handleSubjectPress;

  const renderSubjectItem = useCallback(
    ({ item }: { item: Subject }) => (
      <SubjectCard
        subject={item}
        coverage={coverageRef.current.get(item.id) ?? EMPTY_COVERAGE}
        metrics={subjectMetricsRef.current.get(item.id)}
        matchingTopicsCount={searchMatchCountsRef.current.get(item.id)}
        onPress={() => handleSubjectPressRef.current(item)}
      />
    ),
    [],
  );

  const listHeaderComponent = useMemo(() => {
    if (searchLower.length < 2 || topicResults.length === 0) return null;
    return (
      <View style={styles.topicResultsSection}>
        <Text style={styles.topicResultsLabel}>Direct Topic Matches</Text>
        {topicResults.map((topic) => (
          <TouchableOpacity
            key={`topic-${topic.id}`}
            activeOpacity={0.8}
            onPress={() => handleTopicResultPress(topic)}
          >
            <LinearSurface compact padded={false} style={styles.topicResultCard}>
              <View style={[styles.topicResultDot, { backgroundColor: topic.color_hex }]} />
              <View style={styles.topicResultCopy}>
                <Text style={styles.topicResultName} numberOfLines={2}>
                  {topic.name}
                </Text>
                <Text style={styles.topicResultSubject}>{topic.subject_name}</Text>
              </View>
              <Text style={styles.topicResultAction}>Open</Text>
            </LinearSurface>
          </TouchableOpacity>
        ))}
        <Text style={styles.topicResultsDivider}>Matching Subjects</Text>
      </View>
    );
  }, [searchLower.length, topicResults, handleTopicResultPress]);

  // Animated progress
  const progressWidth = useSharedValue(0);
  const prevPct = useRef(0);

  useEffect(() => {
    const increased = overallPct > prevPct.current;
    prevPct.current = overallPct;

    // Animate progress bar on UI thread
    progressWidth.value = withTiming(overallPct, {
      duration: 1200,
      easing: ReanimatedEasing.inOut(ReanimatedEasing.cubic),
    });

    // Haptic on milestone
    if (increased && overallPct > 0 && overallPct % 10 === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [overallPct, progressWidth]);

  const progressAnimatedStyle = useAnimatedStyle(() => {
    return {
      width: `${Math.min(100, Math.max(0, progressWidth.value))}%`,
    };
  });

  return (
    <SafeAreaView style={styles.safe} testID="syllabus-screen">
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer>
        <ScreenHeader
          title="Syllabus"
          subtitle={
            seenTopics === 0
              ? 'Open any subject to start building coverage.'
              : 'Track coverage, due topics, and high-yield gaps across all subjects.'
          }
          searchElement={
            <BannerSearchBar
              value={searchInput}
              onChangeText={setSearchInput}
              placeholder="Search subjects or topics..."
            />
          }
          rightElement={
            <View style={styles.headerActions}>
              <BannerIconButton
                onPress={handleManualSync}
                disabled={refreshing}
                accessibilityRole="button"
                accessibilityLabel={refreshing ? 'Syncing' : 'Refresh syllabus'}
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color={n.colors.textSecondary} />
                ) : (
                  <Ionicons name="sync-outline" size={17} color={n.colors.textSecondary} />
                )}
              </BannerIconButton>
              <BannerIconButton
                onPress={() => navigation.navigate('Settings' as never)}
                accessibilityRole="button"
                accessibilityLabel="Open settings"
              >
                <Ionicons name="settings-sharp" size={17} color={n.colors.textSecondary} />
              </BannerIconButton>
            </View>
          }
        ></ScreenHeader>
        <LinearSurface compact style={styles.heroSurface}>
          <View style={styles.heroColumn}>
            <Text style={styles.heroEyebrow}>Overall Syllabus</Text>

            <View style={styles.heroMainRow}>
              <View style={styles.heroStatsRow}>
                <Text style={styles.heroStatsCount}>{seenTopics}</Text>
                <Text style={styles.heroStatsTotal}>/ {totalTopics > 0 ? totalTopics : '-'}</Text>
              </View>

              <View style={styles.heroProgressTrackMain}>
                <ReAnimated.View
                  style={[
                    styles.heroProgressFillMain,
                    progressAnimatedStyle,
                    overallPct >= 50 && { backgroundColor: n.colors.success },
                  ]}
                />
              </View>

              <Text style={[styles.heroPctMain, overallPct >= 50 && { color: n.colors.success }]}>
                {overallPct}%
              </Text>
            </View>

            {seenTopics > 0 ? (
              <View style={styles.heroBadgesRow}>
                {totalDue > 0 ? (
                  <View style={styles.badgeDue}>
                    <Text style={styles.labelDue}>Due {totalDue}</Text>
                  </View>
                ) : null}
                {totalHighYield > 0 ? (
                  <View style={styles.badgeHY}>
                    <Text style={styles.labelHY}>HY {totalHighYield}</Text>
                  </View>
                ) : null}
                {totalWithNotes > 0 ? (
                  <View style={styles.badgeNotes}>
                    <Text style={styles.labelNotes}>Notes {totalWithNotes}</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <Text style={styles.metaLabelEmpty}>Complete topics to unlock stats.</Text>
            )}
          </View>
        </LinearSurface>
        <View style={styles.controls}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sortContentContainer}
          >
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
          </ScrollView>
        </View>
        {pendingSuggestions.length > 0 ? (
          <View style={styles.suggestionSection}>
            <Text style={styles.suggestionTitle}>Lecture Topic Suggestions</Text>
            <Text style={styles.suggestionSubtitle}>
              Review unmatched lecture topics before adding them to the syllabus.
            </Text>
            {pendingSuggestions.slice(0, 6).map((suggestion) => {
              const busy = suggestionBusyId === suggestion.id;
              return (
                <LinearSurface key={suggestion.id} compact style={styles.suggestionCard}>
                  <View style={styles.suggestionHeader}>
                    <View
                      style={[
                        styles.suggestionDot,
                        { backgroundColor: suggestion.subjectColor || n.colors.accent },
                      ]}
                    />
                    <View style={styles.suggestionCopy}>
                      <Text style={styles.suggestionName}>{suggestion.name}</Text>
                      <Text style={styles.suggestionMeta}>
                        {suggestion.subjectName} · seen {suggestion.mentionCount} time
                        {suggestion.mentionCount > 1 ? 's' : ''}
                      </Text>
                    </View>
                  </View>
                  {suggestion.sourceSummary ? (
                    <Text style={styles.suggestionSummary} numberOfLines={2}>
                      {suggestion.sourceSummary}
                    </Text>
                  ) : null}
                  <View style={styles.suggestionActions}>
                    <TouchableOpacity
                      style={[styles.suggestionActionBtn, styles.suggestionRejectBtn]}
                      disabled={busy}
                      onPress={() => handleRejectSuggestion(suggestion)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.suggestionRejectText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.suggestionActionBtn, styles.suggestionApproveBtn]}
                      disabled={busy}
                      onPress={() => handleApproveSuggestion(suggestion)}
                      activeOpacity={0.8}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={n.colors.textPrimary} />
                      ) : (
                        <Text style={styles.suggestionApproveText}>Add to syllabus</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </LinearSurface>
              );
            })}
          </View>
        ) : null}
        {isInitialLoad ? (
          <SyllabusSkeleton />
        ) : (
          <FlatList
            data={filteredSubjects}
            keyExtractor={keyExtractor}
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.list}
            removeClippedSubviews={true}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={5}
            updateCellsBatchingPeriod={50}
            onRefresh={async () => {
              setRefreshing(true);
              await loadData();
              setRefreshing(false);
            }}
            refreshing={refreshing}
            ListHeaderComponent={listHeaderComponent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>
                  {searchLower.length >= 2
                    ? 'No subjects or topics matched'
                    : 'No subjects matched'}
                </Text>
                <Text style={styles.emptySub}>
                  Try a different subject name, short code, or topic keyword.
                </Text>
              </View>
            }
            renderItem={renderSubjectItem}
          />
        )}
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  header: {
    paddingHorizontal: n.spacing.md,
    paddingTop: n.spacing.sm,
    paddingBottom: n.spacing.md,
    gap: 8,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...n.typography.title,
    color: n.colors.textPrimary,
    fontSize: 20,
    lineHeight: 26,
  },
  subtitle: {
    ...n.typography.caption,
    color: n.colors.textMuted,
    lineHeight: 17,
    marginBottom: 2,
  },
  heroSurface: {
    marginTop: 4,
    paddingVertical: 6,
  },
  heroColumn: { gap: 8 },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: n.colors.textMuted,
  },

  heroMainRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroStatsRow: { flexDirection: 'row', alignItems: 'baseline', flexShrink: 0 },
  heroStatsCount: {
    fontSize: 32,
    fontWeight: '800',
    color: n.colors.textPrimary,
    letterSpacing: -0.5,
  },
  heroStatsTotal: { fontSize: 16, fontWeight: '700', color: n.colors.textMuted, marginLeft: 4 },

  heroProgressTrackMain: {
    flex: 1,
    height: 12,
    backgroundColor: n.colors.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  heroProgressFillMain: { height: '100%', borderRadius: 6, backgroundColor: n.colors.accent },

  heroPctMain: { fontSize: 24, fontWeight: '800', color: n.colors.accent, flexShrink: 0 },
  heroBadgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },

  badgeDue: {
    backgroundColor: 'rgba(255, 75, 75, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeHY: {
    backgroundColor: 'rgba(250, 173, 20, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeNotes: {
    backgroundColor: n.colors.primaryTintSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  labelDue: { fontSize: 10, color: n.colors.error, fontWeight: '800' },
  labelHY: { fontSize: 10, color: n.colors.warning, fontWeight: '800' },
  labelNotes: { fontSize: 10, color: n.colors.accent, fontWeight: '800' },
  metaLabelEmpty: {
    fontSize: 12,
    color: n.colors.textMuted,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  controls: {
    paddingHorizontal: n.spacing.md,
    paddingVertical: n.spacing.sm,
    gap: 8,
  },
  searchInput: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: n.colors.border,
    paddingHorizontal: 0,
    paddingVertical: 8,
    color: n.colors.textPrimary,
    fontSize: 14,
  },
  sortContentContainer: { flexDirection: 'row', gap: 6, paddingRight: n.spacing.md },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: n.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
  },
  sortChipActive: {
    backgroundColor: n.colors.primaryTintSoft,
    borderColor: n.colors.accent,
  },
  sortChipText: { color: n.colors.textMuted, fontSize: 12, fontWeight: '600' },
  sortChipTextActive: { color: n.colors.accent, fontSize: 12, fontWeight: '700' },
  list: { paddingHorizontal: n.spacing.md, paddingTop: n.spacing.sm, paddingBottom: 40, gap: 8 },
  suggestionSection: {
    paddingHorizontal: n.spacing.md,
    paddingBottom: 8,
    gap: 8,
  },
  suggestionTitle: {
    ...n.typography.label,
    color: n.colors.textPrimary,
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  suggestionSubtitle: {
    ...n.typography.caption,
    color: n.colors.textMuted,
    lineHeight: 17,
  },
  suggestionCard: {
    gap: 8,
  },
  suggestionHeader: { flexDirection: 'row', alignItems: 'center' },
  suggestionDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  suggestionCopy: { flex: 1 },
  suggestionName: { ...n.typography.label, color: n.colors.textPrimary, fontSize: 14 },
  suggestionMeta: { ...n.typography.caption, color: n.colors.textMuted, marginTop: 2 },
  suggestionSummary: { ...n.typography.caption, color: n.colors.textSecondary, lineHeight: 17 },
  suggestionActions: { flexDirection: 'row', gap: 10 },
  suggestionActionBtn: {
    flex: 1,
    borderRadius: 4,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  suggestionApproveBtn: {
    backgroundColor: n.colors.accent,
    borderColor: n.colors.accent,
  },
  suggestionRejectBtn: {
    backgroundColor: 'transparent',
    borderColor: n.colors.border,
  },
  suggestionApproveText: { color: n.colors.textPrimary, fontSize: 12, fontWeight: '800' },
  suggestionRejectText: { color: n.colors.textMuted, fontSize: 12, fontWeight: '600' },
  topicResultsSection: { marginBottom: 8, gap: 6 },
  topicResultsLabel: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  topicResultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  topicResultDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  topicResultCopy: { flex: 1, marginRight: 12 },
  topicResultName: {
    color: n.colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  topicResultSubject: { color: n.colors.textMuted, fontSize: 11 },
  topicResultAction: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  topicResultsDivider: {
    color: n.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 4,
  },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { color: n.colors.textSecondary, fontSize: 15, fontWeight: '600' },
  emptySub: { color: n.colors.textMuted, fontSize: 12, marginTop: 4 },
});
