import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  TextInput,
  Animated,
  Easing,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  useRoute,
  useNavigation,
  useIsFocused,
  type NavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SyllabusStackParamList, TabParamList } from '../navigation/types';
import { getTopicsBySubject, updateTopicNotes, updateTopicProgress } from '../db/queries/topics';
import { clearTopicCache } from '../db/queries/aiCache';
import { fetchWikipediaImage } from '../services/imageService';
import type { TopicWithProgress, TopicStatus } from '../types';
import ScreenHeader from '../components/ScreenHeader';
import LinearBadge from '../components/primitives/LinearBadge';
import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';
import LinearTextInput from '../components/primitives/LinearTextInput';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { linearTheme as n } from '../theme/linearTheme';
import { MS_PER_DAY } from '../constants/time';
import * as Haptics from 'expo-haptics';
import {
  getGeneratedStudyImagesForContext,
  type GeneratedStudyImageRecord,
  type GeneratedStudyImageStyle,
} from '../db/queries/generatedStudyImages';
import { generateStudyImage } from '../services/studyImageService';
import { showInfo, showSuccess, showError, confirmDestructive } from '../components/dialogService';

function TopicImage({ topicName }: { topicName: string }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchWikipediaImage(topicName).then(setImageUrl);
  }, [topicName]);

  if (!imageUrl) return null;

  return <Image source={{ uri: imageUrl }} style={styles.topicImage} resizeMode="contain" />;
}

type Route = RouteProp<SyllabusStackParamList, 'TopicDetail'>;
type Nav = NativeStackNavigationProp<SyllabusStackParamList, 'TopicDetail'>;

const STATUS_COLORS: Record<TopicStatus, string> = {
  unseen: n.colors.textMuted,
  seen: n.colors.accent,
  reviewed: n.colors.warning,
  mastered: n.colors.success,
};

const STATUS_LABELS: Record<TopicStatus, string> = {
  unseen: 'Unseen',
  seen: 'Seen',
  reviewed: 'Reviewed',
  mastered: 'Mastered',
};

const STATUS_BADGE_VARIANTS: Record<TopicStatus, 'default' | 'accent' | 'warning' | 'success'> = {
  unseen: 'default',
  seen: 'accent',
  reviewed: 'warning',
  mastered: 'success',
};
const STATUS_ORDER: TopicStatus[] = ['unseen', 'seen', 'reviewed', 'mastered'];

type TopicFilter = 'all' | 'due' | 'unseen' | 'weak' | 'high_yield' | 'notes';

const FILTER_OPTIONS: Array<{ key: TopicFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'due', label: 'Due' },
  { key: 'unseen', label: 'Unseen' },
  { key: 'weak', label: 'Weak' },
  { key: 'high_yield', label: 'High Yield' },
  { key: 'notes', label: 'Notes' },
];

