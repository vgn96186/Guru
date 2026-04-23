import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, InteractionManager } from 'react-native';
import { dailyLogRepository } from '../db/repositories';
import {
  getWeakestTopics,
  getTopicsDueForReview,
  markNemesisTopics,
  getHighPriorityUnseenTopics,
} from '../db/queries/topics';
import { getCompletedSessionCount, getCompletedTopicIdsBetween } from '../db/queries/sessions';
import { getTodaysExternalStudyMinutes } from '../db/queries/externalLogs';
import {
  getTodaysAgendaWithTimes,
  invalidatePlanCache,
  type TodayTask,
} from '../services/studyPlanner';
import { dbEvents, DB_EVENT_KEYS } from '../services/databaseEvents';
import { profileRepository } from '../db/repositories';
import type { TopicWithProgress } from '../types';

const RECENT_COMPLETION_WINDOW_MS = 36 * 60 * 60 * 1000; // 36h
const homeShownTopicMap = new Map<number, number>();

function isOverdueReviewTask(task: TodayTask, todayStr: string): boolean {
  if (task.type !== 'review') return false;
  const due = task.topic.progress.fsrsDue?.slice(0, 10);
  return Boolean(due && due < todayStr);
}

function rankTasksForNovelty(
  tasks: TodayTask[],
  recentlyCompletedIds: Set<number>,
  nowTs: number,
  repeatCooldownMs: number,
): TodayTask[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  if (tasks.some((task) => !(task as any)?.topic?.id)) return tasks;

  const todayStr = new Date(nowTs).toISOString().slice(0, 10);
  const scored = tasks.map((task, index) => {
    const lastShown = homeShownTopicMap.get(task.topic.id) ?? 0;
    const shownRecently = nowTs - lastShown < repeatCooldownMs;
    const completedRecently = recentlyCompletedIds.has(task.topic.id);
    const overdueReview = isOverdueReviewTask(task, todayStr);

    let score = 0;
    if (overdueReview) score += 1000; // never hide urgent reviews
    if (task.type === 'review') score += 120;
    if (task.type === 'study' && task.topic.progress.status === 'unseen') score += 80;
    if (task.type === 'deep_dive') score += 40;
    score += task.topic.inicetPriority * 8;

    if (!overdueReview && shownRecently) score -= 180;
    if (!overdueReview && completedRecently) score -= 120;

    return { task, score, index };
  });

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map((entry) => entry.task);
}

function rankWeakTopicsForNovelty(
  weak: TopicWithProgress[],
  due: TopicWithProgress[],
  recentlyCompletedIds: Set<number>,
  nowTs: number,
  repeatCooldownMs: number,
): TopicWithProgress[] {
  const dueIdSet = new Set(due.map((t) => t.id));
  const scored = weak.map((topic, index) => {
    const lastShown = homeShownTopicMap.get(topic.id) ?? 0;
    const shownRecently = nowTs - lastShown < repeatCooldownMs;
    const completedRecently = recentlyCompletedIds.has(topic.id);
    const dueBoost = dueIdSet.has(topic.id) ? 500 : 0;

    let score = 0;
    score += dueBoost;
    score += (3 - topic.progress.confidence) * 40;
    score += Math.min(40, (topic.progress.wrongCount ?? 0) * 8);
    if (topic.progress.isNemesis) score += 30;
    score += topic.inicetPriority * 8;
    if (topic.progress.status === 'unseen') score += 40;

    if (!dueIdSet.has(topic.id) && shownRecently) score -= 160;
    if (!dueIdSet.has(topic.id) && completedRecently) score -= 100;

    return { topic, score, index };
  });

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map((entry) => entry.topic);
}

function trackHomeShownTopics(weak: TopicWithProgress[], tasks: TodayTask[], nowTs: number) {
  const topWeak = weak.slice(0, 1).map((topic) => topic.id);
  const topTasks = tasks
    .slice(0, 3)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    .map((task) => (task as any)?.topic?.id)
    .filter((id): id is number => typeof id === 'number');
  [...topWeak, ...topTasks].forEach((id) => homeShownTopicMap.set(id, nowTs));
}

