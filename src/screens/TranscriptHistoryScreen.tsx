/**
 * TranscriptHistoryScreen
 * Browse and search through past lecture transcriptions
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  RefreshControl,
  StatusBar,
  Platform,
} from 'react-native';
import LinearText from '../components/primitives/LinearText';
import ErrorBoundary from '../components/ErrorBoundary';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Clipboard from '@react-native-clipboard/clipboard';
import LinearSurface from '../components/primitives/LinearSurface';
import { useScrollRestoration, usePersistedInput } from '../hooks/useScrollRestoration';
import {
  getLectureHistory,
  searchLectureNotes,
  deleteLectureNote,
  updateLectureTranscriptNote,
  updateLectureTranscriptSummary,
  getLectureNoteById,
  type LectureHistoryItem,
} from '../db/queries/aiCache';
import { linearTheme as n } from '../theme/linearTheme';
import { blackAlpha, whiteAlpha, captureFillAlpha, captureBorderAlpha } from '../theme/colorUtils';
import LoadingOrb from '../components/LoadingOrb';
import { CONFIDENCE_LABELS } from '../constants/gamification';
import { loadTranscriptFromFile } from '../services/transcriptStorage';
import { dbEvents, DB_EVENT_KEYS } from '../services/databaseEvents';
import { MarkdownRender } from '../components/MarkdownRender';
import { resolveLectureSubjectLabel } from '../services/lecture/lectureIdentity';
import {
  copyLectureTranscript,
  filterLectureHistoryItems,
  lectureNeedsAiNote,
  lectureNeedsReview,
  regenerateLectureNoteFromTranscript,
  removeLectureRecording,
  transcribeLectureRecordingToNote,
  type LectureManagerFilter,
} from '../services/lecture/lectureManager';
import { showInfo, showSuccess, showError, confirmDestructive } from '../components/dialogService';
import BannerSearchBar from '../components/BannerSearchBar';
import ScreenHeader from '../components/ScreenHeader';
import TranscriptionSettingsPanel from '../components/TranscriptionSettingsPanel';
import SubjectChip from '../components/SubjectChip';
import TopicPillRow from '../components/TopicPillRow';

import { MenuNav } from '../navigation/typedHooks';
const SUBJECT_COLORS: Record<string, string> = {
  Physiology: n.colors.success,
  Anatomy: '#2196F3',
  Biochemistry: '#9C27B0',
  Pathology: '#E91E63',
  Microbiology: n.colors.warning,
  Pharmacology: '#00BCD4',
  Medicine: '#3F51B5',
  Surgery: n.colors.error,
  OBG: '#E91E63',
  Pediatrics: '#8BC34A',
  Ophthalmology: '#03A9F4',
  ENT: '#FFEB3B',
  Psychiatry: '#673AB7',
  Radiology: '#607D8B',
  Anesthesia: '#795548',
  Dermatology: '#FF5722',
  Orthopedics: '#009688',
  'Forensic Medicine': '#455A64',
  SPM: '#CDDC39',
  Unknown: n.colors.textMuted,
  General: n.colors.textMuted,
};

import { extractFirstLine, getLectureTitle } from '../services/transcripts/formatters';
import TranscriptSection from './transcripts/TranscriptSection';
import AudioPlayer from '../components/AudioPlayer';

export default function TranscriptHistoryScreen() {
  const navigation = MenuNav.useNav();
  const route = MenuNav.useRoute<'TranscriptHistory'>();
  const { onScroll, onContentSizeChange, listRef } = useScrollRestoration('transcript-history');
  const [searchValue, setSearchPersisted] = usePersistedInput('transcript-history-search', '');
  const [notes, setNotes] = useState<LectureHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNote, setSelectedNote] = useState<LectureHistoryItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [renameText, setRenameText] = useState('');
  const [showRenameEditor, setShowRenameEditor] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'subject' | 'confidence'>('date');
  const [managerFilter, setManagerFilter] = useState<LectureManagerFilter>('all');
  const [isManagerBusy, setIsManagerBusy] = useState(false);
  const [readerContent, setReaderContent] = useState<string | null>(null);
  const [readerTitle, setReaderTitle] = useState('');
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Pagination
  const PAGE_SIZE = 20;
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const items = await getLectureHistory(200);
      setNotes(items);
      setDisplayCount(PAGE_SIZE);
      setSelectedIds((prev) => prev.filter((id) => items.some((item) => item.id === id)));
    } finally {
      setLoading(false);
    }
  }, []);

  const sortedNotes = React.useMemo(() => {
    if (sortBy === 'subject') {
      return [...notes].sort((a, b) => (a.subjectName ?? '').localeCompare(b.subjectName ?? ''));
    }
    if (sortBy === 'confidence') {
      return [...notes].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    }
    return notes; // default: date DESC from DB
  }, [notes, sortBy]);

  const visibleNotes = useMemo(
    () => filterLectureHistoryItems(searchValue ? notes : sortedNotes, managerFilter),
    [managerFilter, notes, searchValue, sortedNotes],
  );
  const selectedNeedsAiNote = selectedNote ? lectureNeedsAiNote(selectedNote) : false;
  const isFilterActive = managerFilter !== 'all';
  const selectedHasRecordingOnly = !!(selectedNote?.recordingPath && !selectedNote?.transcript);
  const recordingsCount = useMemo(
    () => notes.filter((item) => Boolean(item.recordingPath)).length,
    [notes],
  );
  const transcriptCount = useMemo(
    () => notes.filter((item) => Boolean(item.transcript)).length,
    [notes],
  );
  const needsAiCount = useMemo(
    () => notes.filter((item) => lectureNeedsAiNote(item)).length,
    [notes],
  );
  const needsReviewCount = useMemo(
    () => notes.filter((item) => lectureNeedsReview(item)).length,
    [notes],
  );

  useEffect(() => {
    const onLectureSaved = () => void loadNotes();
    dbEvents.on(DB_EVENT_KEYS.LECTURE_SAVED, onLectureSaved);
    return () => {
      dbEvents.off(DB_EVENT_KEYS.LECTURE_SAVED, onLectureSaved);
    };
  }, [loadNotes]);

  const isSelectionMode = selectedIds.length > 0;

  useFocusEffect(
    useCallback(() => {
      void loadNotes();
      return () => {
        // Clean up search debounce timer on unmount/blur
        if (searchTimeout.current) {
          clearTimeout(searchTimeout.current);
          searchTimeout.current = null;
        }
      };
    }, [loadNotes]),
  );

  useFocusEffect(
    useCallback(() => {
      const noteId = route.params?.noteId;
      if (!noteId) return;
      void getLectureNoteById(noteId).then((target) => {
        if (target) {
          setSelectedNote(target);
          navigation.setParams({ noteId: undefined });
        }
      });
    }, [navigation, route.params?.noteId]),
  );

  const handleSearch = (query: string) => {
    setSearchPersisted(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      if (query.trim()) {
        const results = await searchLectureNotes(query.trim());
        setNotes(results);
      } else {
        await loadNotes();
      }
    }, 300);
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setSearchPersisted('');
    setManagerFilter('all');
    await loadNotes();
    setRefreshing(false);
  }, [loadNotes, setSearchPersisted]);

  const handleDelete = async (id: number) => {
    const ok = await confirmDestructive('Delete transcript?', 'This action cannot be undone.');
    if (!ok) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await deleteLectureNote(id);
    await loadNotes();
    setSelectedNote(null);
  };

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  }, []);

  const handleLongPressItem = useCallback(
    (id: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      toggleSelection(id);
    },
    [toggleSelection],
  );

  const cancelSelection = () => {
    setSelectedIds([]);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    const idsToDelete = [...selectedIds];
    const ok = await confirmDestructive(
      `Delete ${idsToDelete.length} transcript${idsToDelete.length !== 1 ? 's' : ''}?`,
      'This action cannot be undone.',
    );
    if (!ok) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    for (const id of idsToDelete) {
      await deleteLectureNote(id);
    }
    setSelectedIds([]);
    if (selectedNote && idsToDelete.includes(selectedNote.id)) {
      setSelectedNote(null);
    }
    await loadNotes();
  };

  const openRename = () => {
    if (!selectedNote) return;
    const current = getLectureTitle(selectedNote);
    setRenameText(current);
    setShowRenameEditor(true);
  };

  const saveRename = async () => {
    if (!selectedNote) return;
    const next = renameText.trim();
    await updateLectureTranscriptSummary(selectedNote.id, next.length > 0 ? next : null);
    setSelectedNote({ ...selectedNote, summary: next.length > 0 ? next : null });
    setShowRenameEditor(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadNotes();
  };

  const handleCopyTranscript = async () => {
    if (!selectedNote) return;
    const copied = await copyLectureTranscript(selectedNote.transcript);
    if (!copied) {
      void showInfo('No transcript', 'There is no transcript text available to copy.');
      return;
    }
    Haptics.selectionAsync();
    void showInfo('Copied', 'Transcript copied to clipboard.');
  };

  const handleGenerateAiOutput = async () => {
    if (!selectedNote) return;
    setIsManagerBusy(true);
    try {
      const updated = selectedHasRecordingOnly
        ? await transcribeLectureRecordingToNote(selectedNote.id)
        : await regenerateLectureNoteFromTranscript(selectedNote.id);
      setSelectedNote(updated);
      await loadNotes();
      void showSuccess(
        'Done',
        selectedHasRecordingOnly
          ? 'Recording transcribed and AI note generated.'
          : 'AI note regenerated from the saved transcript.',
      );
    } catch (err) {
      void showError(err, 'Could not generate note');
    } finally {
      setIsManagerBusy(false);
    }
  };

  const handleRemoveRecording = async () => {
    if (!selectedNote?.recordingPath) return;
    const ok = await confirmDestructive(
      'Delete recording?',
      'This removes the saved audio file for this lecture.',
    );
    if (!ok) return;
    setIsManagerBusy(true);
    try {
      await removeLectureRecording(selectedNote.id, selectedNote.recordingPath);
      const updated = { ...selectedNote, recordingPath: null };
      setSelectedNote(updated);
      await loadNotes();
    } finally {
      setIsManagerBusy(false);
    }
  };

  const handleClearAiNote = async () => {
    if (!selectedNote) return;
    const ok = await confirmDestructive(
      'Clear AI note?',
      'This keeps the transcript but removes the generated note.',
    );
    if (!ok) return;
    setIsManagerBusy(true);
    try {
      await updateLectureTranscriptNote(selectedNote.id, '');
      setSelectedNote({ ...selectedNote, note: '' });
      await loadNotes();
    } finally {
      setIsManagerBusy(false);
    }
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const formatDuration = (mins: number | null): string => {
    if (!mins) return '';
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const renderNote = useCallback(
    ({ item }: { item: LectureHistoryItem }) => {
      const isSelected = selectedIds.includes(item.id);
      const subjectLabel = resolveLectureSubjectLabel(item);
      return (
        <TouchableOpacity
          onLongPress={() => handleLongPressItem(item.id)}
          delayLongPress={220}
          onPress={() => {
            if (isSelectionMode) {
              Haptics.selectionAsync();
              toggleSelection(item.id);
              return;
            }
            Haptics.selectionAsync();
            setSelectedNote(item);
          }}
          activeOpacity={0.7}
        >
          <LinearSurface
            padded={false}
            style={[styles.noteCard, isSelected && styles.noteCardSelected]}
          >
            {isSelectionMode && (
              <View style={styles.selectionTickWrap}>
                <Ionicons
                  name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={isSelected ? n.colors.accent : n.colors.textMuted}
                />
              </View>
            )}
            <View style={styles.noteHeader}>
              <SubjectChip
                subject={subjectLabel}
                color="#fff"
                backgroundColor={SUBJECT_COLORS[subjectLabel] ?? n.colors.textMuted}
                borderColor={SUBJECT_COLORS[subjectLabel] ?? n.colors.textMuted}
                style={styles.subjectChip}
              />
              <LinearText style={styles.dateText}>{formatDate(item.createdAt)}</LinearText>
            </View>

            {item.appName && <LinearText style={styles.appBadge}>via {item.appName}</LinearText>}

            <LinearText style={styles.summaryText} numberOfLines={3}>
              {getLectureTitle(item)}
            </LinearText>
            <LinearText style={styles.summaryPreviewText} numberOfLines={3}>
              {item.summary || extractFirstLine(item.note)}
            </LinearText>
            <View style={styles.statusRow}>
              {item.recordingPath ? (
                <LinearText style={styles.statusBadge}>Recording</LinearText>
              ) : null}
              {item.transcript ? (
                <LinearText style={styles.statusBadge}>Transcript</LinearText>
              ) : null}
              {lectureNeedsAiNote(item) ? (
                <LinearText style={styles.statusBadgeWarn}>Needs AI Note</LinearText>
              ) : null}
              {lectureNeedsReview(item) ? (
                <LinearText style={styles.statusBadgeWarn}>Needs Review</LinearText>
              ) : null}
            </View>

            <View style={styles.noteFooter}>
              {item.topics.length > 0 && (
                <TopicPillRow
                  topics={item.topics}
                  wrap
                  maxVisible={3}
                  rowStyle={styles.topicsRow}
                  pillStyle={styles.topicPill}
                  moreBadgeStyle={styles.moreBadge}
                />
              )}
              <View style={styles.metaRow}>
                {item.durationMinutes ? (
                  <LinearText style={styles.metaText}>
                    <Ionicons name="time-outline" size={12} color={n.colors.textMuted} />{' '}
                    {formatDuration(item.durationMinutes)}
                  </LinearText>
                ) : null}
                <LinearText
                  style={[
                    styles.confidenceBadge,
                    {
                      backgroundColor:
                        item.confidence === 3
                          ? n.colors.success
                          : item.confidence === 2
                            ? n.colors.warning
                            : n.colors.error,
                    },
                  ]}
                >
                  {CONFIDENCE_LABELS[item.confidence as 1 | 2 | 3]}
                </LinearText>
              </View>
            </View>
          </LinearSurface>
        </TouchableOpacity>
      );
    },
    [selectedIds, isSelectionMode, handleLongPressItem, toggleSelection, setSelectedNote],
  );

  return (
    // eslint-disable-next-line guru/prefer-screen-shell -- SafeAreaView needed here
    <SafeAreaView style={styles.container}>
      <ErrorBoundary>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        {loading ? (
          <View style={styles.loadingState}>
            <LoadingOrb message="Loading transcripts..." size={120} />
          </View>
        ) : null}
        <ScreenHeader
          title="Transcript Vault"
          onBackPress={() => navigation.navigate('NotesHub')}
          searchElement={
            <BannerSearchBar
              value={searchValue}
              onChangeText={handleSearch}
              placeholder="Search transcripts, topics, concepts..."
              containerStyle={styles.headerSearchRight}
            />
          }
          showSettings
        ></ScreenHeader>
        {isSelectionMode && (
          <LinearSurface padded={false} style={styles.selectionModeBanner}>
            <LinearText style={styles.selectionModeBannerText}>
              ✓ Selection mode — {selectedIds.length} selected · Long-press to add
            </LinearText>
            <TouchableOpacity onPress={cancelSelection}>
              <LinearText style={styles.selectionModeCancelText}>Cancel</LinearText>
            </TouchableOpacity>
          </LinearSurface>
        )}
        <TranscriptionSettingsPanel />

        {notes.length > 0 && (
          <LinearSurface compact style={styles.overviewCard}>
            <View style={styles.overviewHeader}>
              <View style={styles.overviewCopy}>
                <LinearText variant="meta" tone="accent" style={styles.overviewEyebrow}>
                  LECTURE LIBRARY
                </LinearText>
                <LinearText variant="sectionTitle" style={styles.overviewTitle}>
                  Search, triage, and reopen captured lectures
                </LinearText>
                <LinearText variant="bodySmall" tone="secondary" style={styles.overviewText}>
                  Keep recordings, transcripts, AI notes, and review follow-ups in one calmer
                  revision queue.
                </LinearText>
              </View>
              <View style={styles.overviewPill}>
                <LinearText variant="chip" tone="accent">
                  {visibleNotes.length} visible
                </LinearText>
              </View>
            </View>
            <View style={styles.overviewMetricsRow}>
              <View style={styles.overviewMetricCard}>
                <LinearText variant="title" tone="primary" style={styles.overviewMetricValue}>
                  {notes.length}
                </LinearText>
                <LinearText variant="caption" tone="secondary" style={styles.overviewMetricLabel}>
                  Total lectures
                </LinearText>
              </View>
              <View style={styles.overviewMetricCard}>
                <LinearText variant="title" tone="success" style={styles.overviewMetricValue}>
                  {recordingsCount}
                </LinearText>
                <LinearText variant="caption" tone="secondary" style={styles.overviewMetricLabel}>
                  With recording
                </LinearText>
              </View>
              <View style={styles.overviewMetricCard}>
                <LinearText variant="title" tone="warning" style={styles.overviewMetricValue}>
                  {needsAiCount}
                </LinearText>
                <LinearText variant="caption" tone="secondary" style={styles.overviewMetricLabel}>
                  Need AI note
                </LinearText>
              </View>
              <View style={styles.overviewMetricCard}>
                <LinearText variant="title" tone="warning" style={styles.overviewMetricValue}>
                  {needsReviewCount}
                </LinearText>
                <LinearText variant="caption" tone="secondary" style={styles.overviewMetricLabel}>
                  Need review
                </LinearText>
              </View>
            </View>
          </LinearSurface>
        )}

        {notes.length > 0 && (
          <LinearSurface compact style={styles.toolbarCard}>
            <View style={styles.statsBar}>
              {isSelectionMode ? (
                <LinearSurface padded={false} style={styles.selectionBar}>
                  <LinearText style={styles.selectionText}>
                    {selectedIds.length} selected
                  </LinearText>
                  <View style={styles.selectionActions}>
                    <TouchableOpacity style={styles.selectionCancelBtn} onPress={cancelSelection}>
                      <LinearText style={styles.selectionCancelText}>Cancel</LinearText>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.selectionDeleteBtn} onPress={handleBatchDelete}>
                      <Ionicons name="trash-outline" size={14} color="#fff" />
                      <LinearText style={styles.selectionDeleteText}>Delete</LinearText>
                    </TouchableOpacity>
                  </View>
                </LinearSurface>
              ) : (
                <LinearText style={styles.statsText}>
                  {visibleNotes.length} of {notes.length} lecture{notes.length !== 1 ? 's' : ''}{' '}
                  shown · {transcriptCount} transcript{transcriptCount !== 1 ? 's' : ''}
                </LinearText>
              )}
            </View>

            {!searchValue && (
              <View style={styles.sortBar}>
                {(['date', 'subject', 'confidence'] as const).map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.sortBtn, sortBy === opt && styles.sortBtnActive]}
                    onPress={() => setSortBy(opt)}
                    activeOpacity={0.7}
                  >
                    <LinearText
                      style={[styles.sortBtnText, sortBy === opt && styles.sortBtnTextActive]}
                    >
                      {opt === 'date' ? 'Newest' : opt === 'subject' ? 'Subject' : 'Confidence'}
                    </LinearText>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.filterBar}>
              {(
                [
                  ['all', 'All'],
                  ['recording', 'Has Recording'],
                  ['transcript', 'Has Transcript'],
                  ['needs_ai', 'Needs AI'],
                  ['needs_review', 'Needs Review'],
                ] as const
              ).map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.filterChip, managerFilter === value && styles.filterChipActive]}
                  onPress={() => setManagerFilter(value)}
                  activeOpacity={0.7}
                >
                  <LinearText
                    style={[
                      styles.filterChipText,
                      managerFilter === value && styles.filterChipTextActive,
                    ]}
                  >
                    {label}
                  </LinearText>
                </TouchableOpacity>
              ))}
            </View>
          </LinearSurface>
        )}

        {/* Empty state */}
        {visibleNotes.length === 0 && !searchValue && (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color={n.colors.textMuted} />
            <LinearText style={styles.emptyTitle}>
              {isFilterActive ? 'No Lectures Match This Filter' : 'No Transcripts Yet'}
            </LinearText>
            <LinearText style={styles.emptySubtitle}>
              {isFilterActive
                ? 'Try another filter or clear filters to see the full lecture list.'
                : 'Use a lecture app and your sessions will be transcribed and saved here for revision'}
            </LinearText>
          </View>
        )}

        {/* No results */}
        {visibleNotes.length === 0 && searchValue && (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={48} color={n.colors.textMuted} />
            <LinearText style={styles.emptyTitle}>No Results</LinearText>
            <LinearText style={styles.emptySubtitle}>
              No transcripts match "{searchValue}"
            </LinearText>
          </View>
        )}

        {/* Notes list */}
        <FlatList
          ref={listRef}
          data={visibleNotes.slice(0, displayCount)}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderNote}
          contentContainerStyle={styles.listContent}
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
          ListFooterComponent={
            displayCount < visibleNotes.length ? (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={() => setDisplayCount((prev) => prev + PAGE_SIZE)}
                activeOpacity={0.7}
              >
                <LinearText style={styles.loadMoreText}>
                  Load More ({visibleNotes.length - displayCount} remaining)
                </LinearText>
              </TouchableOpacity>
            ) : null
          }
        />

        {/* Detail modal */}
        <Modal
          visible={!!selectedNote}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedNote(null)}
        >
          <View style={styles.modalOverlay}>
            <LinearSurface padded={false} style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <LinearText style={styles.modalTitle} numberOfLines={2}>
                  {selectedNote ? resolveLectureSubjectLabel(selectedNote) : 'Lecture'} Transcript
                </LinearText>
                <View style={styles.modalHeaderActions}>
                  <TouchableOpacity
                    style={styles.headerActionBtn}
                    onPress={openRename}
                    accessibilityRole="button"
                    accessibilityLabel="Rename transcript"
                  >
                    <Ionicons name="create-outline" size={18} color={n.colors.accent} />
                    <LinearText style={styles.headerActionText}>Rename</LinearText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.headerActionBtn}
                    onPress={() => selectedNote && handleDelete(selectedNote.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Delete transcript"
                  >
                    <Ionicons name="trash-outline" size={18} color={n.colors.error} />
                    <LinearText style={[styles.headerActionText, { color: n.colors.error }]}>
                      Delete
                    </LinearText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.headerActionBtn}
                    onPress={() => setSelectedNote(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={22} color={n.colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView style={styles.modalScroll}>
                {/* Meta info */}
                <View style={styles.modalMeta}>
                  {selectedNote && (
                    <LinearText style={styles.customTitleText}>
                      {getLectureTitle(selectedNote)}
                    </LinearText>
                  )}
                  {selectedNote?.appName && (
                    <LinearText style={styles.modalMetaText}>
                      via {selectedNote.appName} • {formatDate(selectedNote.createdAt)}
                      {selectedNote.durationMinutes
                        ? ` • ${formatDuration(selectedNote.durationMinutes)}`
                        : ''}
                    </LinearText>
                  )}
                  <LinearText
                    style={[
                      styles.confidenceBadge,
                      {
                        backgroundColor:
                          (selectedNote?.confidence ?? 2) === 3
                            ? n.colors.success
                            : (selectedNote?.confidence ?? 2) === 2
                              ? n.colors.warning
                              : n.colors.error,
                        alignSelf: 'flex-start',
                        marginTop: 8,
                      },
                    ]}
                  >
                    {CONFIDENCE_LABELS[(selectedNote?.confidence ?? 2) as 1 | 2 | 3]}
                  </LinearText>
                </View>

                {showRenameEditor && (
                  <LinearSurface padded={false} style={styles.renameCard}>
                    <LinearText style={styles.renameLabel}>Rename transcript</LinearText>
                    <TextInput
                      style={styles.renameInput}
                      value={renameText}
                      onChangeText={setRenameText}
                      placeholder="Enter title"
                      placeholderTextColor={n.colors.textMuted}
                      autoFocus
                    />
                    <View style={styles.renameActions}>
                      <TouchableOpacity
                        style={styles.renameCancelBtn}
                        onPress={() => setShowRenameEditor(false)}
                      >
                        <LinearText style={styles.renameCancelText}>Cancel</LinearText>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.renameSaveBtn} onPress={saveRename}>
                        <LinearText style={styles.renameSaveText}>Save</LinearText>
                      </TouchableOpacity>
                    </View>
                  </LinearSurface>
                )}

                {/* Topics */}
                {selectedNote && selectedNote.topics.length > 0 && (
                  <View style={styles.modalSection}>
                    <LinearText style={styles.modalSectionTitle}>Topics Covered</LinearText>
                    <View style={styles.topicsWrap}>
                      {selectedNote.topics.map((t, i) => (
                        <LinearText key={i} style={styles.topicPillLarge}>
                          {t}
                        </LinearText>
                      ))}
                    </View>
                  </View>
                )}

                {/* Audio Player */}
                {selectedNote?.recordingPath && <AudioPlayer uri={selectedNote.recordingPath} />}

                <View style={styles.managerActionGrid}>
                  <TouchableOpacity
                    style={[
                      styles.managerActionBtn,
                      isManagerBusy && styles.managerActionBtnDisabled,
                    ]}
                    onPress={handleGenerateAiOutput}
                    disabled={isManagerBusy}
                  >
                    <Ionicons name="sparkles-outline" size={18} color={n.colors.accent} />
                    <LinearText style={styles.managerActionText}>
                      {selectedHasRecordingOnly
                        ? 'Transcribe Audio'
                        : selectedNeedsAiNote
                          ? 'Generate AI Note'
                          : 'Regenerate AI Note'}
                    </LinearText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.managerActionBtn,
                      isManagerBusy && styles.managerActionBtnDisabled,
                    ]}
                    onPress={handleCopyTranscript}
                    disabled={isManagerBusy}
                  >
                    <Ionicons name="copy-outline" size={18} color={n.colors.textPrimary} />
                    <LinearText style={styles.managerActionText}>Copy Transcript</LinearText>
                  </TouchableOpacity>
                  {selectedNote?.recordingPath ? (
                    <TouchableOpacity
                      style={[
                        styles.managerActionBtn,
                        isManagerBusy && styles.managerActionBtnDisabled,
                      ]}
                      onPress={handleRemoveRecording}
                      disabled={isManagerBusy}
                    >
                      <Ionicons name="trash-outline" size={18} color={n.colors.warning} />
                      <LinearText style={styles.managerActionText}>Delete Recording</LinearText>
                    </TouchableOpacity>
                  ) : null}
                  {selectedNote?.note?.trim() ? (
                    <TouchableOpacity
                      style={[
                        styles.managerActionBtn,
                        isManagerBusy && styles.managerActionBtnDisabled,
                      ]}
                      onPress={handleClearAiNote}
                      disabled={isManagerBusy}
                    >
                      <Ionicons name="document-text-outline" size={18} color={n.colors.error} />
                      <LinearText style={styles.managerActionText}>Clear AI Note</LinearText>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* ADHD-formatted study note */}
                {selectedNote?.note && (
                  <View style={styles.modalSection}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <LinearText style={styles.modalSectionTitle}>Study Note</LinearText>
                      <TouchableOpacity
                        style={styles.readerOpenBtn}
                        onPress={() => {
                          setReaderTitle(getLectureTitle(selectedNote));
                          setReaderContent(selectedNote.note);
                        }}
                      >
                        <Ionicons name="book-outline" size={16} color={n.colors.accent} />
                        <LinearText style={styles.readerOpenText}>Read</LinearText>
                      </TouchableOpacity>
                    </View>
                    <LinearSurface padded={false} style={styles.studyNoteCard}>
                      <MarkdownRender content={selectedNote.note} />
                    </LinearSurface>
                  </View>
                )}

                {/* Full transcript (collapsible) */}
                {selectedNote?.transcript && (
                  <View style={{ marginBottom: 12 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                      }}
                    >
                      <View />
                      <TouchableOpacity
                        style={styles.readerOpenBtn}
                        onPress={async () => {
                          const text = await loadTranscriptFromFile(selectedNote.transcript!);
                          setReaderTitle('Raw Transcript');
                          setReaderContent(text || 'No transcript available.');
                        }}
                      >
                        <Ionicons name="book-outline" size={16} color={n.colors.accent} />
                        <LinearText style={styles.readerOpenText}>Read Full</LinearText>
                      </TouchableOpacity>
                    </View>
                    <TranscriptSection transcript={selectedNote.transcript} />
                  </View>
                )}
              </ScrollView>
            </LinearSurface>
          </View>
        </Modal>

        {/* Full-screen reader */}
        <Modal
          visible={!!readerContent}
          animationType="slide"
          onRequestClose={() => setReaderContent(null)}
        >
          <View style={styles.readerContainer}>
            <LinearSurface padded={false} style={styles.readerHeader}>
              <TouchableOpacity
                onPress={() => setReaderContent(null)}
                style={styles.readerCloseBtn}
              >
                <Ionicons name="arrow-back" size={22} color={n.colors.textPrimary} />
              </TouchableOpacity>
              <LinearText style={styles.readerHeaderTitle} numberOfLines={2}>
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
            </LinearSurface>
            <ScrollView
              style={styles.readerScroll}
              contentContainerStyle={styles.readerScrollContent}
              showsVerticalScrollIndicator
            >
              <MarkdownRender content={readerContent ?? ''} />
            </ScrollView>
          </View>
        </Modal>
      </ErrorBoundary>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: n.colors.background },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: n.colors.surface,
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 52,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: n.colors.textPrimary,
    minHeight: 24,
    paddingVertical: 0,
  },
  overviewCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
  },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: n.spacing.md,
  },
  overviewCopy: {
    flex: 1,
  },
  overviewEyebrow: {
    letterSpacing: 1.1,
  },
  overviewTitle: {
    marginTop: n.spacing.xs,
  },
  overviewText: {
    marginTop: n.spacing.xs,
  },
  overviewPill: {
    backgroundColor: n.colors.primaryTintSoft,
    borderRadius: n.radius.full,
    borderWidth: 1,
    borderColor: n.colors.borderHighlight,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  overviewMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: n.spacing.md,
  },
  overviewMetricCard: {
    flexGrow: 1,
    minWidth: 110,
    backgroundColor: n.colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: n.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  overviewMetricValue: {
    marginBottom: 2,
  },
  overviewMetricLabel: {
    lineHeight: 16,
  },
  toolbarCard: {
    marginHorizontal: 16,
    marginBottom: 10,
  },
  statsBar: {
    paddingBottom: 8,
  },
  statsText: { color: n.colors.textMuted, fontSize: 13 },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectionText: { color: n.colors.textPrimary, fontSize: 14, fontWeight: '700' },
  selectionActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectionCancelBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  selectionCancelText: { color: n.colors.textMuted, fontSize: 13, fontWeight: '600' },
  selectionDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: n.colors.error,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  selectionDeleteText: { color: n.colors.textPrimary, fontSize: 12, fontWeight: '700' },
  listContent: { paddingHorizontal: 16, paddingBottom: 80 },
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
  sortBar: { flexDirection: 'row', paddingVertical: 8, gap: 8 },
  sortBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: n.colors.border,
    backgroundColor: n.colors.surface,
  },
  sortBtnActive: {
    borderColor: n.colors.accent,
    backgroundColor: n.colors.accent + '22',
  },
  sortBtnText: { color: n.colors.textMuted, fontSize: 13, fontWeight: '600' },
  sortBtnTextActive: { color: n.colors.accent, fontWeight: '700' },
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: n.colors.border,
    backgroundColor: n.colors.surface,
  },
  filterChipActive: {
    borderColor: n.colors.accent,
    backgroundColor: n.colors.accent + '22',
  },
  filterChipText: { color: n.colors.textSecondary, fontSize: 12, fontWeight: '600' },
  filterChipTextActive: { color: n.colors.accent, fontWeight: '700' },

  noteCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  noteCardSelected: {
    borderWidth: 1,
    borderColor: n.colors.accent,
    backgroundColor: n.colors.primaryTintSoft,
  },
  selectionTickWrap: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  subjectChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    flexShrink: 1,
  },
  dateText: {
    color: n.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
    marginLeft: 'auto',
    textAlign: 'right',
    minWidth: 72,
  },
  appBadge: { color: n.colors.textMuted, fontSize: 11, marginBottom: 6 },
  summaryText: { color: n.colors.textPrimary, fontSize: 15, lineHeight: 22, marginBottom: 10 },
  summaryPreviewText: {
    color: n.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 10,
  },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  statusBadge: {
    backgroundColor: n.colors.surface,
    color: n.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    overflow: 'hidden',
  },
  statusBadgeWarn: {
    backgroundColor: `${n.colors.warning}18`,
    color: n.colors.warning,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    overflow: 'hidden',
  },
  noteFooter: {},
  topicsRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  topicPill: {
    backgroundColor: n.colors.surface,
    color: n.colors.textSecondary,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginRight: 6,
    marginBottom: 4,
    overflow: 'hidden',
  },
  moreBadge: { color: n.colors.textMuted, fontSize: 11, marginLeft: 4, alignSelf: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaText: { color: n.colors.textMuted, fontSize: 12, lineHeight: 18 },
  confidenceBadge: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: n.colors.textPrimary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },

  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 100,
  },
  emptyTitle: { color: n.colors.textPrimary, fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtitle: { color: n.colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 8 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: blackAlpha['85'],
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    flex: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: n.colors.border,
  },
  modalTitle: {
    color: n.colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    lineHeight: 24,
  },
  modalHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 10 },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  headerActionText: { color: n.colors.accent, fontSize: 12, fontWeight: '600' },
  modalScroll: { padding: 16, flexGrow: 1 },
  modalMeta: { marginBottom: 16 },
  customTitleText: {
    color: n.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  modalMetaText: { color: n.colors.textSecondary, fontSize: 13 },
  renameCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  renameLabel: {
    color: n.colors.textSecondary,
    fontSize: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  renameInput: {
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: n.colors.textPrimary,
    fontSize: 15,
  },
  renameActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  renameCancelBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  renameCancelText: { color: n.colors.textMuted, fontSize: 13, fontWeight: '600' },
  renameSaveBtn: {
    backgroundColor: captureFillAlpha['14'],
    borderWidth: 1,
    borderColor: captureBorderAlpha['24'],
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  renameSaveText: { color: n.colors.textPrimary, fontSize: 13, fontWeight: '700' },
  modalSection: { marginBottom: 20 },
  modalSectionTitle: {
    color: n.colors.textSecondary,
    fontSize: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  managerActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  managerActionBtn: {
    minWidth: '46%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: whiteAlpha['14'],
    backgroundColor: whiteAlpha['6'],
  },
  managerActionBtnDisabled: {
    opacity: 0.55,
  },
  managerActionText: {
    color: n.colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  studyNoteCard: {
    borderRadius: n.radius.lg,
    paddingHorizontal: n.spacing.lg,
    paddingVertical: n.spacing.md,
  },
  modalText: { color: n.colors.textMuted, fontSize: 15, lineHeight: 22 },
  topicsWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  topicPillLarge: {
    backgroundColor: n.colors.surface,
    color: n.colors.textPrimary,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    marginRight: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  transcriptText: {
    color: n.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'Inter_400Regular',
    padding: 12,
    borderRadius: 8,
  },
  transcriptCard: {
    borderRadius: 8,
  },
  selectionModeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: n.colors.accent + '22',
    borderBottomWidth: 1,
    borderBottomColor: n.colors.accent + '55',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  selectionModeBannerText: { color: n.colors.accent, fontSize: 13, fontWeight: '600' },
  selectionModeCancelText: { color: n.colors.accent, fontSize: 13, fontWeight: '800' },
  headerSearchRight: { marginTop: 0 },
  readerOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: n.colors.accent + '18',
  },
  readerOpenText: { color: n.colors.accent, fontSize: 12, fontWeight: '700' },
  readerContainer: { flex: 1, backgroundColor: n.colors.background },
  readerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: n.colors.border,
  },
  readerCloseBtn: { padding: 6, marginRight: 8 },
  readerHeaderTitle: {
    flex: 1,
    color: n.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  readerCopyBtn: { padding: 8 },
  readerScroll: { flex: 1 },
  readerScrollContent: { padding: 20, paddingBottom: 60 },
  loadingState: { alignItems: 'center', justifyContent: 'center', padding: 48, flex: 1 },
  loadingText: { color: n.colors.textMuted, fontSize: 14, marginTop: 16 },
});
