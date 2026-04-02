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
      <View style={liveStyles.banner}>
        <Text style={liveStyles.bannerTitle}>📺 {batchLabel} Live Batch</Text>
        <Text style={liveStyles.bannerHint}>
          Set your batch start date in Settings → Study Plan to unlock daily lecture tracking.
        </Text>
      </View>
    );
  }

  const pos = getCurrentLecturePosition(startDate, resourceMode);
  if (!pos) return null;

  if (pos.isComplete) {
    return (
      <View style={liveStyles.banner}>
        <Text style={liveStyles.bannerTitle}>🎓 {batchLabel} — Complete!</Text>
        <Text style={liveStyles.bannerHint}>
          All {pos.totalDays} teaching days covered. Focus on revision and mocks.
        </Text>
      </View>
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
    <View style={liveStyles.banner}>
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
          <Text style={[liveStyles.subjectName, { color: '#999' }]}>{nextBlock.subjectName}</Text>
          <Text style={liveStyles.subjectMeta}>{nextBlock.days}d</Text>
        </View>
      )}
    </View>
  );
}

function DBMCISyllabusCard({ allTopics }: { allTopics: TopicWithProgress[] }) {
  // Count total topics per subject (for sizing context)
  const subjectTopicCount = new Map<string, number>();
  for (const t of allTopics) {
    subjectTopicCount.set(t.subjectCode, (subjectTopicCount.get(t.subjectCode) ?? 0) + 1);
  }

  return (
    <View style={dbmciStyles.card}>
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
    </View>
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
    <View style={dbmciStyles.card}>
      <Text style={dbmciStyles.title}>📊 BTR — Mastery Progress</Text>
      <Text style={dbmciStyles.subtitle}>
        {overallSeen}/{overallTotal} watched · {overallMastered} mastered · Watching ≠ Learning
      </Text>
      {/* Pipeline legend */}
      <View style={masteryStyles.legendRow}>
        <View style={masteryStyles.legendItem}>
          <View style={[masteryStyles.legendDot, { backgroundColor: '#555' }]} />
          <Text style={masteryStyles.legendText}>Unseen</Text>
        </View>
        <View style={masteryStyles.legendItem}>
          <View style={[masteryStyles.legendDot, { backgroundColor: '#2196F3' }]} />
          <Text style={masteryStyles.legendText}>Watched</Text>
        </View>
        <View style={masteryStyles.legendItem}>
          <View style={[masteryStyles.legendDot, { backgroundColor: '#FF9800' }]} />
          <Text style={masteryStyles.legendText}>Reviewed</Text>
        </View>
        <View style={masteryStyles.legendItem}>
          <View style={[masteryStyles.legendDot, { backgroundColor: '#4CAF50' }]} />
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
              <Text style={[dbmciStyles.subjectName, watchedOrBetter === 0 && { color: '#666' }]}>
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
                    { width: `${masteredPct * 100}%` as `${number}%`, backgroundColor: '#4CAF50' },
                  ]}
                />
                <View
                  style={[
                    masteryStyles.barSeg,
                    {
                      width: `${(reviewedPct - masteredPct) * 100}%` as `${number}%`,
                      backgroundColor: '#FF9800',
                    },
                  ]}
                />
                <View
                  style={[
                    masteryStyles.barSeg,
                    {
                      width: `${(watchedPct - reviewedPct) * 100}%` as `${number}%`,
                      backgroundColor: '#2196F3',
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
    </View>
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
      <Text style={masteryStyles.funnelTitle}>📈 Mastery Pipeline</Text>
      <Text style={masteryStyles.funnelSub}>
        Watching alone is not enough. All topics must reach Mastered.
      </Text>
      <View style={masteryStyles.funnelBar}>
        {bar(summary.masteredCount, '#4CAF50')}
        {bar(summary.reviewedCount, '#FF9800')}
        {bar(summary.seenNeedingQuizCount, '#2196F3')}
        {bar(summary.unseenCount, '#2A2A38')}
      </View>
      <View style={masteryStyles.funnelLegendRow}>
        <Text style={[masteryStyles.funnelLegendItem, { color: '#4CAF50' }]}>
          ✓ {summary.masteredCount} Mastered
        </Text>
        <Text style={[masteryStyles.funnelLegendItem, { color: '#FF9800' }]}>
          ↺ {summary.reviewedCount} Reviewed
        </Text>
        <Text style={[masteryStyles.funnelLegendItem, { color: '#2196F3' }]}>
          👁 {summary.seenNeedingQuizCount} Watched
        </Text>
        <Text style={[masteryStyles.funnelLegendItem, { color: '#555' }]}>
          ○ {summary.unseenCount} Unseen
        </Text>
      </View>
      {summary.seenNeedingQuizCount > 0 && (
        <Text style={masteryStyles.watchGapWarning}>
          ⚡ {summary.seenNeedingQuizCount} topics watched but never quizzed — these don't count
          until reviewed!
        </Text>
      )}
    </View>
  );
}

/** Red/amber banner when the review backlog is large enough to gate new topics. */
function BacklogBanner({ summary }: { summary: StudyPlanSummary }) {
  if (summary.overdueBacklogDays < 2) return null;
  const severe = summary.overdueBacklogDays > 4;
  return (
    <View style={[masteryStyles.backlogBanner, severe && masteryStyles.backlogBannerSevere]}>
      <Text style={masteryStyles.backlogBannerTitle}>
        {severe ? '🔴 Review backlog is critical' : '🟠 Review backlog building'}
      </Text>
      <Text style={masteryStyles.backlogBannerText}>
        {summary.overdueBacklogDays}d of overdue reviews queued.{' '}
        {severe
          ? 'New topics have been throttled. Clear your review pile first.'
          : 'Prioritise reviews before starting new topics today.'}
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
    <View style={[masteryStyles.foundationCard, tone && masteryStyles.foundationCardCritical]}>
      <Text style={masteryStyles.foundationTitle}>🧱 Foundation Repair Queue</Text>
      <Text style={masteryStyles.foundationSub}>
        Fix basics first, then layer high-yield details. This prevents fake progress from video-only
        learning.
      </Text>

      <View style={masteryStyles.foundationStatsRow}>
        <View style={masteryStyles.foundationStatBox}>
          <Text style={masteryStyles.foundationStatLabel}>Today's weak blocks</Text>
          <Text style={masteryStyles.foundationStatValue}>{foundationToday.length}</Text>
        </View>
        <View style={masteryStyles.foundationStatBox}>
          <Text style={masteryStyles.foundationStatLabel}>Repair minutes</Text>
          <Text style={masteryStyles.foundationStatValue}>{foundationMinutes}m</Text>
        </View>
        <View style={masteryStyles.foundationStatBox}>
          <Text style={masteryStyles.foundationStatLabel}>Watched to quiz pending</Text>
          <Text style={masteryStyles.foundationStatValue}>{summary.seenNeedingQuizCount}</Text>
        </View>
      </View>

      <View style={masteryStyles.foundationActionRow}>
        <TouchableOpacity
          style={masteryStyles.foundationPrimaryBtn}
          onPress={onStartFoundation}
          activeOpacity={0.8}
        >
          <Text style={masteryStyles.foundationPrimaryBtnText}>Start Foundation Repair</Text>
        </TouchableOpacity>
        {summary.seenNeedingQuizCount > 0 && (
          <TouchableOpacity
            style={masteryStyles.foundationGhostBtn}
            onPress={onStartQuizRecovery}
            activeOpacity={0.8}
          >
            <Text style={masteryStyles.foundationGhostBtnText}>Fix Watched Topics</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/** Exam countdown + required mastery-rate card. */
function UrgencyCard({ summary }: { summary: StudyPlanSummary }) {
  const total =
    summary.unseenCount +
    summary.seenNeedingQuizCount +
    summary.reviewedCount +
    summary.masteredCount;
  if (total === 0 || summary.daysRemaining <= 0) return null;
  const remaining = total - summary.masteredCount;
  const topicsPerDay = (remaining / summary.daysRemaining).toFixed(1);
  const masteryPct = Math.round((summary.masteredCount / total) * 100);
  // Rough "on track": mastered% ≥ elapsed% of the 180-day study window
  const studyWindow = 180;
  const elapsed = Math.max(0, studyWindow - summary.daysRemaining);
  const onTrack =
    summary.masteredCount > 0 && masteryPct >= Math.round((elapsed / studyWindow) * 100);
  return (
    <View style={urgencyStyles.card}>
      <View style={urgencyStyles.row}>
        <View style={urgencyStyles.box}>
          <Text style={urgencyStyles.boxLabel}>{summary.targetExam} in</Text>
          <Text style={urgencyStyles.boxValue}>{summary.daysRemaining}d</Text>
        </View>
        <View style={urgencyStyles.box}>
          <Text style={urgencyStyles.boxLabel}>Mastered</Text>
          <Text style={urgencyStyles.hint}>
            INICET: {summary.daysToInicet}d · NEET-PG: {summary.daysToNeetPg}d · Phase:{' '}
            {summary.phaseLabel}
          </Text>
          <Text
            style={[
              urgencyStyles.boxValue,
              { color: masteryPct > 60 ? '#4CAF50' : masteryPct > 30 ? '#FF9800' : '#F44336' },
            ]}
          >
            {remaining} topics remain to be mastered · {topicsPerDay} per day needed to finish by{' '}
            {summary.targetExam}
          </Text>
        </View>
        <View style={urgencyStyles.box}>
          <Text style={urgencyStyles.boxLabel}>Topics/day</Text>
          <Text style={urgencyStyles.boxValue}>{topicsPerDay}</Text>
        </View>
        <View style={urgencyStyles.box}>
          <Text style={urgencyStyles.boxLabel}>Status</Text>
          <Text
            style={[
              urgencyStyles.boxValue,
              { color: onTrack ? '#4CAF50' : '#FF9800', fontSize: 12 },
            ]}
          >
            {onTrack ? '✅ On track' : '⚠️ Behind'}
          </Text>
        </View>
      </View>
      <Text style={urgencyStyles.hint}>
        {remaining} topics remain to be mastered · {topicsPerDay} per day needed to finish by INICET
      </Text>
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

  function renderReasonPills(reasonLabels: string[]) {
    return (
      <View style={styles.reasonRow}>
        {reasonLabels.map((label) => (
          <Text key={label} style={styles.reasonPill}>
            {label}
          </Text>
        ))}
      </View>
    );
  }

  function renderPlanRow(day: DailyPlan, index: number, completedIds: Set<number>) {
    const item = day.items[index];
    if (!item) return null;
    const isCompleted = completedIds.has(item.topic.id);

    return (
      <TouchableOpacity
        key={`${day.date}-${item.id}-${index}`}
        style={[
          styles.topicRow,
          item.type === 'review' && styles.rowReview,
          item.type === 'deep_dive' && styles.rowDeep,
          isCompleted && styles.rowCompleted,
        ]}
        activeOpacity={0.7}
        onPress={() => handleStartPlannedTopic(day, index)}
        accessibilityRole="button"
        accessibilityLabel={`${item.topic.name}, ${item.type === 'review' ? 'review' : item.type === 'deep_dive' ? 'deep dive' : 'study'}${isCompleted ? ', completed' : ''}`}
      >
        <View style={[styles.dot, { backgroundColor: item.topic.subjectColor }]} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {item.type === 'review' && <Text style={styles.tagReview}>REL</Text>}
            {item.type === 'deep_dive' && <Text style={styles.tagDeep}>DEEP</Text>}
            {item.type === 'study' && <Text style={styles.tagNew}>NEW</Text>}
            {item.topic.inicetPriority >= 8 && <Text style={styles.tagHighYield}>HY</Text>}
            <Text
              style={[styles.topicName, isCompleted && styles.topicNameCompleted]}
              numberOfLines={3}
              ellipsizeMode="tail"
            >
              {item.topic.name}
            </Text>
          </View>
          <Text style={styles.topicSub}>
            {item.topic.subjectName} · Priority {item.topic.inicetPriority}/10
          </Text>
          {renderReasonPills(item.reasonLabels)}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.topicTime}>{item.duration}m</Text>
          {isCompleted ? (
            <Text style={styles.completedLabel}>Completed</Text>
          ) : (
            <View style={styles.startHintRow}>
              <Text style={styles.startHint}>Start planned topic</Text>
              <Ionicons name="chevron-forward" size={12} color="#6C63FF" />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  if (isLoading && !summary) {
    return (
      <SafeAreaView style={styles.safe} testID="plan-screen">
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#6C63FF" />
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

          {/* Stats Card */}
          <View style={[styles.card, !summary.feasible && styles.cardWarning]}>
            <Text style={styles.cardTitle}>Daily Target</Text>
            <Text style={styles.cardEyebrow}>{summary.resourceLabel}</Text>
            <View style={styles.cardRow}>
              <Text style={styles.cardValue}>{requiredHoursDisplay}</Text>
              <Text style={styles.cardLabel}>/ day needed</Text>
            </View>
            <Text style={styles.cardSub}>{summary.message}</Text>
            {summary.hasWorkBeyondHorizon && (
              <Text style={styles.horizonNote}>
                {summary.hoursBeyondHorizon}h of follow-up reviews sit beyond the current planning
                window and will roll in as days pass.
              </Text>
            )}
            <Text style={styles.cardMeta}>{summary.workloadAssumption}</Text>
            {summary.subjectLoadHighlights.length > 0 && (
              <View style={styles.loadHighlightBox}>
                <Text style={styles.loadHighlightLabel}>Heavier subject blocks</Text>
                <Text style={styles.loadHighlightValue}>
                  {summary.subjectLoadHighlights.join(' · ')}
                </Text>
              </View>
            )}
            <View style={styles.forecastRow}>
              <View style={styles.forecastCard}>
                <Text style={styles.forecastLabel}>Projected finish</Text>
                <Text style={styles.forecastValue}>
                  {summary.projectedFinishDate ?? 'Not enough data'}
                </Text>
              </View>
              <View style={styles.forecastCard}>
                <Text style={styles.forecastLabel}>Buffer</Text>
                <Text style={styles.forecastValue}>
                  {summary.bufferDays} day{summary.bufferDays === 1 ? '' : 's'}
                </Text>
              </View>
            </View>

            <View style={styles.progressContainer}>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${summary.requiredHoursPerDayRaw > 0 ? Math.min(100, ((capacityOverrideMinutes ?? profile?.dailyGoalMinutes ?? 120) / (summary.requiredHoursPerDayRaw * 60)) * 100) : 100}%`,
                    },
                    !summary.feasible && { backgroundColor: '#FF9800' },
                  ]}
                />
              </View>
              <Text style={styles.progressLabel}>
                {capacityOverrideMinutes !== null
                  ? `Today's override: ${capacityOverrideMinutes >= 60 ? `${capacityOverrideMinutes / 60}h` : `${capacityOverrideMinutes}m`}`
                  : `Current Goal: ${Math.round((profile?.dailyGoalMinutes || 120) / 60)}h`}
              </Text>
            </View>
          </View>

          {/* Mastery pipeline overview — always visible */}
          <MasteryFunnelCard summary={summary} />

          {/* Exam countdown + required daily mastery rate */}
          <UrgencyCard summary={summary} />

          {/* Today's capacity quick-set */}
          <View style={masteryStyles.capacityRow}>
            <Text style={masteryStyles.capacityLabel}>
              {capacityOverrideMinutes !== null ? '⏱ Today I have' : '⏱ How much time today?'}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {CAPACITY_OPTIONS.map((opt) => {
                const active = capacityOverrideMinutes === opt.minutes;
                return (
                  <TouchableOpacity
                    key={opt.minutes}
                    style={[masteryStyles.capacityChip, active && masteryStyles.capacityChipActive]}
                    onPress={() => {
                      setCapacityOverrideMinutes(active ? null : opt.minutes);
                    }}
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
            {capacityOverrideMinutes !== null && (
              <TouchableOpacity onPress={() => setCapacityOverrideMinutes(null)}>
                <Text style={masteryStyles.capacityClear}>Reset to default</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Review backlog warning */}
          <BacklogBanner summary={summary} />

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

          <Text style={styles.sectionTitle}>Today</Text>
          {todayPlan && todayPlan.items.length > 0 ? (
            <View style={styles.dayBlock}>
              <View style={styles.dayHeader}>
                <Text style={[styles.dayLabel, { color: '#6C63FF' }]}>{todayPlan.dayLabel}</Text>
                <Text style={styles.dayMeta}>
                  {Math.round(todayPlan.totalMinutes / 60)}h · {todayPlan.items.length} tasks
                </Text>
              </View>
              {todayPlan.items.map((_, idx) => renderPlanRow(todayPlan, idx, completedTodayIds))}
              {todayPlan.isRestDay && (
                <View style={styles.restBox}>
                  <Text style={styles.restText}>🧘 Rest Day / Catch Up</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptySection}>
              <Text style={styles.emptySectionTitle}>Nothing queued for today</Text>
              <Text style={styles.emptySectionSub}>
                Use the syllabus filters or switch plan modes to generate a tighter target.
              </Text>
            </View>
          )}

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
                  <Text style={styles.restText}>🧘 Rest Day / Catch Up</Text>
                </View>
              )}
            </View>
          ))}

          <Text style={styles.sectionTitle}>Missed</Text>
          {missedTopics.length > 0 ? (
            <View style={styles.dayBlock}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayLabel}>Overdue reviews</Text>
                <Text style={styles.dayMeta}>{missedTotalCount} items</Text>
              </View>
              {missedTotalCount > missedTopics.length && (
                <Text style={styles.previewMeta}>
                  Showing first {missedTopics.length} overdue topics
                </Text>
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
                    <Text style={styles.topicName} numberOfLines={3} ellipsizeMode="tail">
                      {topic.name}
                    </Text>
                    <Text style={styles.topicSub}>{topic.subjectName}</Text>
                    {renderReasonPills([
                      topic.progress.fsrsDue?.slice(0, 10)
                        ? `Overdue since ${topic.progress.fsrsDue.slice(0, 10)}`
                        : 'Overdue',
                      topic.inicetPriority >= 8 ? 'High yield' : 'Review',
                    ])}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.topicTime}>Review</Text>
                    <View style={styles.startHintRow}>
                      <Text style={styles.startHint}>Recover now</Text>
                      <Ionicons name="chevron-forward" size={12} color="#6C63FF" />
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.emptySection}>
              <Text style={styles.emptySectionTitle}>No overdue tasks</Text>
              <Text style={styles.emptySectionSub}>
                Your review queue is under control right now.
              </Text>
            </View>
          )}
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  content: { padding: 20, paddingBottom: 60 },
  header: { marginBottom: 24 },
  title: { color: '#fff', fontSize: 28, fontWeight: '900', marginBottom: 4 },
  subtitle: { color: n.colors.textSecondary, fontSize: 14 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  resourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  modeChip: {
    backgroundColor: '#171722',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2A2A38',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modeChipActive: {
    backgroundColor: '#262145',
    borderColor: '#6C63FF66',
  },
  modeChipText: { color: '#A5ADBE', fontSize: 12, fontWeight: '800' },
  modeChipTextActive: { color: '#ECE9FF' },
  resourceChip: {
    backgroundColor: '#141824',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#243148',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resourceChipActive: {
    backgroundColor: '#0F2B3A',
    borderColor: '#49B6FF66',
  },
  resourceChipText: { color: '#9AC5DF', fontSize: 12, fontWeight: '800' },
  resourceChipTextActive: { color: '#E7F6FF' },

  card: {
    backgroundColor: '#1A1A24',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardWarning: { borderColor: '#F44336', backgroundColor: '#2A0A0A' },
  cardTitle: {
    color: n.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  cardEyebrow: {
    color: '#7CC7FF',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  cardRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  cardValue: { color: '#fff', fontSize: 32, fontWeight: '900' },
  cardLabel: { color: n.colors.textMuted, fontSize: 14, fontWeight: '600' },
  cardSub: { color: '#CCC', fontSize: 14, marginBottom: 16, fontStyle: 'italic' },
  cardMeta: { color: '#97A2B8', fontSize: 12, lineHeight: 18, marginTop: -8, marginBottom: 16 },
  loadHighlightBox: {
    backgroundColor: '#141A22',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#243148',
    padding: 12,
    marginBottom: 16,
  },
  loadHighlightLabel: {
    color: '#7BA5C8',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  loadHighlightValue: { color: '#E6F1F8', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  forecastRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  forecastCard: {
    flex: 1,
    backgroundColor: '#16161C',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A38',
    padding: 12,
  },
  forecastLabel: {
    color: '#7E8496',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  forecastValue: { color: '#F2F4F8', fontSize: 14, fontWeight: '800' },

  progressContainer: { marginTop: 8 },
  progressBarBg: {
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 3 },
  progressLabel: { color: n.colors.textMuted, fontSize: 12, lineHeight: 18 },
  horizonNote: {
    color: '#FFE1A6',
    fontSize: 12,
    lineHeight: 18,
    marginTop: -6,
    marginBottom: 10,
  },

  sectionTitle: {
    color: n.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 16,
  },

  dayBlock: { marginBottom: 24 },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 8,
  },
  dayLabel: { color: '#fff', fontSize: 18, fontWeight: '700' },
  dayMeta: { color: n.colors.textMuted, fontSize: 12 },

  topicRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#16161C',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#222',
  },
  rowReview: { borderColor: '#4CAF5044', borderLeftWidth: 3, borderLeftColor: '#4CAF50' },
  rowDeep: { borderColor: '#F4433644', borderLeftWidth: 3, borderLeftColor: '#F44336' },
  rowCompleted: { opacity: 0.7, backgroundColor: '#132017', borderColor: '#2C5A36' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  topicName: { color: '#E0E0E0', fontSize: 15, lineHeight: 21, fontWeight: '600' },
  topicNameCompleted: { textDecorationLine: 'line-through', color: '#A8D9B2' },
  topicSub: { color: n.colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  topicTime: { color: n.colors.textMuted, fontSize: 12, fontWeight: '600' },
  startHint: { color: '#6C63FF', fontSize: 12, marginTop: 2 },
  completedLabel: { color: '#63C27D', fontSize: 12, fontWeight: '800', marginTop: 4 },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  reasonPill: {
    color: '#CBD3E2',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#252734',
  },

  tagReview: {
    fontSize: 12,
    color: n.colors.success,
    fontWeight: '900',
    backgroundColor: 'rgba(63,185,80,0.08)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagDeep: {
    fontSize: 12,
    color: n.colors.error,
    fontWeight: '900',
    backgroundColor: 'rgba(241,76,76,0.08)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagNew: {
    fontSize: 12,
    color: n.colors.accent,
    fontWeight: '900',
    backgroundColor: n.colors.primaryTintSoft,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagHighYield: {
    fontSize: 12,
    color: n.colors.textInverse,
    fontWeight: '900',
    backgroundColor: n.colors.warning,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  startHintRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  emptySection: {
    backgroundColor: '#171722',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A38',
    padding: 16,
    marginBottom: 20,
  },
  emptySectionTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  emptySectionSub: { color: n.colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  previewMeta: {
    color: n.colors.textMuted,
    fontSize: 12,
    marginBottom: 10,
  },

  restBox: {
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#1A2A1A',
    borderRadius: 10,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#4CAF5044',
  },
  restText: { color: '#4CAF50', fontWeight: '600' },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    color: n.colors.textSecondary,
    marginTop: 12,
    fontSize: 14,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    color: n.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#6C63FF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
});

const dbmciStyles = StyleSheet.create({
  card: {
    backgroundColor: '#171722',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A38',
    padding: 16,
    marginBottom: 20,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  subtitle: {
    color: n.colors.textMuted,
    fontSize: 12,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
    marginBottom: 2,
  },
  idx: {
    fontSize: 11,
    fontWeight: '900',
    width: 20,
    textAlign: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  rowContent: {
    flex: 1,
  },
  subjectName: {
    color: '#E0E0E0',
    fontSize: 13,
    fontWeight: '600',
  },
  topicCount: {
    color: n.colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  meta: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  days: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  barBg: {
    height: 3,
    backgroundColor: '#2A2A38',
    borderRadius: 2,
    marginTop: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 3,
    borderRadius: 2,
  },
  pct: {
    color: '#6C63FF',
    fontSize: 11,
    fontWeight: '800',
  },
  markBtn: {
    color: '#6C63FF',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#6C63FF44',
    overflow: 'hidden',
  },
});

const liveStyles = StyleSheet.create({
  banner: {
    backgroundColor: '#13131F',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A38',
    padding: 14,
    marginBottom: 16,
  },
  bannerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  bannerDay: {
    color: '#6C63FF',
    fontSize: 12,
    fontWeight: '700',
  },
  bannerHint: {
    color: n.colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#2A2A38',
    borderRadius: 2,
    marginBottom: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: '#6C63FF',
    borderRadius: 2,
  },
  subjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  subjectBadge: {
    backgroundColor: '#6C63FF',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  subjectBadgeNext: {
    backgroundColor: '#2A2A38',
  },
  subjectBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
  subjectName: {
    color: '#E0E0E0',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  subjectMeta: {
    color: n.colors.textMuted,
    fontSize: 11,
  },
});

const masteryStyles = StyleSheet.create({
  // BTRProgressCard enhancements
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: n.colors.textMuted, fontSize: 11 },
  barTrack: {
    height: 6,
    backgroundColor: '#2A2A38',
    borderRadius: 3,
    flexDirection: 'row',
    overflow: 'hidden',
    width: '100%',
  },
  barSeg: { height: 6 },
  quizNudge: { color: '#2196F3', fontSize: 11, fontWeight: '700' },

  // MasteryFunnelCard
  funnelCard: {
    backgroundColor: '#12121C',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A38',
    padding: 16,
    marginBottom: 16,
  },
  funnelTitle: { color: '#fff', fontSize: 15, fontWeight: '800', marginBottom: 4 },
  funnelSub: { color: n.colors.textMuted, fontSize: 12, marginBottom: 12, lineHeight: 17 },
  funnelBar: {
    height: 10,
    borderRadius: 5,
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: '#2A2A38',
    marginBottom: 10,
  },
  funnelSeg: { height: 10 },
  funnelLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  funnelLegendItem: { fontSize: 12, fontWeight: '700' },
  watchGapWarning: {
    color: '#64B5F6',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
    fontStyle: 'italic',
  },

  // BacklogBanner
  backlogBanner: {
    backgroundColor: '#241A00',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF980066',
    padding: 14,
    marginBottom: 16,
  },
  backlogBannerSevere: {
    backgroundColor: '#2A0A0A',
    borderColor: '#F4433666',
  },
  backlogBannerTitle: { color: '#fff', fontSize: 14, fontWeight: '800', marginBottom: 4 },
  backlogBannerText: { color: '#CCC', fontSize: 13, lineHeight: 18 },

  // Foundation repair queue
  foundationCard: {
    backgroundColor: '#171322',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#423468',
    padding: 14,
    marginBottom: 16,
  },
  foundationCardCritical: {
    backgroundColor: '#2A0D16',
    borderColor: '#7A3246',
  },
  foundationTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  foundationSub: {
    color: '#D5CCE9',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  foundationStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  foundationStatBox: {
    flex: 1,
    backgroundColor: '#201A31',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  foundationStatLabel: {
    color: '#B8A9D6',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  foundationStatValue: {
    color: '#F7F3FF',
    fontSize: 17,
    fontWeight: '900',
  },
  foundationActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  foundationPrimaryBtn: {
    flex: 1,
    backgroundColor: '#6C63FF',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  foundationPrimaryBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  foundationGhostBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#6C63FF66',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#1A1730',
  },
  foundationGhostBtnText: {
    color: '#CDC6FF',
    fontWeight: '800',
    fontSize: 12,
  },

  // Daily capacity chips
  capacityRow: {
    marginBottom: 16,
    backgroundColor: '#13131F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A38',
    padding: 12,
  },
  capacityLabel: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  capacityChip: {
    backgroundColor: '#1E1E2E',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  capacityChipActive: {
    backgroundColor: '#2B2060',
    borderColor: '#6C63FF88',
  },
  capacityChipText: { color: '#AAA', fontSize: 12, fontWeight: '700' },
  capacityChipTextActive: { color: '#ECE9FF' },
  capacityClear: {
    color: '#6C63FF',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 8,
  },
});

const urgencyStyles = StyleSheet.create({
  card: {
    backgroundColor: '#0F131C',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#243148',
    padding: 16,
    marginBottom: 16,
  },
  row: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  box: {
    flex: 1,
    backgroundColor: '#141824',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  boxLabel: {
    color: '#7E8496',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  boxValue: { color: '#fff', fontSize: 18, fontWeight: '900' },
  hint: { color: n.colors.textMuted, fontSize: 12, lineHeight: 17 },
});
