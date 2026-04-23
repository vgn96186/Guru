import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager, Animated, View } from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList, TabParamList } from '../../../navigation/types';
import { fetchExamDatesViaBrave } from '../../../services/examDateSyncService';
import { showInfo } from '../../../components/dialogService';
import { useAppStore } from '../../../store/useAppStore';
import { useSessionStore } from '../../../store/useSessionStore';
import {
  profileRepository,
  dailyLogRepository,
  dailyAgendaRepository,
} from '../../../db/repositories';
import { getDb } from '../../../db/database';
import { getSubjectById } from '../../../db/queries/topics';
import { connectToRoom } from '../../../services/deviceSyncService';
import { getTodaysAgendaWithTimes } from '../../../services/studyPlanner';
import { useHomeDashboardData } from '../../../hooks/useHomeDashboardData';
import {
  useLevelInfo,
  useProfileQuery,
  useRefreshProfile,
} from '../../../hooks/queries/useProfile';
import {
  isLeafTopicIdListValid,
  tasksToAgenda,
  normalizeAgendaForCompare,
} from '../logic/homeHelpers';
import type { Mood } from '../../../types';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

const HOME_FOCUS_RELOAD_THROTTLE_MS = 15_000;

export function useHomeDashboardController() {
  const navigation = useNavigation<Nav>();
  const tabsNavigation = navigation.getParent<NavigationProp<TabParamList>>();
  const { data: profile, isPending: isProfilePending } = useProfileQuery();
  const refreshProfile = useRefreshProfile();
  const levelInfo = useLevelInfo();
  const todayPlan = useAppStore((s) => s.todayPlan);
  const setTodayPlan = useAppStore((s) => s.setTodayPlan);

  const {
    weakTopics,
    todayTasks,
    todayMinutes,
    completedSessions,
    isLoading,
    loadError,
    reload: reloadHomeDashboard,
  } = useHomeDashboardData();

  const [mood, setMood] = useState<Mood>('good');
  const [moreExpanded, setMoreExpanded] = useState(false);
  const [sessionResumeValid, setSessionResumeValid] = useState(false);
  const [entryComplete, setEntryComplete] = useState(false);
  const [weakTopicOffset, setWeakTopicOffset] = useState(0);

  const prevWeakIdsRef = useRef<string>('');
  useEffect(() => {
    const ids = weakTopics.map((t) => t.id).join(',');
    if (ids !== prevWeakIdsRef.current) {
      prevWeakIdsRef.current = ids;
      setWeakTopicOffset(0);
    }
  }, [weakTopics]);

  const moreAnim = useRef(new Animated.Value(0)).current;
  const lastHomeFocusReloadAtRef = useRef(0);

  const openStudyPlan = useCallback(() => {
    tabsNavigation?.navigate('MenuTab', { screen: 'StudyPlan' });
  }, [tabsNavigation]);

  useFocusEffect(
    useCallback(() => {
      setEntryComplete(false);
      const task = InteractionManager.runAfterInteractions(() => {
        const now = Date.now();
        if (now - lastHomeFocusReloadAtRef.current > HOME_FOCUS_RELOAD_THROTTLE_MS) {
          lastHomeFocusReloadAtRef.current = now;
          void reloadHomeDashboard({ silent: true });
        }
        const { sessionId, sessionState } = useSessionStore.getState();
        if (sessionId && sessionState !== 'session_done') {
          getDb()
            .getFirstAsync<{ id: number }>('SELECT id FROM sessions WHERE id = ?', [sessionId])
            .then((row) => setSessionResumeValid(!!row))
            .catch(() => setSessionResumeValid(false));
        } else {
          setSessionResumeValid(false);
        }
      });
      return () => {
        task.cancel();
        setEntryComplete(false);
      };
    }, [reloadHomeDashboard]),
  );

  useEffect(() => {
    InteractionManager.runAfterInteractions(() => {
      dailyLogRepository
        .getDailyLog()
        .then((log) => setMood((log?.mood as Mood) ?? 'good'))
        .catch((err) => console.warn('[Home] Failed to load daily log:', err));

      const date = new Date().toISOString().split('T')[0];
      dailyAgendaRepository
        .getDailyAgenda(date)
        .then(async (plan) => {
          if (plan) {
            const allIds = plan.blocks.flatMap((b) => b.topicIds ?? []).filter((id) => id > 0);
            if (allIds.length > 0) {
              const db = getDb();
              const placeholders = allIds.map(() => '?').join(',');
              const rows = await db.getAllAsync<{ id: number }>(
                `SELECT id FROM topics WHERE id IN (${placeholders}) AND id NOT IN (SELECT parent_topic_id FROM topics WHERE parent_topic_id IS NOT NULL)`,
                allIds,
              );
              const validLeafIds = new Set(rows.map((r) => r.id));
              const hasInvalidTopicIds = !isLeafTopicIdListValid(allIds, validLeafIds);
              if (hasInvalidTopicIds) {
                await dailyAgendaRepository.deleteDailyAgenda(date);
              } else {
                setTodayPlan(plan);
                return;
              }
            } else {
              setTodayPlan(plan);
              return;
            }
          }
          try {
            const tasks = await getTodaysAgendaWithTimes();
            const newPlan = tasksToAgenda(tasks);
            await dailyAgendaRepository.saveDailyAgenda(date, newPlan, 'local');
            setTodayPlan(newPlan);
          } catch (e) {
            console.warn('[Home] Auto plan generation failed:', e);
          }
        })
        .catch((err) => console.warn('[Home] Failed to load daily agenda:', err));
    });
  }, [setTodayPlan]);

  const hasProfile = !!profile;
  useEffect(() => {
    if (!hasProfile) return;
    const syncedPlan = tasksToAgenda(todayTasks);
    const incoming = normalizeAgendaForCompare(syncedPlan);
    const existing = normalizeAgendaForCompare(todayPlan ?? null);
    if (incoming === existing) return;

    const date = new Date().toLocaleDateString('en-CA');
    void dailyAgendaRepository
      .saveDailyAgenda(date, syncedPlan, 'local')
      .then(() => setTodayPlan(syncedPlan))
      .catch((err) => console.warn('[Home] Failed to sync computed plan:', err));
  }, [hasProfile, setTodayPlan, todayPlan, todayTasks]);

  useEffect(() => {
    if (!profile?.syncCode) return;
    return connectToRoom(
      profile.syncCode,
      async (msg: { type: string; durationSeconds?: number; subjectId?: number }) => {
        if (msg.type === 'BREAK_STARTED')
          navigation
            .getParent()
            ?.navigate('BreakEnforcer', { durationSeconds: msg.durationSeconds });
        if (msg.type === 'LECTURE_STARTED') {
          const sub = await getSubjectById(msg.subjectId!);
          showInfo(
            'Lecture Detected',
            `Tablet started ${sub?.name || 'lecture'}. Entering Hostage Mode.`,
          ).then(() => navigation.navigate('LectureMode', { subjectId: msg.subjectId }));
        }
      },
    );
  }, [profile?.syncCode, navigation]);

  const heroCtaLabel = sessionResumeValid
    ? 'START FRESH'
    : todayTasks.length > 0
      ? 'DO NEXT TASK'
      : 'START FOCUS SPRINT';
  const heroCtaSublabel = sessionResumeValid
    ? 'New session'
    : todayTasks.length > 0
      ? todayTasks[0].topic.name
      : 'Quick guided session';

  const bootPhase = useAppStore((s) => s.bootPhase);
  const setBootPhase = useAppStore((s) => s.setBootPhase);
  const setStartButtonLayout = useAppStore((s) => s.setStartButtonLayout);
  const setStartButtonCta = useAppStore((s) => s.setStartButtonCta);
  const startButtonRef = useRef<View>(null);

  useEffect(() => {
    if (!isLoading) {
      setStartButtonCta(heroCtaLabel, heroCtaSublabel);
    }
  }, [isLoading, heroCtaLabel, heroCtaSublabel, setStartButtonCta]);

  useEffect(() => {
    if (!isLoading && bootPhase === 'calming') {
      const timer = setTimeout(() => {
        if (startButtonRef.current) {
          startButtonRef.current.measureInWindow(
            (x: number, y: number, width: number, height: number) => {
              setStartButtonLayout({ x, y, width, height });
              setBootPhase('settling');
            },
          );
        } else {
          setBootPhase('settling');
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, bootPhase, setBootPhase, setStartButtonLayout]);

  const handleRefreshExamDates = useCallback(async () => {
    try {
      const result = await fetchExamDatesViaBrave();
      const updates: { inicetDate?: string; neetDate?: string } = {};
      if (result.inicetDate && result.inicetDate !== profile?.inicetDate)
        updates.inicetDate = result.inicetDate;
      if (result.neetDate && result.neetDate !== profile?.neetDate)
        updates.neetDate = result.neetDate;
      if (Object.keys(updates).length > 0) {
        await profileRepository.updateProfile(updates);
        await refreshProfile();
      }
    } catch {
      // silent
    }
  }, [profile?.inicetDate, profile?.neetDate, refreshProfile]);

  return {
    navigation,
    tabsNavigation,
    profile,
    isProfilePending,
    levelInfo,
    weakTopics,
    todayTasks,
    todayMinutes,
    completedSessions,
    isLoading,
    loadError,
    reloadHomeDashboard,
    mood,
    moreExpanded,
    setMoreExpanded,
    sessionResumeValid,
    entryComplete,
    setEntryComplete,
    weakTopicOffset,
    setWeakTopicOffset,
    moreAnim,
    openStudyPlan,
    heroCtaLabel,
    heroCtaSublabel,
    bootPhase,
    startButtonRef,
    handleRefreshExamDates,
  };
}
