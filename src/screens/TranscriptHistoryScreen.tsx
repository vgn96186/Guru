/**
 * TranscriptHistoryScreen
 * Browse and search through past lecture transcriptions
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
  RefreshControl,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Clipboard from '@react-native-clipboard/clipboard';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MenuStackParamList } from '../navigation/types';
import {
  getLectureHistory,
  searchLectureNotes,
  deleteLectureNote,
  updateLectureTranscriptNote,
  updateLectureTranscriptSummary,
  getLectureNoteById,
  type LectureHistoryItem,
} from '../db/queries/aiCache';
import { theme } from '../constants/theme';
import { CONFIDENCE_LABELS } from '../constants/gamification';
import { loadTranscriptFromFile } from '../services/transcriptStorage';
import { dbEvents, DB_EVENT_KEYS } from '../services/databaseEvents';
import { Audio } from 'expo-av';
import { MarkdownRender } from '../components/MarkdownRender';
import {
  buildLectureDisplayTitle,
  resolveLectureSubjectLabel,
} from '../services/lecture/lectureIdentity';
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
import ScreenHeader from '../components/ScreenHeader';
import TranscriptionSettingsPanel from '../components/TranscriptionSettingsPanel';
import SubjectChip from '../components/SubjectChip';
import TopicPillRow from '../components/TopicPillRow';

const SUBJECT_COLORS: Record<string, string> = {
  Physiology: '#4CAF50',
  Anatomy: '#2196F3',
  Biochemistry: '#9C27B0',
  Pathology: '#E91E63',
  Microbiology: '#FF9800',
  Pharmacology: '#00BCD4',
  Medicine: '#3F51B5',
  Surgery: '#F44336',
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
  Unknown: '#9E9E9E',
  General: '#9E9E9E',
};

/** Extract the first meaningful line from a note (skip markdown headers) */
function extractFirstLine(note: string): string {
  const lines = note
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const stripped = line.replace(/^#+\s*/, '').replace(/\*\*/g, '');
    if (stripped.length > 10) return stripped;
  }
  return lines[0] ?? 'Lecture note';
}

function getLectureTitle(
  item: Pick<LectureHistoryItem, 'subjectName' | 'topics' | 'note' | 'summary'>,
): string {
  return buildLectureDisplayTitle({
    subjectName: item.subjectName,
    topics: item.topics,
    note: item.note,
    summary: item.summary,
  });
}

/** Collapsible transcript section */
function TranscriptSection({ transcript }: { transcript: string }) {
  const [content, setContent] = React.useState<string>('Loading transcript...');
  React.useEffect(() => {
    loadTranscriptFromFile(transcript).then((res: string | null) =>
      setContent(res || 'No transcript available.'),
    );
  }, [transcript]);
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={{ marginBottom: 20 }}>
      <TouchableOpacity
        onPress={() => setExpanded(!expanded)}
        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}
        activeOpacity={0.7}
      >
        <Text style={{ color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
          Raw Transcript
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color="#888"
          style={{ marginLeft: 6 }}
        />
      </TouchableOpacity>
      {expanded && (
        <Text
          style={{
            color: '#aaa',
            fontSize: 13,
            lineHeight: 20,
            fontFamily: 'monospace',
            backgroundColor: '#0D0D0D',
            padding: 12,
            borderRadius: 8,
          }}
        >
          {content}
        </Text>
      )}
    </View>
  );
}

