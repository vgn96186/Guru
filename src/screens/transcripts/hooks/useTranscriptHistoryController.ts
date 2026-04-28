import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useScrollRestoration, usePersistedInput } from '../../../hooks/useScrollRestoration';
import {
  getLectureHistory,
  searchLectureNotes,
  deleteLectureNote,
  updateLectureTranscriptNote,
  updateLectureTranscriptSummary,
  getLectureNoteById,
  type LectureHistoryItem,
} from '../../../db/queries/aiCache';
import { dbEvents, DB_EVENT_KEYS } from '../../../services/databaseEvents';
import { getLectureTitle } from '../../../services/transcripts/formatters';
import {
  copyLectureTranscript,
  filterLectureHistoryItems,
  lectureNeedsAiNote,
  lectureNeedsReview,
  regenerateLectureNoteFromTranscript,
  removeLectureRecording,
  transcribeLectureRecordingToNote,
  type LectureManagerFilter,
} from '../../../services/lecture/lectureManager';
import { showInfo, showSuccess, showError, confirmDestructive } from '../../../components/dialogService';
import { MenuNav } from '../../../navigation/typedHooks';

export function useTranscriptHistoryController() {
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

  return {
    navigation,
    route,
    onScroll,
    onContentSizeChange,
    listRef,
    searchValue,
    setSearchPersisted,
    notes,
    setNotes,
    loading,
    setLoading,
    selectedNote,
    setSelectedNote,
    selectedIds,
    setSelectedIds,
    renameText,
    setRenameText,
    showRenameEditor,
    setShowRenameEditor,
    refreshing,
    setRefreshing,
    sortBy,
    setSortBy,
    managerFilter,
    setManagerFilter,
    isManagerBusy,
    setIsManagerBusy,
    readerContent,
    setReaderContent,
    readerTitle,
    setReaderTitle,
    searchTimeout,
    displayCount,
    setDisplayCount,
    loadNotes,
    sortedNotes,
    visibleNotes,
    selectedNeedsAiNote,
    isFilterActive,
    selectedHasRecordingOnly,
    recordingsCount,
    transcriptCount,
    needsAiCount,
    needsReviewCount,
    isSelectionMode,
    handleSearch,
    handleRefresh,
    handleDelete,
    toggleSelection,
    handleLongPressItem,
    cancelSelection,
    handleBatchDelete,
    openRename,
    saveRename,
    handleCopyTranscript,
    handleGenerateAiOutput,
    handleRemoveRecording,
    handleClearAiNote,
    formatDate,
    formatDuration,
    PAGE_SIZE,
  };
}
