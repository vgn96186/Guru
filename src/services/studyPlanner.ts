import {
  getAllTopicsWithProgress,
  getAllSubjects,
  getTopicsDueForReview,
} from '../db/queries/topics';
import { profileRepository } from '../db/repositories';
import { getPreferredStudyHours } from '../db/queries/sessions';
import { useAppStore } from '../store/useAppStore';
import type { TopicWithProgress, StudyResourceMode } from '../types';
import { MS_PER_DAY } from '../constants/time';
import {
  buildPlanBuckets,
  buildTopicQueues,
  isParentTopic,
  DBMCI_WORKLOAD_OVERRIDES,
} from './studyPlannerBuckets';
import { getExamAwareSubjectWeight, getExamTargetIntelligence } from './examIntelligence';

export type PlanActionType = 'study' | 'review' | 'deep_dive';

export interface PlanItem {
  id: string; // Unique ID for keying
  topic: TopicWithProgress;
  type: PlanActionType;
  duration: number;
  reasonLabels: string[];
}

export interface DailyPlan {
  date: string;
  dayLabel: string;
  items: PlanItem[];
  totalMinutes: number;
  isRestDay: boolean;
}

export interface StudyPlanSummary {
  totalTopicsLeft: number;
  totalHoursLeft: number;
  hoursBeyondHorizon: number;
  targetExam: 'INICET' | 'NEET-PG';
  targetExamDate: string;
  daysToInicet: number;
  daysToNeetPg: number;
  phaseLabel: string;
  phaseFocus: string;
  daysRemaining: number;
  requiredHoursPerDay: number;
  requiredHoursPerDayRaw: number;
  hoursPerDayCapped: boolean;
  feasible: boolean;
  hasWorkBeyondHorizon: boolean;
  message: string;
  projectedFinishDate: string | null;
  bufferDays: number;
  resourceMode: StudyResourceMode;
  resourceLabel: string;
  workloadAssumption: string;
  subjectLoadHighlights: string[];
  /** Topics watched/seen but not yet quizzed/reviewed — the "watch ≠ learn" gap */
  seenNeedingQuizCount: number;
  /** Topics in reviewed/mastered state */
  reviewedCount: number;
  masteredCount: number;
  /** Topics still completely unseen */
  unseenCount: number;
  /**
   * Backlog pressure: ratio of overdue review minutes vs daily goal.
   * > 3 = backlog is consuming >3× daily capacity — new topics should be gated.
   */
  overdueBacklogDays: number;
  /** Whether the planner has suppressed new topics to let the review backlog clear */
  newTopicsGated: boolean;
}

export interface TodayTask {
  timeLabel: string;
  topic: TopicWithProgress;
  type: PlanActionType;
  duration: number;
}

const DUE_TOPICS_FETCH_LIMIT = 2000;

export type PlanMode = 'balanced' | 'high_yield' | 'exam_crunch';

interface GeneratePlanOptions {
  mode?: PlanMode;
  resourceMode?: StudyResourceMode;
  /** Temporarily override the user's saved dailyGoalMinutes for this call only. */
  dailyGoalOverrideMinutes?: number;
}

interface ResourceProfile {
  label: string;
  workloadAssumption: string;
  reviewMinutes: number;
  newTopicMultiplier: number;
  deepDiveMultiplier: number;
  minNewTopicMinutes: number;
  minDeepDiveMinutes: number;
  newTopicDailyBudgetMultiplier: number;
  deepDiveDailyBudgetMultiplier: number;
  subjectWeightSensitivity: number;
}

