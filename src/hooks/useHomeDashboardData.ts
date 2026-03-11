import { useCallback, useEffect, useState } from 'react';
import { Alert, InteractionManager } from 'react-native';
import { getDailyLog } from '../db/queries/progress';
import { getWeakestTopics, getTopicsDueForReview, markNemesisTopics } from '../db/queries/topics';
import { getCompletedSessionCount } from '../db/queries/sessions';
import { getTodaysAgendaWithTimes, type TodayTask } from '../services/studyPlanner';
import type { TopicWithProgress } from '../types';

interface UseHomeDashboardDataParams {
  refreshProfile: () => void | Promise<void>;
}

export function useHomeDashboardData({ refreshProfile }: UseHomeDashboardDataParams) {
  const [weakTopics, setWeakTopics] = useState<TopicWithProgress[]>([]);
  const [dueTopics, setDueTopics] = useState<TopicWithProgress[]>([]);
  const [todayTasks, setTodayTasks] = useState<TodayTask[]>([]);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      await refreshProfile();
      markNemesisTopics();
      // Yield between sync DB calls to avoid long JS thread stalls.
      setWeakTopics(getWeakestTopics(3));
      await new Promise(resolve => setTimeout(resolve, 0));
      setDueTopics(getTopicsDueForReview(5));
      await new Promise(resolve => setTimeout(resolve, 0));
      setTodayTasks(getTodaysAgendaWithTimes().slice(0, 2));
      setCompletedSessions(getCompletedSessionCount());
      const log = getDailyLog();
      setTodayMinutes(log?.totalMinutes ?? 0);
    } catch (err: any) {
      console.error('[Home] Failed to load initial data:', err);
      Alert.alert('Load Failed', err?.message ?? 'Unable to load home data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [refreshProfile]);

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
    reload,
  };
}
