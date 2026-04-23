import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Animated, Easing } from 'react-native';
import { useIsFocused, type NavigationProp } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { SyllabusNav } from '../../../navigation/typedHooks';
import type { TabParamList } from '../../../navigation/types';
import {
  getTopicsBySubject,
  updateTopicNotes,
  updateTopicProgress,
} from '../../../db/queries/topics';
import {
  getGeneratedStudyImagesForContext,
  type GeneratedStudyImageRecord,
  type GeneratedStudyImageStyle,
} from '../../../db/queries/generatedStudyImages';
import { generateStudyImage } from '../../../services/studyImageService';
import { showInfo, showError, confirmDestructive } from '../../../components/dialogService';
import { useHapticNotification } from '../../../hooks/useButtonFeedback';
import { motion } from '../../../motion/presets';
import type { TopicWithProgress } from '../../../types';
import { TopicFilter } from '../logic/topicDetailLogic';

export function useTopicDetailController() {
  const route = SyllabusNav.useRoute<'TopicDetail'>();
  const navigation = SyllabusNav.useNav<'TopicDetail'>();
  const isFocused = useIsFocused();
  const { subjectId, subjectName, initialTopicId, initialSearchQuery } = route.params;
  const [allTopics, setAllTopics] = useState<TopicWithProgress[]>([]);
  const [displayTopics, setDisplayTopics] = useState<TopicWithProgress[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [collapsedParents, setCollapsedParents] = useState<Set<number>>(new Set());
  const [noteText, setNoteText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<TopicFilter>('all');
  const [milestoneText, setMilestoneText] = useState('');
  const [noteImages, setNoteImages] = useState<Record<number, GeneratedStudyImageRecord[]>>({});
  const [imageJobKey, setImageJobKey] = useState<string | null>(null);
  const [savingNoteId, setSavingNoteId] = useState<number | null>(null);
  const [masteringTopicId, setMasteringTopicId] = useState<number | null>(null);
  const [bulkOperationLoading, setBulkOperationLoading] = useState(false);
  const hapticNotifications = useHapticNotification();

  const today = new Date().toISOString().slice(0, 10);
  const isSingleTopicView = initialTopicId != null;

  const childrenByParentId = useMemo(() => {
    const map = new Map<number | null, TopicWithProgress[]>();
    for (const topic of allTopics) {
      const key = topic.parentTopicId ?? null;
      const existing = map.get(key);
      if (existing) {
        existing.push(topic);
      } else {
        map.set(key, [topic]);
      }
    }
    return map;
  }, [allTopics]);

  const topicDepthMap = useMemo(() => {
    const byId = new Map(allTopics.map((topic) => [topic.id, topic]));
    const memo = new Map<number, number>();

    const getDepth = (topic: TopicWithProgress): number => {
      const cached = memo.get(topic.id);
      if (cached != null) return cached;
      if (!topic.parentTopicId) {
        memo.set(topic.id, 0);
        return 0;
      }
      const parent = byId.get(topic.parentTopicId);
      const depth = parent ? getDepth(parent) + 1 : 0;
      memo.set(topic.id, depth);
      return depth;
    };

    for (const topic of allTopics) {
      getDepth(topic);
    }
    return memo;
  }, [allTopics]);

  useEffect(() => {
    if (isFocused) {
      void getTopicsBySubject(subjectId).then(setAllTopics);
    }
  }, [isFocused, subjectId, subjectName]);

  useEffect(() => {
    if (!isFocused) return;
    if (initialSearchQuery && !isSingleTopicView) {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery, isFocused, isSingleTopicView]);

  useEffect(() => {
    if (!isFocused || !initialTopicId || allTopics.length === 0) return;
    const topic = allTopics.find((item) => item.id === initialTopicId);
    if (!topic) return;

    if (topic.parentTopicId) {
      setCollapsedParents((prev) => {
        const next = new Set(prev);
        next.delete(topic.parentTopicId!);
        return next;
      });
    }

    setExpandedId(topic.id);
    setNoteText(topic.progress.userNotes);
    void loadTopicImages(topic.id);
  }, [allTopics, initialTopicId, isFocused]);

  const displayListTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const calculateDisplayList = useCallback(() => {
    if (isSingleTopicView) {
      const topic = allTopics.find((item) => item.id === initialTopicId);
      setDisplayTopics(topic ? [topic] : []);
      return;
    }

    const list: TopicWithProgress[] = [];
    const rootTopics = allTopics.filter(
      (topic) =>
        !topic.parentTopicId ||
        !allTopics.some((candidate) => candidate.id === topic.parentTopicId),
    );

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const todayStr = new Date().toISOString().slice(0, 10);
    const matchesTopic = (topic: TopicWithProgress) => {
      const matchesSearch =
        normalizedQuery.length === 0 || topic.name.toLowerCase().includes(normalizedQuery);
      const isDue =
        topic.progress.status !== 'unseen' &&
        !!topic.progress.fsrsDue &&
        topic.progress.fsrsDue.slice(0, 10) <= todayStr;
      const isWeak =
        topic.progress.timesStudied > 0 &&
        topic.progress.confidence > 0 &&
        topic.progress.confidence < 3;
      const isHighYield = topic.inicetPriority >= 8;
      const hasNotes = topic.progress.userNotes.trim().length > 0;

      if (!matchesSearch) return false;

      switch (activeFilter) {
        case 'due':
          return isDue;
        case 'unseen':
          return topic.progress.status === 'unseen';
        case 'weak':
          return isWeak;
        case 'high_yield':
          return isHighYield;
        case 'notes':
          return hasNotes;
        case 'all':
        default:
          return true;
      }
    };

    const flattenVisible = (topic: TopicWithProgress): TopicWithProgress[] => {
      const children = childrenByParentId.get(topic.id) ?? [];
      const flattenedChildren: TopicWithProgress[] = [];
      let hasVisibleDescendant = false;

      for (const child of children) {
        const flattenedChildBranch = flattenVisible(child);
        if (flattenedChildBranch.length > 0) {
          hasVisibleDescendant = true;
          flattenedChildren.push(...flattenedChildBranch);
        }
      }

      const shouldShow = matchesTopic(topic) || hasVisibleDescendant;
      if (!shouldShow) return [];

      if (collapsedParents.has(topic.id)) {
        return [topic];
      }

      return [topic, ...flattenedChildren];
    };

    for (const rootTopic of rootTopics) {
      list.push(...flattenVisible(rootTopic));
    }

    setDisplayTopics(list);
  }, [
    allTopics,
    activeFilter,
    childrenByParentId,
    collapsedParents,
    initialTopicId,
    isSingleTopicView,
    searchQuery,
  ]);

  useEffect(() => {
    if (displayListTimerRef.current) {
      clearTimeout(displayListTimerRef.current);
    }
    displayListTimerRef.current = setTimeout(() => {
      calculateDisplayList();
      displayListTimerRef.current = null;
    }, 150);

    return () => {
      if (displayListTimerRef.current) {
        clearTimeout(displayListTimerRef.current);
        displayListTimerRef.current = null;
      }
    };
  }, [calculateDisplayList]);

  async function confirmDiscardUnsavedNotes(onDiscard: () => void) {
    const ok = await confirmDestructive('Discard changes?', 'You have unsaved notes.', {
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
    });
    if (ok) {
      onDiscard();
    }
  }

  function openTopicPage(topic: TopicWithProgress) {
    navigation.push('TopicDetail', {
      subjectId,
      subjectName,
      initialTopicId: topic.id,
      initialSearchQuery: topic.name,
    });
  }

  function handleTopicPress(t: TopicWithProgress) {
    const hasChildren = allTopics.some((child) => child.parentTopicId === t.id);

    if (hasChildren) {
      setCollapsedParents((prev) => {
        const next = new Set(prev);
        if (next.has(t.id)) next.delete(t.id);
        else next.add(t.id);
        return next;
      });
    } else {
      if (expandedId === t.id) {
        const savedNote = allTopics.find((x) => x.id === expandedId)?.progress.userNotes ?? '';
        if (noteText.trim() !== savedNote.trim()) {
          confirmDiscardUnsavedNotes(() => setExpandedId(null));
        } else {
          setExpandedId(null);
        }
      } else {
        openTopicPage(t);
      }
    }
  }

  async function loadTopicImages(topicId: number) {
    try {
      const images = await getGeneratedStudyImagesForContext('topic_note', `topic:${topicId}`);
      setNoteImages((prev) => ({ ...prev, [topicId]: images }));
    } catch {
      // Ignore attachment lookup failures
    }
  }

  async function handleSaveNote(topicId: number) {
    if (savingNoteId === topicId) return;
    setSavingNoteId(topicId);
    try {
      await updateTopicNotes(topicId, noteText.trim());
      setAllTopics((prev) =>
        prev.map((t) =>
          t.id === topicId ? { ...t, progress: { ...t.progress, userNotes: noteText.trim() } } : t,
        ),
      );
      hapticNotifications.success();
      setExpandedId(null);
    } catch (error) {
      hapticNotifications.error();
      await showError(error, 'Failed to save note');
    } finally {
      setSavingNoteId(null);
    }
  }

  async function handleGenerateNoteImage(
    topic: TopicWithProgress,
    style: GeneratedStudyImageStyle,
  ) {
    const jobKey = `${topic.id}:${style}`;
    if (imageJobKey) return;

    setImageJobKey(jobKey);
    try {
      const image = await generateStudyImage({
        contextType: 'topic_note',
        contextKey: `topic:${topic.id}`,
        topicId: topic.id,
        topicName: topic.name,
        sourceText: noteText.trim() || `High-yield ${style} for ${topic.name}`,
        style,
      });
      setNoteImages((prev) => ({
        ...prev,
        [topic.id]: [image, ...(prev[topic.id] ?? [])],
      }));
      hapticNotifications.success();
    } catch (error) {
      hapticNotifications.error();
      await showError(error, 'Image generation failed');
    } finally {
      setImageJobKey(null);
    }
  }

  async function markTopicMastered(topic: TopicWithProgress) {
    if (masteringTopicId === topic.id) return;
    setMasteringTopicId(topic.id);
    try {
      await updateTopicProgress(topic.id, 'mastered', 5, 20);
      hapticNotifications.success();
      setAllTopics((prev) =>
        prev.map((t) =>
          t.id === topic.id
            ? { ...t, progress: { ...t.progress, status: 'mastered', confidence: 5 } }
            : t,
        ),
      );
      setTimeout(() => {
        setExpandedId(null);
      }, 300);
    } catch (error) {
      hapticNotifications.error();
      setMasteringTopicId(null);
      await showError(error, 'Failed to mark as mastered');
    }
  }

  const leafTopics = useMemo(
    () =>
      allTopics.filter(
        (topic) => !allTopics.some((candidate) => candidate.parentTopicId === topic.id),
      ),
    [allTopics],
  );

  const done = useMemo(
    () => leafTopics.filter((t) => t.progress.status !== 'unseen').length,
    [leafTopics],
  );
  const pct = leafTopics.length > 0 ? Math.round((done / leafTopics.length) * 100) : 0;

  const dueTopics = useMemo(
    () =>
      leafTopics.filter(
        (topic) =>
          topic.progress.status !== 'unseen' &&
          !!topic.progress.fsrsDue &&
          topic.progress.fsrsDue.slice(0, 10) <= today,
      ),
    [leafTopics, today],
  );
  const weakTopics = useMemo(
    () =>
      leafTopics.filter(
        (topic) =>
          topic.progress.timesStudied > 0 &&
          topic.progress.confidence > 0 &&
          topic.progress.confidence < 3,
      ),
    [leafTopics],
  );
  const highYieldTopics = useMemo(
    () => leafTopics.filter((topic) => topic.inicetPriority >= 8),
    [leafTopics],
  );
  const filterCounts = useMemo(() => {
    return {
      all: leafTopics.length,
      due: dueTopics.length,
      unseen: leafTopics.filter((t) => t.progress.status === 'unseen').length,
      weak: weakTopics.length,
      high_yield: highYieldTopics.length,
      notes: leafTopics.filter((t) => t.progress.userNotes.trim().length > 0).length,
    } as Record<TopicFilter, number>;
  }, [leafTopics, dueTopics.length, highYieldTopics.length, weakTopics.length]);

  const prevDoneRef = useRef(0);
  useEffect(() => {
    const previous = prevDoneRef.current;
    if (done > previous && previous > 0) {
      const delta = done - previous;
      setMilestoneText(`+${delta} micro-topic${delta > 1 ? 's' : ''} completed`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const timeout = setTimeout(() => setMilestoneText(''), 2200);
      prevDoneRef.current = done;
      return () => clearTimeout(timeout);
    }
    prevDoneRef.current = done;
  }, [done]);

  function launchBatch(topics: TopicWithProgress[], actionType: 'study' | 'review' | 'deep_dive') {
    const ids = topics.slice(0, actionType === 'review' ? 4 : 3).map((topic) => topic.id);
    if (ids.length === 0) {
      void showInfo('Nothing to study', 'There are no matching topics in this bucket yet.');
      return;
    }
    setBulkOperationLoading(true);
    navigation.getParent<NavigationProp<TabParamList>>()?.navigate('HomeTab', {
      screen: 'Session',
      params: {
        mood: actionType === 'deep_dive' ? 'energetic' : 'good',
        mode: actionType === 'deep_dive' ? 'deep' : undefined,
        focusTopicIds: ids,
        preferredActionType: actionType,
      },
    });
    setTimeout(() => setBulkOperationLoading(false), 500);
  }

  const progressAnim = useRef(new Animated.Value(0)).current;
  const countAnim = useRef(new Animated.Value(0)).current;
  const [displayCount, setDisplayCount] = useState(done);
  const prevPct = useRef(0);

  useEffect(() => {
    const increased = pct > prevPct.current;
    prevPct.current = pct;

    motion
      .to(progressAnim, {
        toValue: pct,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      })
      .start();

    motion
      .to(countAnim, {
        toValue: done,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      })
      .start();

    const listener = countAnim.addListener(({ value }) => {
      setDisplayCount(Math.round(value));
    });

    if (increased && pct > 0 && pct % 25 === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    return () => countAnim.removeListener(listener);
  }, [countAnim, done, pct, progressAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  async function refreshTopics() {
    setRefreshing(true);
    await getTopicsBySubject(subjectId).then(setAllTopics);
    setRefreshing(false);
  }

  function navigateToSession(topicId: number) {
    navigation.getParent<NavigationProp<TabParamList>>()?.navigate('HomeTab', {
      screen: 'Session',
      params: {
        mood: 'good',
        focusTopicId: topicId,
        preferredActionType: 'study',
      },
    });
  }

  return {
    subjectName,
    subjectId,
    displayTopics,
    allTopics,
    refreshing,
    refreshTopics,
    expandedId,
    setExpandedId,
    collapsedParents,
    noteText,
    setNoteText,
    searchQuery,
    setSearchQuery,
    activeFilter,
    setActiveFilter,
    milestoneText,
    noteImages,
    imageJobKey,
    savingNoteId,
    masteringTopicId,
    bulkOperationLoading,
    isSingleTopicView,
    childrenByParentId,
    topicDepthMap,
    leafTopics,
    dueTopics,
    weakTopics,
    highYieldTopics,
    filterCounts,
    done,
    pct,
    displayCount,
    progressWidth,

    handleTopicPress,
    handleSaveNote,
    handleGenerateNoteImage,
    markTopicMastered,
    launchBatch,
    confirmDiscardUnsavedNotes,
    navigateToSession,
    today,
  };
}
