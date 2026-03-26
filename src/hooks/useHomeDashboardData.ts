import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, InteractionManager } from 'react-native';
import { dailyLogRepository } from '../db/repositories';
import {
  getWeakestTopics,
  getTopicsDueForReview,
  markNemesisTopics,
  getHighPriorityUnseenTopics,
} from '../db/queries/topics';
import { getCompletedSessionCount } from '../db/queries/sessions';
import { getTodaysExternalStudyMinutes } from '../db/queries/externalLogs';
import { getTodaysAgendaWithTimes, invalidatePlanCache, type TodayTask } from '../services/studyPlanner';
import { dbEvents, DB_EVENT_KEYS } from '../services/databaseEvents';
import type { TopicWithProgress } from '../types';

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
      const [weak, due] = await Promise.all([getWeakestTopics(3), getTopicsDueForReview(5)]);

      // Fallback: if no weak topics yet (new user), show highest-priority unseen topics
      if (weak.length === 0) {
        const unseen = await getHighPriorityUnseenTopics(3);
        setWeakTopics(unseen);
      } else {
        setWeakTopics(weak);
      }
      setDueTopics(due);

      invalidatePlanCache();
      const tasks = await getTodaysAgendaWithTimes();
      setTodayTasks(tasks);

      setCompletedSessions(await getCompletedSessionCount());
      const [log, externalMinutes] = await Promise.all([
        dailyLogRepository.getDailyLog(),
        getTodaysExternalStudyMinutes(),
      ]);
      setTodayMinutes((log?.totalMinutes ?? 0) + externalMinutes);
    } catch (err: any) {
      console.error('[Home] Failed to load initial data:', err);
      const message = err?.message ?? 'Unable to load home data. Please try again.';
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
