import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  TextInput,
  Alert,
  Image,
  Platform,
  Pressable,
  Modal,
  ScrollView,
  InteractionManager,
} from 'react-native';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
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
import BannerSearchBar from '../components/BannerSearchBar';
import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { linearTheme as n } from '../theme/linearTheme';
import { MS_PER_DAY } from '../constants/time';
import { useAppStore } from '../store/useAppStore';
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

// ---------- Memoized list item (extracted for FlatList perf) ----------

interface TopicListItemProps {
  item: TopicWithProgress;
  isParent: boolean;
  depth: number;
  isCollapsed: boolean;
  parentChildren: TopicWithProgress[];
  isExpanded: boolean;
  noteText: string;
  today: string;
  noteImages: GeneratedStudyImageRecord[];
  imageJobKey: string | null;
  onPress: (topic: TopicWithProgress) => void;
  onSaveNote: (topicId: number) => void;
  onMarkMastered: (topic: TopicWithProgress) => void;
  onGenerateImage: (topic: TopicWithProgress, style: GeneratedStudyImageStyle) => void;
  onCancelExpand: (topic: TopicWithProgress) => void;
  onStudyNow: (topicId: number) => void;
  onClearCache: (topicId: number) => void;
  formatReviewDate: (dateStr: string | null) => string;
  onNoteTextChange: (text: string) => void;
}