const RESOURCE_PROFILES: Record<StudyResourceMode, ResourceProfile> = {
  standard: {
    label: 'Standard Topics',
    workloadAssumption: 'Revision-sized topic blocks with lighter time assumptions.',
    reviewMinutes: 15,
    newTopicMultiplier: 1,
    deepDiveMultiplier: 1,
    minNewTopicMinutes: 35,
    minDeepDiveMinutes: 35,
    newTopicDailyBudgetMultiplier: 1,
    deepDiveDailyBudgetMultiplier: 0.6,
    subjectWeightSensitivity: 0.35,
  },
  btr: {
    label: 'BTR',
    workloadAssumption:
      'Compressed high-yield revision blocks modeled closer to 75-90 minute sessions.',
    reviewMinutes: 22,
    newTopicMultiplier: 2.2,
    deepDiveMultiplier: 1.8,
    minNewTopicMinutes: 75,
    minDeepDiveMinutes: 60,
    newTopicDailyBudgetMultiplier: 1.35,
    deepDiveDailyBudgetMultiplier: 0.85,
    subjectWeightSensitivity: 0.7,
  },
  dbmci_live: {
    label: 'DBMCI Live (Extracted)',
    workloadAssumption:
      'Chronological lecture-heavy sequence explicitly tuned to 8-month DBMCI class durations (~2,144 content hours).',
    reviewMinutes: 20,
    newTopicMultiplier: 1.8,
    deepDiveMultiplier: 1.4,
    minNewTopicMinutes: 35,
    minDeepDiveMinutes: 45,
    newTopicDailyBudgetMultiplier: 1.65,
    deepDiveDailyBudgetMultiplier: 0.9,
    subjectWeightSensitivity: 1,
  },
  hybrid: {
    label: 'BTR + DBMCI Hybrid',
    workloadAssumption: 'Blends marathon revision blocks with multi-hour live-class learning load.',
    reviewMinutes: 25,
    newTopicMultiplier: 2.8,
    deepDiveMultiplier: 2.2,
    minNewTopicMinutes: 95,
    minDeepDiveMinutes: 80,
    newTopicDailyBudgetMultiplier: 1.55,
    deepDiveDailyBudgetMultiplier: 0.95,
    subjectWeightSensitivity: 0.85,
  },
};

const MAX_DAILY_DISPLAY_MINUTES = 24 * 60;

export const SUBJECT_WORKLOAD_OVERRIDES: Record<string, number> = {
  MED: 1.35,
  SURG: 1.3,
  OBG: 1.2,
  PSM: 1.2,
  PEDS: 1.15,
  PATH: 1.12,
  PHAR: 1.08,
  ANAT: 1.08,
  PHYS: 1.05,
  MICR: 1.05,
  ORTH: 1.02,
  OPTH: 0.95,
  ENT: 0.92,
  FMT: 0.9,
  PSY: 0.88,
  DERM: 0.88,
  RADI: 0.9,
  ANES: 0.86,
  BIOC: 0.96,
};

function toDateOnly(dateLike: string | null): string | null {
  if (!dateLike) return null;
  return dateLike.slice(0, 10);
}

function buildReasonLabels(
  topic: TopicWithProgress,
  type: PlanActionType,
  today: string,
): string[] {
  const labels: string[] = [];
  const dueDate = toDateOnly(topic.progress.fsrsDue);

  if (type === 'review') {
    if (dueDate && dueDate < today) {
      const overdueDays = Math.max(
        1,
        Math.ceil((new Date(today).getTime() - new Date(dueDate).getTime()) / MS_PER_DAY),
      );
      labels.push(`Overdue ${overdueDays}d`);
    } else if (dueDate === today) {
      labels.push('Due today');
    } else {
      labels.push('Scheduled review');
    }
  }

  if (type === 'deep_dive') labels.push('Weak topic');
  if (topic.progress.confidence <= 1 && topic.progress.status !== 'unseen')
    labels.push('Foundation gap');
  if (type === 'study' && topic.progress.status === 'unseen') labels.push('Untouched');
  if (topic.inicetPriority >= 8) labels.push('High yield');
  if (topic.progress.isNemesis) labels.push('Nemesis');

  return labels.slice(0, 3);
}

function createPlanItem(
  id: string,
  topic: TopicWithProgress,
  type: PlanActionType,
  duration: number,
  today: string,
): PlanItem {
  return {
    id,
    topic,
    type,
    duration,
    reasonLabels: buildReasonLabels(topic, type, today),
  };
}

function getResourceProfile(mode: StudyResourceMode): ResourceProfile {
  return RESOURCE_PROFILES[mode] ?? RESOURCE_PROFILES.hybrid;
}

