import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  generateStudyPlan,
  type DailyPlan,
  type StudyPlanSummary,
  type PlanMode,
} from '../services/studyPlanner';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MenuStackParamList, TabParamList, HomeStackParamList } from '../navigation/types';
import { navigationRef } from '../navigation/navigationRef';
import { showToast } from '../components/Toast';
import { useAppStore } from '../store/useAppStore';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { linearTheme as n } from '../theme/linearTheme';
import { MS_PER_DAY } from '../constants/time';
import { Ionicons } from '@expo/vector-icons';
import { getCompletedTopicIdsBetween } from '../db/queries/sessions';
import { getTopicsDueForReview, getAllTopicsWithProgress } from '../db/queries/topics';
import { getDb } from '../db/database';
import type { TopicWithProgress, StudyResourceMode } from '../types';
import ScreenHeader from '../components/ScreenHeader';
import { DBMCI_SUBJECT_ORDER, DBMCI_WORKLOAD_OVERRIDES } from '../services/studyPlannerBuckets';
import { SUBJECTS_SEED } from '../constants/syllabus';
import { getCurrentLecturePosition } from '../services/lecturePositionService';
import LinearSurface from '../components/primitives/LinearSurface';

const SUBJECT_MAP = new Map(SUBJECTS_SEED.map((s) => [s.shortCode, s]));
const DBMCI_TOTAL_DAYS = 137;
const OVERDUE_FETCH_LIMIT = 2000;
const MISSED_PREVIEW_LIMIT = 8;

/**
 * Compact banner that shows where the student currently sits in their
 * DBMCI One or BTR live batch, based on the stored start date.
 */
function LiveClassBanner({
  resourceMode,
  dbmciStartDate,
  btrStartDate,
}: {
  resourceMode: StudyResourceMode;
  dbmciStartDate?: string | null;
  btrStartDate?: string | null;
}) {
  const startDate = resourceMode === 'btr' ? btrStartDate : dbmciStartDate;
  const batchLabel = resourceMode === 'btr' ? 'BTR' : 'DBMCI One';

  if (!startDate) {
    return (
      <LinearSurface compact style={liveStyles.banner}>
        <Text style={liveStyles.bannerTitle}>📺 {batchLabel} Live Batch</Text>
        <Text style={liveStyles.bannerHint}>
          Set your batch start date in Settings → Study Plan to unlock daily lecture tracking.
        </Text>
      </LinearSurface>
    );
  }

  const pos = getCurrentLecturePosition(startDate, resourceMode);
  if (!pos) return null;

  if (pos.isComplete) {
    return (
      <LinearSurface compact style={liveStyles.banner}>
        <Text style={liveStyles.bannerTitle}>🎓 {batchLabel} — Complete!</Text>
        <Text style={liveStyles.bannerHint}>
          All {pos.totalDays} teaching days covered. Focus on revision and mocks.
        </Text>
      </LinearSurface>
    );
  }

  const {
    currentBlock,
    nextBlock,
    dayNumber,
    totalDays,
    dayInSubject,
    daysLeftInSubject,
    progressPercent,
  } = pos;
  const progressBarWidth = `${progressPercent}%` as `${number}%`;

  return (
    <LinearSurface compact style={liveStyles.banner}>
      <View style={liveStyles.bannerRow}>
        <Text style={liveStyles.bannerTitle}>📺 {batchLabel}</Text>
        <Text style={liveStyles.bannerDay}>
          Day {dayNumber}/{totalDays}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={liveStyles.progressTrack}>
        <View style={[liveStyles.progressFill, { width: progressBarWidth }]} />
      </View>

      {/* Current subject */}
      <View style={liveStyles.subjectRow}>
        <View style={liveStyles.subjectBadge}>
          <Text style={liveStyles.subjectBadgeText}>NOW</Text>
        </View>
        <Text style={liveStyles.subjectName}>{currentBlock.subjectName}</Text>
        <Text style={liveStyles.subjectMeta}>
          Day {dayInSubject}/{currentBlock.days} · {daysLeftInSubject}d left
        </Text>
      </View>

      {/* Next subject */}
      {nextBlock && (
        <View style={liveStyles.subjectRow}>
          <View style={[liveStyles.subjectBadge, liveStyles.subjectBadgeNext]}>
            <Text style={liveStyles.subjectBadgeText}>NEXT</Text>
          </View>
          <Text style={[liveStyles.subjectName, { color: n.colors.textMuted }]}>
            {nextBlock.subjectName}
          </Text>
          <Text style={liveStyles.subjectMeta}>{nextBlock.days}d</Text>
        </View>
      )}
    </LinearSurface>
  );
}

