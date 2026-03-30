import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  TextInput,
  Alert,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  Modal,
  ScrollView,
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
import { ResponsiveContainer } from '../hooks/useResponsive';
import { theme } from '../constants/theme';
import { MS_PER_DAY } from '../constants/time';
import * as Haptics from 'expo-haptics';
import {
  getGeneratedStudyImagesForContext,
  type GeneratedStudyImageRecord,
  type GeneratedStudyImageStyle,
} from '../db/queries/generatedStudyImages';
import { generateStudyImage } from '../services/studyImageService';

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
  unseen: theme.colors.unseen,
  seen: theme.colors.seen,
  reviewed: theme.colors.primary,
  mastered: theme.colors.mastered,
};

type TopicFilter = 'all' | 'due' | 'unseen' | 'weak' | 'high_yield' | 'notes';
type TopicSortOption = 'default' | 'name' | 'priority' | 'status';

const FILTER_OPTIONS: Array<{ key: TopicFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'due', label: 'Due' },
  { key: 'unseen', label: 'Unseen' },
  { key: 'weak', label: 'Weak' },
  { key: 'high_yield', label: 'High Yield' },
  { key: 'notes', label: 'Notes' },
];

const SORT_OPTIONS: Array<{ value: TopicSortOption; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'name', label: 'Name' },
  { value: 'priority', label: 'Priority' },
  { value: 'status', label: 'Status' },
];

