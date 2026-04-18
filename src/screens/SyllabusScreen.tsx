import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  InteractionManager,
  ScrollView,
} from 'react-native';
import { showInfo } from '../components/dialogService';
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
import { showDialog } from '../components/dialogService';
import ScreenMotion from '../motion/ScreenMotion';
import StaggeredEntrance from '../motion/StaggeredEntrance';
import { showToast } from '../components/Toast';
import type { Subject } from '../types';
import { ResponsiveContainer } from '../hooks/useResponsive';
import * as Haptics from 'expo-haptics';
import BannerIconButton from '../components/BannerIconButton';
import BannerSearchBar from '../components/BannerSearchBar';
import { linearTheme as n } from '../theme/linearTheme';
import { errorAlpha, warningAlpha } from '../theme/colorUtils';
import ScreenHeader from '../components/ScreenHeader';
import LinearSurface from '../components/primitives/LinearSurface';
import LinearBadge from '../components/primitives/LinearBadge';
import LinearText from '../components/primitives/LinearText';
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
const SYLLABUS_SCREEN_MOTION_TRIGGER = 'first-mount' as const;
// The screen chrome above the list already fills most of the first viewport.
// Animate only the first few visible cards; everything else renders statically.
const FIRST_VISIBLE_SUBJECT_CARD_LIMIT = 3;