function DBMCISyllabusCard({ allTopics }: { allTopics: TopicWithProgress[] }) {
  // Count total topics per subject (for sizing context)
  const subjectTopicCount = new Map<string, number>();
  for (const t of allTopics) {
    subjectTopicCount.set(t.subjectCode, (subjectTopicCount.get(t.subjectCode) ?? 0) + 1);
  }

  return (
    <LinearSurface style={dbmciStyles.card}>
      <Text style={dbmciStyles.title}>📋 DBMCI One — Study Sequence</Text>
      <Text style={dbmciStyles.subtitle}>
        Follow this order · {DBMCI_TOTAL_DAYS} lecture days · Topics auto-tracked from recordings
      </Text>
      {DBMCI_SUBJECT_ORDER.map((code, idx) => {
        const subject = SUBJECT_MAP.get(code);
        if (!subject) return null;
        const multiplier = DBMCI_WORKLOAD_OVERRIDES[code] ?? 1;
        const days = Math.round(multiplier * (DBMCI_TOTAL_DAYS / DBMCI_SUBJECT_ORDER.length));
        const topicCount = subjectTopicCount.get(code) ?? 0;

        return (
          <View key={code} style={dbmciStyles.row}>
            <Text style={[dbmciStyles.idx, { color: subject.colorHex }]}>{idx + 1}</Text>
            <View style={[dbmciStyles.dot, { backgroundColor: subject.colorHex }]} />
            <View style={dbmciStyles.rowContent}>
              <Text style={dbmciStyles.subjectName}>{subject.name}</Text>
              <Text style={dbmciStyles.topicCount}>{topicCount} topics</Text>
            </View>
            <View style={dbmciStyles.meta}>
              <Text style={dbmciStyles.days}>{days}d</Text>
            </View>
          </View>
        );
      })}
    </LinearSurface>
  );
}