export function getDefaultSubjectLoadMultiplier(
  subjectCode: string,
  resourceMode?: StudyResourceMode,
): number {
  if (resourceMode === 'dbmci_live' && DBMCI_WORKLOAD_OVERRIDES[subjectCode]) {
    return DBMCI_WORKLOAD_OVERRIDES[subjectCode];
  }
  return SUBJECT_WORKLOAD_OVERRIDES[subjectCode] ?? 1;
}

function getSubjectLoadFactor(
  topic: TopicWithProgress,
  resourceMode: StudyResourceMode,
  customOverrides?: Record<string, number>,
): number {
  const resourceProfile = getResourceProfile(resourceMode);
  const baseline =
    customOverrides?.[topic.subjectCode] ??
    getDefaultSubjectLoadMultiplier(topic.subjectCode, resourceMode);
  return 1 + (baseline - 1) * resourceProfile.subjectWeightSensitivity;
}

function estimateActionDuration(
  topic: TopicWithProgress,
  type: PlanActionType,
  resourceMode: StudyResourceMode,
  customOverrides?: Record<string, number>,
): number {
  const profile = getResourceProfile(resourceMode);
  const baseMinutes = Math.max(topic.estimatedMinutes || 35, 20);
  const subjectFactor = getSubjectLoadFactor(topic, resourceMode, customOverrides);

  if (type === 'review') {
    return Math.round(
      (profile.reviewMinutes + (topic.inicetPriority >= 8 ? 5 : 0)) *
        Math.max(0.92, Math.min(1.15, subjectFactor)),
    );
  }

  if (type === 'deep_dive') {
    const scaled = Math.round(baseMinutes * profile.deepDiveMultiplier * subjectFactor);
    return Math.max(profile.minDeepDiveMinutes, scaled);
  }

  const scaled = Math.round(baseMinutes * profile.newTopicMultiplier * subjectFactor);
  const priorityBoost = topic.inicetPriority >= 8 ? 10 : 0;
  return Math.max(profile.minNewTopicMinutes, scaled + priorityBoost);
}

function getActiveSubjectLoadHighlights(
  resourceMode: StudyResourceMode,
  customOverrides?: Record<string, number>,
): string[] {
  const resourceProfile = getResourceProfile(resourceMode);
  const baseOverrides =
    resourceMode === 'dbmci_live'
      ? { ...SUBJECT_WORKLOAD_OVERRIDES, ...DBMCI_WORKLOAD_OVERRIDES }
      : SUBJECT_WORKLOAD_OVERRIDES;
  return Object.entries({ ...baseOverrides, ...(customOverrides ?? {}) })
    .map(([code, factor]) => ({
      code,
      applied: 1 + (factor - 1) * resourceProfile.subjectWeightSensitivity,
    }))
    .filter((item) => item.applied >= 1.1)
    .sort((a, b) => b.applied - a.applied)
    .slice(0, 4)
    .map((item) => `${item.code} ${item.applied.toFixed(2)}x`);
}

// In-memory cache to prevent heavy recomputation on every render
let cachedPlan: { plan: DailyPlan[]; summary: StudyPlanSummary } | null = null;
let lastCacheKey: string | null = null;

export function invalidatePlanCache() {
  cachedPlan = null;
  lastCacheKey = null;
}

