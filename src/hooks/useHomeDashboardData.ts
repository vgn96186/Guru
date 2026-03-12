import { useCallback, useEffect, useState } from 'react';
import { Alert, InteractionManager } from 'react-native';
import { dailyLogRepository } from '../db/repositories';
import { getWeakestTopics, getTopicsDueForReview, markNemesisTopics } from '../db/queries/topics';
import { getCompletedSessionCount } from '../db/queries/sessions';
import { getTodaysAgendaWithTimes, type TodayTask } from '../services/studyPlanner';
import type { TopicWithProgress } from '../types';

export function useHomeDashboardData() {
  const [weakTopics, setWeakTopics] = useState<TopicWithProgress[]>([]);
  const [dueTopics, setDueTopics] = useState<TopicWithProgress[]>([]);
  const [todayTasks, setTodayTasks] = useState<TodayTask[]>([]);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      await markNemesisTopics();
      const [weak, due] = await Promise.all([getWeakestTopics(3), getTopicsDueForReview(5)]);
      setWeakTopics(weak);
      setDueTopics(due);
      setTodayTasks((await getTodaysAgendaWithTimes()).slice(0, 2));
      setCompletedSessions(await getCompletedSessionCount());
      const log = await dailyLogRepository.getDailyLog();
      setTodayMinutes(log?.totalMinutes ?? 0);
    } catch (err: any) {
      console.error('[Home] Failed to load initial data:', err);
      Alert.alert('Load Failed', err?.message ?? 'Unable to load home data. Please try again.');
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
    reload,
  };
}