const TopicListItem = React.memo(function TopicListItem({
  item,
  isParent,
  depth,
  isCollapsed,
  parentChildren,
  isExpanded,
  noteText,
  today,
  noteImages,
  imageJobKey,
  onPress,
  onSaveNote,
  onMarkMastered,
  onGenerateImage,
  onCancelExpand,
  onStudyNow,
  onClearCache,
  formatReviewDate,
  onNoteTextChange,
}: TopicListItemProps) {
  const isHighYield = item.inicetPriority >= 8;
  const isDue =
    item.progress.status !== 'unseen' &&
    !!item.progress.fsrsDue &&
    item.progress.fsrsDue.slice(0, 10) <= today;
  const isWeak =
    item.progress.timesStudied > 0 && item.progress.confidence > 0 && item.progress.confidence < 3;
  const parentCompleted = isParent
    ? parentChildren.filter((child) => child.progress.status !== 'unseen').length
    : 0;
  const parentDue = isParent
    ? parentChildren.filter(
        (child) =>
          child.progress.status !== 'unseen' &&
          !!child.progress.fsrsDue &&
          child.progress.fsrsDue.slice(0, 10) <= today,
      ).length
    : 0;
  const parentHighYield = isParent
    ? parentChildren.filter((child) => child.inicetPriority >= 8).length
    : 0;

  const depthStyle = depth > 0 ? { marginLeft: Math.min(depth * 12, 48) } : undefined;

  return (
    <View>
      <TouchableOpacity
        style={[styles.topicRow, isParent && styles.parentRow, depthStyle]}
        onPress={() => onPress(item)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={isParent ? `Topic group: ${item.name}` : item.name}
        accessibilityHint={
          isParent ? 'Double tap to expand or collapse' : 'Double tap to open topic'
        }
      >
        <View
          style={[styles.statusBar, { backgroundColor: STATUS_COLORS[item.progress.status] }]}
        />
        <View style={styles.topicInfo}>
          <View style={styles.nameRow}>
            {isParent && (
              <LinearText style={styles.folderIcon}>{isCollapsed ? '📁' : '📂'}</LinearText>
            )}
            <LinearText
              variant={isParent ? 'sectionTitle' : 'label'}
              style={[styles.topicName, isParent && styles.parentName]}
              truncate
            >
              {item.name}
            </LinearText>
          </View>
          {isParent && (
            <View style={styles.parentSummaryRow}>
              <LinearText variant="meta" tone="secondary" style={styles.parentSummaryText}>
                {parentCompleted}/{parentChildren.length} done
              </LinearText>
              {parentDue > 0 && (
                <LinearText variant="meta" style={styles.parentDueText}>
                  {parentDue} due
                </LinearText>
              )}
              {parentHighYield > 0 && (
                <LinearText variant="meta" style={styles.parentHighYieldText}>
                  {parentHighYield} HY
                </LinearText>
              )}
            </View>
          )}
          {!isParent && (
            <View style={styles.topicMeta}>
              <LinearText variant="meta" tone="muted" style={styles.topicMetaText}>
                Priority {item.inicetPriority}{' '}
              </LinearText>
              {item.progress.timesStudied > 0 && (
                <LinearText variant="meta" style={styles.studiedText}>
                  · Studied {item.progress.timesStudied}x
                </LinearText>
              )}
            </View>
          )}
          {!isParent && item.progress.userNotes.trim().length > 0 && (
            <LinearText variant="meta" tone="accent" style={styles.notePreview} truncate>
              📝 {item.progress.userNotes.trim()}
            </LinearText>
          )}
          {!isParent && (
            <View style={styles.badgeRow}>
              {isHighYield && (
                <LinearText variant="chip" style={styles.highYieldBadge}>
                  HY
                </LinearText>
              )}
              {isDue && (
                <LinearText variant="chip" style={styles.dueBadge}>
                  DUE
                </LinearText>
              )}
              {isWeak && (
                <LinearText variant="chip" style={styles.weakBadge}>
                  WEAK
                </LinearText>
              )}
            </View>
          )}
          {!isParent && item.progress.status !== 'unseen' && (
            <View style={[styles.reviewBadge, isDue && styles.reviewOverdue]}>
              <LinearText
                variant="meta"
                style={[styles.reviewText, isDue && styles.reviewTextOverdue]}
              >
                {formatReviewDate(item.progress.fsrsDue)}
              </LinearText>
            </View>
          )}
        </View>
        <View style={styles.topicRight}>
          {!isParent && (
            <View style={styles.confRow}>
              <LinearText variant="meta" tone="muted" style={styles.confLabel}>
                CONF
              </LinearText>
              {[1, 2, 3, 4, 5].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.confDot,
                    {
                      backgroundColor:
                        i <= item.progress.confidence
                          ? STATUS_COLORS[item.progress.status]
                          : n.colors.border,
                    },
                  ]}
                />
              ))}
            </View>
          )}
          <Ionicons
            name={isParent ? (isCollapsed ? 'chevron-down' : 'chevron-up') : 'chevron-forward'}
            size={18}
            color={n.colors.textMuted}
            style={{ alignSelf: 'flex-end', marginTop: isParent ? 0 : 4 }}
          />
        </View>
      </TouchableOpacity>
      {isExpanded && (
        <View style={styles.notesExpanded}>
          <TopicImage topicName={item.name} />
          <TouchableOpacity
            style={styles.studyNowBtn}
            onPress={() => onStudyNow(item.id)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Study this topic now"
          >
            <LinearText style={styles.studyNowText}>Study this topic now →</LinearText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.studyNowBtn, { backgroundColor: n.colors.success, marginTop: 8 }]}
            onPress={() => onMarkMastered(item)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Mark topic as mastered"
          >
            <LinearText style={[styles.studyNowText, { color: n.colors.textInverse }]}>
              Mark as Mastered ✓
            </LinearText>
          </TouchableOpacity>
          <LinearText style={styles.notesLabel}>Your Notes / Mnemonic</LinearText>
          <TextInput
            style={styles.notesInput}
            value={noteText}
            onChangeText={onNoteTextChange}
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
                  style={[styles.imageActionBtn, isGenerating && styles.imageActionBtnBusy]}
                  onPress={() => onGenerateImage(item, style)}
                  disabled={!!imageJobKey}
                  accessibilityRole="button"
                  accessibilityLabel={
                    style === 'illustration' ? 'Generate note illustration' : 'Generate note chart'
                  }
                >
                  <LinearText style={styles.imageActionBtnText}>
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
          {(noteImages ?? []).length > 0 ? (
            <View style={styles.noteImagesWrap}>
              {(noteImages ?? []).map((image) => (
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
              onPress={() => onSaveNote(item.id)}
              accessibilityRole="button"
              accessibilityLabel="Save note"
            >
              <LinearText style={styles.notesSaveText}>Save Note</LinearText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.notesCancel}
              onPress={() => onCancelExpand(item)}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <LinearText style={styles.notesCancelText}>Cancel</LinearText>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.notesCancel, { backgroundColor: n.colors.errorSurface, marginTop: 12 }]}
            onPress={() => onClearCache(item.id)}
          >
            <LinearText style={[styles.notesCancelText, { color: n.colors.error }]}>
              Clear AI Cache
            </LinearText>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

const STATUS_COLORS: Record<TopicStatus, string> = {
  unseen: '#606080',
  seen: n.colors.accent,
  reviewed: n.colors.accent,
  mastered: n.colors.success,
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
  const refreshProfile = useAppStore((s) => s.refreshProfile);
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
  const [screenHydrated, setScreenHydrated] = useState(false);
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
    if (!isFocused) {
      setScreenHydrated(false);
      return;
    }

    let active = true;

    // Defer heavy fetch/list hydration until after JS frame to avoid stutter.
    setTimeout(() => {
      if (!active) return;
      void getTopicsBySubject(subjectId).then((rows) => {
        if (!active) return;
        setAllTopics(rows);
        setScreenHydrated(true);
      });
    }, 150);

    return () => {
      active = false;
    };
  }, [isFocused, subjectId]);

  useEffect(() => {
    if (!isFocused || !screenHydrated) return;
    if (initialSearchQuery && !isSingleTopicView) {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery, isFocused, isSingleTopicView, screenHydrated]);

  useEffect(() => {
    if (!isFocused || !screenHydrated || !initialTopicId || allTopics.length === 0) return;
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
  }, [allTopics, initialTopicId, isFocused, screenHydrated]);

  useEffect(() => {
    if (!screenHydrated) {
      setDisplayTopics([]);
      return;
    }

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
    screenHydrated,
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
    await refreshProfile();
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
  const progressAnim = useSharedValue(0);
  const prevPct = useRef(0);

  useEffect(() => {
    const increased = pct > prevPct.current;
    prevPct.current = pct;

    progressAnim.value = withTiming(pct, {
      duration: 900,
      easing: Easing.inOut(Easing.cubic),
    });

    if (increased && pct > 0 && pct % 25 === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [pct]);

  const progressStyle = useAnimatedStyle(() => {
    return {
      width: `${Math.min(Math.max(progressAnim.value, 0), 100)}%`,
    };
  });

  const handleCancelExpand = useCallback(
    (topic: TopicWithProgress) => {
      const savedNote = topic.progress.userNotes ?? '';
      if (noteText.trim() !== savedNote.trim()) {
        confirmDiscardUnsavedNotes(() => setExpandedId(null));
      } else {
        setExpandedId(null);
      }
    },
    [noteText],
  );

  const handleStudyNow = useCallback(
    (topicId: number) => {
      navigation.getParent<NavigationProp<TabParamList>>()?.navigate('HomeTab', {
        screen: 'Session',
        params: {
          mood: 'good',
          focusTopicId: topicId,
          preferredActionType: 'study',
        },
      });
    },
    [navigation],
  );

  const handleClearCache = useCallback((topicId: number) => {
    Alert.alert(
      'Clear AI Cache?',
      'This will remove cached AI content for this topic. It will be regenerated next time you study it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearTopicCache(topicId);
            Alert.alert('Success', 'AI content cache cleared for this topic.');
          },
        },
      ],
    );
  }, []);

  // Format review date
  const formatReviewDate = useCallback((dateStr: string | null): string => {
    if (!dateStr) return '';
    const todayStr = new Date().toISOString().slice(0, 10);
    if (dateStr === todayStr) return 'Review today';
    const tomorrow = new Date(Date.now() + MS_PER_DAY).toISOString().slice(0, 10);
    if (dateStr === tomorrow) return 'Review tomorrow';
    if (dateStr < todayStr) return 'Overdue for review!';
    const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / MS_PER_DAY);
    return `Review in ${days} days`;
  }, []);

  const emptyNoteImages: GeneratedStudyImageRecord[] = [];

  const renderTopicItem = useCallback(
    ({ item }: { item: TopicWithProgress }) => {
      const parentChildren = childrenByParentId.get(item.id) ?? [];
      const isParent = parentChildren.length > 0;
      return (
        <TopicListItem
          item={item}
          isParent={isParent}
          depth={topicDepthMap.get(item.id) ?? 0}
          isCollapsed={collapsedParents.has(item.id)}
          parentChildren={parentChildren}
          isExpanded={expandedId === item.id}
          noteText={expandedId === item.id ? noteText : ''}
          today={today}
          noteImages={noteImages[item.id] ?? emptyNoteImages}
          imageJobKey={expandedId === item.id ? imageJobKey : null}
          onPress={handleTopicPress}
          onSaveNote={handleSaveNote}
          onMarkMastered={markTopicMastered}
          onGenerateImage={handleGenerateNoteImage}
          onCancelExpand={handleCancelExpand}
          onStudyNow={handleStudyNow}
          onClearCache={handleClearCache}
          formatReviewDate={formatReviewDate}
          onNoteTextChange={setNoteText}
        />
      );
    },
    [
      childrenByParentId,
      topicDepthMap,
      collapsedParents,
      expandedId,
      noteText,
      today,
      noteImages,
      imageJobKey,
      handleTopicPress,
      handleSaveNote,
      markTopicMastered,
      handleGenerateNoteImage,
      handleCancelExpand,
      handleStudyNow,
      handleClearCache,
      formatReviewDate,
    ],
  );

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer>
          <ScreenHeader
            title={subjectName}
            titleNumberOfLines={1}
            containerStyle={styles.screenHeader}
            titleStyle={styles.screenHeaderTitle}
            searchElement={
              !isSingleTopicView ? (
                <BannerSearchBar
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search topics..."
                />
              ) : undefined
            }
          >
            <View style={styles.headerCenter}>
              <View style={styles.progressRow}>
                <LinearText variant="caption" tone="secondary" style={styles.subtitle}>
                  {done}/{leafTopics.length} micro-topics
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
                    tone="secondary"
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
                <LinearText style={styles.milestoneText}>{milestoneText}</LinearText>
              ) : null}
              <View style={styles.progressTrack}>
                <ReAnimated.View style={[styles.progressFill, progressStyle]} />
              </View>
            </View>
          </ScreenHeader>

          <View style={styles.controls}>
            {!screenHydrated ? (
              <View style={styles.singleTopicBanner}>
                <LinearText variant="label" style={styles.singleTopicBannerTitle}>
                  Topic page
                </LinearText>
                <LinearText variant="caption" tone="secondary" style={styles.singleTopicBannerText}>
                  Start a focused session for this topic or add notes below.
                </LinearText>
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
                        color={isSortMenuOpen ? n.colors.accent : n.colors.textSecondary}
                      />
                      <LinearText
                        variant="caption"
                        style={[
                          styles.quickActionText,
                          isSortMenuOpen && styles.quickActionTextPrimary,
                        ]}
                      >
                        Sort{' '}
                        <LinearText variant="caption" style={styles.quickActionValue}>
                          {currentSortLabel}
                        </LinearText>
                      </LinearText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.quickActionChip,
                        (activeFilter !== 'all' || isFilterMenuOpen) &&
                          styles.quickActionChipPrimary,
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
                            ? n.colors.accent
                            : n.colors.textSecondary
                        }
                      />
                      <LinearText
                        variant="caption"
                        style={[
                          styles.quickActionText,
                          activeFilter !== 'all' && styles.quickActionTextPrimary,
                        ]}
                      >
                        {activeFilterSummary}
                      </LinearText>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
                {isSortMenuOpen ? (
                  <View style={styles.sortSection}>
                    <LinearSurface padded={false} style={styles.sortMenu}>
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
                          <LinearText
                            variant="bodySmall"
                            style={[
                              styles.sortOptionText,
                              sortBy === option.value && styles.sortOptionTextActive,
                            ]}
                          >
                            {option.label}
                          </LinearText>
                          {sortBy === option.value ? (
                            <Ionicons name="checkmark" size={16} color={n.colors.accent} />
                          ) : null}
                        </TouchableOpacity>
                      ))}
                    </LinearSurface>
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

          <FlatList
            data={displayTopics}
            keyExtractor={(t) => t.id.toString()}
            keyboardDismissMode="on-drag"
            removeClippedSubviews={true}
            initialNumToRender={6}
            maxToRenderPerBatch={8}
            windowSize={4}
            updateCellsBatchingPeriod={80}
            contentContainerStyle={styles.list}
            onRefresh={async () => {
              setRefreshing(true);
              await getTopicsBySubject(subjectId).then(setAllTopics);
              setRefreshing(false);
            }}
            refreshing={refreshing}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <LinearText variant="body" centered style={styles.emptyText}>
                  No topics found. 🧐
                </LinearText>
              </View>
            }
            renderItem={renderTopicItem}
          />
          <Modal
            visible={isFilterMenuOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setIsFilterMenuOpen(false)}
          >
            <View style={styles.sheetOverlay}>
              <Pressable style={styles.sheetBackdrop} onPress={() => setIsFilterMenuOpen(false)} />
              <LinearSurface padded={false} style={styles.sheetCard}>
                <View style={styles.sheetHeader}>
                  <View style={styles.sheetHeaderCopy}>
                    <LinearText style={styles.sheetTitle}>Filter Topics</LinearText>
                    <LinearText style={styles.sheetSubtitle}>
                      Keep the current syllabus filters in one place.
                    </LinearText>
                  </View>
                  <TouchableOpacity
                    style={styles.sheetCloseBtn}
                    onPress={() => setIsFilterMenuOpen(false)}
                  >
                    <Ionicons name="close" size={18} color={n.colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.clearFiltersBtn}
                  onPress={() => {
                    setActiveFilter('all');
                    setIsFilterMenuOpen(false);
                  }}
                >
                  <LinearText style={styles.clearFiltersText}>Clear filters</LinearText>
                </TouchableOpacity>

                <ScrollView
                  style={styles.sheetScroll}
                  contentContainerStyle={styles.sheetScrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.sheetSection}>
                    <LinearText style={styles.sheetSectionTitle}>Topic focus</LinearText>
                    <View style={styles.sheetOptions}>
                      {FILTER_OPTIONS.map((option) => (
                        <LinearSurface
                          key={option.key}
                          padded={false}
                          style={[
                            styles.sheetOptionSurface,
                            activeFilter === option.key && styles.sheetOptionActive,
                          ]}
                        >
                          <TouchableOpacity
                            style={styles.sheetOptionInner}
                            onPress={() => {
                              setActiveFilter(option.key);
                              setIsFilterMenuOpen(false);
                            }}
                          >
                            <LinearText
                              style={[
                                styles.sheetOptionText,
                                activeFilter === option.key && styles.sheetOptionTextActive,
                              ]}
                            >
                              {option.label} {filterCounts[option.key]}
                            </LinearText>
                            <Ionicons
                              name={
                                activeFilter === option.key ? 'radio-button-on' : 'radio-button-off'
                              }
                              size={18}
                              color={
                                activeFilter === option.key ? n.colors.accent : n.colors.textMuted
                              }
                            />
                          </TouchableOpacity>
                        </LinearSurface>
                      ))}
                    </View>
                  </View>
                </ScrollView>
              </LinearSurface>
            </View>
          </Modal>
        </ResponsiveContainer>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  screenHeader: { padding: 16, paddingTop: 20, marginBottom: 0 },
  headerCenter: { minWidth: 0 },
  screenHeaderTitle: { fontSize: 22, fontWeight: '800' },
  topicImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: n.colors.surface,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 8 },
  subtitle: { color: n.colors.textSecondary, fontSize: 13 },
  milestoneText: { color: n.colors.success, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  pctBadge: {
    backgroundColor: n.colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
  },
  pctBadgeGood: { backgroundColor: n.colors.successSurface },
  pctBadgeComplete: { backgroundColor: n.colors.accent + '22' },
  pctText: { fontWeight: '800', fontSize: 12 },
  progressTrack: {
    height: 4,
    backgroundColor: n.colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: n.colors.accent, borderRadius: 2 },
  controls: { paddingHorizontal: 16, gap: 10, marginBottom: 10 },
  singleTopicBanner: {
    backgroundColor: n.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: n.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  singleTopicBannerTitle: {
    marginBottom: 4,
  },
  singleTopicBannerText: {
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
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickActionChipPrimary: {
    backgroundColor: n.colors.accent + '14',
    borderColor: n.colors.accent + '38',
  },
  quickActionText: {
    color: n.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  quickActionTextPrimary: {
    color: n.colors.accent,
  },
  quickActionValue: {
    color: n.colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  sortSection: {
    marginTop: -2,
  },
  sortMenu: {
    borderRadius: 14,
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
    backgroundColor: n.colors.accent + '12',
  },
  sortOptionText: {
    color: n.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  sortOptionTextActive: {
    color: n.colors.accent,
    fontWeight: '700',
  },
  bulkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bulkChip: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bulkDueChip: {
    backgroundColor: `${n.colors.error}22`,
    borderWidth: 1,
    borderColor: `${n.colors.error}44`,
  },
  bulkHighYieldChip: {
    backgroundColor: `${n.colors.warning}22`,
    borderWidth: 1,
    borderColor: `${n.colors.warning}44`,
  },
  bulkWeakChip: {
    backgroundColor: `${n.colors.accent}22`,
    borderWidth: 1,
    borderColor: `${n.colors.accent}44`,
  },
  bulkChipText: { color: n.colors.textPrimary },

  list: { paddingHorizontal: 16, paddingBottom: 40 },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: n.colors.card,
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  parentRow: { backgroundColor: n.colors.surface, borderLeftWidth: 0 },
  childRow: { marginLeft: 16, transform: [{ scale: 0.98 }] },
  statusBar: { width: 4, alignSelf: 'stretch' },
  topicInfo: { flex: 1, minWidth: 0, padding: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  folderIcon: { color: n.colors.accent, fontSize: 12, fontWeight: '900', marginRight: 8 },
  topicName: { flex: 1 },
  parentName: { color: n.colors.accent, flex: 1 },
  parentSummaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  parentSummaryText: { fontWeight: '700' },
  parentDueText: { color: n.colors.error, fontWeight: '800' },
  parentHighYieldText: { color: n.colors.warning, fontWeight: '800' },
  topicMeta: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  topicMetaText: { color: n.colors.textSecondary, fontSize: 12, lineHeight: 18 },
  studiedText: { color: n.colors.accent, fontSize: 12, lineHeight: 18 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  highYieldBadge: {
    color: n.colors.textInverse,
    backgroundColor: n.colors.warning,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  dueBadge: {
    color: n.colors.textInverse,
    backgroundColor: n.colors.error,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  weakBadge: {
    color: n.colors.textInverse,
    backgroundColor: n.colors.accent,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  reviewBadge: {
    backgroundColor: n.colors.surface,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  reviewOverdue: { backgroundColor: n.colors.errorSurface },
  reviewText: { color: n.colors.success, fontWeight: '600' },
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
  confRow: { flexDirection: 'row', gap: 3, marginBottom: 4, alignItems: 'center' },
  confLabel: { color: n.colors.textMuted, fontSize: 9, fontWeight: '700', marginRight: 2 },
  confDot: { width: 6, height: 6, borderRadius: 3 },

  notePreview: {
    marginTop: 3,
    fontStyle: 'italic',
  },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { textAlign: 'center' },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetCard: {
    backgroundColor: n.colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '78%',
    paddingTop: 12,
    overflow: 'hidden',
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
    color: n.colors.textPrimary,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  sheetSubtitle: {
    color: n.colors.textSecondary,
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
    backgroundColor: n.colors.surface,
  },
  clearFiltersBtn: {
    alignSelf: 'flex-start',
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: n.colors.accent + '14',
    borderWidth: 1,
    borderColor: n.colors.accent + '32',
  },
  clearFiltersText: {
    color: n.colors.accent,
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
    color: n.colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  sheetOptions: {
    gap: 8,
  },
  sheetOptionSurface: {
    minHeight: 46,
    borderRadius: 14,
  },
  sheetOptionInner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sheetOptionActive: {
    borderColor: n.colors.accent + '50',
    backgroundColor: n.colors.accent + '12',
  },
  sheetOptionText: {
    flex: 1,
    minWidth: 0,
    color: n.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  sheetOptionTextActive: {
    color: n.colors.accent,
    fontWeight: '700',
  },
  notesExpanded: {
    backgroundColor: n.colors.card,
    padding: 12,
    marginTop: -2,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    borderColor: `${n.colors.accent}44`,
    borderTopWidth: 0,
  },
  notesLabel: { color: n.colors.accent, fontWeight: '700', fontSize: 12, marginBottom: 8 },
  notesInput: {
    backgroundColor: n.colors.background,
    borderRadius: 10,
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
    borderRadius: 10,
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
    borderRadius: 12,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  notesActions: { flexDirection: 'row', gap: 8 },
  notesSave: {
    flex: 1,
    backgroundColor: n.colors.accent,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  notesSaveText: { color: n.colors.textInverse, fontWeight: '700', fontSize: 13 },
  notesCancel: {
    flex: 1,
    backgroundColor: n.colors.border,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  notesCancelText: { color: n.colors.textSecondary, fontWeight: '600', fontSize: 13 },
  studyNowBtn: {
    backgroundColor: n.colors.accent,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  studyNowText: { color: n.colors.textInverse, fontWeight: '800', fontSize: 14 },
});
