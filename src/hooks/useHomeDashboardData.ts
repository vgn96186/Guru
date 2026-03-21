import { useCallback, useEffect, useState } from 'react';
import { Alert, InteractionManager } from 'react-native';
import { dailyLogRepository } from '../db/repositories';
import { getWeakestTopics, getTopicsDueForReview, markNemesisTopics } from '../db/queries/topics';
import { getCompletedSessionCount } from '../db/queries/sessions';
import { getTodaysExternalStudyMinutes } from '../db/queries/externalLogs';
import { getTodaysAgendaWithTimes, type TodayTask } from '../services/studyPlanner';
import type { TopicWithProgress } from '../types';

export function useHomeDashboardData() {
  const [weakTopics, setWeakTopics] = useState<TopicWithProgress[]>([]);
  const [dueTopics, setDueTopics] = useState<TopicWithProgress[]>([]);
  const [todayTasks, setTodayTasks] = useState<TodayTask[]>([]);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoadError(null);
      setIsLoading(true);
    }
    try {
      await markNemesisTopics();
      const [weak, due] = await Promise.all([getWeakestTopics(3), getTopicsDueForReview(5)]);
      setWeakTopics(weak);
      setDueTopics(due);
      setTodayTasks(await getTodaysAgendaWithTimes());
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

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void reload();
    });

    return () => {
      task.cancel();
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