export default function TopicDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
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

  useEffect(() => {
    if (isSingleTopicView) {
      const topic = allTopics.find((item) => item.id === initialTopicId);
      setDisplayTopics(topic ? [topic] : []);
      return;
    }

    // Re-calculate display list whenever allTopics or collapsedParents change
    const list: TopicWithProgress[] = [];
    const rootTopics = allTopics.filter(
      (topic) =>
        !topic.parentTopicId ||
        !allTopics.some((candidate) => candidate.id === topic.parentTopicId),
    );

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    const matchesTopic = (topic: TopicWithProgress) => {
      const matchesSearch =
        normalizedQuery.length === 0 || topic.name.toLowerCase().includes(normalizedQuery);
      const isDue =
        topic.progress.status !== 'unseen' &&
        !!topic.progress.fsrsDue &&
        topic.progress.fsrsDue.slice(0, 10) <= today;
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
    activeFilter,
    allTopics,
    childrenByParentId,
    collapsedParents,
    initialTopicId,
    isSingleTopicView,
    searchQuery,
  ]);

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
      // Toggle collapse for parent topics
      setCollapsedParents((prev) => {
        const next = new Set(prev);
        if (next.has(t.id)) next.delete(t.id);
        else next.add(t.id);
        return next;
      });
    } else {
      // Expand notes for leaf topics
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
      // Ignore attachment lookup failures in the note editor.
    }
  }

  async function handleSaveNote(topicId: number) {
    await updateTopicNotes(topicId, noteText.trim());
    setAllTopics((prev) =>
      prev.map((t) =>
        t.id === topicId ? { ...t, progress: { ...t.progress, userNotes: noteText.trim() } } : t,
      ),
    );
    setExpandedId(null);
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
    } catch (error) {
      await showError(error, 'Image generation failed');
    } finally {
      setImageJobKey(null);
    }
  }

  async function markTopicMastered(topic: TopicWithProgress) {
    await updateTopicProgress(topic.id, 'mastered', 5, 20);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAllTopics((prev) =>
      prev.map((t) =>
        t.id === topic.id
          ? { ...t, progress: { ...t.progress, status: 'mastered', confidence: 5 } }
          : t,
      ),
    );
    setExpandedId(null);
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
    navigation.getParent<NavigationProp<TabParamList>>()?.navigate('HomeTab', {
      screen: 'Session',
      params: {
        mood: actionType === 'deep_dive' ? 'energetic' : 'good',
        mode: actionType === 'deep_dive' ? 'deep' : undefined,
        focusTopicIds: ids,
        preferredActionType: actionType,
      },
    });
  }

  // Animated progress
  const progressAnim = useRef(new Animated.Value(0)).current;
  const countAnim = useRef(new Animated.Value(0)).current;
  const [displayCount, setDisplayCount] = useState(done);
  const prevPct = useRef(0);

  useEffect(() => {
    const increased = pct > prevPct.current;
    prevPct.current = pct;

    Animated.timing(progressAnim, {
      toValue: pct,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    Animated.timing(countAnim, {
      toValue: done,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

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

  // Format review date
  const formatReviewDate = (dateStr: string | null): string => {
    if (!dateStr) return '';
    const today = new Date().toISOString().slice(0, 10);
    if (dateStr === today) return 'Review today';
    const tomorrow = new Date(Date.now() + MS_PER_DAY).toISOString().slice(0, 10);
    if (dateStr === tomorrow) return 'Review tomorrow';
    if (dateStr < today) return 'Overdue for review!';
    const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / MS_PER_DAY);
    return `Review in ${days} days`;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer>
        <ScreenHeader
          title={subjectName}
          titleNumberOfLines={1}
          containerStyle={styles.screenHeader}
          titleStyle={styles.screenHeaderTitle}
        >
          <View style={styles.headerCenter}>
            <View style={styles.progressRow}>
              <LinearText variant="caption" tone="secondary" style={styles.subtitle}>
                {displayCount}/{leafTopics.length} micro-topics
              </LinearText>
              <View
                style={[
                  styles.pctBadge,
                  pct >= 50 && styles.pctBadgeGood,
                  pct === 100 && styles.pctBadgeComplete,
                ]}
              >
                <LinearText
                  variant="caption"
                  style={[
                    styles.pctText,
                    pct >= 50 && { color: n.colors.success },
                    pct === 100 && { color: n.colors.warning },
                  ]}
                >
                  {pct}%
                </LinearText>
              </View>
            </View>
            {milestoneText ? (
              <LinearText variant="caption" tone="success" style={styles.milestoneText}>
                {milestoneText}
              </LinearText>
            ) : null}
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
            </View>
          </View>
        </ScreenHeader>

        <View style={styles.controls}>
          {isSingleTopicView ? (
            <LinearSurface compact style={styles.singleTopicBanner}>
              <LinearText variant="label" style={styles.singleTopicBannerTitle}>
                Topic page
              </LinearText>
              <LinearText variant="bodySmall" tone="secondary" style={styles.singleTopicBannerText}>
                Start a focused session for this topic or add notes below.
              </LinearText>
            </LinearSurface>
          ) : (
            <>
              <LinearTextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search topics in this subject..."
                containerStyle={styles.searchInputContainer}
                style={styles.searchInput}
                leftIcon={<Ionicons name="search-outline" size={16} color={n.colors.textMuted} />}
              />
              <View style={styles.filterRow}>
                {FILTER_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    style={[
                      styles.filterChip,
                      activeFilter === option.key && styles.filterChipActive,
                    ]}
                    onPress={() => setActiveFilter(option.key)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Filter: ${option.label} ${filterCounts[option.key]}`}
                    accessibilityState={{ selected: activeFilter === option.key }}
                  >
                    <LinearText
                      variant="chip"
                      style={[
                        styles.filterChipText,
                        activeFilter === option.key && styles.filterChipTextActive,
                      ]}
                    >
                      {option.label} {filterCounts[option.key]}
                    </LinearText>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.bulkRow}>
                <TouchableOpacity
                  style={[styles.bulkChip, styles.bulkDueChip]}
                  onPress={() => launchBatch(dueTopics, 'review')}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Review all due topics"
                >
                  <LinearText variant="chip" style={styles.bulkChipText}>
                    Review all due
                  </LinearText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bulkChip, styles.bulkHighYieldChip]}
                  onPress={() => launchBatch(highYieldTopics, 'study')}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Study high yield topics"
                >
                  <LinearText variant="chip" style={styles.bulkChipText}>
                    Study high yield
                  </LinearText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bulkChip, styles.bulkWeakChip]}
                  onPress={() => launchBatch(weakTopics, 'deep_dive')}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Review weak topics only"
                >
                  <LinearText variant="chip" style={styles.bulkChipText}>
                    Review weak only
                  </LinearText>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {!isSingleTopicView ? (
          <View style={styles.legend}>
            {STATUS_ORDER.map((status) => (
              <LinearBadge
                key={status}
                label={STATUS_LABELS[status]}
                variant={STATUS_BADGE_VARIANTS[status]}
                style={styles.legendBadge}
              />
            ))}
          </View>
        ) : null}

        <FlatList
          data={displayTopics}
          keyExtractor={(t) => t.id.toString()}
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          onRefresh={async () => {
            setRefreshing(true);
            await getTopicsBySubject(subjectId).then(setAllTopics);
            setRefreshing(false);
          }}
          refreshing={refreshing}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <LinearText variant="sectionTitle" centered style={styles.emptyText}>
                No topics match this view
              </LinearText>
            </View>
          }
          renderItem={({ item }) => {
            const isParent = (childrenByParentId.get(item.id)?.length ?? 0) > 0;
            const depth = topicDepthMap.get(item.id) ?? 0;
            const isCollapsed = collapsedParents.has(item.id);
            const isHighYield = item.inicetPriority >= 8;
            const isDue =
              item.progress.status !== 'unseen' &&
              !!item.progress.fsrsDue &&
              item.progress.fsrsDue.slice(0, 10) <= new Date().toISOString().slice(0, 10);
            const isWeak =
              item.progress.timesStudied > 0 &&
              item.progress.confidence > 0 &&
              item.progress.confidence < 3;
            const parentChildren = childrenByParentId.get(item.id) ?? [];
            const parentCompleted = parentChildren.filter(
              (child) => child.progress.status !== 'unseen',
            ).length;
            const parentDue = parentChildren.filter(
              (child) =>
                child.progress.status !== 'unseen' &&
                !!child.progress.fsrsDue &&
                child.progress.fsrsDue.slice(0, 10) <= today,
            ).length;
            const parentHighYield = parentChildren.filter(
              (child) => child.inicetPriority >= 8,
            ).length;

            return (
              <View>
                <TouchableOpacity
                  onPress={() => handleTopicPress(item)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={isParent ? `Topic group: ${item.name}` : item.name}
                  accessibilityHint={
                    isParent ? 'Double tap to expand or collapse' : 'Double tap to open topic'
                  }
                >
                  <LinearSurface
                    compact
                    padded={false}
                    style={[
                      styles.topicRow,
                      isParent && styles.parentRow,
                      depth > 0 && { marginLeft: Math.min(depth * 12, 48) },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusBar,
                        { backgroundColor: STATUS_COLORS[item.progress.status] },
                      ]}
                    />
                    <View style={styles.topicInfo}>
                      <View style={styles.nameRow}>
                        {isParent ? (
                          <Ionicons
                            name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
                            size={14}
                            color={n.colors.accent}
                            style={styles.folderIcon}
                          />
                        ) : null}
                        <LinearText
                          variant={isParent ? 'label' : 'body'}
                          style={[styles.topicName, isParent && styles.parentName]}
                          numberOfLines={3}
                          ellipsizeMode="tail"
                        >
                          {item.name}
                        </LinearText>
                      </View>
                      {isParent && parentChildren.length > 0 ? (
                        <View style={styles.parentSummaryRow}>
                          <LinearText variant="caption" style={styles.parentSummaryText}>
                            {parentCompleted}/{parentChildren.length} micro-topics covered
                          </LinearText>
                          {parentDue > 0 ? (
                            <LinearText variant="caption" style={styles.parentDueText}>
                              {parentDue} due
                            </LinearText>
                          ) : null}
                          {parentHighYield > 0 ? (
                            <LinearText variant="caption" style={styles.parentHighYieldText}>
                              {parentHighYield} HY
                            </LinearText>
                          ) : null}
                        </View>
                      ) : null}
                      {!isParent ? (
                        <View style={styles.topicMeta}>
                          <LinearText variant="caption" style={styles.topicMetaText}>
                            {item.estimatedMinutes}min - Priority {item.inicetPriority}/10
                          </LinearText>
                          {item.progress.timesStudied > 0 ? (
                            <LinearText variant="caption" style={styles.studiedText}>
                              {' '}
                              - Studied {item.progress.timesStudied}x
                            </LinearText>
                          ) : null}
                        </View>
                      ) : null}
                      {!isParent ? (
                        <View style={styles.badgeRow}>
                          {isHighYield ? (
                            <LinearBadge label="High Yield" variant="warning" />
                          ) : null}
                          {isDue ? <LinearBadge label="Due" variant="error" /> : null}
                          {isWeak ? <LinearBadge label="Weak" variant="accent" /> : null}
                        </View>
                      ) : null}
                      {item.progress.fsrsDue && !isParent ? (
                        <View
                          style={[
                            styles.reviewBadge,
                            item.progress.fsrsDue.slice(0, 10) <
                              new Date().toISOString().slice(0, 10) && styles.reviewOverdue,
                          ]}
                        >
                          <LinearText
                            variant="caption"
                            style={[
                              styles.reviewText,
                              item.progress.fsrsDue.slice(0, 10) <
                                new Date().toISOString().slice(0, 10) && styles.reviewTextOverdue,
                            ]}
                          >
                            {formatReviewDate(item.progress.fsrsDue.slice(0, 10))}
                          </LinearText>
                        </View>
                      ) : null}
                      {item.progress.userNotes ? (
                        <LinearText
                          variant="bodySmall"
                          tone="accent"
                          style={styles.notePreview}
                          numberOfLines={3}
                        >
                          Notes: {item.progress.userNotes}
                        </LinearText>
                      ) : null}
                    </View>
                    <View style={styles.topicRight}>
                      {item.progress.confidence > 0 ? (
                        <View
                          style={styles.confRow}
                          accessibilityLabel={`Confidence: ${item.progress.confidence} of 5`}
                          accessibilityRole="text"
                        >
                          <LinearText variant="meta" style={styles.confLabel}>
                            {item.progress.confidence}/5
                          </LinearText>
                          {[1, 2, 3, 4, 5].map((i) => (
                            <View
                              key={i}
                              style={[
                                styles.confDot,
                                {
                                  backgroundColor:
                                    i <= item.progress.confidence
                                      ? n.colors.warning
                                      : n.colors.border,
                                },
                              ]}
                            />
                          ))}
                        </View>
                      ) : null}
                      <LinearText
                        variant="caption"
                        style={[styles.statusLabel, { color: STATUS_COLORS[item.progress.status] }]}
                      >
                        {STATUS_LABELS[item.progress.status]}
                      </LinearText>
                    </View>
                  </LinearSurface>
                </TouchableOpacity>
                {expandedId === item.id && (
                  <LinearSurface padded={false} style={styles.notesExpanded}>
                    <View style={styles.notesExpandedContent}>
                      <TopicImage topicName={item.name} />
                      <TouchableOpacity
                        style={styles.studyNowBtn}
                        onPress={() => {
                          navigation
                            .getParent<NavigationProp<TabParamList>>()
                            ?.navigate('HomeTab', {
                              screen: 'Session',
                              params: {
                                mood: 'good',
                                focusTopicId: item.id,
                                preferredActionType: 'study',
                              },
                            });
                        }}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="Study this topic now"
                      >
                        <LinearText variant="label" tone="inverse" style={styles.studyNowText}>
                          Start focused session
                        </LinearText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.studyNowBtn, styles.masteredBtn]}
                        onPress={() => markTopicMastered(item)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="Mark topic as mastered"
                      >
                        <LinearText variant="label" tone="inverse" style={styles.studyNowText}>
                          Mark as mastered
                        </LinearText>
                      </TouchableOpacity>
                      <LinearText variant="label" tone="accent" style={styles.notesLabel}>
                        Your Notes / Mnemonic
                      </LinearText>
                      <TextInput
                        style={styles.notesInput}
                        value={noteText}
                        onChangeText={setNoteText}
                        placeholder="Write your own notes..."
                        placeholderTextColor={n.colors.textMuted}
                        multiline
                        autoFocus
                      />
                      <View style={styles.imageActionRow}>
                        {(['illustration', 'chart'] as GeneratedStudyImageStyle[]).map((style) => {
                          const isGenerating = imageJobKey === `${item.id}:${style}`;
                          return (
                            <TouchableOpacity
                              key={`${item.id}-${style}`}
                              style={[
                                styles.imageActionBtn,
                                isGenerating && styles.imageActionBtnBusy,
                              ]}
                              onPress={() => handleGenerateNoteImage(item, style)}
                              disabled={!!imageJobKey}
                              accessibilityRole="button"
                              accessibilityLabel={
                                style === 'illustration'
                                  ? 'Generate note illustration'
                                  : 'Generate note chart'
                              }
                            >
                              <LinearText
                                variant="label"
                                tone="accent"
                                style={styles.imageActionBtnText}
                              >
                                {isGenerating
                                  ? 'Generating...'
                                  : style === 'illustration'
                                  ? 'Illustration'
                                  : 'Chart'}
                              </LinearText>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {(noteImages[item.id] ?? []).length > 0 ? (
                        <View style={styles.noteImagesWrap}>
                          {(noteImages[item.id] ?? []).map((image) => (
                            <Image
                              key={`topic-note-image-${image.id}`}
                              source={{ uri: image.localUri }}
                              style={styles.noteGeneratedImage}
                              resizeMode="cover"
                            />
                          ))}
                        </View>
                      ) : null}
                      <View style={styles.notesActions}>
                        <TouchableOpacity
                          style={styles.notesSave}
                          onPress={() => handleSaveNote(item.id)}
                          accessibilityRole="button"
                          accessibilityLabel="Save note"
                        >
                          <LinearText variant="label" tone="inverse" style={styles.notesSaveText}>
                            Save note
                          </LinearText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.notesCancel}
                          onPress={() => {
                            const savedNote = item.progress.userNotes ?? '';
                            if (noteText.trim() !== savedNote.trim()) {
                              confirmDiscardUnsavedNotes(() => setExpandedId(null));
                            } else {
                              setExpandedId(null);
                            }
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Cancel"
                        >
                          <LinearText
                            variant="label"
                            tone="secondary"
                            style={styles.notesCancelText}
                          >
                            Cancel
                          </LinearText>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        style={[styles.notesCancel, styles.clearCacheBtn]}
                        onPress={async () => {
                          const ok = await confirmDestructive(
                            'Clear AI Cache?',
                            'This will remove cached AI content for this topic. It will be regenerated next time you study it.',
                            { confirmLabel: 'Clear' },
                          );
                          if (ok) {
                            await clearTopicCache(item.id);
                            await showSuccess(
                              'Success',
                              'AI content cache cleared for this topic.',
                            );
                          }
                        }}
                      >
                        <LinearText variant="label" tone="error" style={styles.notesCancelText}>
                          Clear AI Cache
                        </LinearText>
                      </TouchableOpacity>
                    </View>
                  </LinearSurface>
                )}
              </View>
            );
          }}
        />
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  screenHeader: { paddingHorizontal: 16, paddingTop: 20, marginBottom: 0 },
  headerCenter: { minWidth: 0 },
  screenHeaderTitle: { fontSize: 22, fontWeight: '800' },
  topicImage: {
    width: '100%',
    height: 180,
    borderRadius: n.radius.md,
    marginBottom: 12,
    backgroundColor: n.colors.card,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 8 },
  subtitle: { color: n.colors.textSecondary, fontSize: 13 },
  milestoneText: { marginBottom: 8 },
  pctBadge: {
    backgroundColor: n.colors.surfaceHover,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: n.radius.sm,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  pctBadgeGood: { backgroundColor: n.colors.successSurface, borderColor: `${n.colors.success}44` },
  pctBadgeComplete: {
    backgroundColor: `${n.colors.warning}18`,
    borderColor: `${n.colors.warning}44`,
  },
  pctText: { color: n.colors.textSecondary, fontWeight: '800', fontSize: 12 },
  progressTrack: {
    height: 4,
    backgroundColor: n.colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: n.colors.accent, borderRadius: 2 },
  controls: { paddingHorizontal: 16, gap: 10, marginBottom: 10 },
  searchInputContainer: {},
  searchInput: {
    fontSize: 14,
  },
  singleTopicBanner: {
    borderColor: n.colors.borderHighlight,
  },
  singleTopicBannerTitle: {
    marginBottom: 4,
  },
  singleTopicBannerText: {
    lineHeight: 18,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  filterChipActive: {
    backgroundColor: n.colors.primaryTintSoft,
    borderColor: `${n.colors.accent}66`,
  },
  filterChipText: { color: n.colors.textSecondary, fontSize: 12, fontWeight: '700' },
  filterChipTextActive: { color: n.colors.accent },
  bulkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bulkChip: {
    borderRadius: n.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  bulkDueChip: { backgroundColor: n.colors.errorSurface, borderColor: `${n.colors.error}44` },
  bulkHighYieldChip: {
    backgroundColor: `${n.colors.warning}18`,
    borderColor: `${n.colors.warning}44`,
  },
  bulkWeakChip: { backgroundColor: n.colors.primaryTintSoft, borderColor: `${n.colors.accent}44` },
  bulkChipText: { color: n.colors.textPrimary, fontSize: 12, fontWeight: '800' },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  legendBadge: {},
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    overflow: 'hidden',
    borderColor: n.colors.border,
  },
  parentRow: { backgroundColor: n.colors.primaryTintSoft, borderColor: `${n.colors.accent}33` },
  statusBar: { width: 4, alignSelf: 'stretch' },
  topicInfo: { flex: 1, minWidth: 0, padding: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  folderIcon: { marginRight: 4, marginTop: 1 },
  topicName: {
    color: n.colors.textPrimary,
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 21,
    flex: 1,
  },
  parentName: { fontSize: 16, fontWeight: '800', color: n.colors.accent, flex: 1 },
  parentSummaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  parentSummaryText: { color: n.colors.textSecondary, fontSize: 12, fontWeight: '700' },
  parentDueText: { color: n.colors.error, fontSize: 12, fontWeight: '800' },
  parentHighYieldText: { color: n.colors.warning, fontSize: 12, fontWeight: '800' },
  topicMeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  topicMetaText: { color: n.colors.textSecondary, fontSize: 12, lineHeight: 18 },
  studiedText: { color: n.colors.accent, fontSize: 12, lineHeight: 18 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  reviewBadge: {
    backgroundColor: n.colors.successSurface,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: n.radius.sm,
    marginTop: 6,
  },
  reviewOverdue: { backgroundColor: n.colors.errorSurface },
  reviewText: { color: n.colors.success, fontSize: 12, fontWeight: '600' },
  reviewTextOverdue: { color: n.colors.error },
  topicRight: {
    paddingTop: 12,
    paddingRight: 14,
    paddingBottom: 12,
    paddingLeft: 8,
    alignItems: 'stretch',
    minWidth: 104,
    flexShrink: 0,
  },
  confRow: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  confLabel: { color: n.colors.textMuted, fontSize: 9, fontWeight: '700', marginRight: 2 },
  confDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'right',
    alignSelf: 'flex-end',
    paddingHorizontal: 2,
  },
  notePreview: {
    color: n.colors.accent,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    fontStyle: 'italic',
  },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { color: n.colors.textPrimary },
  notesExpanded: {
    marginTop: 6,
    marginBottom: 12,
    borderColor: n.colors.borderHighlight,
  },
  notesExpandedContent: { padding: 12 },
  notesLabel: { color: n.colors.accent, fontWeight: '700', fontSize: 12, marginBottom: 8 },
  notesInput: {
    backgroundColor: n.colors.card,
    borderRadius: n.radius.md,
    padding: 12,
    color: n.colors.textPrimary,
    fontSize: 14,
    minHeight: 80,
    borderWidth: 1,
    borderColor: n.colors.border,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  imageActionRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  imageActionBtn: {
    flex: 1,
    backgroundColor: n.colors.surface,
    borderRadius: n.radius.md,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  imageActionBtnBusy: {
    opacity: 0.7,
  },
  imageActionBtnText: {
    color: n.colors.accent,
    fontWeight: '700',
    fontSize: 13,
  },
  noteImagesWrap: {
    gap: 8,
    marginBottom: 10,
  },
  noteGeneratedImage: {
    width: '100%',
    height: 220,
    borderRadius: n.radius.md,
    backgroundColor: n.colors.card,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  notesActions: { flexDirection: 'row', gap: 8 },
  notesSave: {
    flex: 1,
    backgroundColor: n.colors.accent,
    borderRadius: n.radius.md,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${n.colors.accent}66`,
  },
  notesSaveText: { color: n.colors.textInverse, fontWeight: '700', fontSize: 13 },
  notesCancel: {
    flex: 1,
    backgroundColor: n.colors.surface,
    borderRadius: n.radius.md,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  notesCancelText: { color: n.colors.textSecondary, fontWeight: '600', fontSize: 13 },
  clearCacheBtn: {
    backgroundColor: n.colors.errorSurface,
    borderColor: `${n.colors.error}44`,
    marginTop: 12,
  },
  studyNowBtn: {
    backgroundColor: n.colors.accent,
    borderRadius: n.radius.md,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: `${n.colors.accent}66`,
  },
  masteredBtn: {
    backgroundColor: n.colors.success,
    borderColor: `${n.colors.success}66`,
  },
  studyNowText: { color: n.colors.textInverse, fontWeight: '800', fontSize: 14 },
});
