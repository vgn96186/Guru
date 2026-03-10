import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import { getDb } from '../db/database';
import { getAllSubjects } from '../db/queries/topics';
import { searchLectureNotes, type LectureHistoryItem } from '../db/queries/aiCache';
import { ResponsiveContainer } from '../hooks/useResponsive';

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
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const subjects = React.useMemo(() => getAllSubjects(), []);

  function getSubjectForTopic(topicName: string) {
    return subjects.find(s => topicName.toLowerCase().includes(s.name.toLowerCase()));
  }

  function search(text: string) {
    setQuery(text);
    if (text.length < 2) {
      setResults([]);
      return;
    }
    const db = getDb();

    // Search topic notes
    const topicRows = db.getAllSync<{ id: number; name: string; user_notes: string; subject_id: number }>(
      `SELECT t.id, t.name, p.user_notes, t.subject_id
       FROM topics t
       JOIN topic_progress p ON t.id = p.topic_id
       WHERE p.user_notes LIKE ? LIMIT 25`,
      [`%${text}%`]
    );
    const topicResults: SearchResult[] = topicRows.map(r => ({ type: 'topic' as const, ...r }));

    // Search lecture notes (transcripts, summaries, ADHD notes)
    const lectureRows = searchLectureNotes(text, 25);
    const lectureResults: SearchResult[] = lectureRows.map(item => ({ type: 'lecture' as const, item }));

    // Merge: lecture notes first (more likely what user wants), then topic notes
    setResults([...lectureResults, ...topicResults]);
  }

  function extractPreview(note: string): string {
    // Strip markdown formatting for preview
    return note
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .slice(0, 2)
      .join(' ')
      .replace(/\*\*/g, '')
      .slice(0, 150);
  }

  function renderItem({ item }: { item: SearchResult }) {
    if (item.type === 'lecture') {
      const lecture = item.item;
      return (
        <TouchableOpacity
          style={styles.item}
          onPress={() => navigation.navigate('TranscriptHistory', { noteId: lecture.id })}
        >
          <View style={styles.lectureHeader}>
            <Text style={styles.lectureBadge}>LECTURE</Text>
            {lecture.appName && <Text style={styles.appName}>via {lecture.appName}</Text>}
          </View>
          <Text style={styles.topic}>{lecture.subjectName ?? 'Lecture'}</Text>
          <Text style={styles.note} numberOfLines={3}>{extractPreview(lecture.note)}</Text>
          {lecture.topics.length > 0 && (
            <Text style={styles.topicsPreview}>{lecture.topics.slice(0, 3).join(' · ')}</Text>
          )}
          <Text style={styles.tapHint}>Tap to view lecture notes →</Text>
        </TouchableOpacity>
      );
    }

    // Topic note
    return (
      <TouchableOpacity
        style={styles.item}
        onPress={() => {
          const subject = getSubjectForTopic(item.name);
          if (subject) {
            navigation.getParent()?.navigate('SyllabusTab', {
              screen: 'TopicDetail',
              params: {
                subjectId: subject.id,
                subjectName: subject.name,
                initialTopicId: item.id,
                initialSearchQuery: item.name,
              },
            });
          }
        }}
      >
        <Text style={styles.topic}>{item.name}</Text>
        <Text style={styles.note} numberOfLines={3}>{item.user_notes}</Text>
        <Text style={styles.tapHint}>Tap to view topic →</Text>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <ResponsiveContainer>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>←</Text></TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Search notes & transcripts..."
            placeholderTextColor="#666"
            value={query}
            onChangeText={search}
            autoFocus
          />
        </View>
        <FlatList
          data={results}
          keyExtractor={(item, idx) =>
            item.type === 'lecture' ? `lec-${item.item.id}` : `topic-${item.id}`
          }
          renderItem={renderItem}
          ListEmptyComponent={query.length > 1 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.empty}>No matches found</Text>
              <Text style={styles.emptySub}>Try searching for 2+ characters or different keywords</Text>
            </View>
          ) : query.length > 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptySub}>Type at least 2 characters to search</Text>
            </View>
          ) : null}
        />
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: '#222' },
  back: { color: '#fff', fontSize: 24 },
  input: { flex: 1, backgroundColor: '#1A1A24', padding: 12, borderRadius: 10, color: '#fff', fontSize: 16 },
  item: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#222', backgroundColor: '#0F0F14' },
  tapHint: { color: '#6C63FF', fontSize: 12, marginTop: 8, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptySub: { color: '#666', textAlign: 'center', marginTop: 8, fontSize: 14 },
  topic: { color: '#6C63FF', fontWeight: '700', marginBottom: 4 },
  note: { color: '#ccc', lineHeight: 20 },
  empty: { color: '#666', textAlign: 'center', marginTop: 40 },
  lectureHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  lectureBadge: {
    color: '#4CAF50',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    backgroundColor: '#4CAF5022',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  appName: { color: '#888', fontSize: 11 },
  topicsPreview: { color: '#A09CF7', fontSize: 12, marginTop: 4 },
});