function AudioPlayer({ uri }: { uri: string }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const handlePlayPause = async () => {
    if (sound) {
      if (isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        await sound.playAsync();
        setIsPlaying(true);
      }
    } else {
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded) {
            setPosition(status.positionMillis);
            setDuration(status.durationMillis || 0);
            setIsPlaying(status.isPlaying);
          }
        },
      );
      setSound(newSound);
      setIsPlaying(true);
    }
  };

  const seekTo = async (targetMs: number) => {
    if (!sound) return;
    const clamped = Math.max(0, Math.min(duration, targetMs));
    await sound.setPositionAsync(clamped);
    setPosition(clamped);
  };

  const jumpBy = async (deltaMs: number) => {
    await seekTo(position + deltaMs);
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <View style={audioStyles.container}>
      <TouchableOpacity onPress={handlePlayPause} style={audioStyles.playBtn}>
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => void jumpBy(-10000)} style={audioStyles.jumpBtn}>
        <Text style={audioStyles.jumpBtnText}>-10s</Text>
      </TouchableOpacity>
      <View style={audioStyles.progressWrap}>
        <Pressable
          style={audioStyles.progressBar}
          onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
          onPress={(event) => {
            if (!duration || barWidth <= 0) return;
            const next = (event.nativeEvent.locationX / barWidth) * duration;
            void seekTo(next);
          }}
        >
          <View
            style={[
              audioStyles.progressFill,
              { width: `${duration > 0 ? (position / duration) * 100 : 0}%` },
            ]}
          />
        </Pressable>
        <View style={audioStyles.timeRow}>
          <Text style={audioStyles.timeText}>{formatTime(position)}</Text>
          <Text style={audioStyles.timeText}>{formatTime(duration)}</Text>
        </View>
      </View>
      <TouchableOpacity onPress={() => void jumpBy(10000)} style={audioStyles.jumpBtn}>
        <Text style={audioStyles.jumpBtnText}>+10s</Text>
      </TouchableOpacity>
    </View>
  );
}

const audioStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 20,
    gap: 12,
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  jumpBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#23233A',
  },
  jumpBtnText: { color: '#D4D4F7', fontSize: 11, fontWeight: '700' },
  progressWrap: { flex: 1, gap: 4 },
  progressBar: { height: 4, backgroundColor: '#333', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#6C63FF' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  timeText: { color: '#888', fontSize: 10, fontFamily: 'monospace' },
});