/** Premium skeleton matching the split SubjectCard layout */
function SyllabusSkeleton() {
  return (
    <View style={skeletonStyles.container}>
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
    paddingHorizontal: n.spacing.md,
    paddingTop: 8,
  },
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
export default function SyllabusScreen() {
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
  const [entryComplete, setEntryComplete] = useState(false);
  const isFocusedRef = useRef(isFocused);
  const entryCompleteRef = useRef(entryComplete);
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

  useEffect(() => {
    entryCompleteRef.current = entryComplete;
  }, [entryComplete]);

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
      const timer = setTimeout(() => {
        void loadData();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isFocused, isInitialLoad, sortMode, loadData, unlockNavigation]);

  useEffect(() => {
    return () => {
      if (navUnlockTimerRef.current) {
        clearTimeout(navUnlockTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onProgressOrLecture = () => {
      const timer = setTimeout(() => {
        void loadData();
      }, 150);
      return timer;
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
    const result = await showDialog({
      title: 'Re-check syllabus topics?',
      message:
        'This will safely sync new syllabus and vault topics without deleting your progress.',
      variant: 'focus',
      actions: [
        { id: 'cancel', label: 'Cancel', variant: 'secondary' },
        { id: 'sync', label: 'Sync', variant: 'primary' },
      ],
      allowDismiss: true,
    });

    if (result !== 'sync') return;

    setRefreshing(true);
    try {
      await syncVaultSeedTopics();
      await loadData();
      showToast({
        title: 'Synced',
        message: 'Guru successfully re-checked your topics. 😏',
        variant: 'success',
      });
    } catch (e: any) {
      showToast({
        title: 'Sync failed',
        message: e?.message ?? 'Unknown error',
        variant: 'error',
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function handleApproveSuggestion(suggestion: TopicSuggestion) {
    setSuggestionBusyId(suggestion.id);
    try {
      const topicId = await approveTopicSuggestion(suggestion.id);
      await loadData();
      showToast({
        title: 'Topic approved',
        message: topicId
          ? `"${suggestion.name}" is now part of ${suggestion.subjectName}.`
          : `"${suggestion.name}" was already available.`,
        variant: 'success',
      });
    } catch (e: any) {
      showToast({
        title: 'Approval failed',
        message: e?.message ?? 'Unknown error',
        variant: 'error',
      });
    } finally {
      setSuggestionBusyId(null);
    }
  }

  async function handleRejectSuggestion(suggestion: TopicSuggestion) {
    setSuggestionBusyId(suggestion.id);
    try {
      await rejectTopicSuggestion(suggestion.id);
      await loadData();
      showToast({
        title: 'Suggestion rejected',
        message: `"${suggestion.name}" will stay out of the syllabus.`,
        variant: 'info',
      });
    } catch (e: any) {
      showToast({
        title: 'Reject failed',
        message: e?.message ?? 'Unknown error',
        variant: 'error',
      });
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
          `${subjectMap.get(c.subject_id) || `ID ${c.subject_id} (NOT IN SUBJECTS)`}: ${
            c.c
          } topics`,
      )
      .join('\n');

    const diag =
      `Total topics: ${count}\n\n` +
      `--- Topics Per Subject ---\n${summary}\n\n` +
      `--- Subjects Map ---\n${subjects.map((s: any) => `${s.id}: ${s.name}`).join('\n')}`;

    showInfo('Database State', diag);
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

  const renderSubjectItem = useCallback(({ item, index }: { item: Subject; index: number }) => {
    const card = (
      <SubjectCard
        subject={item}
        coverage={coverageRef.current.get(item.id) ?? EMPTY_COVERAGE}
        metrics={subjectMetricsRef.current.get(item.id)}
        matchingTopicsCount={searchMatchCountsRef.current.get(item.id)}
        onPress={() => handleSubjectPressRef.current(item)}
      />
    );

    if (index >= FIRST_VISIBLE_SUBJECT_CARD_LIMIT) {
      return card;
    }

    return (
      <StaggeredEntrance index={index + 3} disabled={!entryCompleteRef.current}>
        {card}
      </StaggeredEntrance>
    );
  }, []);

  const listHeaderComponent = useMemo(() => {
    if (searchLower.length < 2 || topicResults.length === 0) return null;
    return (
      <View style={styles.topicResultsSection}>
        <LinearText variant="label" tone="muted" style={styles.topicResultsLabel}>
          Direct Topic Matches
        </LinearText>
        {topicResults.map((topic) => (
          <TouchableOpacity
            key={`topic-${topic.id}`}
            activeOpacity={0.8}
            onPress={() => handleTopicResultPress(topic)}
          >
            <LinearSurface compact padded={false} style={styles.topicResultCard}>
              <View style={[styles.topicResultDot, { backgroundColor: topic.color_hex }]} />
              <View style={styles.topicResultCopy}>
                <LinearText variant="label" style={styles.topicResultName} truncate>
                  {topic.name}
                </LinearText>
                <LinearText variant="caption" tone="muted" style={styles.topicResultSubject}>
                  {topic.subject_name}
                </LinearText>
              </View>
              <LinearText variant="caption" tone="muted" style={styles.topicResultAction}>
                Open
              </LinearText>
            </LinearSurface>
          </TouchableOpacity>
        ))}
        <LinearText variant="label" tone="muted" style={styles.topicResultsDivider}>
          Matching Subjects
        </LinearText>
      </View>
    );
  }, [searchLower.length, topicResults, handleTopicResultPress]);

  // Animated progress
  const progressWidth = useSharedValue(0);
  const prevPct = useRef(0);

  useEffect(() => {
    if (!entryComplete) {
      return;
    }
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
  }, [overallPct, progressWidth, entryComplete]);

  const progressAnimatedStyle = useAnimatedStyle(() => {
    return {
      width: `${Math.min(100, Math.max(0, progressWidth.value))}%`,
    };
  });

  return (
    <SafeAreaView style={styles.safe} testID="syllabus-screen">
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ScreenMotion
        style={styles.motionShell}
        trigger={SYLLABUS_SCREEN_MOTION_TRIGGER}
        isEntryComplete={() => setEntryComplete(true)}
      >
        <ResponsiveContainer style={styles.content}>
          <StaggeredEntrance index={0} disabled={!entryComplete}>
            <ScreenHeader
              title="Syllabus"
              searchElement={
                <BannerSearchBar
                  value={searchInput}
                  onChangeText={setSearchInput}
                  placeholder="Search subjects or topics..."
                />
              }
              rightElement={
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
              }
              showSettings
            ></ScreenHeader>
          </StaggeredEntrance>

          <StaggeredEntrance index={1} disabled={!entryComplete}>
            <LinearSurface compact style={styles.heroSurface}>
              <View style={styles.heroColumn}>
                <LinearText variant="meta" tone="muted" style={styles.heroEyebrow}>
                  Overall Syllabus
                </LinearText>

                <View style={styles.heroMainRow}>
                  <View style={styles.heroStatsRow}>
                    <LinearText variant="display" style={styles.heroStatsCount}>
                      {seenTopics}
                    </LinearText>
                    <LinearText variant="body" tone="muted" style={styles.heroStatsTotal}>
                      / {totalTopics > 0 ? totalTopics : '-'}
                    </LinearText>
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

                  <LinearText
                    variant="title"
                    style={[styles.heroPctMain, overallPct >= 50 && { color: n.colors.success }]}
                  >
                    {overallPct}%
                  </LinearText>
                </View>

                {seenTopics > 0 ? (
                  <View style={styles.heroBadgesRow}>
                    {totalDue > 0 ? (
                      <View style={styles.badgeDue}>
                        <LinearText variant="chip" style={styles.labelDue}>
                          Due {totalDue}
                        </LinearText>
                      </View>
                    ) : null}
                    {totalHighYield > 0 ? (
                      <View style={styles.badgeHY}>
                        <LinearText variant="chip" style={styles.labelHY}>
                          HY {totalHighYield}
                        </LinearText>
                      </View>
                    ) : null}
                    {totalWithNotes > 0 ? (
                      <View style={styles.badgeNotes}>
                        <LinearText variant="chip" style={styles.labelNotes}>
                          Notes {totalWithNotes}
                        </LinearText>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <LinearText variant="caption" tone="muted" style={styles.metaLabelEmpty}>
                    Complete topics to unlock stats.
                  </LinearText>
                )}
              </View>
            </LinearSurface>
          </StaggeredEntrance>

          <StaggeredEntrance index={2} disabled={!entryComplete}>
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
                    <LinearText
                      variant="caption"
                      style={[
                        styles.sortChipText,
                        sortMode === option.key && styles.sortChipTextActive,
                      ]}
                    >
                      {option.label}
                    </LinearText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </StaggeredEntrance>

          {pendingSuggestions.length > 0 ? (
            <View style={styles.suggestionSection}>
              <LinearText variant="label" style={styles.suggestionTitle}>
                Lecture Topic Suggestions
              </LinearText>
              <LinearText variant="caption" tone="muted" style={styles.suggestionSubtitle}>
                Review unmatched lecture topics before adding them to the syllabus.
              </LinearText>
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
                        <LinearText variant="label" style={styles.suggestionName}>
                          {suggestion.name}
                        </LinearText>
                        <LinearText variant="caption" tone="muted" style={styles.suggestionMeta}>
                          {suggestion.subjectName} · seen {suggestion.mentionCount} time
                          {suggestion.mentionCount > 1 ? 's' : ''}
                        </LinearText>
                      </View>
                    </View>
                    {suggestion.sourceSummary ? (
                      <LinearText
                        variant="caption"
                        tone="secondary"
                        style={styles.suggestionSummary}
                        numberOfLines={2}
                      >
                        {suggestion.sourceSummary}
                      </LinearText>
                    ) : null}
                    <View style={styles.suggestionActions}>
                      <TouchableOpacity
                        style={[styles.suggestionActionBtn, styles.suggestionRejectBtn]}
                        disabled={busy}
                        onPress={() => handleRejectSuggestion(suggestion)}
                        activeOpacity={0.8}
                      >
                        <LinearText variant="caption" style={styles.suggestionRejectText}>
                          Reject
                        </LinearText>
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
                          <LinearText variant="caption" style={styles.suggestionApproveText}>
                            Add to syllabus
                          </LinearText>
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
              extraData={entryComplete}
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
                  <LinearText variant="body" tone="secondary" style={styles.emptyTitle}>
                    {searchLower.length >= 2
                      ? 'No subjects or topics matched'
                      : 'No subjects matched'}
                  </LinearText>
                  <LinearText variant="caption" tone="muted" style={styles.emptySub}>
                    Try a different subject name, short code, or topic keyword.
                  </LinearText>
                </View>
              }
              renderItem={renderSubjectItem}
            />
          )}
        </ResponsiveContainer>
      </ScreenMotion>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  motionShell: { flex: 1 },
  content: { flex: 1 },
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
  headerTitle: { fontSize: 24, fontWeight: '800' },
  heroSurface: {
    marginTop: 4,
    paddingVertical: 6,
  },
  heroColumn: { gap: 8 },
  heroEyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  heroMainRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroStatsRow: { flexDirection: 'row', alignItems: 'baseline', flexShrink: 0 },
  heroStatsCount: {
    letterSpacing: -0.5,
  },
  heroStatsTotal: { marginLeft: 4 },

  heroProgressTrackMain: {
    flex: 1,
    height: 12,
    backgroundColor: n.colors.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  heroProgressFillMain: { height: '100%', borderRadius: 6, backgroundColor: n.colors.accent },

  heroPctMain: { flexShrink: 0 },
  heroBadgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },

  badgeDue: {
    backgroundColor: errorAlpha['15'],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeHY: {
    backgroundColor: warningAlpha['15'],
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
  labelDue: { color: n.colors.error },
  labelHY: { color: n.colors.warning },
  labelNotes: { color: n.colors.accent },
  metaLabelEmpty: {
    fontStyle: 'italic',
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
  sortChipText: {},
  sortChipTextActive: { color: n.colors.accent },
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
    marginBottom: 2,
  },
  topicResultSubject: {},
  topicResultAction: {},
  topicResultsDivider: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 4,
  },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { marginBottom: 4 },
  emptySub: { textAlign: 'center' },
});
