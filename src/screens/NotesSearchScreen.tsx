import React, { useState } from 'react';
import {
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
} from 'react-native';
import LinearText from '../components/primitives/LinearText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MenuStackParamList, TabParamList } from '../navigation/types';
import { getDb } from '../db/database';
import { getAllSubjects } from '../db/queries/topics';
import {
  searchLectureNotes,
  deleteLectureNote,
  type LectureHistoryItem,
} from '../db/queries/aiCache';
import { linearTheme as n } from '../theme/linearTheme';
import { ResponsiveContainer } from '../hooks/useResponsive';
import type { Subject } from '../types';
import { buildLectureDisplayTitle } from '../services/lecture/lectureIdentity';
import BannerSearchBar from '../components/BannerSearchBar';
import ScreenHeader from '../components/ScreenHeader';

interface TopicNoteResult {
  type: 'topic';
  id: number;
  name: string;
  user_notes: string;
  subject_id: number;
}

interface LectureNoteResult {
  type: 'lecture';
  item: LectureHistoryItem;
}

type SearchResult = TopicNoteResult | LectureNoteResult;

export default function NotesSearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
  const tabsNavigation = navigation.getParent<NavigationProp<TabParamList>>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  React.useEffect(() => {
    void getAllSubjects().then(setSubjects);
  }, []);
  const isSelectionMode = selectedKeys.length > 0;

  function getResultKey(item: SearchResult): string {
    return item.type === 'lecture' ? `lec-${item.item.id}` : `topic-${item.id}`;
  }

  function toggleSelection(key: string) {
    setSelectedKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      return [...prev, key];
    });
  }

  function clearSelection() {
    setSelectedKeys([]);
  }

  function getSubjectById(subjectId: number) {
    return subjects.find((s) => s.id === subjectId);
  }

  async function search(text: string) {
    setQuery(text);
    setSelectedKeys([]);
    if (text.length < 2) {
      setResults([]);
      return;
    }
    const db = getDb();

    // Search topic notes
    const topicRows = await db.getAllAsync<{
      id: number;
      name: string;
      user_notes: string;
      subject_id: number;
    }>(
      `SELECT t.id, t.name, p.user_notes, t.subject_id
       FROM topics t
       JOIN topic_progress p ON t.id = p.topic_id
       WHERE p.user_notes LIKE ? LIMIT 25`,
      [`%${text}%`],
    );
    const topicResults: SearchResult[] = topicRows.map((r) => ({ type: 'topic' as const, ...r }));

    // Search lecture notes (transcripts, summaries, ADHD notes)
    const lectureRows = await searchLectureNotes(text, 25);
    const lectureResults: SearchResult[] = lectureRows.map((item) => ({
      type: 'lecture' as const,
      item,
    }));

    // Merge: lecture notes first (more likely what user wants), then topic notes
    setResults([...lectureResults, ...topicResults]);
  }

  function extractPreview(note: string): string {
    // Strip markdown formatting for preview
    return note
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .slice(0, 2)
      .join(' ')
      .replace(/\*\*/g, '')
      .slice(0, 150);
  }

  function getLectureTitle(lecture: LectureHistoryItem): string {
    return buildLectureDisplayTitle({
      subjectName: lecture.subjectName,
      topics: lecture.topics,
      note: lecture.note,
      summary: lecture.summary,
    });
  }

  function removeLectureNote(id: number) {
    Alert.alert(
      'Delete transcript?',
      'This will permanently delete the lecture note and transcript.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteLectureNote(id);
            await search(query);
          },
        },
      ],
    );
  }

  function removeTopicNote(topicId: number) {
    Alert.alert('Delete topic note?', 'This clears your saved note for this topic.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const db = getDb();
          await db.runAsync('UPDATE topic_progress SET user_notes = ? WHERE topic_id = ?', [
            '',
            topicId,
          ]);
          await search(query);
        },
      },
    ]);
  }

  function openResult(item: SearchResult) {
    if (item.type === 'lecture') {
      navigation.navigate('TranscriptHistory', { noteId: item.item.id });
      return;
    }

    const subject = getSubjectById(item.subject_id);
    if (subject) {
      tabsNavigation?.navigate('SyllabusTab', {
        screen: 'TopicDetail',
        params: {
          subjectId: subject.id,
          subjectName: subject.name,
          initialTopicId: item.id,
          initialSearchQuery: item.name,
        },
      });
    }
  }

  function batchDeleteSelected() {
    if (selectedKeys.length === 0) return;
    const keysToDelete = [...selectedKeys];
    Alert.alert(
      `Delete ${keysToDelete.length} note${keysToDelete.length !== 1 ? 's' : ''}?`,
      'This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const db = getDb();
            for (const key of keysToDelete) {
              if (key.startsWith('lec-')) {
                const id = Number(key.replace('lec-', ''));
                if (!Number.isNaN(id)) await deleteLectureNote(id);
              } else if (key.startsWith('topic-')) {
                const id = Number(key.replace('topic-', ''));
                if (!Number.isNaN(id)) {
                  await db.runAsync('UPDATE topic_progress SET user_notes = ? WHERE topic_id = ?', [
                    '',
                    id,
                  ]);
                }
              }
            }
            setSelectedKeys([]);
            await search(query);
          },
        },
      ],
    );
  }

  function renderItem({ item }: { item: SearchResult }) {
    const resultKey = getResultKey(item);
    const isSelected = selectedKeys.includes(resultKey);

    if (item.type === 'lecture') {
      const lecture = item.item;
      return (
        <View style={styles.item}>
          <View style={styles.rowBetween}>
            <TouchableOpacity
              style={[styles.resultBody, isSelected && styles.resultBodySelected]}
              onLongPress={() => toggleSelection(resultKey)}
              delayLongPress={220}
              onPress={() => {
                if (isSelectionMode) {
                  toggleSelection(resultKey);
                  return;
                }
                openResult(item);
              }}
              activeOpacity={0.8}
            >
              {isSelectionMode && (
                <LinearText style={styles.selectedMarker}>
                  {isSelected ? '● Selected' : '○ Select'}
                </LinearText>
              )}
              <View style={styles.lectureHeader}>
                <LinearText style={styles.lectureBadge}>LECTURE</LinearText>
                {lecture.appName && (
                  <LinearText style={styles.appName}>via {lecture.appName}</LinearText>
                )}
              </View>
              <LinearText style={styles.topic}>{getLectureTitle(lecture)}</LinearText>
              <LinearText style={styles.note} numberOfLines={3}>
                {extractPreview(lecture.note)}
              </LinearText>
              {lecture.topics.length > 0 && (
                <LinearText style={styles.topicsPreview}>
                  {lecture.topics.slice(0, 3).join(' · ')}
                </LinearText>
              )}
              <LinearText style={styles.tapHint}>Tap to view lecture notes →</LinearText>
            </TouchableOpacity>
            {!isSelectionMode && (
              <TouchableOpacity
                style={styles.deletePill}
                onPress={() => removeLectureNote(lecture.id)}
                activeOpacity={0.8}
              >
                <LinearText style={styles.deletePillText}>Delete</LinearText>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    // Topic note
    return (
      <View style={styles.item}>
        <View style={styles.rowBetween}>
          <TouchableOpacity
            style={[styles.resultBody, isSelected && styles.resultBodySelected]}
            onLongPress={() => toggleSelection(resultKey)}
            delayLongPress={220}
            onPress={() => {
              if (isSelectionMode) {
                toggleSelection(resultKey);
                return;
              }
              openResult(item);
            }}
            activeOpacity={0.8}
          >
            {isSelectionMode && (
              <LinearText style={styles.selectedMarker}>
                {isSelected ? '● Selected' : '○ Select'}
              </LinearText>
            )}
            <LinearText style={styles.topic}>{item.name}</LinearText>
            <LinearText style={styles.note} numberOfLines={3}>
              {item.user_notes}
            </LinearText>
            <LinearText style={styles.tapHint}>Tap to view topic →</LinearText>
          </TouchableOpacity>
          {!isSelectionMode && (
            <TouchableOpacity
              style={styles.deletePill}
              onPress={() => removeTopicNote(item.id)}
              activeOpacity={0.8}
            >
              <LinearText style={styles.deletePillText}>Delete</LinearText>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer>
        <ScreenHeader
          title="Notes Search"
          subtitle="Search notes, transcripts, and saved lecture material."
          searchElement={
            <BannerSearchBar
              value={query}
              onChangeText={search}
              placeholder="Search notes & transcripts..."
              autoFocus
            />
          }
        ></ScreenHeader>
        <FlatList
          data={results}
          ListHeaderComponent={
            isSelectionMode ? (
              <View style={styles.selectionBar}>
                <LinearText style={styles.selectionText}>{selectedKeys.length} selected</LinearText>
                <View style={styles.selectionActions}>
                  <TouchableOpacity onPress={clearSelection} style={styles.selectionCancelBtn}>
                    <LinearText style={styles.selectionCancelText}>Cancel</LinearText>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={batchDeleteSelected} style={styles.selectionDeleteBtn}>
                    <LinearText style={styles.selectionDeleteText}>Delete</LinearText>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null
          }
          keyExtractor={(item, idx) =>
            item.type === 'lecture' ? `lec-${item.item.id}` : `topic-${item.id}`
          }
          renderItem={renderItem}
          ListEmptyComponent={
            query.length > 1 ? (
              <View style={styles.emptyContainer}>
                <LinearText style={styles.empty}>No matches found</LinearText>
                <LinearText style={styles.emptySub}>
                  Try searching for 2+ characters or different keywords
                </LinearText>
              </View>
            ) : query.length > 0 ? (
              <View style={styles.emptyContainer}>
                <LinearText style={styles.emptySub}>
                  Type at least 2 characters to search
                </LinearText>
              </View>
            ) : null
          }
        />
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  back: { color: n.colors.textPrimary, fontSize: 24 },
  input: {
    flex: 1,
    backgroundColor: n.colors.surface,
    padding: 12,
    borderRadius: 10,
    color: n.colors.textPrimary,
    fontSize: 16,
  },
  item: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    backgroundColor: n.colors.background,
  },
  rowBetween: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  resultBody: { flex: 1 },
  resultBodySelected: {
    borderWidth: 1,
    borderColor: n.colors.accent,
    borderRadius: 10,
    padding: 10,
    margin: -10,
    backgroundColor: n.colors.surface,
  },
  selectedMarker: { color: n.colors.accent, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  deletePill: {
    borderWidth: 1,
    borderColor: '#6A3131',
    backgroundColor: '#261414',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deletePillText: { color: '#F28B8B', fontSize: 12, fontWeight: '700' },
  tapHint: { color: n.colors.accent, fontSize: 12, marginTop: 8, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptySub: { color: '#666', textAlign: 'center', marginTop: 8, fontSize: 14 },
  topic: { color: n.colors.accent, fontWeight: '700', marginBottom: 4 },
  note: { color: n.colors.textMuted, lineHeight: 20 },
  empty: { color: '#666', textAlign: 'center', marginTop: 40 },
  lectureHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  lectureBadge: {
    color: n.colors.success,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    backgroundColor: '#4CAF5022',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  appName: { color: n.colors.textMuted, fontSize: 11 },
  topicsPreview: { color: n.colors.accent, fontSize: 12, marginTop: 4 },
  selectionBar: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionText: { color: n.colors.textPrimary, fontSize: 14, fontWeight: '700' },
  selectionActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectionCancelBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  selectionCancelText: { color: n.colors.textMuted, fontSize: 13, fontWeight: '700' },
  selectionDeleteBtn: {
    backgroundColor: n.colors.error,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  selectionDeleteText: { color: n.colors.textPrimary, fontSize: 12, fontWeight: '800' },
});