export default function TranscriptHistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
  const route = useRoute<RouteProp<MenuStackParamList, 'TranscriptHistory'>>();
  const [notes, setNotes] = useState<LectureHistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
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

  const loadNotes = useCallback(async () => {
    const items = await getLectureHistory(200);
    setNotes(items);
    setSelectedIds((prev) => prev.filter((id) => items.some((item) => item.id === id)));
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
    () => filterLectureHistoryItems(searchQuery ? notes : sortedNotes, managerFilter),
    [managerFilter, notes, searchQuery, sortedNotes],
  );
  const selectedNeedsAiNote = selectedNote ? lectureNeedsAiNote(selectedNote) : false;
  const isFilterActive = managerFilter !== 'all';
  const selectedHasRecordingOnly = !!(selectedNote?.recordingPath && !selectedNote?.transcript);

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
    setSearchQuery(query);
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
    setSearchQuery('');
    setManagerFilter('all');
    await loadNotes();
    setRefreshing(false);
  }, [loadNotes]);

  const handleDelete = (id: number) => {
    Alert.alert('Delete transcript?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await deleteLectureNote(id);
          await loadNotes();
          setSelectedNote(null);
        },
      },
    ]);
  };

  const toggleSelection = (id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };

  const handleLongPressItem = (id: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggleSelection(id);
  };

  const cancelSelection = () => {
    setSelectedIds([]);
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    const idsToDelete = [...selectedIds];
    Alert.alert(
      `Delete ${idsToDelete.length} transcript${idsToDelete.length !== 1 ? 's' : ''}?`,
      'This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            for (const id of idsToDelete) {
              await deleteLectureNote(id);
            }
            setSelectedIds([]);
            if (selectedNote && idsToDelete.includes(selectedNote.id)) {
              setSelectedNote(null);
            }
            await loadNotes();
          },
        },
      ],
    );
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
      Alert.alert('No transcript', 'There is no transcript text available to copy.');
      return;
    }
    Haptics.selectionAsync();
    Alert.alert('Copied', 'Transcript copied to clipboard.');
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
      Alert.alert(
        'Done',
        selectedHasRecordingOnly
          ? 'Recording transcribed and AI note generated.'
          : 'AI note regenerated from the saved transcript.',
      );
    } catch (err) {
      Alert.alert('Could not generate note', err instanceof Error ? err.message : String(err));
    } finally {
      setIsManagerBusy(false);
    }
  };

  const handleRemoveRecording = async () => {
    if (!selectedNote?.recordingPath) return;
    Alert.alert('Delete recording?', 'This removes the saved audio file for this lecture.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete recording',
        style: 'destructive',
        onPress: async () => {
          setIsManagerBusy(true);
          try {
            await removeLectureRecording(selectedNote.id, selectedNote.recordingPath);
            const updated = { ...selectedNote, recordingPath: null };
            setSelectedNote(updated);
            await loadNotes();
          } finally {
            setIsManagerBusy(false);
          }
        },
      },
    ]);
  };

  const handleClearAiNote = async () => {
    if (!selectedNote) return;
    Alert.alert('Clear AI note?', 'This keeps the transcript but removes the generated note.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear note',
        style: 'destructive',
        onPress: async () => {
          setIsManagerBusy(true);
          try {
            await updateLectureTranscriptNote(selectedNote.id, '');
            setSelectedNote({ ...selectedNote, note: '' });
            await loadNotes();
          } finally {
            setIsManagerBusy(false);
          }
        },
      },
    ]);
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

  const renderNote = ({ item }: { item: LectureHistoryItem }) => {
    const isSelected = selectedIds.includes(item.id);
    const subjectLabel = resolveLectureSubjectLabel(item);
    return (
      <TouchableOpacity
        style={[styles.noteCard, isSelected && styles.noteCardSelected]}
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
        {isSelectionMode && (
          <View style={styles.selectionTickWrap}>
            <Ionicons
              name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={isSelected ? '#6C63FF' : '#666'}
            />
          </View>
        )}
        <View style={styles.noteHeader}>
          <SubjectChip
            subject={subjectLabel}
            color="#fff"
            backgroundColor={SUBJECT_COLORS[subjectLabel] ?? '#9E9E9E'}
            borderColor={SUBJECT_COLORS[subjectLabel] ?? '#9E9E9E'}
            style={styles.subjectChip}
          />
          <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
        </View>

        {item.appName && <Text style={styles.appBadge}>via {item.appName}</Text>}

        <Text style={styles.summaryText} numberOfLines={3}>
          {getLectureTitle(item)}
        </Text>
        <Text style={styles.summaryPreviewText} numberOfLines={3}>
          {item.summary || extractFirstLine(item.note)}
        </Text>
        <View style={styles.statusRow}>
          {item.recordingPath ? <Text style={styles.statusBadge}>Recording</Text> : null}
          {item.transcript ? <Text style={styles.statusBadge}>Transcript</Text> : null}
          {lectureNeedsAiNote(item) ? (
            <Text style={styles.statusBadgeWarn}>Needs AI Note</Text>
          ) : null}
          {lectureNeedsReview(item) ? (
            <Text style={styles.statusBadgeWarn}>Needs Review</Text>
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
              <Text style={styles.metaText}>
                <Ionicons name="time-outline" size={12} color="#888" />{' '}
                {formatDuration(item.durationMinutes)}
              </Text>
            ) : null}
            <Text
              style={[
                styles.confidenceBadge,
                {
                  backgroundColor:
                    item.confidence === 3
                      ? '#4CAF50'
                      : item.confidence === 2
                        ? '#FF9800'
                        : '#F44336',
                },
              ]}
            >
              {CONFIDENCE_LABELS[item.confidence as 1 | 2 | 3]}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ScreenHeader
        title="Transcript Vault"
        subtitle="Search, review, and manage captured lectures."
        onBackPress={() => navigation.navigate('NotesHub')}
      />
      {isSelectionMode && (
        <View style={styles.selectionModeBanner}>
          <Text style={styles.selectionModeBannerText}>
            ✓ Selection mode — {selectedIds.length} selected · Long-press to add
          </Text>
          <TouchableOpacity onPress={cancelSelection}>
            <Text style={styles.selectionModeCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
      <TranscriptionSettingsPanel />

      {/* Search bar */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={20} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search transcripts, topics, concepts..."
          placeholderTextColor={theme.colors.textMuted}
          value={searchQuery}
          onChangeText={handleSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <Ionicons name="close-circle" size={20} color="#888" />
          </TouchableOpacity>
        )}
      </View>

      {/* Header stats */}
      <View style={styles.statsBar}>
        {isSelectionMode ? (
          <View style={styles.selectionBar}>
            <Text style={styles.selectionText}>{selectedIds.length} selected</Text>
            <View style={styles.selectionActions}>
              <TouchableOpacity style={styles.selectionCancelBtn} onPress={cancelSelection}>
                <Text style={styles.selectionCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.selectionDeleteBtn} onPress={handleBatchDelete}>
                <Ionicons name="trash-outline" size={14} color="#fff" />
                <Text style={styles.selectionDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={styles.statsText}>
            {visibleNotes.length} of {notes.length} lecture{notes.length !== 1 ? 's' : ''} shown
          </Text>
        )}
      </View>

      {/* Empty state */}
      {visibleNotes.length === 0 && !searchQuery && (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={64} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>
            {isFilterActive ? 'No Lectures Match This Filter' : 'No Transcripts Yet'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {isFilterActive
              ? 'Try another filter or clear filters to see the full lecture list.'
              : 'Use a lecture app and your sessions will be transcribed and saved here for revision'}
          </Text>
        </View>
      )}

      {/* No results */}
      {visibleNotes.length === 0 && searchQuery && (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={48} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>No Results</Text>
          <Text style={styles.emptySubtitle}>No transcripts match "{searchQuery}"</Text>
        </View>
      )}

      {/* Sort bar */}
      {notes.length > 0 && !searchQuery && (
        <View style={styles.sortBar}>
          {(['date', 'subject', 'confidence'] as const).map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.sortBtn, sortBy === opt && styles.sortBtnActive]}
              onPress={() => setSortBy(opt)}
              activeOpacity={0.7}
            >
              <Text style={[styles.sortBtnText, sortBy === opt && styles.sortBtnTextActive]}>
                {opt === 'date' ? 'Newest' : opt === 'subject' ? 'Subject' : 'Confidence'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {notes.length > 0 && (
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
              <Text
                style={[
                  styles.filterChipText,
                  managerFilter === value && styles.filterChipTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Notes list */}
      <FlatList
        data={visibleNotes}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderNote}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.textPrimary}
          />
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
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={2}>
                {selectedNote ? resolveLectureSubjectLabel(selectedNote) : 'Lecture'} Transcript
              </Text>
              <View style={styles.modalHeaderActions}>
                <TouchableOpacity
                  style={styles.headerActionBtn}
                  onPress={openRename}
                  accessibilityRole="button"
                  accessibilityLabel="Rename transcript"
                >
                  <Ionicons name="create-outline" size={18} color={theme.colors.primaryLight} />
                  <Text style={styles.headerActionText}>Rename</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerActionBtn}
                  onPress={() => selectedNote && handleDelete(selectedNote.id)}
                  accessibilityRole="button"
                  accessibilityLabel="Delete transcript"
                >
                  <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                  <Text style={[styles.headerActionText, { color: theme.colors.error }]}>
                    Delete
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerActionBtn}
                  onPress={() => setSelectedNote(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.modalScroll}>
              {/* Meta info */}
              <View style={styles.modalMeta}>
                {selectedNote && (
                  <Text style={styles.customTitleText}>{getLectureTitle(selectedNote)}</Text>
                )}
                {selectedNote?.appName && (
                  <Text style={styles.modalMetaText}>
                    via {selectedNote.appName} • {formatDate(selectedNote.createdAt)}
                    {selectedNote.durationMinutes
                      ? ` • ${formatDuration(selectedNote.durationMinutes)}`
                      : ''}
                  </Text>
                )}
                <Text
                  style={[
                    styles.confidenceBadge,
                    {
                      backgroundColor:
                        (selectedNote?.confidence ?? 2) === 3
                          ? theme.colors.success
                          : (selectedNote?.confidence ?? 2) === 2
                            ? theme.colors.warning
                            : theme.colors.error,
                      alignSelf: 'flex-start',
                      marginTop: 8,
                    },
                  ]}
                >
                  {CONFIDENCE_LABELS[(selectedNote?.confidence ?? 2) as 1 | 2 | 3]}
                </Text>
              </View>

              {showRenameEditor && (
                <View style={styles.renameCard}>
                  <Text style={styles.renameLabel}>Rename transcript</Text>
                  <TextInput
                    style={styles.renameInput}
                    value={renameText}
                    onChangeText={setRenameText}
                    placeholder="Enter title"
                    placeholderTextColor={theme.colors.textMuted}
                    autoFocus
                  />
                  <View style={styles.renameActions}>
                    <TouchableOpacity
                      style={styles.renameCancelBtn}
                      onPress={() => setShowRenameEditor(false)}
                    >
                      <Text style={styles.renameCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.renameSaveBtn} onPress={saveRename}>
                      <Text style={styles.renameSaveText}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Topics */}
              {selectedNote && selectedNote.topics.length > 0 && (
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Topics Covered</Text>
                  <View style={styles.topicsWrap}>
                    {selectedNote.topics.map((t, i) => (
                      <Text key={i} style={styles.topicPillLarge}>
                        {t}
                      </Text>
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
                  <Ionicons name="sparkles-outline" size={18} color={theme.colors.primaryLight} />
                  <Text style={styles.managerActionText}>
                    {selectedHasRecordingOnly
                      ? 'Transcribe Audio'
                      : selectedNeedsAiNote
                        ? 'Generate AI Note'
                        : 'Regenerate AI Note'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.managerActionBtn,
                    isManagerBusy && styles.managerActionBtnDisabled,
                  ]}
                  onPress={handleCopyTranscript}
                  disabled={isManagerBusy}
                >
                  <Ionicons name="copy-outline" size={18} color={theme.colors.textPrimary} />
                  <Text style={styles.managerActionText}>Copy Transcript</Text>
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
                    <Ionicons name="trash-outline" size={18} color={theme.colors.warning} />
                    <Text style={styles.managerActionText}>Delete Recording</Text>
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
                    <Ionicons name="document-text-outline" size={18} color={theme.colors.error} />
                    <Text style={styles.managerActionText}>Clear AI Note</Text>
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
                    <Text style={styles.modalSectionTitle}>Study Note</Text>
                    <TouchableOpacity
                      style={styles.readerOpenBtn}
                      onPress={() => {
                        setReaderTitle(getLectureTitle(selectedNote));
                        setReaderContent(selectedNote.note);
                      }}
                    >
                      <Ionicons name="book-outline" size={16} color={theme.colors.primary} />
                      <Text style={styles.readerOpenText}>Read</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.studyNoteCard}>
                    <MarkdownRender content={selectedNote.note} />
                  </View>
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
                      <Ionicons name="book-outline" size={16} color={theme.colors.primary} />
                      <Text style={styles.readerOpenText}>Read Full</Text>
                    </TouchableOpacity>
                  </View>
                  <TranscriptSection transcript={selectedNote.transcript} />
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Full-screen reader */}
      <Modal
        visible={!!readerContent}
        animationType="slide"
        onRequestClose={() => setReaderContent(null)}
      >
        <View style={styles.readerContainer}>
          <View style={styles.readerHeader}>
            <TouchableOpacity onPress={() => setReaderContent(null)} style={styles.readerCloseBtn}>
              <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.readerHeaderTitle} numberOfLines={2}>
              {readerTitle}
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (readerContent) {
                  Clipboard.setString(readerContent);
                  Haptics.selectionAsync();
                }
              }}
              style={styles.readerCopyBtn}
            >
              <Ionicons name="copy-outline" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.readerScroll}
            contentContainerStyle={styles.readerScrollContent}
            showsVerticalScrollIndicator
          >
            <MarkdownRender content={readerContent ?? ''} />
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
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
    color: '#fff',
    minHeight: 24,
    paddingVertical: 0,
  },
  statsBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  statsText: { color: '#888', fontSize: 13 },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  selectionText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  selectionActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectionCancelBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  selectionCancelText: { color: '#999', fontSize: 13, fontWeight: '600' },
  selectionDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D9534F',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  selectionDeleteText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  listContent: { paddingHorizontal: 16, paddingBottom: 80 },
  sortBar: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  sortBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  sortBtnActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '22',
  },
  sortBtnText: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '600' },
  sortBtnTextActive: { color: theme.colors.primary, fontWeight: '700' },
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2E314B',
    backgroundColor: '#181A27',
  },
  filterChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '22',
  },
  filterChipText: { color: '#B5B8CF', fontSize: 12, fontWeight: '600' },
  filterChipTextActive: { color: theme.colors.primaryLight, fontWeight: '700' },

  noteCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  noteCardSelected: {
    borderWidth: 1,
    borderColor: '#6C63FF',
    backgroundColor: '#232038',
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
    color: '#888',
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
    marginLeft: 'auto',
    textAlign: 'right',
    minWidth: 72,
  },
  appBadge: { color: '#666', fontSize: 11, marginBottom: 6 },
  summaryText: { color: '#ddd', fontSize: 15, lineHeight: 22, marginBottom: 10 },
  summaryPreviewText: { color: '#8f8fa8', fontSize: 13, lineHeight: 20, marginBottom: 10 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  statusBadge: {
    backgroundColor: '#263145',
    color: '#C7D4F5',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    overflow: 'hidden',
  },
  statusBadgeWarn: {
    backgroundColor: '#453118',
    color: '#FFD18A',
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
    backgroundColor: '#333',
    color: '#aaa',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginRight: 6,
    marginBottom: 4,
    overflow: 'hidden',
  },
  moreBadge: { color: '#666', fontSize: 11, marginLeft: 4, alignSelf: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaText: { color: '#888', fontSize: 12, lineHeight: 18 },
  confidenceBadge: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: '#fff',
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
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtitle: { color: '#888', fontSize: 14, textAlign: 'center', marginTop: 8 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
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
    borderBottomColor: '#333',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '600', flex: 1, lineHeight: 24 },
  modalHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 10 },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  headerActionText: { color: '#A09CF7', fontSize: 12, fontWeight: '600' },
  modalScroll: { padding: 16, flexGrow: 1 },
  modalMeta: { marginBottom: 16 },
  customTitleText: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  modalMetaText: { color: theme.colors.textSecondary, fontSize: 13 },
  renameCard: {
    backgroundColor: '#222',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    padding: 12,
    marginBottom: 16,
  },
  renameLabel: {
    color: '#bbb',
    fontSize: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  renameInput: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#3A3A3A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
  },
  renameActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  renameCancelBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  renameCancelText: { color: '#999', fontSize: 13, fontWeight: '600' },
  renameSaveBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  renameSaveText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  modalSection: { marginBottom: 20 },
  modalSectionTitle: {
    color: theme.colors.textSecondary,
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
    borderColor: '#35384D',
    backgroundColor: '#1D1F2C',
  },
  managerActionBtnDisabled: {
    opacity: 0.55,
  },
  managerActionText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  studyNoteCard: {
    backgroundColor: theme.colors.panel,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  modalText: { color: '#ddd', fontSize: 15, lineHeight: 22 },
  topicsWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  topicPillLarge: {
    backgroundColor: '#333',
    color: '#fff',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    marginRight: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  transcriptText: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'monospace',
    backgroundColor: '#0D0D0D',
    padding: 12,
    borderRadius: 8,
  },
  selectionModeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.primary + '22',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.primary + '55',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  selectionModeBannerText: { color: theme.colors.primary, fontSize: 13, fontWeight: '600' },
  selectionModeCancelText: { color: theme.colors.primary, fontSize: 13, fontWeight: '800' },
  readerOpenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: theme.colors.primary + '18',
  },
  readerOpenText: { color: theme.colors.primary, fontSize: 12, fontWeight: '700' },
  readerContainer: { flex: 1, backgroundColor: '#0A0A0A' },
  readerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    backgroundColor: '#111',
  },
  readerCloseBtn: { padding: 6, marginRight: 8 },
  readerHeaderTitle: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700', lineHeight: 22 },
  readerCopyBtn: { padding: 8 },
  readerScroll: { flex: 1 },
  readerScrollContent: { padding: 20, paddingBottom: 60 },
});