export async function getTodaysAgendaWithTimes(): Promise<TodayTask[]> {
  const { plan } = await generateStudyPlan();
  const todayPlan = plan[0];
  if (!todayPlan || todayPlan.items.length === 0) return [];
  const todayIso = new Date().toISOString().slice(0, 10);

  const formatClock = (totalMinutes: number) => {
    const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
    const hour = Math.floor(normalized / 60);
    const minute = normalized % 60;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  };

  const formatClockWithOffset = (totalMinutes: number) => {
    const dayOffset = Math.floor(totalMinutes / (24 * 60));
    const suffix = dayOffset > 0 ? ` (+${dayOffset}d)` : '';
    return `${formatClock(totalMinutes)}${suffix}`;
  };

  // Get user-stated availability from store
  const availability = useAppStore.getState().dailyAvailability;

  // 1. Filter items based on availability/capacity
  let items = todayPlan.items;

  // Home card should feel fresh: avoid repeating the same topic multiple times in one agenda,
  // except when a repeated item is an overdue review that must remain visible.
  const seenTopicIds = new Set<number>();
  items = items.filter((item) => {
    const due = item.topic.progress.fsrsDue?.slice(0, 10);
    const isOverdueReview = item.type === 'review' && Boolean(due && due < todayIso);
    if (isOverdueReview) return true;
    if (seenTopicIds.has(item.topic.id)) return false;
    seenTopicIds.add(item.topic.id);
    return true;
  });

  if (availability !== null) {
    // "Just Checking" -> Show nothing or maybe just 1 quick win
    if (availability === 0) return [];

    // Filter logic
    items = items.filter((item) => {
      // If short on time (< 45m), skip Deep Dives
      if (availability < 45 && item.type === 'deep_dive') return false;
      // If very short on time (< 20m), skip New Topics, keep only Reviews
      if (availability < 20 && item.type !== 'review') return false;
      return true;
    });

    // Truncate list to fit availability
    let total = 0;
    const fittingItems: PlanItem[] = [];
    for (const item of items) {
      if (total + item.duration <= availability) {
        fittingItems.push(item);
        total += item.duration;
      }
    }
    items = fittingItems;
  }

  const preferredHours = await getPreferredStudyHours();
  const now = new Date();
  const currentHour = now.getHours();

  // Filter out hours that have already passed, unless we have no future slots
  let availableHours = preferredHours.filter((h) => h >= currentHour);
  if (availableHours.length === 0) {
    // If all preferred times passed, just suggest next hour onwards
    availableHours = [currentHour + 1, currentHour + 2, currentHour + 3];
  }

  const schedule: TodayTask[] = [];
  let hourIndex = 0;
  let currentSlotMinutes = 0;

  // Group items into hour blocks
  for (const item of items) {
    const hour =
      availableHours[hourIndex] ??
      availableHours[availableHours.length - 1] + 1 + (hourIndex - availableHours.length);
    const slotStart = hour * 60 + currentSlotMinutes;
    const slotEnd = slotStart + item.duration;

    schedule.push({
      timeLabel: `${formatClockWithOffset(slotStart)} - ${formatClockWithOffset(slotEnd)}`,
      topic: item.topic,
      type: item.type,
      duration: item.duration,
    });

    currentSlotMinutes += item.duration;
    // If slot > 50 mins, move to next hour
    if (currentSlotMinutes >= 50) {
      hourIndex++;
      currentSlotMinutes = 0;
    }
  }

  return schedule;
}