function BTRProgressCard({
  allTopics,
  onRefresh,
}: {
  allTopics: TopicWithProgress[];
  onRefresh: () => void;
}) {
  const subjects = [...SUBJECTS_SEED].sort((a, b) => a.displayOrder - b.displayOrder);

  // Per-subject mastery pipeline counts
  type SubjectStats = {
    unseen: number;
    seen: number;
    reviewed: number;
    mastered: number;
    total: number;
  };
  const subjectStats = new Map<string, SubjectStats>();
  for (const s of subjects) {
    subjectStats.set(s.shortCode, { unseen: 0, seen: 0, reviewed: 0, mastered: 0, total: 0 });
  }
  for (const t of allTopics) {
    if ((t.childCount ?? 0) > 0) continue; // skip containers
    const stats = subjectStats.get(t.subjectCode);
    if (!stats) continue;
    stats.total++;
    if (t.progress.status === 'mastered') stats.mastered++;
    else if (t.progress.status === 'reviewed') stats.reviewed++;
    else if (t.progress.status === 'seen') stats.seen++;
    else stats.unseen++;
  }

  const overallSeen = [...subjectStats.values()].reduce(
    (s, v) => s + v.seen + v.reviewed + v.mastered,
    0,
  );
  const overallTotal = [...subjectStats.values()].reduce((s, v) => s + v.total, 0);
  const overallMastered = [...subjectStats.values()].reduce((s, v) => s + v.mastered, 0);

  const handleMarkDone = async (subjectId: number) => {
    try {
      const db = getDb();
      const now = Date.now();
      await db.runAsync(
        `UPDATE topic_progress
         SET status = 'seen', last_studied_at = ?
         WHERE topic_id IN (
           SELECT id FROM topics WHERE subject_id = ? AND parent_topic_id IS NOT NULL
         )
         AND status = 'unseen'`,
        [now, subjectId],
      );
      showToast(
        'Subject marked as done (watched). Now quiz these topics to make them stick.',
        'success',
      );
      onRefresh();
    } catch (err) {
      console.error('[BTR] Mark done failed:', err);
      showToast('Failed to mark subject', 'error');
    }
  };

  return (
    <LinearSurface style={dbmciStyles.card}>
      <Text style={dbmciStyles.title}>📊 BTR — Mastery Progress</Text>
      <Text style={dbmciStyles.subtitle}>
        {overallSeen}/{overallTotal} watched · {overallMastered} mastered · Watching ≠ Learning
      </Text>
      {/* Pipeline legend */}
      <View style={masteryStyles.legendRow}>
        <View style={masteryStyles.legendItem}>
          <View style={[masteryStyles.legendDot, { backgroundColor: n.colors.textMuted }]} />
          <Text style={masteryStyles.legendText}>Unseen</Text>
        </View>
        <View style={masteryStyles.legendItem}>
          <View style={[masteryStyles.legendDot, { backgroundColor: n.colors.accent }]} />
          <Text style={masteryStyles.legendText}>Watched</Text>
        </View>
        <View style={masteryStyles.legendItem}>
          <View style={[masteryStyles.legendDot, { backgroundColor: n.colors.warning }]} />
          <Text style={masteryStyles.legendText}>Reviewed</Text>
        </View>
        <View style={masteryStyles.legendItem}>
          <View style={[masteryStyles.legendDot, { backgroundColor: n.colors.success }]} />
          <Text style={masteryStyles.legendText}>Mastered</Text>
        </View>
      </View>
      {subjects.map((subject) => {
        const stats = subjectStats.get(subject.shortCode) ?? {
          unseen: 0,
          seen: 0,
          reviewed: 0,
          mastered: 0,
          total: 0,
        };
        const watchedOrBetter = stats.seen + stats.reviewed + stats.mastered;
        const masteredPct = stats.total > 0 ? stats.mastered / stats.total : 0;
        const watchedPct = stats.total > 0 ? watchedOrBetter / stats.total : 0;
        const reviewedPct = stats.total > 0 ? (stats.reviewed + stats.mastered) / stats.total : 0;
        const needsQuiz = stats.seen > 0; // watched but unquizzed

        return (
          <View
            key={subject.shortCode}
            style={[
              dbmciStyles.row,
              { flexDirection: 'column', alignItems: 'flex-start', paddingBottom: 10 },
            ]}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 4 }}
            >
              <View style={[dbmciStyles.dot, { backgroundColor: subject.colorHex }]} />
              <Text
                style={[
                  dbmciStyles.subjectName,
                  watchedOrBetter === 0 && { color: n.colors.textMuted },
                ]}
              >
                {subject.name}
              </Text>
              {stats.total > 0 && (
                <Text style={[dbmciStyles.days, { marginLeft: 'auto' }]}>
                  {stats.mastered}/{stats.total}
                </Text>
              )}
            </View>
            {/* Stacked pipeline bar */}
            {stats.total > 0 && (
              <View style={masteryStyles.barTrack}>
                <View
                  style={[
                    masteryStyles.barSeg,
                    {
                      width: `${masteredPct * 100}%` as `${number}%`,
                      backgroundColor: n.colors.success,
                    },
                  ]}
                />
                <View
                  style={[
                    masteryStyles.barSeg,
                    {
                      width: `${(reviewedPct - masteredPct) * 100}%` as `${number}%`,
                      backgroundColor: n.colors.warning,
                    },
                  ]}
                />
                <View
                  style={[
                    masteryStyles.barSeg,
                    {
                      width: `${(watchedPct - reviewedPct) * 100}%` as `${number}%`,
                      backgroundColor: n.colors.accent,
                    },
                  ]}
                />
              </View>
            )}
            {/* Action row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
              {needsQuiz && (
                <Text style={masteryStyles.quizNudge}>⚡ {stats.seen} need quiz/review</Text>
              )}
              {watchedOrBetter === 0 && (
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert(
                      'Mark as watched?',
                      'This marks all unseen leaf topics as "seen" for this subject. Watching ≠ mastery — Guru will then queue them for quiz and review.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Mark Watched', onPress: () => handleMarkDone(subject.id) },
                      ],
                    )
                  }
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={dbmciStyles.markBtn}>Mark Watched</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
    </LinearSurface>
  );
}

/** Mastery funnel summary — shown at top of plan for all modes. */
function MasteryFunnelCard({ summary }: { summary: StudyPlanSummary }) {
  const total =
    summary.unseenCount +
    summary.seenNeedingQuizCount +
    summary.reviewedCount +
    summary.masteredCount;
  if (total === 0) return null;

  const bar = (count: number, color: string) => {
    const pct =
      total > 0
        ? (`${Math.round((count / total) * 100)}%` as `${number}%`)
        : ('0%' as `${number}%`);
    return <View style={[masteryStyles.funnelSeg, { flex: count, backgroundColor: color }]} />;
  };

  return (
    <View style={masteryStyles.funnelCard}>
      <View style={masteryStyles.funnelBar}>
        {bar(summary.masteredCount, n.colors.success)}
        {bar(summary.reviewedCount, n.colors.warning)}
        {bar(summary.seenNeedingQuizCount, n.colors.accent)}
        {bar(summary.unseenCount, n.colors.border)}
      </View>
      <View style={masteryStyles.funnelLegendRow}>
        <Text style={[masteryStyles.funnelLegendItem, { color: n.colors.success }]}>
          {summary.masteredCount}
        </Text>
        <Text style={[masteryStyles.funnelLegendItem, { color: n.colors.warning }]}>
          {summary.reviewedCount}
        </Text>
        <Text style={[masteryStyles.funnelLegendItem, { color: n.colors.accent }]}>
          {summary.seenNeedingQuizCount}
        </Text>
        <Text style={[masteryStyles.funnelLegendItem, { color: n.colors.textMuted }]}>
          {summary.unseenCount}
        </Text>
      </View>
    </View>
  );
}

/** Red/amber banner when the review backlog is large enough to gate new topics. */
function BacklogBanner({ summary }: { summary: StudyPlanSummary }) {
  if (summary.overdueBacklogDays < 2) return null;
  const severe = summary.overdueBacklogDays > 4;
  return (
    <View style={masteryStyles.backlogBanner}>
      <Text
        style={[
          masteryStyles.backlogBannerText,
          { color: severe ? n.colors.error : n.colors.warning },
        ]}
      >
        {summary.overdueBacklogDays}d overdue reviews
        {severe ? ' — new topics throttled' : ' — clear before new topics'}
      </Text>
    </View>
  );
}

/** Focus card to repair weak fundamentals before chasing more new topics. */
function FoundationRepairQueueCard({
  summary,
  todayPlan,
  onStartFoundation,
  onStartQuizRecovery,
}: {
  summary: StudyPlanSummary;
  todayPlan?: DailyPlan;
  onStartFoundation: () => void;
  onStartQuizRecovery: () => void;
}) {
  const foundationToday =
    todayPlan?.items.filter(
      (item) =>
        item.type === 'deep_dive' ||
        item.reasonLabels.includes('Foundation gap') ||
        item.topic.progress.confidence <= 1,
    ) ?? [];

  const foundationMinutes = foundationToday.reduce((sum, item) => sum + item.duration, 0);
  const hasQueue = foundationToday.length > 0 || summary.seenNeedingQuizCount > 0;
  if (!hasQueue) return null;

  const tone = summary.newTopicsGated || summary.overdueBacklogDays > 4;

  return (
    <View style={masteryStyles.foundationActionRow}>
      <TouchableOpacity
        style={masteryStyles.foundationPrimaryBtn}
        onPress={onStartFoundation}
        activeOpacity={0.8}
      >
        <Text style={masteryStyles.foundationPrimaryBtnText}>
          Repair {foundationToday.length} weak
        </Text>
      </TouchableOpacity>
      {summary.seenNeedingQuizCount > 0 && (
        <TouchableOpacity
          style={masteryStyles.foundationGhostBtn}
          onPress={onStartQuizRecovery}
          activeOpacity={0.8}
        >
          <Text style={masteryStyles.foundationGhostBtnText}>
            Quiz {summary.seenNeedingQuizCount} watched
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Inline urgency cell for the summary strip. */
function UrgencyCell({ summary }: { summary: StudyPlanSummary }) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryValue}>{summary.daysRemaining}d</Text>
      <Text style={styles.summaryLabel}>{summary.targetExam}</Text>
    </View>
  );
}

/** Horizontal chip row for quickly picking today's available time. */
const CAPACITY_OPTIONS = [
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '1.5h', minutes: 90 },
  { label: '2h', minutes: 120 },
  { label: '3h', minutes: 180 },
  { label: '4h+', minutes: 240 },
];

type Nav = NativeStackNavigationProp<MenuStackParamList>;

const PLAN_MODES: Array<{ key: PlanMode; label: string }> = [
  { key: 'balanced', label: 'Balanced' },
  { key: 'high_yield', label: 'High Yield Only' },
  { key: 'exam_crunch', label: 'Exam Crunch' },
];

const RESOURCE_MODES: Array<{ key: StudyResourceMode; label: string }> = [
  { key: 'standard', label: 'Standard' },
  { key: 'btr', label: 'BTR' },
  { key: 'dbmci_live', label: 'DBMCI One' },
  { key: 'hybrid', label: 'Hybrid' },
];

export default function StudyPlanScreen() {
  const navigation = useNavigation<Nav>();
  const [plan, setPlan] = useState<DailyPlan[]>([]);
  const [summary, setSummary] = useState<StudyPlanSummary | null>(null);
  const [planMode, setPlanMode] = useState<PlanMode>('balanced');
  const [completedTodayIds, setCompletedTodayIds] = useState<Set<number>>(new Set());
  const [completedWeekIds, setCompletedWeekIds] = useState<Set<number>>(new Set());
  const [missedTopics, setMissedTopics] = useState<TopicWithProgress[]>([]);
  const [missedTotalCount, setMissedTotalCount] = useState(0);
  const [allTopics, setAllTopics] = useState<TopicWithProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Override daily capacity for just this screen session (not persisted). */
  const [capacityOverrideMinutes, setCapacityOverrideMinutes] = useState<number | null>(null);
  const { profile, setStudyResourceMode } = useAppStore();
  const resourceMode = profile?.studyResourceMode ?? 'hybrid';

  useFocusEffect(
    useCallback(() => {
      refreshPlan();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [planMode, resourceMode, capacityOverrideMinutes]),
  );

  async function refreshPlan() {
    setLoadError(null);
    setIsLoading(true);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfWeek = startOfToday - mondayOffset * MS_PER_DAY;
    const todayStr = now.toISOString().slice(0, 10);
    try {
      const [{ plan: p, summary: s }, overdueRaw, fetchedAllTopics] = await Promise.all([
        generateStudyPlan({
          mode: planMode,
          resourceMode,
          ...(capacityOverrideMinutes !== null
            ? { dailyGoalOverrideMinutes: capacityOverrideMinutes }
            : {}),
        }),
        getTopicsDueForReview(OVERDUE_FETCH_LIMIT),
        resourceMode === 'dbmci_live' || resourceMode === 'btr'
          ? getAllTopicsWithProgress()
          : Promise.resolve([]),
      ]);
      if (resourceMode === 'dbmci_live' || resourceMode === 'btr') setAllTopics(fetchedAllTopics);
      const overdue = overdueRaw.filter((topic) => {
        const dueDate = topic.progress.fsrsDue?.slice(0, 10);
        if (!dueDate || dueDate >= todayStr) return false;
        if (planMode === 'high_yield') return topic.inicetPriority >= 8;
        if (planMode === 'exam_crunch')
          return topic.inicetPriority >= 7 || topic.progress.confidence < 3;
        return true;
      });

      const [completedToday, completedWeek] = await Promise.all([
        getCompletedTopicIdsBetween(startOfToday),
        getCompletedTopicIdsBetween(startOfWeek),
      ]);
      setPlan(p);
      setSummary(s);
      setCompletedTodayIds(new Set(completedToday));
      setCompletedWeekIds(new Set(completedWeek));
      setMissedTotalCount(overdue.length);
      setMissedTopics(overdue.slice(0, MISSED_PREVIEW_LIMIT));
    } catch (err: any) {
      console.error('[StudyPlan] Failed to refresh plan:', err);
      setLoadError(err?.message ?? 'Unable to load study plan right now.');
    } finally {
      setIsLoading(false);
    }
  }

  function navigateToSession(params: HomeStackParamList['Session']) {
    try {
      // Prefer navigationRef (works across any navigator context)
      if (navigationRef.isReady()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (navigationRef as any).navigate('Tabs', {
          screen: 'HomeTab',
          params: { screen: 'Session', params },
        });
        return;
      }
      // Fallback: getParent() from MenuStack → Tab
      navigation.getParent<NavigationProp<TabParamList>>()?.navigate('HomeTab', {
        screen: 'Session',
        params,
      });
    } catch (err) {
      console.error('[StudyPlan] Navigation to Session failed:', err);
      showToast('Could not start session. Try again.', 'error');
    }
  }

  function handleStartPlannedTopic(day: DailyPlan, index: number) {
    const item = day.items[index];
    if (!item) return;
    navigateToSession({
      mood: item.type === 'deep_dive' ? 'energetic' : 'good',
      ...(item.type === 'deep_dive' ? { mode: 'deep' } : {}),
      focusTopicId: item.topic.id,
      preferredActionType: item.type,
      forcedMinutes: item.duration,
    });
  }

  function handleStartTopicSet(
    topics: TopicWithProgress[],
    actionType: 'study' | 'review' | 'deep_dive',
  ) {
    const ids = topics.slice(0, actionType === 'review' ? 4 : 3).map((topic) => topic.id);
    if (ids.length === 0) return;
    navigateToSession({
      mood: actionType === 'deep_dive' ? 'energetic' : 'good',
      ...(actionType === 'deep_dive' ? { mode: 'deep' } : {}),
      focusTopicIds: ids,
      preferredActionType: actionType,
    });
  }

  function renderPlanRow(day: DailyPlan, index: number, completedIds: Set<number>) {
    const item = day.items[index];
    if (!item) return null;
    const isCompleted = completedIds.has(item.topic.id);

    return (
      <TouchableOpacity
        key={`${day.date}-${item.id}-${index}`}
        activeOpacity={0.7}
        onPress={() => handleStartPlannedTopic(day, index)}
        accessibilityRole="button"
        accessibilityLabel={`${item.topic.name}, ${item.type === 'review' ? 'review' : item.type === 'deep_dive' ? 'deep dive' : 'study'}${isCompleted ? ', completed' : ''}`}
        style={[
          styles.topicRow,
          item.type === 'review' && styles.rowReview,
          item.type === 'deep_dive' && styles.rowDeep,
          isCompleted && styles.rowCompleted,
        ]}
      >
        <View style={[styles.dot, { backgroundColor: item.topic.subjectColor }]} />
        <View style={{ flex: 1 }}>
          <View style={styles.topicNameRow}>
            {item.type === 'review' && <Text style={styles.tagReview}>REV</Text>}
            {item.type === 'deep_dive' && <Text style={styles.tagDeep}>DEEP</Text>}
            {item.type === 'study' && <Text style={styles.tagNew}>NEW</Text>}
            {item.topic.inicetPriority >= 8 && <Text style={styles.tagHighYield}>HY</Text>}
            <Text
              style={[styles.topicName, isCompleted && styles.topicNameCompleted]}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {item.topic.name}
            </Text>
          </View>
          <Text style={styles.topicSub}>
            {item.topic.subjectName} · P{item.topic.inicetPriority} · {item.duration}m
          </Text>
        </View>
        {isCompleted ? (
          <Ionicons name="checkmark-circle" size={16} color={n.colors.success} />
        ) : (
          <Ionicons name="chevron-forward" size={14} color={n.colors.textMuted} />
        )}
      </TouchableOpacity>
    );
  }

  if (isLoading && !summary) {
    return (
      <SafeAreaView style={styles.safe} testID="plan-screen">
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={n.colors.accent} />
          <Text style={styles.loadingText}>Building your study plan...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError && !summary) {
    return (
      <SafeAreaView style={styles.safe} testID="plan-screen">
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <View style={styles.loadingWrap}>
          <Text style={styles.errorTitle}>Could not load study plan</Text>
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refreshPlan} activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!summary) return null;

  const todayPlan = plan[0];
  const weekPlans = plan.slice(1, 7);
  const requiredHoursDisplay = summary.hoursPerDayCapped
    ? `${summary.requiredHoursPerDay}h+`
    : `${summary.requiredHoursPerDay}h`;
  const foundationToday =
    todayPlan?.items
      .map((item) => item.topic)
      .filter(
        (topic) =>
          topic.progress.confidence <= 1 ||
          topic.progress.isNemesis ||
          (topic.progress.wrongCount ?? 0) >= 2,
      ) ?? [];
  const watchedNeedingQuizToday =
    todayPlan?.items
      .filter((item) => item.topic.progress.status === 'seen' && item.topic.progress.confidence < 1)
      .map((item) => item.topic) ?? [];

  return (
    <SafeAreaView style={styles.safe} testID="plan-screen">
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ScrollView contentContainerStyle={styles.content}>
        <ResponsiveContainer>
          <View style={styles.header}>
            <ScreenHeader
              title="Dynamic Plan"
              subtitle={`${summary.daysRemaining} days to INICET · ${summary.totalHoursLeft}h content left`}
              onBackPress={() => navigation.navigate('MenuHome')}
            />
            <View style={styles.modeRow}>
              {PLAN_MODES.map((mode) => (
                <TouchableOpacity
                  key={mode.key}
                  style={[styles.modeChip, planMode === mode.key && styles.modeChipActive]}
                  onPress={() => setPlanMode(mode.key)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Plan mode: ${mode.label}`}
                  accessibilityState={{ selected: planMode === mode.key }}
                >
                  <Text
                    style={[
                      styles.modeChipText,
                      planMode === mode.key && styles.modeChipTextActive,
                    ]}
                  >
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.resourceRow}>
              {RESOURCE_MODES.map((mode) => (
                <TouchableOpacity
                  key={mode.key}
                  style={[
                    styles.resourceChip,
                    resourceMode === mode.key && styles.resourceChipActive,
                  ]}
                  onPress={() => setStudyResourceMode(mode.key)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Resource: ${mode.label}`}
                  accessibilityState={{ selected: resourceMode === mode.key }}
                >
                  <Text
                    style={[
                      styles.resourceChipText,
                      resourceMode === mode.key && styles.resourceChipTextActive,
                    ]}
                  >
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Dashboard card ── */}
          <LinearSurface compact style={styles.dashboardCard}>
            <View style={styles.summaryStrip}>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryValue}>{requiredHoursDisplay}</Text>
                <Text style={styles.summaryLabel}>per day</Text>
              </View>
              <View style={styles.summaryDivider} />
              <UrgencyCell summary={summary} />
              <View style={styles.summaryDivider} />
              <View style={styles.summaryCell}>
                <Text style={styles.summaryValue}>{summary.bufferDays}d</Text>
                <Text style={styles.summaryLabel}>buffer</Text>
              </View>
            </View>
            {!summary.feasible && <Text style={styles.warningHint}>{summary.message}</Text>}
            <MasteryFunnelCard summary={summary} />
          </LinearSurface>

          {/* ── Controls ── */}
          <View style={styles.controlsRow}>
            <View style={masteryStyles.capacityChipRow}>
              {CAPACITY_OPTIONS.map((opt) => {
                const active = capacityOverrideMinutes === opt.minutes;
                return (
                  <TouchableOpacity
                    key={opt.minutes}
                    style={[masteryStyles.capacityChip, active && masteryStyles.capacityChipActive]}
                    onPress={() => setCapacityOverrideMinutes(active ? null : opt.minutes)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        masteryStyles.capacityChipText,
                        active && masteryStyles.capacityChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <FoundationRepairQueueCard
              summary={summary}
              todayPlan={todayPlan}
              onStartFoundation={() =>
                handleStartTopicSet(
                  foundationToday.length > 0 ? foundationToday : missedTopics,
                  'deep_dive',
                )
              }
              onStartQuizRecovery={() =>
                handleStartTopicSet(
                  watchedNeedingQuizToday.length > 0 ? watchedNeedingQuizToday : missedTopics,
                  'review',
                )
              }
            />
          </View>

          <BacklogBanner summary={summary} />

          {(resourceMode === 'dbmci_live' || resourceMode === 'hybrid') && (
            <LiveClassBanner
              resourceMode={resourceMode}
              dbmciStartDate={profile?.dbmciClassStartDate}
              btrStartDate={profile?.btrStartDate}
            />
          )}
          {resourceMode === 'btr' && (
            <LiveClassBanner
              resourceMode={resourceMode}
              dbmciStartDate={profile?.dbmciClassStartDate}
              btrStartDate={profile?.btrStartDate}
            />
          )}
          {resourceMode === 'dbmci_live' && allTopics.length > 0 && (
            <DBMCISyllabusCard allTopics={allTopics} />
          )}
          {resourceMode === 'btr' && allTopics.length > 0 && (
            <BTRProgressCard allTopics={allTopics} onRefresh={refreshPlan} />
          )}

          {/* ── Today ── */}
          <Text style={styles.sectionTitle}>Today</Text>
          {todayPlan && todayPlan.items.length > 0 ? (
            <View style={styles.dayBlock}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayLabel}>{todayPlan.dayLabel}</Text>
                <Text style={styles.dayMeta}>
                  {Math.round(todayPlan.totalMinutes / 60)}h · {todayPlan.items.length} tasks
                </Text>
              </View>
              {todayPlan.items.map((_, idx) => renderPlanRow(todayPlan, idx, completedTodayIds))}
              {todayPlan.isRestDay && (
                <View style={styles.restBox}>
                  <Text style={styles.restText}>Rest Day / Catch Up</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptySection}>
              <Text style={styles.emptySectionTitle}>Nothing queued</Text>
              <Text style={styles.emptySectionSub}>
                Switch plan modes or open syllabus to generate targets.
              </Text>
            </View>
          )}

          {/* ── This Week ── */}
          <Text style={styles.sectionTitle}>This Week</Text>
          {weekPlans.map((day, i) => (
            <View key={i} style={styles.dayBlock}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayLabel}>{day.dayLabel}</Text>
                <Text style={styles.dayMeta}>
                  {Math.round(day.totalMinutes / 60)}h · {day.items.length} tasks
                </Text>
              </View>
              {day.items.map((_, idx) => renderPlanRow(day, idx, completedWeekIds))}
              {day.isRestDay && (
                <View style={styles.restBox}>
                  <Text style={styles.restText}>Rest Day / Catch Up</Text>
                </View>
              )}
            </View>
          ))}

          {/* ── Overdue ── */}
          <Text style={styles.sectionTitle}>Overdue</Text>
          {missedTopics.length > 0 ? (
            <View style={styles.dayBlock}>
              <View style={styles.dayHeader}>
                <Text style={[styles.dayLabel, { color: n.colors.warning }]}>
                  {missedTotalCount} review{missedTotalCount === 1 ? '' : 's'} due
                </Text>
              </View>
              {missedTotalCount > missedTopics.length && (
                <Text style={styles.previewMeta}>Showing first {missedTopics.length}</Text>
              )}
              {missedTopics.map((topic) => (
                <TouchableOpacity
                  key={`missed-${topic.id}`}
                  style={[styles.topicRow, styles.rowReview]}
                  activeOpacity={0.7}
                  onPress={() => handleStartTopicSet([topic], 'review')}
                >
                  <View style={[styles.dot, { backgroundColor: topic.subjectColor }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.topicName} numberOfLines={2} ellipsizeMode="tail">
                      {topic.name}
                    </Text>
                    <Text style={styles.topicSub}>
                      {topic.subjectName} · {topic.progress.fsrsDue?.slice(5, 10) ?? 'overdue'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={n.colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.emptySection}>
              <Text style={styles.emptySectionTitle}>All clear</Text>
              <Text style={styles.emptySectionSub}>No overdue reviews right now.</Text>
            </View>
          )}
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  content: { paddingHorizontal: n.spacing.md, paddingTop: n.spacing.sm, paddingBottom: 40 },
  header: { marginBottom: n.spacing.sm },
  title: { ...n.typography.display, color: n.colors.textPrimary, marginBottom: n.spacing.xs },
  subtitle: { ...n.typography.bodySmall, color: n.colors.textSecondary },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: n.spacing.sm },
  resourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  modeChip: {
    backgroundColor: 'transparent',
    borderRadius: n.radius.full,
    borderWidth: 1,
    borderColor: n.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  modeChipActive: {
    backgroundColor: n.colors.primaryTintSoft,
    borderColor: `${n.colors.accent}66`,
  },
  modeChipText: { ...n.typography.meta, color: n.colors.textMuted, fontWeight: '700' },
  modeChipTextActive: { color: n.colors.textPrimary },
  resourceChip: {
    backgroundColor: 'transparent',
    borderRadius: n.radius.full,
    borderWidth: 1,
    borderColor: n.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  resourceChipActive: {
    backgroundColor: n.colors.primaryTintSoft,
    borderColor: n.colors.borderLight,
  },
  resourceChipText: { ...n.typography.meta, color: n.colors.textMuted, fontWeight: '700' },
  resourceChipTextActive: { color: n.colors.textPrimary },

  // ── Dashboard card ──
  dashboardCard: {
    marginBottom: n.spacing.md,
  },
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: n.spacing.sm,
  },
  summaryCell: { flex: 1, alignItems: 'center' },
  summaryValue: { color: n.colors.textPrimary, fontSize: 18, fontWeight: '900' },
  summaryLabel: { ...n.typography.meta, color: n.colors.textMuted, fontSize: 10, marginTop: 2 },
  summaryDivider: { width: 1, height: 24, backgroundColor: n.colors.border },
  warningHint: {
    ...n.typography.caption,
    color: n.colors.warning,
    marginBottom: n.spacing.sm,
    fontStyle: 'italic',
  },

  // ── Controls row ──
  controlsRow: {
    marginBottom: n.spacing.md,
    gap: n.spacing.sm,
  },

  // ── Section labels ──
  sectionTitle: {
    ...n.typography.label,
    color: n.colors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: n.spacing.sm,
    marginTop: n.spacing.sm,
  },

  dayBlock: { marginBottom: n.spacing.lg },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: n.spacing.sm,
    paddingBottom: n.spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: n.colors.border,
  },
  dayLabel: { ...n.typography.label, color: n.colors.textPrimary, fontSize: 14 },
  dayMeta: { ...n.typography.meta, color: n.colors.textMuted },

  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: n.colors.border,
  },
  rowReview: { borderLeftWidth: 2, borderLeftColor: n.colors.success, paddingLeft: 10 },
  rowDeep: { borderLeftWidth: 2, borderLeftColor: n.colors.error, paddingLeft: 10 },
  rowCompleted: { opacity: 0.4 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 10 },
  topicNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  topicName: { ...n.typography.bodySmall, color: n.colors.textPrimary, fontWeight: '500', flex: 1 },
  topicNameCompleted: { textDecorationLine: 'line-through', color: n.colors.textMuted },
  topicSub: { ...n.typography.meta, color: n.colors.textMuted, fontSize: 11, marginTop: 2 },
  tagReview: {
    ...n.typography.meta,
    fontSize: 10,
    color: n.colors.success,
    fontWeight: '800',
    backgroundColor: n.colors.successSurface,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  tagDeep: {
    ...n.typography.meta,
    fontSize: 10,
    color: n.colors.error,
    fontWeight: '800',
    backgroundColor: n.colors.errorSurface,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  tagNew: {
    ...n.typography.meta,
    fontSize: 10,
    color: n.colors.accent,
    fontWeight: '800',
    backgroundColor: n.colors.primaryTintSoft,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  tagHighYield: {
    ...n.typography.meta,
    fontSize: 10,
    color: n.colors.warning,
    fontWeight: '800',
    backgroundColor: 'rgba(217, 119, 6, 0.1)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  emptySection: {
    paddingVertical: n.spacing.md,
    paddingLeft: 14,
    borderLeftWidth: 2,
    borderLeftColor: n.colors.border,
    marginBottom: n.spacing.md,
  },
  emptySectionTitle: {
    ...n.typography.bodySmall,
    color: n.colors.textSecondary,
    fontWeight: '600',
  },
  emptySectionSub: { ...n.typography.caption, color: n.colors.textMuted, marginTop: 4 },
  previewMeta: {
    ...n.typography.meta,
    color: n.colors.textMuted,
    marginBottom: 6,
  },

  restBox: {
    padding: n.spacing.sm,
    alignItems: 'center',
    backgroundColor: n.colors.successSurface,
    borderRadius: n.radius.sm,
    marginTop: n.spacing.xs,
  },
  restText: { ...n.typography.caption, color: n.colors.success, fontWeight: '600' },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: n.spacing.lg,
  },
  loadingText: {
    ...n.typography.bodySmall,
    color: n.colors.textSecondary,
    marginTop: 12,
  },
  errorTitle: {
    ...n.typography.sectionTitle,
    color: n.colors.textPrimary,
    marginBottom: n.spacing.sm,
    textAlign: 'center',
  },
  errorText: {
    ...n.typography.bodySmall,
    color: n.colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: n.spacing.md,
  },
  retryButton: {
    backgroundColor: n.colors.accent,
    borderRadius: n.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: n.spacing.sm,
  },
  retryButtonText: {
    ...n.typography.button,
    color: n.colors.textPrimary,
  },
});

const dbmciStyles = StyleSheet.create({
  card: {
    marginBottom: n.spacing.sm,
  },
  title: {
    ...n.typography.sectionTitle,
    color: n.colors.textPrimary,
    fontSize: 16,
    marginBottom: 2,
  },
  subtitle: {
    ...n.typography.meta,
    color: n.colors.textMuted,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: n.spacing.xs,
    borderRadius: n.radius.sm,
    marginBottom: 2,
  },
  idx: {
    ...n.typography.meta,
    fontWeight: '900',
    width: 20,
    textAlign: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: n.spacing.sm,
  },
  rowContent: {
    flex: 1,
  },
  subjectName: {
    ...n.typography.label,
    color: n.colors.textPrimary,
  },
  topicCount: {
    ...n.typography.meta,
    color: n.colors.textMuted,
    marginTop: 1,
  },
  meta: {
    alignItems: 'flex-end',
    marginLeft: n.spacing.sm,
  },
  days: {
    ...n.typography.meta,
    color: n.colors.textMuted,
    fontWeight: '700',
  },
  barBg: {
    height: 3,
    backgroundColor: n.colors.border,
    borderRadius: 2,
    marginTop: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 3,
    borderRadius: 2,
  },
  pct: {
    ...n.typography.meta,
    color: n.colors.accent,
    fontWeight: '800',
  },
  markBtn: {
    ...n.typography.meta,
    color: n.colors.accent,
    fontWeight: '700',
    paddingHorizontal: n.spacing.sm,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: `${n.colors.accent}44`,
    overflow: 'hidden',
  },
});

const liveStyles = StyleSheet.create({
  banner: {
    marginBottom: n.spacing.sm,
  },
  bannerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: n.spacing.sm,
  },
  bannerTitle: {
    ...n.typography.label,
    color: n.colors.textPrimary,
    fontSize: 14,
  },
  bannerDay: {
    ...n.typography.label,
    color: n.colors.accent,
    fontSize: 12,
  },
  bannerHint: {
    ...n.typography.caption,
    color: n.colors.textMuted,
    marginTop: n.spacing.xs,
  },
  progressTrack: {
    height: 4,
    backgroundColor: n.colors.border,
    borderRadius: 2,
    marginBottom: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: n.colors.accent,
    borderRadius: 2,
  },
  subjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: n.spacing.xs,
    gap: n.spacing.sm,
  },
  subjectBadge: {
    backgroundColor: n.colors.accent,
    borderRadius: n.spacing.xs,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  subjectBadgeNext: {
    backgroundColor: n.colors.border,
  },
  subjectBadgeText: {
    ...n.typography.meta,
    color: n.colors.textPrimary,
    fontSize: 9,
    fontWeight: '900',
  },
  subjectName: {
    ...n.typography.label,
    color: n.colors.textPrimary,
    flex: 1,
  },
  subjectMeta: {
    ...n.typography.meta,
    color: n.colors.textMuted,
  },
});

const masteryStyles = StyleSheet.create({
  // BTRProgressCard enhancements
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: n.spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { ...n.typography.meta, color: n.colors.textMuted, fontSize: 10 },
  barTrack: {
    height: 4,
    backgroundColor: n.colors.border,
    borderRadius: 2,
    flexDirection: 'row',
    overflow: 'hidden',
    width: '100%',
  },
  barSeg: { height: 4 },
  quizNudge: { ...n.typography.meta, color: n.colors.accent, fontWeight: '700', fontSize: 10 },

  // MasteryFunnelCard — flat bar inside dashboard
  funnelCard: {},
  funnelBar: {
    height: 6,
    borderRadius: 3,
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: n.colors.border,
    marginBottom: 6,
  },
  funnelSeg: { height: 6 },
  funnelLegendRow: { flexDirection: 'row', gap: 14 },
  funnelLegendItem: { ...n.typography.meta, fontSize: 11, fontWeight: '700' },

  // BacklogBanner — inline text
  backlogBanner: {
    marginBottom: n.spacing.sm,
  },
  backlogBannerText: {
    ...n.typography.caption,
    color: n.colors.textSecondary,
    fontStyle: 'italic',
  },
  foundationActionRow: {
    flexDirection: 'row',
    gap: 6,
  },
  foundationPrimaryBtn: {
    backgroundColor: n.colors.accent,
    borderRadius: n.radius.sm,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  foundationPrimaryBtnText: {
    ...n.typography.meta,
    color: n.colors.textPrimary,
    fontWeight: '800',
    fontSize: 11,
  },
  foundationGhostBtn: {
    borderRadius: n.radius.sm,
    borderWidth: 1,
    borderColor: n.colors.border,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  foundationGhostBtnText: {
    ...n.typography.meta,
    color: n.colors.accent,
    fontWeight: '700',
    fontSize: 11,
  },
  capacityChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  capacityChip: {
    borderRadius: n.radius.full,
    borderWidth: 1,
    borderColor: n.colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  capacityChipActive: {
    backgroundColor: n.colors.primaryTintSoft,
    borderColor: `${n.colors.accent}88`,
  },
  capacityChipText: { ...n.typography.meta, color: n.colors.textMuted, fontSize: 11 },
  capacityChipTextActive: { color: n.colors.textPrimary },
});

// urgencyStyles removed — UrgencyCell is now inline in the summary strip