const STATUS_SORT_ORDER: Record<TopicStatus, number> = {
  unseen: 0,
  seen: 1,
  reviewed: 2,
  mastered: 3,
};

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
  const [sortBy, setSortBy] = useState<TopicSortOption>('default');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [milestoneText, setMilestoneText] = useState('');
  const [noteImages, setNoteImages] = useState<Record<number, GeneratedStudyImageRecord[]>>({});
  const [imageJobKey, setImageJobKey] = useState<string | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchWidthAnim = useRef(new Animated.Value(170)).current;
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

    const compareTopics = (left: TopicWithProgress, right: TopicWithProgress): number => {
      if (sortBy === 'default') {
        return 0;
      }
      if (sortBy === 'name') {
        return left.name.localeCompare(right.name);
      }
      if (sortBy === 'priority') {
        return right.inicetPriority - left.inicetPriority || left.name.localeCompare(right.name);
      }
      return (
        STATUS_SORT_ORDER[left.progress.status] - STATUS_SORT_ORDER[right.progress.status] ||
        left.name.localeCompare(right.name)
      );
    };

    const sortTopicGroup = (topics: TopicWithProgress[]): TopicWithProgress[] =>
      sortBy === 'default' ? topics : [...topics].sort(compareTopics);

    const flattenVisible = (topic: TopicWithProgress): TopicWithProgress[] => {
      const children = sortTopicGroup(childrenByParentId.get(topic.id) ?? []);
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

    for (const rootTopic of sortTopicGroup(rootTopics)) {
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
    sortBy,
  ]);

  function confirmDiscardUnsavedNotes(onDiscard: () => void) {
    Alert.alert('Discard changes?', 'You have unsaved notes.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onDiscard },
    ]);
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
      Alert.alert(
        'Image generation failed',
        error instanceof Error ? error.message : String(error),
      );
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
  const activeFilterSummary = useMemo(() => {
    if (activeFilter === 'all') {
      return 'Filter All topics';
    }
    const label = FILTER_OPTIONS.find((option) => option.key === activeFilter)?.label ?? 'Filter';
    return `${label} ${filterCounts[activeFilter]}`;
  }, [activeFilter, filterCounts]);
  const currentSortLabel =
    SORT_OPTIONS.find((option) => option.value === sortBy)?.label ?? 'Default';

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
      Alert.alert('Nothing to study', 'There are no matching topics in this bucket yet.');
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
    Animated.timing(searchWidthAnim, {
      toValue: isSearchFocused || searchQuery.length > 0 ? 280 : 170, // Expands to approx 3 inches
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [isSearchFocused, searchQuery.length, searchWidthAnim]);

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
  }, [pct, done]);

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
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ResponsiveContainer>
        <ScreenHeader
          title={subjectName}
          titleNumberOfLines={1}
          containerStyle={styles.screenHeader}
          titleStyle={styles.screenHeaderTitle}
          rightElement={
            !isSingleTopicView ? (
              <Animated.View
                style={[
                  styles.headerSearchContainer,
                  {
                    width: searchWidthAnim,
                    backgroundColor:
                      isSearchFocused || searchQuery.length > 0
                        ? theme.colors.surface
                        : theme.colors.surfaceAlt,
                  },
                ]}
              >
                <Ionicons name="search" size={16} color={theme.colors.textMuted} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                  placeholder="Search..."
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.headerSearchInputNative}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchQuery('')}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle" size={16} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                )}
              </Animated.View>
            ) : undefined
          }
        >
          <View style={styles.headerCenter}>
            <View style={styles.progressRow}>
              <Text style={styles.subtitle}>
                {displayCount}/{leafTopics.length} micro-topics
              </Text>
              <View
                style={[
                  styles.pctBadge,
                  pct >= 50 && styles.pctBadgeGood,
                  pct === 100 && styles.pctBadgeComplete,
                ]}
              >
                <Text
                  style={[
                    styles.pctText,
                    pct >= 50 && { color: '#4CAF50' },
                    pct === 100 && { color: '#FFD700' },
                  ]}
                >
                  {pct}%
                </Text>
              </View>
            </View>
            {milestoneText ? <Text style={styles.milestoneText}>{milestoneText}</Text> : null}
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
            </View>
          </View>
        </ScreenHeader>

        <View style={styles.controls}>
          {isSingleTopicView ? (
            <View style={styles.singleTopicBanner}>
              <Text style={styles.singleTopicBannerTitle}>Topic page</Text>
              <Text style={styles.singleTopicBannerText}>
                Start a focused session for this topic or add notes below.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.quickActionsSection}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.quickActionsContent}
                >
                  <TouchableOpacity
                    style={[
                      styles.quickActionChip,
                      isSortMenuOpen && styles.quickActionChipPrimary,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Sort topics"
                    onPress={() => setIsSortMenuOpen((prev) => !prev)}
                  >
                    <Ionicons
                      name={isSortMenuOpen ? 'swap-vertical' : 'swap-vertical-outline'}
                      size={15}
                      color={
                        isSortMenuOpen ? theme.colors.primaryLight : theme.colors.textSecondary
                      }
                    />
                    <Text
                      style={[
                        styles.quickActionText,
                        isSortMenuOpen && styles.quickActionTextPrimary,
                      ]}
                    >
                      Sort <Text style={styles.quickActionValue}>{currentSortLabel}</Text>
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.quickActionChip,
                      (activeFilter !== 'all' || isFilterMenuOpen) && styles.quickActionChipPrimary,
                    ]}
                    onPress={() => setIsFilterMenuOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Filter topics"
                  >
                    <Ionicons
                      name="options-outline"
                      size={15}
                      color={
                        activeFilter !== 'all' || isFilterMenuOpen
                          ? theme.colors.primaryLight
                          : theme.colors.textSecondary
                      }
                    />
                    <Text
                      style={[
                        styles.quickActionText,
                        activeFilter !== 'all' && styles.quickActionTextPrimary,
                      ]}
                    >
                      {activeFilterSummary}
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
              {isSortMenuOpen ? (
                <View style={styles.sortSection}>
                  <View style={styles.sortMenu}>
                    {SORT_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.sortOption,
                          sortBy === option.value && styles.sortOptionActive,
                        ]}
                        onPress={() => {
                          setSortBy(option.value);
                          setIsSortMenuOpen(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.sortOptionText,
                            sortBy === option.value && styles.sortOptionTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                        {sortBy === option.value ? (
                          <Ionicons name="checkmark" size={16} color={theme.colors.primaryLight} />
                        ) : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}
              <View style={styles.bulkRow}>
                <TouchableOpacity
                  style={[styles.bulkChip, styles.bulkDueChip]}
                  onPress={() => launchBatch(dueTopics, 'review')}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Review all due topics"
                >
                  <Text style={styles.bulkChipText}>Review all due</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bulkChip, styles.bulkHighYieldChip]}
                  onPress={() => launchBatch(highYieldTopics, 'study')}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Study high yield topics"
                >
                  <Text style={styles.bulkChipText}>Study high yield</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bulkChip, styles.bulkWeakChip]}
                  onPress={() => launchBatch(weakTopics, 'deep_dive')}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Review weak topics only"
                >
                  <Text style={styles.bulkChipText}>Review weak only</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

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
              <Text style={styles.emptyText}>No topics found. 🧐</Text>
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
                  style={[
                    styles.topicRow,
                    isParent && styles.parentRow,
                    depth > 0 && { marginLeft: Math.min(depth * 12, 48) },
                  ]}
                  onPress={() => handleTopicPress(item)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={isParent ? `Topic group: ${item.name}` : item.name}
                  accessibilityHint={
                    isParent ? 'Double tap to expand or collapse' : 'Double tap to open topic'
                  }
                >
                  <View
                    style={[
                      styles.statusBar,
                      { backgroundColor: STATUS_COLORS[item.progress.status] },
                    ]}
                  />
                  <View style={styles.topicInfo}>
                    <View style={styles.nameRow}>
                      {isParent && (
                        <Text style={styles.folderIcon}>{isCollapsed ? '▶ ' : '▼ '}</Text>
                      )}
                      <Text
                        style={[styles.topicName, isParent && styles.parentName]}
                        numberOfLines={3}
                        ellipsizeMode="tail"
                      >
                        {item.name}
                      </Text>
                    </View>
                    {isParent && parentChildren.length > 0 && (
                      <View style={styles.parentSummaryRow}>
                        <Text style={styles.parentSummaryText}>
                          {parentCompleted}/{parentChildren.length} micro-topics covered
                        </Text>
                        {parentDue > 0 && <Text style={styles.parentDueText}>{parentDue} due</Text>}
                        {parentHighYield > 0 && (
                          <Text style={styles.parentHighYieldText}>{parentHighYield} HY</Text>
                        )}
                      </View>
                    )}
                    {!isParent && (
                      <View style={styles.topicMeta}>
                        <Text style={styles.topicMetaText}>
                          {item.estimatedMinutes}min · Priority {item.inicetPriority}/10
                        </Text>
                        {item.progress.timesStudied > 0 && (
                          <Text style={styles.studiedText}>
                            {' '}
                            · Studied {item.progress.timesStudied}×
                          </Text>
                        )}
                      </View>
                    )}
                    {!isParent && (
                      <View style={styles.badgeRow}>
                        {isHighYield && <Text style={styles.highYieldBadge}>HIGH YIELD</Text>}
                        {isDue && <Text style={styles.dueBadge}>DUE</Text>}
                        {isWeak && <Text style={styles.weakBadge}>WEAK</Text>}
                      </View>
                    )}
                    {/* Review date indicator */}
                    {item.progress.fsrsDue && !isParent && (
                      <View
                        style={[
                          styles.reviewBadge,
                          item.progress.fsrsDue.slice(0, 10) <
                            new Date().toISOString().slice(0, 10) && styles.reviewOverdue,
                        ]}
                      >
                        <Text
                          style={[
                            styles.reviewText,
                            item.progress.fsrsDue.slice(0, 10) <
                              new Date().toISOString().slice(0, 10) && styles.reviewTextOverdue,
                          ]}
                        >
                          {formatReviewDate(item.progress.fsrsDue.slice(0, 10))}
                        </Text>
                      </View>
                    )}
                    {item.progress.userNotes ? (
                      <Text style={styles.notePreview} numberOfLines={3}>
                        📝 {item.progress.userNotes}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.topicRight}>
                    {item.progress.confidence > 0 && (
                      <View
                        style={styles.confRow}
                        accessibilityLabel={`Confidence: ${item.progress.confidence} of 5`}
                        accessibilityRole="text"
                      >
                        <Text style={styles.confLabel}>{item.progress.confidence}/5</Text>
                        {[1, 2, 3, 4, 5].map((i) => (
                          <View
                            key={i}
                            style={[
                              styles.confDot,
                              {
                                backgroundColor:
                                  i <= item.progress.confidence
                                    ? theme.colors.warning
                                    : theme.colors.border,
                              },
                            ]}
                          />
                        ))}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
                {expandedId === item.id && (
                  <View style={styles.notesExpanded}>
                    <TopicImage topicName={item.name} />
                    <TouchableOpacity
                      style={styles.studyNowBtn}
                      onPress={() => {
                        navigation.getParent<NavigationProp<TabParamList>>()?.navigate('HomeTab', {
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
                      <Text style={styles.studyNowText}>Study this topic now →</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.studyNowBtn,
                        { backgroundColor: theme.colors.success, marginTop: 8 },
                      ]}
                      onPress={() => markTopicMastered(item)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel="Mark topic as mastered"
                    >
                      <Text style={[styles.studyNowText, { color: theme.colors.textInverse }]}>
                        Mark as Mastered ✓
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.notesLabel}>Your Notes / Mnemonic</Text>
                    <TextInput
                      style={styles.notesInput}
                      value={noteText}
                      onChangeText={setNoteText}
                      placeholder="Write your own notes..."
                      placeholderTextColor={theme.colors.textMuted}
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
                            <Text style={styles.imageActionBtnText}>
                              {isGenerating
                                ? 'Generating...'
                                : style === 'illustration'
                                  ? 'Illustration'
                                  : 'Chart'}
                            </Text>
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
                        <Text style={styles.notesSaveText}>Save Note</Text>
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
                        <Text style={styles.notesCancelText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.notesCancel,
                        { backgroundColor: theme.colors.errorSurface, marginTop: 12 },
                      ]}
                      onPress={() => {
                        Alert.alert(
                          'Clear AI Cache?',
                          'This will remove cached AI content for this topic. It will be regenerated next time you study it.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Clear',
                              style: 'destructive',
                              onPress: async () => {
                                await clearTopicCache(item.id);
                                Alert.alert('Success', 'AI content cache cleared for this topic.');
                              },
                            },
                          ],
                        );
                      }}
                    >
                      <Text style={[styles.notesCancelText, { color: theme.colors.error }]}>
                        Clear AI Cache
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
        />
        <Modal
          visible={isFilterMenuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsFilterMenuOpen(false)}
        >
          <View style={styles.sheetOverlay}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setIsFilterMenuOpen(false)} />
            <View style={styles.sheetCard}>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetHeaderCopy}>
                  <Text style={styles.sheetTitle}>Filter Topics</Text>
                  <Text style={styles.sheetSubtitle}>
                    Keep the current syllabus filters in one place.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.sheetCloseBtn}
                  onPress={() => setIsFilterMenuOpen(false)}
                >
                  <Ionicons name="close" size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.clearFiltersBtn}
                onPress={() => {
                  setActiveFilter('all');
                  setIsFilterMenuOpen(false);
                }}
              >
                <Text style={styles.clearFiltersText}>Clear filters</Text>
              </TouchableOpacity>

              <ScrollView
                style={styles.sheetScroll}
                contentContainerStyle={styles.sheetScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.sheetSection}>
                  <Text style={styles.sheetSectionTitle}>Topic focus</Text>
                  <View style={styles.sheetOptions}>
                    {FILTER_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.key}
                        style={[
                          styles.sheetOption,
                          activeFilter === option.key && styles.sheetOptionActive,
                        ]}
                        onPress={() => {
                          setActiveFilter(option.key);
                          setIsFilterMenuOpen(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.sheetOptionText,
                            activeFilter === option.key && styles.sheetOptionTextActive,
                          ]}
                        >
                          {option.label} {filterCounts[option.key]}
                        </Text>
                        <Ionicons
                          name={
                            activeFilter === option.key ? 'radio-button-on' : 'radio-button-off'
                          }
                          size={18}
                          color={
                            activeFilter === option.key
                              ? theme.colors.primaryLight
                              : theme.colors.textMuted
                          }
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  screenHeader: { padding: 16, paddingTop: 20, marginBottom: 0 },
  headerCenter: { minWidth: 0 },
  screenHeaderTitle: { fontSize: 22, fontWeight: '800' },
  topicImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#1A1A24',
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 8 },
  subtitle: { color: theme.colors.textSecondary, fontSize: 13 },
  milestoneText: { color: '#7CFFB2', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  pctBadge: {
    backgroundColor: '#2A2A38',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
  },
  pctBadgeGood: { backgroundColor: '#1A2A1A' },
  pctBadgeComplete: { backgroundColor: '#2A2A0A' },
  pctText: { color: theme.colors.textSecondary, fontWeight: '800', fontSize: 12 },
  progressTrack: { height: 4, backgroundColor: '#2A2A38', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#6C63FF', borderRadius: 2 },
  controls: { paddingHorizontal: 16, gap: 10, marginBottom: 10 },
  headerSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    minHeight: 36,
  },
  headerSearchInputNative: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    marginLeft: 8,
    paddingVertical: 0,
    minHeight: 26,
  },
  singleTopicBanner: {
    backgroundColor: '#171722',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A38',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  singleTopicBannerTitle: {
    color: '#ECE9FF',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  singleTopicBannerText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  quickActionsSection: {},
  quickActionsContent: {
    gap: 10,
    paddingRight: 4,
  },
  quickActionChip: {
    minHeight: 38,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickActionChipPrimary: {
    backgroundColor: theme.colors.primary + '14',
    borderColor: theme.colors.primary + '38',
  },
  quickActionText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  quickActionTextPrimary: {
    color: theme.colors.primaryLight,
  },
  quickActionValue: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  sortSection: {
    marginTop: -2,
  },
  sortMenu: {
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  sortOption: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sortOptionActive: {
    backgroundColor: theme.colors.primary + '12',
  },
  sortOptionText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  sortOptionTextActive: {
    color: theme.colors.primaryLight,
    fontWeight: '700',
  },
  bulkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bulkChip: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bulkDueChip: { backgroundColor: '#472129' },
  bulkHighYieldChip: { backgroundColor: '#4A3610' },
  bulkWeakChip: { backgroundColor: '#2E244C' },
  bulkChipText: { color: '#F3F4F8', fontSize: 12, fontWeight: '800' },

  list: { paddingHorizontal: 16, paddingBottom: 40 },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1A1A24',
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  parentRow: { backgroundColor: '#1E1E2E', borderLeftWidth: 0 },
  childRow: { marginLeft: 16, transform: [{ scale: 0.98 }] },
  statusBar: { width: 4, alignSelf: 'stretch' },
  topicInfo: { flex: 1, minWidth: 0, padding: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  folderIcon: { color: '#6C63FF', fontSize: 12, fontWeight: '900' },
  topicName: { color: '#fff', fontWeight: '600', fontSize: 15, lineHeight: 21, flex: 1 },
  parentName: { fontSize: 16, fontWeight: '800', color: '#6C63FF', flex: 1 },
  parentSummaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  parentSummaryText: { color: '#A3ACC2', fontSize: 12, fontWeight: '700' },
  parentDueText: { color: '#FFB6BC', fontSize: 12, fontWeight: '800' },
  parentHighYieldText: { color: '#FFD36C', fontSize: 12, fontWeight: '800' },
  topicMeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  topicMetaText: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18 },
  studiedText: { color: '#6C63FF', fontSize: 12, lineHeight: 18 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  highYieldBadge: {
    color: '#241600',
    backgroundColor: '#FFC857',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  dueBadge: {
    color: '#FFD8D8',
    backgroundColor: '#4A2026',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  weakBadge: {
    color: '#FFE3C4',
    backgroundColor: '#4A2D16',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  reviewBadge: {
    backgroundColor: '#1A2A2A',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  reviewOverdue: { backgroundColor: '#2A1A1A' },
  reviewText: { color: '#4CAF50', fontSize: 12, fontWeight: '600' },
  reviewTextOverdue: { color: '#F44336' },
  topicRight: {
    paddingTop: 12,
    paddingRight: 14,
    paddingBottom: 12,
    paddingLeft: 8,
    alignItems: 'stretch',
    minWidth: 104,
    flexShrink: 0,
  },
  confRow: { flexDirection: 'row', gap: 3, marginBottom: 4, alignItems: 'center' },
  confLabel: { color: theme.colors.textMuted, fontSize: 9, fontWeight: '700', marginRight: 2 },
  confDot: { width: 6, height: 6, borderRadius: 3 },

  notePreview: {
    color: '#6C63FF',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
    fontStyle: 'italic',
  },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetCard: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderBottomWidth: 0,
    maxHeight: '78%',
    paddingTop: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  sheetHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  sheetTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  sheetSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  sheetCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  clearFiltersBtn: {
    alignSelf: 'flex-start',
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.primary + '14',
    borderWidth: 1,
    borderColor: theme.colors.primary + '32',
  },
  clearFiltersText: {
    color: theme.colors.primaryLight,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 20,
  },
  sheetSection: {
    gap: 10,
  },
  sheetSectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  sheetOptions: {
    gap: 8,
  },
  sheetOption: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sheetOptionActive: {
    borderColor: theme.colors.primary + '50',
    backgroundColor: theme.colors.primary + '12',
  },
  sheetOptionText: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  sheetOptionTextActive: {
    color: theme.colors.primaryLight,
    fontWeight: '700',
  },
  notesExpanded: {
    backgroundColor: '#0F0F1E',
    padding: 12,
    marginTop: -2,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    borderColor: '#6C63FF44',
    borderTopWidth: 0,
  },
  notesLabel: { color: '#6C63FF', fontWeight: '700', fontSize: 12, marginBottom: 8 },
  notesInput: {
    backgroundColor: '#1A1A24',
    borderRadius: 10,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#2A2A38',
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  imageActionRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  imageActionBtn: {
    flex: 1,
    backgroundColor: '#171722',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A38',
  },
  imageActionBtnBusy: {
    opacity: 0.7,
  },
  imageActionBtnText: {
    color: '#6C63FF',
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
    borderRadius: 12,
    backgroundColor: '#1A1A24',
    borderWidth: 1,
    borderColor: '#2A2A38',
  },
  notesActions: { flexDirection: 'row', gap: 8 },
  notesSave: {
    flex: 1,
    backgroundColor: '#6C63FF',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  notesSaveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  notesCancel: {
    flex: 1,
    backgroundColor: '#2A2A38',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  notesCancelText: { color: theme.colors.textSecondary, fontWeight: '600', fontSize: 13 },
  studyNowBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  studyNowText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
