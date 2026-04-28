import { useCallback, useState } from 'react';
import { InteractionManager } from 'react-native';
import { useFocusEffect, type NavigationProp } from '@react-navigation/native';
import {
  generateStudyPlan,
  type DailyPlan,
  type StudyPlanSummary,
  type PlanMode,
} from '../../../services/studyPlanner';
import type { TabParamList, HomeStackParamList } from '../../../navigation/types';
import { navigationRef } from '../../../navigation/navigationRef';
import { showToast } from '../../../components/Toast';
import { useProfileQuery, useProfileActions } from '../../../hooks/queries/useProfile';
import { MS_PER_DAY } from '../../../constants/time';
import { getCompletedTopicIdsBetween } from '../../../db/queries/sessions';
import { getTopicsDueForReview, getAllTopicsWithProgress } from '../../../db/queries/topics';
import type { TopicWithProgress } from '../../../types';
import { MenuNav } from '../../../navigation/typedHooks';

const OVERDUE_FETCH_LIMIT = 2000;
const MISSED_PREVIEW_LIMIT = 8;

export function useStudyPlanController() {
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
  const [capacityOverrideMinutes, setCapacityOverrideMinutes] = useState<number | null>(null);
  const { data: profile } = useProfileQuery();
  const { setStudyResourceMode } = useProfileActions();
  const resourceMode = profile?.studyResourceMode ?? 'hybrid';

  const refreshPlan = useCallback(async () => {
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
  }, [planMode, resourceMode, capacityOverrideMinutes, profile?.examType]);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        void refreshPlan();
      });
      return () => task.cancel();
    }, [refreshPlan]),
  );

  const navigateToSession = useCallback(
    (params: HomeStackParamList['Session']) => {
      try {
        if (navigationRef.isReady()) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (navigationRef as any).navigate('Tabs', {
            screen: 'HomeTab',
            params: { screen: 'Session', params },
          });
          return;
        }
        navigation.getParent<NavigationProp<TabParamList>>()?.navigate('HomeTab', {
          screen: 'Session',
          params,
        });
      } catch (err) {
        console.error('[StudyPlan] Navigation to Session failed:', err);
        showToast('Could not start session. Try again.', 'error');
      }
    },
    [navigation],
  );

  const handleStartPlannedTopic = useCallback(
    (day: DailyPlan, index: number) => {
      const item = day.items[index];
      if (!item) return;
      navigateToSession({
        mood: item.type === 'deep_dive' ? 'energetic' : 'good',
        ...(item.type === 'deep_dive' ? { mode: 'deep' } : {}),
        focusTopicId: item.topic.id,
        preferredActionType: item.type,
        forcedMinutes: item.duration,
      });
    },
    [navigateToSession],
  );

  const handleStartTopicSet = useCallback(
    (topics: TopicWithProgress[], actionType: 'study' | 'review' | 'deep_dive') => {
      const ids = topics.slice(0, actionType === 'review' ? 4 : 3).map((topic) => topic.id);
      if (ids.length === 0) return;
      navigateToSession({
        mood: actionType === 'deep_dive' ? 'energetic' : 'good',
        ...(actionType === 'deep_dive' ? { mode: 'deep' } : {}),
        focusTopicIds: ids,
        preferredActionType: actionType,
      });
    },
    [navigateToSession],
  );

  return {
    plan,
    summary,
    planMode,
    setPlanMode,
    completedTodayIds,
    completedWeekIds,
    missedTopics,
    missedTotalCount,
    allTopics,
    isLoading,
    loadError,
    capacityOverrideMinutes,
    setCapacityOverrideMinutes,
    resourceMode,
    setStudyResourceMode,
    refreshPlan,
    handleStartPlannedTopic,
    handleStartTopicSet,
    profile,
  };
}
