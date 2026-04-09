/**
 * NotesVaultScreen
 *
 * Clean, processed AI study notes — separated from raw transcripts.
 * Shows only lecture_notes entries that have a non-empty `note` field.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
  RefreshControl,
  StatusBar,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import LinearText from '../components/primitives/LinearText';
import ErrorBoundary from '../components/ErrorBoundary';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Clipboard from '@react-native-clipboard/clipboard';
import { z } from 'zod';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import BannerSearchBar from '../components/BannerSearchBar';
import { MarkdownRender } from '../components/MarkdownRender';
import ScreenHeader from '../components/ScreenHeader';
import SubjectChip from '../components/SubjectChip';
import TopicPillRow from '../components/TopicPillRow';
import LinearSurface from '../components/primitives/LinearSurface';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { useScrollRestoration, usePersistedInput } from '../hooks/useScrollRestoration';
import { linearTheme as n } from '../theme/linearTheme';
import {
  getLectureHistory,
  deleteLectureNote,
  updateLectureAnalysisMetadata,
  type LectureHistoryItem,
} from '../db/queries/aiCache';
import { getSubjectByName } from '../db/queries/topics';
import { generateJSONWithRouting } from '../services/ai/generate';
import type { Message } from '../services/ai/types';
import { CONFIDENCE_LABELS } from '../constants/gamification';
import type { TabParamList } from '../navigation/types';
import { showInfo, showSuccess, confirm, confirmDestructive } from '../components/dialogService';

const NoteLabelSchema = z.object({
  subject: z
    .string()
    .describe('NEET-PG medical subject (e.g. "Anatomy", "Pharmacology", "Pathology")'),
  title: z
    .string()
    .describe(
      'Short note title — noun phrase only, no verbs (e.g. "Cardiac Valves & Murmurs", "Beta Blockers — MOA & Side Effects")',
    ),
  topics: z.array(z.string()).describe('2-5 specific medical topics covered'),
});

async function aiRelabelNote(
  noteText: string,
): Promise<{ subject: string; title: string; topics: string[] } | null> {
  try {
    const snippet = noteText.split(/\s+/).slice(0, 800).join(' ');
    const messages: Message[] = [
      {
        role: 'system',
        content: `You label medical study notes. Return a subject, title, and topics.

TITLE RULES:
- Must be a short noun phrase like a textbook chapter heading (max 60 chars)
- NEVER start with "This note covers", "Focuses on", "Overview of", "The note discusses" or similar
- Good: "Cardiac Valves & Murmurs", "Iron Deficiency Anemia", "Brachial Plexus Injuries"
- Bad: "This note covers cardiac anatomy", "Focuses on iron metabolism"

Subject must be one of: Anatomy, Physiology, Biochemistry, Pathology, Pharmacology, Microbiology, Forensic Medicine, ENT, Ophthalmology, Community Medicine, Surgery, Medicine, OBG, Pediatrics, Orthopedics, Dermatology, Psychiatry, Radiology, Anesthesia.`,
      },
      { role: 'user', content: snippet },
    ];
    const { parsed } = await generateJSONWithRouting(
      messages,
      NoteLabelSchema,
      'low',
      false,
      'groq',
    );
    return parsed;
  } catch {
    return null;
  }
}

function countWords(text: string): number {
  return text?.trim() ? text.trim().split(/\s+/).length : 0;
}

const SUBJECT_COLORS: Record<string, string> = {
  Physiology: n.colors.success,
  Anatomy: '#2196F3',
  Biochemistry: n.colors.warning,
  Pathology: n.colors.error,
  Pharmacology: '#9C27B0',
  Microbiology: '#00BCD4',
  'Forensic Medicine': '#795548',
  ENT: '#607D8B',
  Ophthalmology: '#3F51B5',
  'Community Medicine': '#8BC34A',
  Surgery: '#E91E63',
  Medicine: '#009688',
  OBG: '#FF5722',
  Pediatrics: '#CDDC39',
  Orthopedics: '#FFC107',
  Dermatology: '#673AB7',
  Psychiatry: '#00ACC1',
  Radiology: '#546E7A',
  Anesthesia: '#D32F2F',
};

type NoteItem = LectureHistoryItem;
type SortOption = 'date' | 'subject' | 'words';

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'date', label: 'Newest' },
  { value: 'subject', label: 'Subject' },
  { value: 'words', label: 'Words' },
];

const PAGE_SIZE = 20;

function getTitle(item: NoteItem): string {
  const summary = item.summary?.trim();
  if (
    summary &&
    !/^lecture content recorded(\.|\. review transcript for details\.)?$/i.test(summary) &&
    !/^lecture summary captured\.?$/i.test(summary)
  ) {
    return summary;
  }
  if (item.topics.length > 0) return item.topics.slice(0, 3).join(', ');
  return item.note?.slice(0, 60) || 'Untitled Note';
}

function buildNoteGroundingContext(item: NoteItem): string {
  return [
    `Title: ${getTitle(item)}`,
    `Subject: ${item.subjectName || 'Unknown'}`,
    item.topics.length > 0 ? `Topics: ${item.topics.join(', ')}` : null,
    item.summary ? `Summary: ${item.summary}` : null,
    item.appName ? `Source: ${item.appName}` : null,
    `Saved note:\n${item.note.trim().slice(0, 4500)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildVaultGroundingContext(notes: NoteItem[]): string {
  return notes
    .slice(0, 5)
    .map((note, index) => `Note ${index + 1}\n${buildNoteGroundingContext(note)}`)
    .join('\n\n---\n\n');
}

export default function NotesVaultScreen() {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const navigation = useNavigation();
  const tabsNavigation = navigation.getParent<NavigationProp<TabParamList>>();
  const { onScroll, onContentSizeChange, listRef } = useScrollRestoration('notes-vault');
  const [searchValue, setSearchPersisted] = usePersistedInput('notes-vault-search', '');
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const isSelectionMode = selectedIds.size > 0;

  // Reader modal
  const [readerContent, setReaderContent] = useState<string | null>(null);
  const [readerTitle, setReaderTitle] = useState('');
  const [readerNote, setReaderNote] = useState<NoteItem | null>(null);

  // Pagination
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getLectureHistory(500);
      // Only show entries with a processed AI note
      const withNotes = all.filter((n) => n.note?.trim() && n.note.length > 20);
      setNotes(withNotes);
      setDisplayCount(PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadNotes();
    }, [loadNotes]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotes();
    setRefreshing(false);
  }, [loadNotes]);

  const visibleNotes = useMemo(() => {
    let filtered = notes;
    if (subjectFilter !== 'all') {
      filtered = filtered.filter((n) => (n.subjectName || 'Unknown') === subjectFilter);
    }
    if (topicFilter !== 'all') {
      filtered = filtered.filter((n) => n.topics.includes(topicFilter));
    }
    if (searchValue.trim()) {
      const q = searchValue.toLowerCase();
      filtered = filtered.filter(
        (n) =>
          n.note?.toLowerCase().includes(q) ||
          n.summary?.toLowerCase().includes(q) ||
          n.subjectName?.toLowerCase().includes(q) ||
          n.topics.some((t) => t.toLowerCase().includes(q)),
      );
    }
    const sorted = [...filtered];
    if (sortBy === 'subject') {
      sorted.sort((a, b) => (a.subjectName ?? '').localeCompare(b.subjectName ?? ''));
    } else if (sortBy === 'words') {
      sorted.sort((a, b) => countWords(a.note) - countWords(b.note));
    }
    // date sort is default from DB (newest first)
    return sorted;
  }, [notes, searchValue, sortBy, subjectFilter, topicFilter]);

  const subjectOptions = useMemo(
    () =>
      [...new Set(notes.map((note) => note.subjectName || 'Unknown'))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [notes],
  );

  const topicOptions = useMemo(() => {
    const topicSourceNotes =
      subjectFilter === 'all'
        ? notes
        : notes.filter((note) => (note.subjectName || 'Unknown') === subjectFilter);
    const counts = new Map<string, number>();
    for (const note of topicSourceNotes) {
      for (const topic of note.topics) {
        counts.set(topic, (counts.get(topic) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([topic]) => topic);
  }, [notes, subjectFilter]);

  const activeFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (subjectFilter !== 'all') {
      parts.push(subjectFilter);
    }
    if (topicFilter !== 'all') {
      parts.push(topicFilter);
    }
    return parts.length > 0 ? parts.join(' • ') : 'All notes';
  }, [subjectFilter, topicFilter]);

  const listLayoutKey = `${viewportWidth}x${viewportHeight}`;

  useEffect(() => {
    if (subjectFilter !== 'all' && !subjectOptions.includes(subjectFilter)) {
      setSubjectFilter('all');
    }
  }, [subjectFilter, subjectOptions]);

  useEffect(() => {
    if (topicFilter !== 'all' && !topicOptions.includes(topicFilter)) {
      setTopicFilter('all');
    }
  }, [topicFilter, topicOptions]);

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleLongPress = useCallback((id: number) => {
    Haptics.selectionAsync();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const cancelSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBatchDelete = useCallback(async () => {
    const count = selectedIds.size;
    const ok = await confirmDestructive(
      `Delete ${count} note${count !== 1 ? 's' : ''}?`,
      'This cannot be undone.',
    );
    if (!ok) return;
    let deleted = 0;
    let lastErr = '';
    for (const id of selectedIds) {
      try {
        await deleteLectureNote(id);
        deleted++;
      } catch (e: any) {
        lastErr = e?.message ?? String(e);
      }
    }
    setSelectedIds(new Set());
    setNotes((prev) => prev.filter((n) => !selectedIds.has(n.id)));
    void loadNotes();
    if (deleted < selectedIds.size) {
      void showInfo(
        'Some notes could not be deleted',
        `Deleted ${deleted}/${selectedIds.size}.\n\nError: ${lastErr}`,
      );
    }
  }, [selectedIds, loadNotes]);

  // Junk notes: very short
  const junkNotes = useMemo(() => notes.filter((n) => countWords(n.note) < 80), [notes]);

  // Duplicate detection by content prefix
  const duplicateIds = useMemo(() => {
    const groups = new Map<string, NoteItem[]>();
    for (const n of notes) {
      if (!n.note || countWords(n.note) < 5) continue;
      const key = n.note.trim().slice(0, 200);
      const group = groups.get(key) ?? [];
      group.push(n);
      groups.set(key, group);
    }
    const dupes = new Set<number>();
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      // Keep newest, mark rest
      group.sort((a, b) => b.createdAt - a.createdAt);
      for (let i = 1; i < group.length; i++) dupes.add(group[i].id);
    }
    return dupes;
  }, [notes]);

  // Notes needing relabeling: no subject or generic labels
  const unlabeledNotes = useMemo(
    () =>
      notes.filter((n) => {
        if (countWords(n.note) < 80) return false;
        const subj = (n.subjectName ?? '').toLowerCase();
        return (
          !subj ||
          subj === 'general' ||
          subj === 'unknown' ||
          subj === 'lecture' ||
          (!n.summary && n.topics.length === 0)
        );
      }),
    [notes],
  );

  const [relabelProgress, setRelabelProgress] = useState<string | null>(null);

  // Bad title patterns from previous AI runs
  const badTitleNotes = useMemo(
    () =>
      notes.filter((n) => {
        const s = (n.summary ?? '').toLowerCase();
        return (
          !!s &&
          (/\b(covers?|focuses?|discusses?|overview of|about the|this note)\b/.test(s) ||
            /^lecture content recorded(\. review transcript for details\.)?$/.test(s) ||
            /^lecture summary captured\.?$/.test(s))
        );
      }),
    [notes],
  );

  const runRelabel = useCallback(
    async (targets: NoteItem[]) => {
      let fixed = 0;
      let failed = 0;
      for (let i = 0; i < targets.length; i++) {
        const n = targets[i];
        setRelabelProgress(`${i + 1}/${targets.length}`);
        try {
          const label = await aiRelabelNote(n.note ?? '');
          if (!label) {
            failed++;
            continue;
          }

          let subjectId: number | null = null;
          if (label.subject) {
            const subj = await getSubjectByName(label.subject);
            if (subj) subjectId = subj.id;
          }

          await updateLectureAnalysisMetadata(n.id, {
            subjectId,
            summary: label.title || null,
            topics: label.topics?.length ? label.topics : undefined,
          });
          fixed++;
        } catch {
          failed++;
        }
      }
      setRelabelProgress(null);
      void loadNotes();
      void showSuccess(
        'Done',
        `Labeled ${fixed} note${fixed !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}.`,
      );
    },
    [loadNotes],
  );

  const handleRelabel = useCallback(async () => {
    const count = unlabeledNotes.length;
    const ok = await confirm(
      `AI-label ${count} note${count !== 1 ? 's' : ''}?`,
      '1 quick API call per note.',
    );
    if (!ok) return;
    void runRelabel(unlabeledNotes);
  }, [unlabeledNotes, runRelabel]);

  const handleFixBadTitles = useCallback(async () => {
    const count = badTitleNotes.length;
    const ok = await confirm(
      `Re-label ${count} note${count !== 1 ? 's' : ''}?`,
      'Fixes titles like "This note covers..." with proper noun-phrase headings. 1 API call per note.',
    );
    if (!ok) return;
    void runRelabel(badTitleNotes);
  }, [badTitleNotes, runRelabel]);

  const handleDeleteJunk = useCallback(async () => {
    const count = junkNotes.length;
    const ok = await confirmDestructive(
      `Delete ${count} junk note${count !== 1 ? 's' : ''}?`,
      'Permanently deletes notes with fewer than 80 words.',
    );
    if (!ok) return;
    for (const n of junkNotes) {
      try {
        await deleteLectureNote(n.id);
      } catch {
        /* skip */
      }
    }
    void loadNotes();
  }, [junkNotes, loadNotes]);

  const handleDeleteDuplicates = useCallback(async () => {
    const count = duplicateIds.size;
    const ok = await confirmDestructive(
      `Delete ${count} duplicate${count !== 1 ? 's' : ''}?`,
      'Keeps the newest copy of each note.',
    );
    if (!ok) return;
    for (const id of duplicateIds) {
      try {
        await deleteLectureNote(id);
      } catch {
        /* skip */
      }
    }
    void loadNotes();
  }, [duplicateIds, loadNotes]);

  const getSubjectLabel = (item: NoteItem) => item.subjectName || 'Unknown';

  const handleAskGuruFromNotes = useCallback(() => {
    if (visibleNotes.length === 0) return;
    tabsNavigation?.navigate('ChatTab', {
      screen: 'GuruChat',
      params: {
        topicName: 'Notes Vault',
        groundingTitle:
          subjectFilter !== 'all' || topicFilter !== 'all'
            ? [
                subjectFilter !== 'all' ? subjectFilter : null,
                topicFilter !== 'all' ? topicFilter : null,
              ]
                .filter(Boolean)
                .join(' / ')
            : 'Saved notes',
        groundingContext: buildVaultGroundingContext(visibleNotes),
        autoFocusComposer: true,
      },
    });
  }, [subjectFilter, tabsNavigation, topicFilter, visibleNotes]);

  const handleAskGuruFromNote = useCallback(
    (item: NoteItem) => {
      setReaderContent(null);
      setReaderNote(null);
      tabsNavigation?.navigate('ChatTab', {
        screen: 'GuruChat',
        params: {
          topicName: getTitle(item),
          groundingTitle: getTitle(item),
          groundingContext: buildNoteGroundingContext(item),
          autoFocusComposer: true,
        },
      });
    },
    [tabsNavigation],
  );

  const formatDate = (ts: number): string => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const wordCountMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const note of visibleNotes) {
      map.set(note.id, countWords(note.note));
    }
    return map;
  }, [visibleNotes]);

  const renderNote = useCallback(
    ({ item }: { item: NoteItem }) => {
      const subjectLabel = getSubjectLabel(item);
      const isSelected = selectedIds.has(item.id);

      return (
        <TouchableOpacity
          style={[styles.card, isSelected && styles.cardSelected]}
          activeOpacity={0.7}
          onLongPress={() => handleLongPress(item.id)}
          delayLongPress={220}
          onPress={() => {
            if (isSelectionMode) {
              Haptics.selectionAsync();
              toggleSelection(item.id);
              return;
            }
            setReaderTitle(getTitle(item));
            setReaderContent(item.note);
            setReaderNote(item);
          }}
        >
          {isSelectionMode && (
            <View style={styles.selectIcon}>
              <Ionicons
                name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={isSelected ? n.colors.accent : n.colors.textMuted}
              />
            </View>
          )}
          <View style={styles.cardHeader}>
            <SubjectChip
              subject={subjectLabel}
              color="#fff"
              backgroundColor={SUBJECT_COLORS[subjectLabel] ?? n.colors.textMuted}
              borderColor={SUBJECT_COLORS[subjectLabel] ?? n.colors.textMuted}
              style={styles.subjectChip}
            />
          </View>
          <View style={styles.dateRow}>
            <LinearText style={styles.dateText}>{formatDate(item.createdAt)}</LinearText>
          </View>
          <LinearText style={styles.titleText} numberOfLines={3}>
            {getTitle(item)}
          </LinearText>
          {item.topics.length > 0 && (
            <TopicPillRow
              topics={item.topics}
              wrap
              maxVisible={4}
              rowStyle={styles.topicsRow}
              pillStyle={styles.topicPill}
              moreBadgeStyle={styles.moreBadge}
            />
          )}
          <View style={styles.cardFooter}>
            {item.confidence > 0 && (
              <LinearText
                style={[
                  styles.confidenceBadge,
                  item.confidence === 3
                    ? styles.confidenceBadgeStrong
                    : item.confidence === 2
                      ? styles.confidenceBadgeMid
                      : styles.confidenceBadgeLight,
                ]}
              >
                {CONFIDENCE_LABELS[item.confidence as 1 | 2 | 3]}
              </LinearText>
            )}
            <LinearText style={styles.wordCount}>
              {(wordCountMap.get(item.id) ?? countWords(item.note)).toLocaleString()} words
            </LinearText>
            {item.appName ? (
              <LinearText style={styles.appBadge}>via {item.appName}</LinearText>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    },
    [selectedIds, isSelectionMode, handleLongPress, toggleSelection, wordCountMap],
  );

  const currentSortLabel =
    SORT_OPTIONS.find((option) => option.value === sortBy)?.label ?? 'Newest';
  const hasQuickActions =
    !isSelectionMode &&
    (visibleNotes.length > 0 ||
      (notes.length > 0 && !searchValue) ||
      subjectOptions.length > 0 ||
      topicOptions.length > 0 ||
      junkNotes.length > 0 ||
      duplicateIds.size > 0 ||
      unlabeledNotes.length > 0 ||
      badTitleNotes.length > 0 ||
      !!relabelProgress);

  return (
    <SafeAreaView style={styles.safe}>
      <ErrorBoundary>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={n.colors.accent} />
            <LinearText style={styles.loadingText}>Loading...</LinearText>
          </View>
        ) : null}
        <ResponsiveContainer style={styles.flex}>
          <ScreenHeader
            title="Notes Vault"
            subtitle={`${notes.length} processed study note${notes.length !== 1 ? 's' : ''}`}
            containerStyle={styles.headerCompact}
            titleStyle={styles.headerTitleCompact}
            subtitleStyle={styles.headerSubtitleCompact}
            searchElement={
              <BannerSearchBar
                value={searchValue}
                onChangeText={setSearchPersisted}
                placeholder="Search notes, topics, subjects..."
              />
            }
          ></ScreenHeader>

          {/* Selection banner */}
          {isSelectionMode && (
            <View style={styles.selectionBanner}>
              <LinearText style={styles.selectionText}>{selectedIds.size} selected</LinearText>
              <View style={styles.selectionActions}>
                <TouchableOpacity style={styles.selectionCancelBtn} onPress={cancelSelection}>
                  <LinearText style={styles.selectionCancelText}>Cancel</LinearText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.selectionDeleteBtn} onPress={handleBatchDelete}>
                  <Ionicons name="trash-outline" size={14} color="#fff" />
                  <LinearText style={styles.selectionDeleteText}>Delete</LinearText>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {hasQuickActions && (
            <View style={styles.quickActionsSection}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickActionsContent}
              >
                {visibleNotes.length > 0 && (
                  <TouchableOpacity
                    style={[styles.quickActionChip, styles.quickActionChipPrimary]}
                    onPress={handleAskGuruFromNotes}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Ask Guru using current notes"
                  >
                    <Ionicons name="sparkles-outline" size={15} color={n.colors.accent} />
                    <LinearText style={[styles.quickActionText, styles.quickActionTextPrimary]}>
                      Ask Guru
                    </LinearText>
                  </TouchableOpacity>
                )}

                {notes.length > 0 && !searchValue && (
                  <TouchableOpacity
                    style={[
                      styles.quickActionChip,
                      isSortMenuOpen && styles.quickActionChipPrimary,
                    ]}
                    onPress={() => setIsSortMenuOpen((prev) => !prev)}
                    accessibilityRole="button"
                    accessibilityLabel="Sort notes"
                  >
                    <Ionicons
                      name={isSortMenuOpen ? 'swap-vertical' : 'swap-vertical-outline'}
                      size={15}
                      color={isSortMenuOpen ? n.colors.accent : n.colors.textSecondary}
                    />
                    <LinearText style={styles.quickActionText}>
                      Sort{' '}
                      <LinearText style={styles.quickActionValue}>{currentSortLabel}</LinearText>
                    </LinearText>
                  </TouchableOpacity>
                )}

                {(subjectOptions.length > 0 || topicOptions.length > 0) && (
                  <TouchableOpacity
                    style={[
                      styles.quickActionChip,
                      (subjectFilter !== 'all' || topicFilter !== 'all' || isFilterMenuOpen) &&
                        styles.quickActionChipPrimary,
                    ]}
                    onPress={() => setIsFilterMenuOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Filter notes"
                  >
                    <Ionicons
                      name="options-outline"
                      size={15}
                      color={
                        subjectFilter !== 'all' || topicFilter !== 'all' || isFilterMenuOpen
                          ? n.colors.accent
                          : n.colors.textSecondary
                      }
                    />
                    <LinearText style={styles.quickActionText}>
                      <LinearText
                        style={[
                          styles.quickActionText,
                          (subjectFilter !== 'all' || topicFilter !== 'all') &&
                            styles.quickActionTextPrimary,
                        ]}
                      >
                        {activeFilterSummary}
                      </LinearText>
                    </LinearText>
                  </TouchableOpacity>
                )}

                {junkNotes.length > 0 && (
                  <TouchableOpacity
                    style={[styles.quickActionChip, styles.quickActionChipError]}
                    onPress={handleDeleteJunk}
                  >
                    <Ionicons name="trash-outline" size={15} color={n.colors.error} />
                    <LinearText style={[styles.quickActionText, styles.quickActionTextError]}>
                      Clean {junkNotes.length}
                    </LinearText>
                  </TouchableOpacity>
                )}

                {duplicateIds.size > 0 && (
                  <TouchableOpacity
                    style={[styles.quickActionChip, styles.quickActionChipWarning]}
                    onPress={handleDeleteDuplicates}
                  >
                    <Ionicons name="copy-outline" size={15} color={n.colors.warning} />
                    <LinearText style={[styles.quickActionText, styles.quickActionTextWarning]}>
                      Duplicates {duplicateIds.size}
                    </LinearText>
                  </TouchableOpacity>
                )}

                {!relabelProgress && unlabeledNotes.length > 0 && (
                  <TouchableOpacity
                    style={[styles.quickActionChip, styles.quickActionChipPrimary]}
                    onPress={handleRelabel}
                  >
                    <Ionicons name="sparkles-outline" size={15} color={n.colors.accent} />
                    <LinearText style={[styles.quickActionText, styles.quickActionTextPrimary]}>
                      Label {unlabeledNotes.length}
                    </LinearText>
                  </TouchableOpacity>
                )}

                {!relabelProgress && badTitleNotes.length > 0 && (
                  <TouchableOpacity
                    style={[styles.quickActionChip, styles.quickActionChipPrimary]}
                    onPress={handleFixBadTitles}
                  >
                    <Ionicons name="create-outline" size={15} color={n.colors.accent} />
                    <LinearText style={[styles.quickActionText, styles.quickActionTextPrimary]}>
                      Fix Titles {badTitleNotes.length}
                    </LinearText>
                  </TouchableOpacity>
                )}

                {relabelProgress && (
                  <View style={[styles.quickActionChip, styles.quickActionChipPrimary]}>
                    <ActivityIndicator size="small" color={n.colors.accent} />
                    <LinearText style={[styles.quickActionText, styles.quickActionTextPrimary]}>
                      Labeling {relabelProgress}
                    </LinearText>
                  </View>
                )}
              </ScrollView>
            </View>
          )}

          {notes.length > 0 && !searchValue && isSortMenuOpen && (
            <View style={styles.sortSection}>
              <LinearSurface padded={false} compact style={styles.sortMenu}>
                {SORT_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.sortOption, sortBy === option.value && styles.sortOptionActive]}
                    onPress={() => {
                      setSortBy(option.value);
                      setIsSortMenuOpen(false);
                    }}
                  >
                    <LinearText
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
          )}

          {/* List */}
          {visibleNotes.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={64} color={n.colors.textMuted} />
              <LinearText style={styles.emptyTitle}>No Notes Yet</LinearText>
              <LinearText style={styles.emptySubtitle}>
                Study a topic or import a lecture to create notes.
              </LinearText>
            </View>
          ) : (
            <>
              <FlatList
                ref={listRef}
                data={visibleNotes.slice(0, displayCount)}
                key={listLayoutKey}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderNote}
                extraData={listLayoutKey}
                contentContainerStyle={styles.list}
                onScroll={onScroll}
                onContentSizeChange={onContentSizeChange}
                scrollEventThrottle={16}
                initialNumToRender={10}
                maxToRenderPerBatch={5}
                windowSize={11}
                removeClippedSubviews={Platform.OS === 'android' ? true : undefined}
                updateCellsBatchingPeriod={100}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    tintColor={n.colors.textPrimary}
                  />
                }
              />
              {displayCount < visibleNotes.length && (
                <TouchableOpacity
                  style={styles.loadMoreBtn}
                  onPress={() => setDisplayCount((prev) => prev + PAGE_SIZE)}
                  activeOpacity={0.7}
                >
                  <LinearText style={styles.loadMoreText}>
                    Load More ({visibleNotes.length - displayCount} remaining)
                  </LinearText>
                </TouchableOpacity>
              )}
            </>
          )}

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
                    <LinearText style={styles.sheetTitle}>Filter Notes</LinearText>
                    <LinearText style={styles.sheetSubtitle}>
                      Narrow the vault by subject and topic.
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
                    setSubjectFilter('all');
                    setTopicFilter('all');
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
                    <LinearText style={styles.sheetSectionTitle}>Subject</LinearText>
                    <View style={styles.sheetOptions}>
                      <TouchableOpacity
                        style={[
                          styles.sheetOption,
                          subjectFilter === 'all' && styles.sheetOptionActive,
                        ]}
                        onPress={() => setSubjectFilter('all')}
                      >
                        <LinearText
                          style={[
                            styles.sheetOptionText,
                            subjectFilter === 'all' && styles.sheetOptionTextActive,
                          ]}
                        >
                          All subjects
                        </LinearText>
                        {subjectFilter === 'all' ? (
                          <Ionicons name="radio-button-on" size={18} color={n.colors.accent} />
                        ) : (
                          <Ionicons name="radio-button-off" size={18} color={n.colors.textMuted} />
                        )}
                      </TouchableOpacity>
                      {subjectOptions.map((subject) => (
                        <TouchableOpacity
                          key={subject}
                          style={[
                            styles.sheetOption,
                            subjectFilter === subject && styles.sheetOptionActive,
                          ]}
                          onPress={() => setSubjectFilter(subject)}
                        >
                          <LinearText
                            style={[
                              styles.sheetOptionText,
                              subjectFilter === subject && styles.sheetOptionTextActive,
                            ]}
                          >
                            {subject}
                          </LinearText>
                          {subjectFilter === subject ? (
                            <Ionicons name="radio-button-on" size={18} color={n.colors.accent} />
                          ) : (
                            <Ionicons
                              name="radio-button-off"
                              size={18}
                              color={n.colors.textMuted}
                            />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.sheetSection}>
                    <LinearText style={styles.sheetSectionTitle}>Topic</LinearText>
                    <View style={styles.sheetOptions}>
                      <TouchableOpacity
                        style={[
                          styles.sheetOption,
                          topicFilter === 'all' && styles.sheetOptionActive,
                        ]}
                        onPress={() => setTopicFilter('all')}
                      >
                        <LinearText
                          style={[
                            styles.sheetOptionText,
                            topicFilter === 'all' && styles.sheetOptionTextActive,
                          ]}
                        >
                          All topics
                        </LinearText>
                        {topicFilter === 'all' ? (
                          <Ionicons name="radio-button-on" size={18} color={n.colors.accent} />
                        ) : (
                          <Ionicons name="radio-button-off" size={18} color={n.colors.textMuted} />
                        )}
                      </TouchableOpacity>
                      {topicOptions.map((topic) => (
                        <TouchableOpacity
                          key={topic}
                          style={[
                            styles.sheetOption,
                            topicFilter === topic && styles.sheetOptionActive,
                          ]}
                          onPress={() => setTopicFilter(topic)}
                        >
                          <LinearText
                            style={[
                              styles.sheetOptionText,
                              topicFilter === topic && styles.sheetOptionTextActive,
                            ]}
                          >
                            {topic}
                          </LinearText>
                          {topicFilter === topic ? (
                            <Ionicons name="radio-button-on" size={18} color={n.colors.accent} />
                          ) : (
                            <Ionicons
                              name="radio-button-off"
                              size={18}
                              color={n.colors.textMuted}
                            />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </ScrollView>
              </LinearSurface>
            </View>
          </Modal>

          {/* Full-screen reader */}
          <Modal
            visible={!!readerContent}
            animationType="slide"
            onRequestClose={() => {
              setReaderContent(null);
              setReaderNote(null);
            }}
          >
            <View style={styles.readerContainer}>
              <View style={styles.readerHeader}>
                <TouchableOpacity
                  onPress={() => {
                    setReaderContent(null);
                    setReaderNote(null);
                  }}
                  style={styles.readerCloseBtn}
                >
                  <Ionicons name="arrow-back" size={22} color={n.colors.textPrimary} />
                </TouchableOpacity>
                <LinearText style={styles.readerHeaderTitle} numberOfLines={3}>
                  {readerTitle}
                </LinearText>
                <TouchableOpacity
                  onPress={() => {
                    if (readerContent) {
                      Clipboard.setString(readerContent);
                      Haptics.selectionAsync();
                    }
                  }}
                  style={styles.readerCopyBtn}
                >
                  <Ionicons name="copy-outline" size={20} color={n.colors.textMuted} />
                </TouchableOpacity>
              </View>
              {readerNote ? (
                <TouchableOpacity
                  style={styles.readerAskGuruBtn}
                  onPress={() => handleAskGuruFromNote(readerNote)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Ask Guru from this note"
                >
                  <Ionicons name="sparkles-outline" size={16} color={n.colors.accent} />
                  <LinearText style={styles.readerAskGuruText}>Ask Guru From This Note</LinearText>
                </TouchableOpacity>
              ) : null}
              <ScrollView
                style={styles.readerScroll}
                contentContainerStyle={styles.readerScrollContent}
                showsVerticalScrollIndicator
              >
                <MarkdownRender content={readerContent ?? ''} />
              </ScrollView>
            </View>
          </Modal>
        </ResponsiveContainer>
      </ErrorBoundary>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  flex: { flex: 1 },
  list: { padding: 16, paddingBottom: 40 },
  headerCompact: {
    marginBottom: 12,
  },
  headerTitleCompact: {
    fontSize: 24,
    lineHeight: 30,
  },
  headerSubtitleCompact: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  askGuruBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: n.colors.accent + '12',
    borderWidth: 1,
    borderColor: n.colors.accent + '35',
    borderRadius: n.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  askGuruBannerCopy: {
    flex: 1,
  },
  askGuruBannerTitle: {
    color: n.colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  askGuruBannerSubtitle: {
    color: n.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 10,
    borderRadius: n.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    gap: 8,
  },
  quickActionsSection: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  quickActionsContent: {
    gap: 8,
    paddingRight: 16,
  },
  quickActionChip: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickActionChipPrimary: {
    backgroundColor: n.colors.accent + '10',
    borderColor: n.colors.accent + '35',
  },
  quickActionChipWarning: {
    backgroundColor: n.colors.warning + '10',
    borderColor: n.colors.warning + '30',
  },
  quickActionChipError: {
    backgroundColor: n.colors.error + '10',
    borderColor: n.colors.error + '30',
  },
  quickActionText: {
    color: n.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  quickActionTextPrimary: {
    color: n.colors.accent,
  },
  quickActionTextWarning: {
    color: n.colors.warning,
  },
  quickActionTextError: {
    color: n.colors.error,
  },
  quickActionValue: {
    color: n.colors.textPrimary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
  },
  filterSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  filterTrigger: {
    minHeight: 48,
    borderRadius: n.radius.md,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  filterTriggerActive: {
    borderColor: n.colors.accent + '55',
    backgroundColor: n.colors.accent + '10',
  },
  filterTriggerCopy: {
    flex: 1,
    minWidth: 0,
  },
  filterTriggerLabel: {
    color: n.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  filterTriggerValue: {
    color: n.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    marginTop: 2,
  },
  searchInput: {
    flex: 1,
    color: n.colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
    minWidth: 0,
    padding: 0,
  },
  sortSection: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sortTrigger: {
    minHeight: 44,
    borderRadius: n.radius.md,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sortTriggerActive: {
    borderColor: n.colors.accent + '55',
    backgroundColor: n.colors.accent + '10',
  },
  sortTriggerLabel: {
    color: n.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  sortTriggerValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  sortTriggerValue: {
    color: n.colors.accent,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
  },
  sortMenu: {
    marginTop: 8,
    borderRadius: n.radius.md,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
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
  card: {
    backgroundColor: n.colors.surface,
    borderRadius: n.radius.md,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  cardSelected: {
    borderColor: n.colors.accent,
    backgroundColor: n.colors.accent + '12',
  },
  selectIcon: { position: 'absolute', top: 10, right: 10, zIndex: 2 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  subjectChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    flexShrink: 1,
    overflow: 'visible',
  },
  dateRow: {
    width: '100%',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  dateText: {
    color: n.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'right',
    minWidth: 72,
  },
  titleText: {
    color: n.colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 8,
  },
  topicsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 4,
    marginBottom: 8,
  },
  topicPill: {
    backgroundColor: n.colors.surface,
    color: n.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: n.colors.border,
    overflow: 'hidden',
  },
  moreBadge: {
    color: n.colors.textMuted,
    fontSize: 12,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  confidenceBadge: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
  },
  confidenceBadgeLight: {
    color: n.colors.error,
    backgroundColor: 'rgba(241,76,76,0.08)',
    borderColor: n.colors.error + '55',
  },
  confidenceBadgeMid: {
    color: n.colors.warning,
    backgroundColor: 'rgba(217,119,6,0.08)',
    borderColor: n.colors.warning + '55',
  },
  confidenceBadgeStrong: {
    color: n.colors.success,
    backgroundColor: 'rgba(63,185,80,0.08)',
    borderColor: n.colors.success + '55',
  },
  wordCount: { color: n.colors.textMuted, fontSize: 12 },
  appBadge: { color: n.colors.textMuted, fontSize: 12 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    marginTop: 40,
    gap: 16,
  },
  emptyTitle: {
    color: n.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: n.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  loadMoreBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 12,
    backgroundColor: n.colors.accent + '12',
    borderWidth: 1,
    borderColor: n.colors.accent + '30',
  },
  loadMoreText: {
    color: n.colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  cleanupBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: n.colors.error + '12',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: n.radius.md,
    borderWidth: 1,
    borderColor: n.colors.error + '30',
  },
  dupeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: n.colors.warning + '12',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: n.radius.md,
    borderWidth: 1,
    borderColor: n.colors.warning + '30',
  },
  relabelBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: n.colors.accent + '12',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: n.radius.md,
    borderWidth: 1,
    borderColor: n.colors.accent + '30',
  },
  bannerText: {
    flex: 1,
    color: n.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    minWidth: 0,
  },
  bannerActionError: { color: n.colors.error, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  bannerActionWarning: {
    color: n.colors.warning,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  bannerActionPrimary: {
    color: n.colors.accent,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  selectionBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    backgroundColor: n.colors.accent + '18',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: n.radius.md,
    borderWidth: 1,
    borderColor: n.colors.accent + '40',
  },
  selectionText: { color: n.colors.accent, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginLeft: 'auto',
  },
  selectionCancelBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  selectionCancelText: {
    color: n.colors.accent,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  selectionDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: n.colors.error,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  selectionDeleteText: {
    color: n.colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
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
    maxHeight: '82%',
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
  sheetOption: {
    minHeight: 46,
    borderRadius: n.radius.md,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
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
  readerContainer: { flex: 1, backgroundColor: n.colors.background },
  readerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: n.colors.border,
    gap: 10,
  },
  readerCloseBtn: { padding: 6 },
  readerHeaderTitle: {
    flex: 1,
    color: n.colors.textPrimary,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    minWidth: 0,
  },
  readerCopyBtn: { padding: 6 },
  readerScroll: { flex: 1 },
  readerScrollContent: { padding: 20, paddingBottom: 60 },
  readerAskGuruBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 12,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: n.colors.accent + '16',
    borderWidth: 1,
    borderColor: n.colors.accent + '35',
  },
  readerAskGuruText: {
    color: n.colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  loadingState: { alignItems: 'center', justifyContent: 'center', padding: 48, flex: 1 },
  loadingText: { color: n.colors.textMuted, fontSize: 14, marginTop: 16 },
});
