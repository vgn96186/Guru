import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  generateStudyPlan,
  type DailyPlan,
  type StudyPlanSummary,
  type PlanMode,
} from '../services/studyPlanner';
import { useFocusEffect, type NavigationProp } from '@react-navigation/native';
import type { TabParamList, HomeStackParamList } from '../navigation/types';
import { navigationRef } from '../navigation/navigationRef';
import { showToast } from '../components/Toast';
import { useProfileQuery, useProfileActions } from '../hooks/queries/useProfile';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { linearTheme as n } from '../theme/linearTheme';
import { warningAlpha } from '../theme/colorUtils';
import LoadingOrb from '../components/LoadingOrb';
import { MS_PER_DAY } from '../constants/time';
import { Ionicons } from '@expo/vector-icons';
import { getCompletedTopicIdsBetween } from '../db/queries/sessions';
import { getTopicsDueForReview, getAllTopicsWithProgress } from '../db/queries/topics';

import type { TopicWithProgress, StudyResourceMode } from '../types';
import ScreenHeader from '../components/ScreenHeader';
import { SUBJECTS_SEED } from '../constants/syllabus';
import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';

import { MenuNav } from '../navigation/typedHooks';
import LiveClassBanner from './studyPlan/cards/LiveClassBanner';
import DBMCISyllabusCard from './studyPlan/cards/DBMCISyllabusCard';
import BTRProgressCard from './studyPlan/cards/BTRProgressCard';
import MasteryFunnelCard from './studyPlan/cards/MasteryFunnelCard';
import BacklogBanner from './studyPlan/cards/BacklogBanner';
import FoundationRepairQueueCard from './studyPlan/cards/FoundationRepairQueueCard';
import UrgencyCell from './studyPlan/cards/UrgencyCell';

const _SUBJECT_MAP = new Map(SUBJECTS_SEED.map((s) => [s.shortCode, s]));
const _DBMCI_TOTAL_DAYS = 137;
const OVERDUE_FETCH_LIMIT = 2000;
const MISSED_PREVIEW_LIMIT = 8;