export async function generateStudyPlan(
  options?: GeneratePlanOptions,
): Promise<{ plan: DailyPlan[]; summary: StudyPlanSummary }> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const mode = options?.mode ?? 'balanced';
  const profile = await profileRepository.getProfile();
  const resourceMode = options?.resourceMode ?? profile.studyResourceMode ?? 'hybrid';
  const customSubjectLoads = profile.customSubjectLoadMultipliers ?? {};
  const resourceProfile = getResourceProfile(resourceMode);
  const cacheKey = JSON.stringify({
    todayStr,
    mode,
    resourceMode,
    customSubjectLoads,
    dailyGoalMinutes: options?.dailyGoalOverrideMinutes ?? profile.dailyGoalMinutes,
    inicetDate: profile.inicetDate,
    neetDate: profile.neetDate,
    dbmciClassStartDate: profile.dbmciClassStartDate ?? null,
    btrStartDate: profile.btrStartDate ?? null,
  });
  if (cachedPlan && lastCacheKey === cacheKey) {
    return cachedPlan;
  }

  const [allTopics, subjects] = await Promise.all([getAllTopicsWithProgress(), getAllSubjects()]);
  const examIntelligence = getExamTargetIntelligence(profile, profileRepository.getDaysToExam);
  const subjectWeights = new Map(
    subjects.map((s) => [s.id, getExamAwareSubjectWeight(s, examIntelligence.targetExam)]),
  );

  // 1. Initial State
  const today = new Date();
  const daysToExam = examIntelligence.daysToTarget;
  const dailyGoal =
    (options?.dailyGoalOverrideMinutes ?? profile.dailyGoalMinutes) > 0
      ? (options?.dailyGoalOverrideMinutes ?? profile.dailyGoalMinutes)
      : 120;

  // Get exam dates to mark as rest days
  const examDates = new Set([profile.inicetDate, profile.neetDate]);

  // Pending actions queue
  const pendingActions: PlanItem[] = [];

  // 2. Identify Tasks

  // A. Overdue Reviews (Priority 1)
  const due = await getTopicsDueForReview(DUE_TOPICS_FETCH_LIMIT);
  for (const t of due) {
    pendingActions.push(
      createPlanItem(
        `rev_${t.id}_init`,
        t,
        'review',
        estimateActionDuration(t, 'review', resourceMode, customSubjectLoads),
        todayStr,
      ),
    );
  }

  const { weak, newTopics } = buildPlanBuckets({
    allTopics,
    due,
    mode,
    resourceMode,
    subjectWeights,
    liveClassStartDate:
      resourceMode === 'btr'
        ? (profile.btrStartDate ?? null)
        : (profile.dbmciClassStartDate ?? null),
  });

  // B. Weak Topics (Priority 2 - Deep Dive)
  for (const t of weak) {
    pendingActions.push({
      ...createPlanItem(
        `dive_${t.id}_init`,
        t,
        'deep_dive',
        estimateActionDuration(t, 'deep_dive', resourceMode, customSubjectLoads),
        todayStr,
      ),
    });
  }

  // 2b. Mastery status counts (for summary)
  const unseenCount = allTopics.filter(
    (t) => !isParentTopic(t) && t.progress.status === 'unseen',
  ).length;
  const seenNeedingQuizCount = allTopics.filter(
    (t) => !isParentTopic(t) && t.progress.status === 'seen' && t.progress.confidence < 1,
  ).length;
  const reviewedCount = allTopics.filter(
    (t) => !isParentTopic(t) && t.progress.status === 'reviewed',
  ).length;
  const masteredCount = allTopics.filter(
    (t) => !isParentTopic(t) && t.progress.status === 'mastered',
  ).length;

  const foundationalGapTopics = allTopics.filter((t) => {
    if (isParentTopic(t)) return false;
    if (t.progress.status === 'unseen') return false;
    return t.progress.confidence <= 1 || (t.progress.wrongCount ?? 0) >= 2 || t.progress.isNemesis;
  });

  // 2c. Backlog pressure — how many days of just-reviews are sitting in the queue
  const overdueReviewMinutes = due.reduce(
    (sum, t) => sum + estimateActionDuration(t, 'review', resourceMode, customSubjectLoads),
    0,
  );
  const overdueBacklogDays =
    dailyGoal > 0 ? Math.round((overdueReviewMinutes / dailyGoal) * 10) / 10 : 0;
  // Gate new topics when overdue backlog exceeds 4× daily capacity
  const newTopicsGated = overdueBacklogDays > 4;
  const foundationalGapMinutes = foundationalGapTopics.reduce(
    (sum, t) => sum + estimateActionDuration(t, 'deep_dive', resourceMode, customSubjectLoads),
    0,
  );
  const foundationalGapDays =
    dailyGoal > 0 ? Math.round((foundationalGapMinutes / dailyGoal) * 10) / 10 : 0;
  const foundationalGapsNeedPriority = foundationalGapDays > 2;

  // C. New Topics (Priority 3 — gated when backlog is too large)
  for (const t of newTopics) {
    pendingActions.push(
      createPlanItem(
        `new_${t.id}_init`,
        t,
        'study',
        estimateActionDuration(t, 'study', resourceMode, customSubjectLoads),
        todayStr,
      ),
    );
  }

  // Sort Pending Queue: Reviews > Deep Dives > High Yield New
  // We'll just keep them in order of insertion roughly, but let's do a strict sort for the simulation
  // actually, let's keep separate queues for the simulation to interleave

  const { queueReviews, queueDeep, queueNew } = buildTopicQueues(pendingActions);

  const totalExpectedWorkloadMinutes =
    queueReviews.reduce((sum, item) => sum + item.duration, 0) +
    queueDeep.reduce(
      (sum, item) =>
        sum +
        item.duration +
        estimateActionDuration(item.topic, 'review', resourceMode, customSubjectLoads),
      0,
    ) +
    queueNew.reduce(
      (sum, item) =>
        sum +
        item.duration +
        estimateActionDuration(item.topic, 'review', resourceMode, customSubjectLoads) * 2,
      0,
    );

  // Simulation State
  const plan: DailyPlan[] = [];
  const futureReviews: Map<number, PlanItem[]> = new Map(); // DayOffset -> Items

  const daysToPlan = Math.min(daysToExam, 60);
  const planEndDate = new Date(today);
  planEndDate.setDate(today.getDate() + daysToPlan);
  const planEndStr = planEndDate.toISOString().slice(0, 10);
  const studyDaysAvailable = Math.max(
    1,
    daysToPlan -
      Array.from(examDates).filter((date) => date >= todayStr && date <= planEndStr).length,
  );

  for (let i = 0; i < daysToPlan; i++) {
    const currentDate = new Date(today);
    currentDate.setDate(today.getDate() + i);
    const dateStr = currentDate.toISOString().slice(0, 10);

    // Check if this is an exam day - mark as rest day
    const isExamDay = examDates.has(dateStr);

    let label = dateStr;
    if (i === 0) label = 'Today';
    else if (i === 1) label = 'Tomorrow';
    else if (isExamDay)
      label = `🎯 ${currentDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })} (EXAM)`;
    else
      label = currentDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

    const dayItems: PlanItem[] = [];
    let dayMinutes = 0;

    // If exam day, don't schedule any topics - rest day
    if (isExamDay) {
      plan.push({
        date: dateStr,
        dayLabel: label,
        items: [],
        totalMinutes: 0,
        isRestDay: true,
      });
      continue;
    }

    // 1. Must-do: Future Scheduled Reviews (SRS simulation)
    const scheduledToday = futureReviews.get(i) || [];
    futureReviews.delete(i);
    for (const item of scheduledToday) {
      if (dayMinutes + item.duration <= dailyGoal * 1.2) {
        // Allow slight overflow for reviews
        dayItems.push(item);
        dayMinutes += item.duration;
      } else {
        // Push to tomorrow if absolutely full
        const tomorrow = i + 1;
        const list = futureReviews.get(tomorrow) || [];
        list.unshift(item);
        futureReviews.set(tomorrow, list);
      }
    }

    // 2. Backlog Reviews
    while (queueReviews.length > 0 && dayMinutes < dailyGoal) {
      const item = queueReviews.shift()!;
      dayItems.push(item);
      dayMinutes += item.duration;
    }

    // 3. Deep Dives (Limit 1 per day to avoid burnout, unless day is empty)
    let divesToday = 0;
    const deepDiveBudget = Math.max(
      dailyGoal,
      Math.round(
        dailyGoal * resourceProfile.deepDiveDailyBudgetMultiplier * examIntelligence.deepDiveBias,
      ),
    );
    while (queueDeep.length > 0 && dayMinutes < deepDiveBudget) {
      const diveLimit = mode === 'exam_crunch' ? 2 : 1;
      const deepThreshold = mode === 'high_yield' ? deepDiveBudget * 0.85 : deepDiveBudget * 0.7;
      if (divesToday >= diveLimit && dayMinutes > deepThreshold) break; // Balance
      const item = queueDeep.shift()!;
      dayItems.push(item);
      dayMinutes += item.duration;
      divesToday++;

      // Schedule follow-up review
      const revDay = i + 2;
      const list = futureReviews.get(revDay) || [];
      list.push(
        createPlanItem(
          `rev_${item.topic.id}_post_dive`,
          item.topic,
          'review',
          estimateActionDuration(item.topic, 'review', resourceMode, customSubjectLoads),
          todayStr,
        ),
      );
      futureReviews.set(revDay, list);
    }

    // 4. New Study
    // When the overdue backlog is large (4+ days' worth), gate new topics so we clear
    // the review pile first — on day i, allow new topics only once the overdue
    // queue has been mostly absorbed.
    const baseNewTopicBudget = Math.round(
      dailyGoal * resourceProfile.newTopicDailyBudgetMultiplier,
    );
    const newTopicBudgetMultiplier =
      mode === 'exam_crunch' ? 0.55 : mode === 'high_yield' ? 0.8 : 1;
    const backlogGateFactor = newTopicsGated
      ? Math.max(0.1, 1 - (overdueBacklogDays - 4) * 0.15) // ramp down as backlog grows
      : 1;
    const foundationalGapGateFactor = foundationalGapsNeedPriority
      ? Math.max(0.2, 1 - Math.max(0, foundationalGapDays - 2) * 0.18)
      : 1;
    const newTopicBudget =
      baseNewTopicBudget *
      newTopicBudgetMultiplier *
      examIntelligence.newTopicBias *
      backlogGateFactor *
      foundationalGapGateFactor;
    while (queueNew.length > 0 && dayMinutes < newTopicBudget) {
      const item = queueNew.shift()!;
      dayItems.push(item);
      dayMinutes += item.duration;

      // Schedule SRS reviews
      // Day + 1
      const r1 = i + 1;
      const l1 = futureReviews.get(r1) || [];
      l1.push(
        createPlanItem(
          `rev_${item.topic.id}_1`,
          item.topic,
          'review',
          estimateActionDuration(item.topic, 'review', resourceMode, customSubjectLoads),
          todayStr,
        ),
      );
      futureReviews.set(r1, l1);

      // Day + 4
      const r2 = i + 4;
      const l2 = futureReviews.get(r2) || [];
      l2.push(
        createPlanItem(
          `rev_${item.topic.id}_2`,
          item.topic,
          'review',
          estimateActionDuration(item.topic, 'review', resourceMode, customSubjectLoads),
          todayStr,
        ),
      );
      futureReviews.set(r2, l2);
    }

    plan.push({
      date: dateStr,
      dayLabel: label,
      items: dayItems,
      totalMinutes: dayMinutes,
      isRestDay: dayMinutes === 0,
    });

    // Break early if queues empty (and no future reviews pending for near future)
    if (
      queueReviews.length === 0 &&
      queueDeep.length === 0 &&
      queueNew.length === 0 &&
      futureReviews.size === 0
    ) {
      // Continue loop only to flush future reviews? No, effectively done.
      // But we might have reviews scheduled for day 60 when we are at day 5.
      // Let's just run the loop to fill the calendar.
    }
  }

  // Summary Logic
  const left = allTopics.filter((t) => t.progress.status !== 'mastered').length;

  // Total workload estimation includes the backlog + simulated reviews
  const rawRequiredMinutesPerDay =
    totalExpectedWorkloadMinutes > 0
      ? Math.ceil(totalExpectedWorkloadMinutes / Math.max(1, studyDaysAvailable))
      : 0;
  const requiredMinutesPerDay = Math.min(rawRequiredMinutesPerDay, MAX_DAILY_DISPLAY_MINUTES);
  const hoursPerDayCapped = rawRequiredMinutesPerDay > MAX_DAILY_DISPLAY_MINUTES;
  const remainingFutureReviewMinutes = Array.from(futureReviews.entries())
    .filter(([dayOffset]) => dayOffset >= daysToPlan)
    .reduce(
      (sum, [, items]) => sum + items.reduce((itemSum, item) => itemSum + item.duration, 0),
      0,
    );
  const remainingQueueMinutes =
    queueReviews.reduce((sum, item) => sum + item.duration, 0) +
    queueDeep.reduce((sum, item) => sum + item.duration, 0) +
    queueNew.reduce((sum, item) => sum + item.duration, 0) +
    remainingFutureReviewMinutes;
  const hasWorkBeyondHorizon = remainingFutureReviewMinutes > 0;
  const isFeasible = remainingQueueMinutes === 0 && rawRequiredMinutesPerDay <= dailyGoal * 1.15;

  const lastPlannedDay = [...plan].reverse().find((day) => day.totalMinutes > 0);
  const projectedFinishDate = remainingQueueMinutes > 0 ? null : (lastPlannedDay?.date ?? null);
  const projectedFinishOffset = projectedFinishDate
    ? Math.max(
        0,
        Math.ceil(
          (new Date(projectedFinishDate).getTime() - new Date(todayStr).getTime()) / MS_PER_DAY,
        ),
      )
    : 0;
  const bufferDays = Math.max(0, daysToExam - projectedFinishOffset - 1);

  let message = 'On track.';
  if (mode === 'high_yield')
    message = 'High-yield mode: prioritizing the most exam-relevant topics first.';
  if (mode === 'exam_crunch')
    message = 'Exam crunch mode: review-heavy with only the highest-yield new topics.';
  if (newTopicsGated)
    message = `Review backlog is ${overdueBacklogDays}d deep — new topics are gated until it clears. Focus on reviews first.`;
  else if (foundationalGapsNeedPriority)
    message = `Foundational gaps are ~${foundationalGapDays}d deep — plan is prioritizing weak basics before adding many new topics.`;
  else if (hoursPerDayCapped)
    message = `Impossible timeline: needs ${Number(
      (rawRequiredMinutesPerDay / 60).toFixed(1),
    )}h/day. Extend the exam date, reduce scope, or lower resource load.`;
  else if (hasWorkBeyondHorizon)
    message = `Planned work extends beyond the visible ${daysToPlan}-day horizon. Continue daily and roll forward.`;
  else if (remainingQueueMinutes > 0)
    message = `Course load exceeds the current horizon. Raise the daily goal or switch to a lighter resource profile.`;
  else if (rawRequiredMinutesPerDay > dailyGoal)
    message = `Heavy load! ${Number(
      (rawRequiredMinutesPerDay / 60).toFixed(1),
    )}h/day required with ${resourceProfile.label}.`;
  else if (projectedFinishDate)
    message = `Projected finish ${projectedFinishDate}${
      bufferDays > 0 ? ` with ${bufferDays} buffer days.` : '.'
    }`;
  else message = 'Plan looks solid. Stick to it!';

  message = `${message} ${examIntelligence.targetExam} phase: ${examIntelligence.phaseLabel}. ${examIntelligence.plannerFocus}`;

  const result = {
    plan,
    summary: {
      totalTopicsLeft: left,
      totalHoursLeft: Number((totalExpectedWorkloadMinutes / 60).toFixed(1)),
      hoursBeyondHorizon: Number((remainingFutureReviewMinutes / 60).toFixed(1)),
      targetExam: examIntelligence.targetExam,
      targetExamDate: examIntelligence.targetDate,
      daysToInicet: examIntelligence.daysToInicet,
      daysToNeetPg: examIntelligence.daysToNeetPg,
      phaseLabel: examIntelligence.phaseLabel,
      phaseFocus: examIntelligence.plannerFocus,
      daysRemaining: daysToExam,
      requiredHoursPerDay: Number((requiredMinutesPerDay / 60).toFixed(1)),
      requiredHoursPerDayRaw: Number((rawRequiredMinutesPerDay / 60).toFixed(1)),
      hoursPerDayCapped,
      feasible: isFeasible,
      hasWorkBeyondHorizon,
      message,
      projectedFinishDate,
      bufferDays,
      resourceMode,
      resourceLabel: resourceProfile.label,
      workloadAssumption: resourceProfile.workloadAssumption,
      subjectLoadHighlights: getActiveSubjectLoadHighlights(resourceMode, customSubjectLoads),
      unseenCount,
      seenNeedingQuizCount,
      reviewedCount,
      masteredCount,
      overdueBacklogDays,
      newTopicsGated,
    },
  };

  cachedPlan = result;
  lastCacheKey = cacheKey;
  return result;
}
