/**
 * TranscriptHistoryScreen
 * Browse and search through past lecture transcriptions
 */

import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MenuStackParamList } from '../navigation/types';
import {
  getLectureHistory,
  searchLectureNotes,
  deleteLectureNote,
  updateLectureTranscriptSummary,
  getLectureNoteById,
  type LectureHistoryItem,
} from '../db/queries/aiCache';
import { loadTranscriptFromFile } from '../services/transcriptStorage';
import { MarkdownRender } from '../components/MarkdownRender';

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
};

const CONFIDENCE_LABELS: Record<number, string> = {
  1: 'Introduced',
  2: 'Understood',
  3: 'Can explain',
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
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  const loadNotes = useCallback(async () => {
    const items = await getLectureHistory(100);
    setNotes(items);
    setSelectedIds((prev) => prev.filter((id) => items.some((item) => item.id === id)));
  }, []);

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
    const current =
      selectedNote.summary && selectedNote.summary.trim().length > 0
        ? selectedNote.summary
        : extractFirstLine(selectedNote.note);
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
          <View
            style={[
              styles.subjectChip,
              { backgroundColor: SUBJECT_COLORS[item.subjectName ?? 'Unknown'] ?? '#9E9E9E' },
            ]}
          >
            <Text style={styles.subjectText}>{item.subjectName ?? 'Unknown'}</Text>
          </View>
          <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
        </View>

        {item.appName && <Text style={styles.appBadge}>via {item.appName}</Text>}

        <Text style={styles.summaryText} numberOfLines={2}>
          {item.summary || extractFirstLine(item.note)}
        </Text>

        <View style={styles.noteFooter}>
          {item.topics.length > 0 && (
            <View style={styles.topicsRow}>
              {item.topics.slice(0, 3).map((t, i) => (
                <Text key={i} style={styles.topicPill}>
                  {t}
                </Text>
              ))}
              {item.topics.length > 3 && (
                <Text style={styles.moreBadge}>+{item.topics.length - 3}</Text>
              )}
            </View>
          )}
          <View style={styles.metaRow}>
            {item.durationMinutes && (
              <Text style={styles.metaText}>
                <Ionicons name="time-outline" size={12} color="#888" />{' '}
                {formatDuration(item.durationMinutes)}
              </Text>
            )}
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
              {CONFIDENCE_LABELS[item.confidence]}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={20} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search transcripts, topics, concepts..."
          placeholderTextColor="#888"
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
            {notes.length} lecture{notes.length !== 1 ? 's' : ''} recorded
          </Text>
        )}
      </View>

      {/* Empty state */}
      {notes.length === 0 && !searchQuery && (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={64} color="#444" />
          <Text style={styles.emptyTitle}>No Transcripts Yet</Text>
          <Text style={styles.emptySubtitle}>
            Use a lecture app and your sessions will be transcribed and saved here for revision
          </Text>
        </View>
      )}

      {/* No results */}
      {notes.length === 0 && searchQuery && (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={48} color="#666" />
          <Text style={styles.emptyTitle}>No Results</Text>
          <Text style={styles.emptySubtitle}>No transcripts match "{searchQuery}"</Text>
        </View>
      )}

      {/* Notes list */}
      <FlatList
        data={notes}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderNote}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" />
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
              <Text style={styles.modalTitle} numberOfLines={1}>
                {selectedNote?.subjectName ?? 'Lecture'} Transcript
              </Text>
              <View style={styles.modalHeaderActions}>
                <TouchableOpacity style={styles.headerActionBtn} onPress={openRename}>
                  <Ionicons name="create-outline" size={18} color="#A09CF7" />
                  <Text style={styles.headerActionText}>Rename</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerActionBtn}
                  onPress={() => selectedNote && handleDelete(selectedNote.id)}
                >
                  <Ionicons name="trash-outline" size={18} color="#F28B8B" />
                  <Text style={[styles.headerActionText, { color: '#F28B8B' }]}>Delete</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerActionBtn}
                  onPress={() => setSelectedNote(null)}
                >
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.modalScroll}>
              {/* Meta info */}
              <View style={styles.modalMeta}>
                {selectedNote && (
                  <Text style={styles.customTitleText}>
                    {selectedNote.summary?.trim() || extractFirstLine(selectedNote.note)}
                  </Text>
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
                          ? '#4CAF50'
                          : (selectedNote?.confidence ?? 2) === 2
                            ? '#FF9800'
                            : '#F44336',
                      alignSelf: 'flex-start',
                      marginTop: 8,
                    },
                  ]}
                >
                  {CONFIDENCE_LABELS[selectedNote?.confidence ?? 2]}
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
                    placeholderTextColor="#777"
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

              {/* Study note — same renderer as Guru chat (coloured highlights for **bold**) */}
              {selectedNote?.note && (
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Study Note</Text>
                  <MarkdownRender content={selectedNote.note} />
                </View>
              )}

              {/* Full transcript (collapsible) */}
              {selectedNote?.transcript && (
                <TranscriptSection transcript={selectedNote.transcript} />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
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
    height: 48,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: '#fff',
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
    alignItems: 'center',
    marginBottom: 8,
  },
  subjectChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  subjectText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  dateText: { color: '#888', fontSize: 12 },
  appBadge: { color: '#666', fontSize: 11, marginBottom: 6 },
  summaryText: { color: '#ddd', fontSize: 14, lineHeight: 20, marginBottom: 10 },
  noteFooter: {},
  topicsRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  topicPill: {
    backgroundColor: '#333',
    color: '#aaa',
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 6,
    marginBottom: 4,
    overflow: 'hidden',
  },
  moreBadge: { color: '#666', fontSize: 11, marginLeft: 4, alignSelf: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaText: { color: '#888', fontSize: 12 },
  confidenceBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 3,
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
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '600', flex: 1 },
  modalHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 10 },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  headerActionText: { color: '#A09CF7', fontSize: 12, fontWeight: '600' },
  modalScroll: { padding: 16 },
  modalMeta: { marginBottom: 16 },
  customTitleText: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  modalMetaText: { color: '#888', fontSize: 13 },
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
    paddingVertical: 10,
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
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
});