export function useHomeDashboardData() {
  const [weakTopics, setWeakTopics] = useState<TopicWithProgress[]>([]);
  const [dueTopics, setDueTopics] = useState<TopicWithProgress[]>([]);
  const [todayTasks, setTodayTasks] = useState<TodayTask[]>([]);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoadError(null);
      setIsLoading(true);
    }
    try {
      // Skip expensive nemesis recalculation on silent (background) reloads
      if (!options?.silent) {
        await markNemesisTopics();
      }
      const nowTs = Date.now();
      let noveltyCooldownHours = 6;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
        const maybeProfile = await (profileRepository as any)?.getProfile?.();
        if (maybeProfile?.homeNoveltyCooldownHours != null) {
          noveltyCooldownHours = Math.min(24, Math.max(1, maybeProfile.homeNoveltyCooldownHours));
        }
      } catch {
        noveltyCooldownHours = 6;
      }
      const repeatCooldownMs = noveltyCooldownHours * 60 * 60 * 1000;
      const recentStart = nowTs - RECENT_COMPLETION_WINDOW_MS;
      const getCompletedTopicIdsBetweenSafe = getCompletedTopicIdsBetween as unknown as
        | ((startTs: number, endTs?: number) => Promise<number[]>)
        | undefined;

      const [weak, due, recentCompletedTopicIds] = await Promise.all([
        getWeakestTopics(6),
        getTopicsDueForReview(8),
        getCompletedTopicIdsBetweenSafe
          ? getCompletedTopicIdsBetweenSafe(recentStart)
          : Promise.resolve([]),
      ]);
      const recentCompletedSet = new Set(recentCompletedTopicIds);

      let displayedWeak: TopicWithProgress[] = [];

      // Fallback: if no weak topics yet (new user), show highest-priority unseen topics
      if (weak.length === 0) {
        const unseen = await getHighPriorityUnseenTopics(6);
        const rotatedUnseen = rankWeakTopicsForNovelty(
          unseen,
          due,
          recentCompletedSet,
          nowTs,
          repeatCooldownMs,
        );
        displayedWeak = rotatedUnseen.slice(0, 3);
      } else {
        const rotatedWeak = rankWeakTopicsForNovelty(
          weak,
          due,
          recentCompletedSet,
          nowTs,
          repeatCooldownMs,
        );
        displayedWeak = rotatedWeak.slice(0, 3);
      }

      invalidatePlanCache();
      const tasks = await getTodaysAgendaWithTimes();
      const rotatedTasks = rankTasksForNovelty(tasks, recentCompletedSet, nowTs, repeatCooldownMs);

      // ── Stabilise state: skip updates when data hasn't actually changed ──
      // This prevents the "DO THIS NOW" / "UP NEXT" cards from jittering on
      // every silent focus-reload by avoiding new array references.
      setWeakTopics((prev) => {
        const ids = displayedWeak.map((t) => t.id).join(',');
        return prev.map((t) => t.id).join(',') === ids ? prev : displayedWeak;
      });
      setDueTopics((prev) => {
        const ids = due.map((t) => t.id).join(',');
        return prev.map((t) => t.id).join(',') === ids ? prev : due;
      });
      setTodayTasks((prev) => {
        const ids = rotatedTasks.map((t) => t.topic.id).join(',');
        return prev.map((t) => t.topic.id).join(',') === ids ? prev : rotatedTasks;
      });
      trackHomeShownTopics(displayedWeak, rotatedTasks, nowTs);

      setCompletedSessions(await getCompletedSessionCount());
      const [log, externalMinutes] = await Promise.all([
        dailyLogRepository.getDailyLog(),
        getTodaysExternalStudyMinutes(),
      ]);
      const nextMinutes = (log?.totalMinutes ?? 0) + externalMinutes;
      setTodayMinutes((prev) => (prev === nextMinutes ? prev : nextMinutes));
    } catch (err: unknown) {
      console.error('[Home] Failed to load initial data:', err);
      const message =
        (err instanceof Error ? err.message : String(err)) ??
        'Unable to load home data. Please try again.';
      if (!options?.silent) {
        setLoadError(message);
        Alert.alert('Load Failed', message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void reload();
    });

    return () => {
      task.cancel();
    };
  }, [reload]);

  // Auto-refresh when progress or profile changes (e.g. after a session, settings save)
  useEffect(() => {
    const onDataChanged = () => {
      // Debounce: collapse rapid successive events into one reload after 500ms
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => {
        retryTimer.current = null;
        void reload({ silent: true });
      }, 500);
    };

    dbEvents.on(DB_EVENT_KEYS.PROGRESS_UPDATED, onDataChanged);
    dbEvents.on(DB_EVENT_KEYS.PROFILE_UPDATED, onDataChanged);
    dbEvents.on(DB_EVENT_KEYS.LECTURE_SAVED, onDataChanged);

    return () => {
      dbEvents.off(DB_EVENT_KEYS.PROGRESS_UPDATED, onDataChanged);
      dbEvents.off(DB_EVENT_KEYS.PROFILE_UPDATED, onDataChanged);
      dbEvents.off(DB_EVENT_KEYS.LECTURE_SAVED, onDataChanged);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [reload]);

  return {
    weakTopics,
    dueTopics,
    todayTasks,
    todayMinutes,
    completedSessions,
    isLoading,
    loadError,
    reload,
  };
}