/** Horizontal chip row for quickly picking today's available time. */
const CAPACITY_OPTIONS = [
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '1.5h', minutes: 90 },
  { label: '2h', minutes: 120 },
  { label: '3h', minutes: 180 },
  { label: '4h+', minutes: 240 },
];
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
  const navigation = MenuNav.useNav();
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
  const { data: profile } = useProfileQuery();
  const { setStudyResourceMode } = useProfileActions();
  const resourceMode = profile?.studyResourceMode ?? 'hybrid';

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        void refreshPlan();
      });
      return () => task.cancel();
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
      // NEET-PG tests breadth; use a slightly lower priority threshold so more topics qualify.
      const isNeet = profile?.examType === 'NEET';
      const overdue = overdueRaw.filter((topic) => {
        const dueDate = topic.progress.fsrsDue?.slice(0, 10);
        if (!dueDate || dueDate >= todayStr) return false;
        if (planMode === 'high_yield') return topic.inicetPriority >= (isNeet ? 7 : 8);
        if (planMode === 'exam_crunch')
          return topic.inicetPriority >= (isNeet ? 6 : 7) || topic.progress.confidence < 3;
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
    } catch (err: unknown) {
      console.error('[StudyPlan] Failed to refresh plan:', err);
      setLoadError(
        (err instanceof Error ? err.message : String(err)) ??
          'Unable to load study plan right now.',
      );
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
        accessibilityLabel={`${item.topic.name}, ${
          item.type === 'review' ? 'review' : item.type === 'deep_dive' ? 'deep dive' : 'study'
        }${isCompleted ? ', completed' : ''}`}
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
            {item.type === 'review' && <LinearText style={styles.tagReview}>REV</LinearText>}
            {item.type === 'deep_dive' && <LinearText style={styles.tagDeep}>DEEP</LinearText>}
            {item.type === 'study' && <LinearText style={styles.tagNew}>NEW</LinearText>}
            {item.topic.inicetPriority >= 8 && (
              <LinearText style={styles.tagHighYield}>HY</LinearText>
            )}
            <LinearText
              style={[styles.topicName, isCompleted && styles.topicNameCompleted]}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {item.topic.name}
            </LinearText>
          </View>
          <LinearText style={styles.topicSub}>
            {item.topic.subjectName} · P{item.topic.inicetPriority} · {item.duration}m
          </LinearText>
        </View>
        {isCompleted ? (
          <Ionicons name="checkmark-circle" size={16} color={n.colors.success} />
        ) : (
          <Ionicons name="chevron-forward" size={14} color={n.colors.textMuted} />
        )}
      </TouchableOpacity>
    );
  }

  // ── Hooks MUST run before any early returns (rules-of-hooks) ──
  const todayPlan = plan[0];
  const weekPlans = plan.slice(1, 7);
  const requiredHoursDisplay = summary?.hoursPerDayCapped
    ? `${summary.requiredHoursPerDay}h+`
    : `${summary?.requiredHoursPerDay ?? 0}h`;
  const currentPlanModeLabel =
    PLAN_MODES.find((mode) => mode.key === planMode)?.label ?? 'Balanced';
  const currentResourceLabel =
    RESOURCE_MODES.find((mode) => mode.key === resourceMode)?.label ?? summary?.resourceLabel ?? '';
  const todayTaskCount = todayPlan?.items.length ?? 0;
  const heroMetrics = [
    { label: 'Today tasks', value: String(todayTaskCount), tone: 'accent' as const },
    {
      label: 'Topics left',
      value: String(summary?.totalTopicsLeft ?? 0),
      tone: 'primary' as const,
    },
    {
      label: 'Watch gap',
      value: String(summary?.seenNeedingQuizCount ?? 0),
      tone: 'warning' as const,
    },
    {
      label: 'Overdue load',
      value: `${summary?.overdueBacklogDays ?? 0}d`,
      tone: (summary?.overdueBacklogDays ?? 0) > 4 ? ('error' as const) : ('success' as const),
    },
  ];
  // Pre-compute aggregates once — map+filter over items on every render was expensive
  const { foundationToday, watchedNeedingQuizToday } = useMemo(() => {
    const items = todayPlan?.items ?? [];
    const foundation = items
      .map((item) => item.topic)
      .filter(
        (topic) =>
          topic.progress.confidence <= 1 ||
          topic.progress.isNemesis ||
          (topic.progress.wrongCount ?? 0) >= 2,
      );
    const quizRecovery = items
      .filter((item) => item.topic.progress.status === 'seen' && item.topic.progress.confidence < 1)
      .map((item) => item.topic);
    return { foundationToday: foundation, watchedNeedingQuizToday: quizRecovery };
  }, [todayPlan]);

  // ── Early returns AFTER all hooks ──
  if (isLoading && !summary) {
    return (
      // eslint-disable-next-line guru/prefer-screen-shell -- SafeAreaView needed here
      <SafeAreaView style={styles.safe} testID="plan-screen">
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <View style={styles.loadingWrap}>
          <LoadingOrb message="Building your study plan..." size={120} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError && !summary) {
    return (
      // eslint-disable-next-line guru/prefer-screen-shell -- SafeAreaView needed here
      <SafeAreaView style={styles.safe} testID="plan-screen">
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <View style={styles.loadingWrap}>
          <LinearText style={styles.errorTitle}>Could not load study plan</LinearText>
          <LinearText style={styles.errorText}>{loadError}</LinearText>
          <TouchableOpacity style={styles.retryButton} onPress={refreshPlan} activeOpacity={0.8}>
            <LinearText style={styles.retryButtonText}>Retry</LinearText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!summary) return null;

  return (
    // eslint-disable-next-line guru/prefer-screen-shell -- SafeAreaView needed here
    <SafeAreaView style={styles.safe} testID="plan-screen">
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ScrollView contentContainerStyle={styles.content}>
        <ResponsiveContainer>
          <View style={styles.header}>
            <ScreenHeader
              title="Dynamic Plan"
              onBackPress={() => navigation.navigate('MenuHome')}
              showSettings
            />
          </View>

          <LinearSurface compact style={styles.heroCard}>
            <View style={styles.heroHeader}>
              <View style={styles.heroCopy}>
                <LinearText variant="meta" tone="accent" style={styles.heroEyebrow}>
                  TRAJECTORY
                </LinearText>
                <LinearText variant="sectionTitle" style={styles.heroTitle}>
                  {summary.phaseLabel}
                </LinearText>
                <LinearText variant="bodySmall" tone="secondary" style={styles.heroText}>
                  {summary.phaseFocus}
                </LinearText>
              </View>
              <View
                style={[
                  styles.heroStatusPill,
                  summary.feasible ? styles.heroStatusPillOk : styles.heroStatusPillWarn,
                ]}
              >
                <LinearText variant="chip" tone={summary.feasible ? 'success' : 'warning'}>
                  {summary.feasible ? 'On track' : 'Compressed'}
                </LinearText>
              </View>
            </View>

            <View style={styles.heroContextRow}>
              <View style={styles.heroContextChip}>
                <LinearText variant="caption" tone="muted">
                  Mode
                </LinearText>
                <LinearText variant="label" style={styles.heroContextValue}>
                  {currentPlanModeLabel}
                </LinearText>
              </View>
              <View style={styles.heroContextChip}>
                <LinearText variant="caption" tone="muted">
                  Resource
                </LinearText>
                <LinearText variant="label" style={styles.heroContextValue}>
                  {currentResourceLabel}
                </LinearText>
              </View>
            </View>

            {summary.subjectLoadHighlights.length > 0 && (
              <View style={styles.heroHighlightRow}>
                {summary.subjectLoadHighlights.slice(0, 3).map((highlight) => (
                  <View key={highlight} style={styles.heroHighlightChip}>
                    <LinearText variant="caption" tone="secondary" numberOfLines={2}>
                      {highlight}
                    </LinearText>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.heroMetricsRow}>
              {heroMetrics.map((metric) => (
                <View key={metric.label} style={styles.heroMetricCard}>
                  <LinearText variant="title" tone={metric.tone} style={styles.heroMetricValue}>
                    {metric.value}
                  </LinearText>
                  <LinearText variant="caption" tone="secondary" style={styles.heroMetricLabel}>
                    {metric.label}
                  </LinearText>
                </View>
              ))}
            </View>
          </LinearSurface>

          {/* ── Dashboard card ── */}
          <LinearSurface compact style={styles.dashboardCard}>
            <View style={styles.summaryStrip}>
              <View style={styles.summaryCell}>
                <LinearText style={styles.summaryValue}>{requiredHoursDisplay}</LinearText>
                <LinearText style={styles.summaryLabel}>per day</LinearText>
              </View>
              <View style={styles.summaryDivider} />
              <UrgencyCell summary={summary} />
              <View style={styles.summaryDivider} />
              <View style={styles.summaryCell}>
                <LinearText style={styles.summaryValue}>{summary.bufferDays}d</LinearText>
                <LinearText style={styles.summaryLabel}>buffer</LinearText>
              </View>
            </View>
            {!summary.feasible && (
              <LinearText style={styles.warningHint}>{summary.message}</LinearText>
            )}
            <MasteryFunnelCard summary={summary} />
          </LinearSurface>

          {/* ── Controls ── */}
          <View style={styles.controlsRow}>
            <LinearSurface compact style={styles.controlCard}>
              <View style={styles.controlSection}>
                <LinearText variant="meta" tone="muted" style={styles.controlEyebrow}>
                  PLAN MODE
                </LinearText>
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
                      <LinearText
                        style={[
                          styles.modeChipText,
                          planMode === mode.key && styles.modeChipTextActive,
                        ]}
                      >
                        {mode.label}
                      </LinearText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.controlSection}>
                <LinearText variant="meta" tone="muted" style={styles.controlEyebrow}>
                  LECTURE SYNC
                </LinearText>
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
                      <LinearText
                        style={[
                          styles.resourceChipText,
                          resourceMode === mode.key && styles.resourceChipTextActive,
                        ]}
                      >
                        {mode.label}
                      </LinearText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.controlSection}>
                <LinearText variant="meta" tone="muted" style={styles.controlEyebrow}>
                  DAILY CAPACITY
                </LinearText>
                <LinearText variant="bodySmall" tone="secondary" style={styles.controlHint}>
                  Choose what today realistically allows. The queue will adapt around it.
                </LinearText>
                <View style={masteryStyles.capacityChipRow}>
                  {CAPACITY_OPTIONS.map((opt) => {
                    const active = capacityOverrideMinutes === opt.minutes;
                    return (
                      <TouchableOpacity
                        key={opt.minutes}
                        style={[
                          masteryStyles.capacityChip,
                          active && masteryStyles.capacityChipActive,
                        ]}
                        onPress={() => setCapacityOverrideMinutes(active ? null : opt.minutes)}
                        activeOpacity={0.8}
                      >
                        <LinearText
                          style={[
                            masteryStyles.capacityChipText,
                            active && masteryStyles.capacityChipTextActive,
                          ]}
                        >
                          {opt.label}
                        </LinearText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </LinearSurface>
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
          <LinearText style={styles.sectionTitle}>Today</LinearText>
          {todayPlan && todayPlan.items.length > 0 ? (
            <View style={styles.dayBlock}>
              <View style={styles.dayHeader}>
                <LinearText style={styles.dayLabel}>{todayPlan.dayLabel}</LinearText>
                <LinearText style={styles.dayMeta}>
                  {Math.round(todayPlan.totalMinutes / 60)}h · {todayPlan.items.length} tasks
                </LinearText>
              </View>
              {todayPlan.items.map((_, idx) => renderPlanRow(todayPlan, idx, completedTodayIds))}
              {todayPlan.isRestDay && (
                <View style={styles.restBox}>
                  <LinearText style={styles.restText}>Rest Day / Catch Up</LinearText>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptySection}>
              <LinearText style={styles.emptySectionTitle}>Nothing queued</LinearText>
              <LinearText style={styles.emptySectionSub}>
                Switch plan modes or open syllabus to generate targets.
              </LinearText>
            </View>
          )}

          {/* ── This Week ── */}
          <LinearText style={styles.sectionTitle}>This Week</LinearText>
          {weekPlans.map((day, i) => (
            <View key={i} style={styles.dayBlock}>
              <View style={styles.dayHeader}>
                <LinearText style={styles.dayLabel}>{day.dayLabel}</LinearText>
                <LinearText style={styles.dayMeta}>
                  {Math.round(day.totalMinutes / 60)}h · {day.items.length} tasks
                </LinearText>
              </View>
              {day.items.map((_, idx) => renderPlanRow(day, idx, completedWeekIds))}
              {day.isRestDay && (
                <View style={styles.restBox}>
                  <LinearText style={styles.restText}>Rest Day / Catch Up</LinearText>
                </View>
              )}
            </View>
          ))}

          {/* ── Overdue ── */}
          <LinearText style={styles.sectionTitle}>Overdue</LinearText>
          {missedTopics.length > 0 ? (
            <View style={styles.dayBlock}>
              <View style={styles.dayHeader}>
                <LinearText style={[styles.dayLabel, { color: n.colors.warning }]}>
                  {missedTotalCount} review{missedTotalCount === 1 ? '' : 's'} due
                </LinearText>
              </View>
              {missedTotalCount > missedTopics.length && (
                <LinearText style={styles.previewMeta}>
                  Showing first {missedTopics.length}
                </LinearText>
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
                    <LinearText style={styles.topicName} numberOfLines={2} ellipsizeMode="tail">
                      {topic.name}
                    </LinearText>
                    <LinearText style={styles.topicSub}>
                      {topic.subjectName} · {topic.progress.fsrsDue?.slice(5, 10) ?? 'overdue'}
                    </LinearText>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={n.colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.emptySection}>
              <LinearText style={styles.emptySectionTitle}>All clear</LinearText>
              <LinearText style={styles.emptySectionSub}>No overdue reviews right now.</LinearText>
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
  heroCard: {
    marginBottom: n.spacing.md,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: n.spacing.md,
  },
  heroCopy: {
    flex: 1,
  },
  heroEyebrow: {
    letterSpacing: 1.1,
  },
  heroTitle: {
    marginTop: n.spacing.xs,
  },
  heroText: {
    marginTop: n.spacing.xs,
  },
  heroStatusPill: {
    borderRadius: n.radius.full,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroStatusPillOk: {
    backgroundColor: n.colors.successSurface,
    borderColor: `${n.colors.success}55`,
  },
  heroStatusPillWarn: {
    backgroundColor: warningAlpha['12'],
    borderColor: `${n.colors.warning}55`,
  },
  heroContextRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: n.spacing.md,
  },
  heroContextChip: {
    flexGrow: 1,
    minWidth: 132,
    backgroundColor: n.colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: n.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  heroContextValue: {
    marginTop: 2,
  },
  heroHighlightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: n.spacing.md,
  },
  heroHighlightChip: {
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: n.colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: n.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  heroMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: n.spacing.md,
  },
  heroMetricCard: {
    flexGrow: 1,
    minWidth: 110,
    backgroundColor: n.colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: n.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  heroMetricValue: {
    marginBottom: 2,
  },
  heroMetricLabel: {
    lineHeight: 16,
  },
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
  controlCard: {
    marginBottom: 2,
  },
  controlSection: {
    marginBottom: n.spacing.md,
  },
  controlEyebrow: {
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  controlHint: {
    marginBottom: 10,
  },
  sectionTitle: {
    ...n.typography.sectionTitle,
    color: n.colors.textPrimary,
    marginTop: 2,
  },

  dayBlock: {
    marginBottom: n.spacing.md,
    backgroundColor: n.colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: n.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: n.spacing.sm,
    paddingBottom: n.spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: n.colors.border,
    gap: n.spacing.sm,
  },
  dayLabel: { ...n.typography.label, color: n.colors.textPrimary, fontSize: 14 },
  dayMeta: { ...n.typography.meta, color: n.colors.textMuted, textAlign: 'right' },

  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
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
    backgroundColor: warningAlpha['10'],
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  emptySection: {
    paddingVertical: n.spacing.md,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: n.colors.border,
    backgroundColor: n.colors.background,
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

const _dbmciStyles = StyleSheet.create({
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

const _liveStyles = StyleSheet.create({
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
