import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import { getDb } from '../db/database';
import { getAllSubjects } from '../db/queries/topics';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'NotesHub'>;

interface TopicNote {
  kind: 'topic';
  id: number;
  topicName: string;
  note: string;
}

interface LectureNote {
  kind: 'lecture';
  id: number;
  subjectName: string | null;
  note: string;
  createdAt: number;
}

type NoteItem = TopicNote | LectureNote;

export default function NotesHubScreen() {
  const navigation = useNavigation<Nav>();
  const [query, setQuery] = useState('');
  const subjects = getAllSubjects();

  const db = getDb();

  const recentTopicNotes: TopicNote[] = useMemo(() => db.getAllSync<{ id: number; name: string; user_notes: string }>(
    `SELECT t.id, t.name, p.user_notes
     FROM topics t
     JOIN topic_progress p ON t.id = p.topic_id
     WHERE p.user_notes IS NOT NULL AND p.user_notes != ''
     ORDER BY p.last_studied_at DESC LIMIT 20`
  ).map(r => ({ kind: 'topic' as const, id: r.id, topicName: r.name, note: r.user_notes })), []);

  const recentLectureNotes: LectureNote[] = useMemo(() => db.getAllSync<{ id: number; subject_name: string | null; note: string; created_at: number }>(
    `SELECT ln.id, s.name AS subject_name, ln.note, ln.created_at
     FROM lecture_notes ln
     LEFT JOIN subjects s ON ln.subject_id = s.id
     ORDER BY ln.created_at DESC LIMIT 30`
  ).map(r => ({ kind: 'lecture' as const, id: r.id, subjectName: r.subject_name, note: r.note, createdAt: r.created_at })), []);

  const searchResults: NoteItem[] = useMemo(() => {
    if (query.length < 2) return [];
    const q = `%${query}%`;
    const topicResults: TopicNote[] = db.getAllSync<{ id: number; name: string; user_notes: string }>(
      `SELECT t.id, t.name, p.user_notes
       FROM topics t
       JOIN topic_progress p ON t.id = p.topic_id
       WHERE p.user_notes LIKE ? LIMIT 30`,
      [q]
    ).map(r => ({ kind: 'topic' as const, id: r.id, topicName: r.name, note: r.user_notes }));

    const lectureResults: LectureNote[] = db.getAllSync<{ id: number; subject_name: string | null; note: string; created_at: number }>(
      `SELECT ln.id, s.name AS subject_name, ln.note, ln.created_at
       FROM lecture_notes ln
       LEFT JOIN subjects s ON ln.subject_id = s.id
       WHERE ln.note LIKE ?
       ORDER BY ln.created_at DESC LIMIT 20`,
      [q]
    ).map(r => ({ kind: 'lecture' as const, id: r.id, subjectName: r.subject_name, note: r.note, createdAt: r.created_at }));

    return [...topicResults, ...lectureResults];
  }, [query]);

  function navigateToTopic(topicName: string) {
    const subject = subjects.find(s => topicName.toLowerCase().includes(s.name.toLowerCase()));
    if (subject) {
      (navigation as any).navigate('SyllabusTab');
      setTimeout(() => {
        (navigation as any).navigate('TopicDetail', { subjectId: subject.id, subjectName: subject.name });
      }, 100);
    }
  }

  function formatDate(ts: number) {
    const d = new Date(ts);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  const isSearching = query.length >= 2;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Notes</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search all notes..."
          placeholderTextColor="#555"
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Quick Actions (browse mode only) */}
        {!isSearching && (
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => (navigation as any).getParent?.()?.navigate('BrainDumpReview') ?? (navigation as any).navigate('BrainDumpReview')}
              activeOpacity={0.8}
            >
              <Text style={styles.actionEmoji}>🧠</Text>
              <Text style={styles.actionTitle}>Brain Dumps</Text>
              <Text style={styles.actionSub}>Parked thoughts</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionCard, styles.actionCardOrange]}
              onPress={() => navigation.navigate('FlaggedReview')}
              activeOpacity={0.8}
            >
              <Text style={styles.actionEmoji}>🚩</Text>
              <Text style={styles.actionTitle}>Flagged</Text>
              <Text style={styles.actionSub}>For review</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Search results */}
        {isSearching && (
          <>
            {searchResults.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🔍</Text>
                <Text style={styles.emptyText}>No notes match "{query}"</Text>
              </View>
            ) : (
              <>
                <Text style={styles.sectionHeader}>
                  {searchResults.length} RESULT{searchResults.length !== 1 ? 'S' : ''}
                </Text>
                {searchResults.map(item =>
                  item.kind === 'lecture' ? (
                    <LectureNoteCard key={`l-${item.id}`} item={item} formatDate={formatDate} />
                  ) : (
                    <TopicNoteCard key={`t-${item.id}`} item={item} onPress={() => navigateToTopic(item.topicName)} />
                  )
                )}
              </>
            )}
          </>
        )}

        {/* Browse mode: Lecture Notes section */}
        {!isSearching && (
          <>
            {recentLectureNotes.length > 0 && (
              <>
                <Text style={styles.sectionHeader}>📺 LECTURE NOTES</Text>
                {recentLectureNotes.map(item => (
                  <LectureNoteCard key={`l-${item.id}`} item={item} formatDate={formatDate} />
                ))}
              </>
            )}

            {/* Browse mode: Topic Notes section */}
            {recentTopicNotes.length > 0 && (
              <>
                <Text style={styles.sectionHeader}>✏️ TOPIC NOTES</Text>
                {recentTopicNotes.map(item => (
                  <TopicNoteCard key={`t-${item.id}`} item={item} onPress={() => navigateToTopic(item.topicName)} />
                ))}
              </>
            )}

            {recentLectureNotes.length === 0 && recentTopicNotes.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>📝</Text>
                <Text style={styles.emptyText}>No notes yet</Text>
                <Text style={styles.emptySub}>
                  Notes from lectures and topics you study will appear here.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function LectureNoteCard({ item, formatDate }: { item: LectureNote; formatDate: (ts: number) => string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity
      style={styles.lectureNoteCard}
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.8}
    >
      <View style={styles.lectureNoteHeader}>
        <Text style={styles.lectureNoteSubject}>{item.subjectName ?? 'Lecture'}</Text>
        <Text style={styles.lectureNoteDate}>{formatDate(item.createdAt)}</Text>
      </View>
      <Text style={styles.lectureNoteText} numberOfLines={expanded ? undefined : 4}>
        {item.note}
      </Text>
      {!expanded && item.note.length > 200 && (
        <Text style={styles.expandHint}>Tap to expand ↓</Text>
      )}
    </TouchableOpacity>
  );
}

function TopicNoteCard({ item, onPress }: { item: TopicNote; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.topicNoteCard} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.topicNoteName}>{item.topicName}</Text>
      <Text style={styles.topicNoteText} numberOfLines={3}>{item.note}</Text>
      <Text style={styles.tapHint}>Tap to open topic →</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  backBtn: { padding: 4, marginRight: 12 },
  backText: { color: '#6C63FF', fontSize: 22 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1A1A24', borderRadius: 12,
    marginHorizontal: 16, marginBottom: 16,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: '#2A2A38',
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 15 },
  clearBtn: { color: '#666', fontSize: 16, paddingLeft: 8 },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  quickActions: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  actionCard: {
    flex: 1, backgroundColor: '#1A1A2E', borderRadius: 14,
    padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#6C63FF44',
  },
  actionCardOrange: { backgroundColor: '#1A1200', borderColor: '#FF980044' },
  actionEmoji: { fontSize: 28, marginBottom: 6 },
  actionTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  actionSub: { color: '#9E9E9E', fontSize: 11, marginTop: 2 },
  sectionHeader: { color: '#666', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginTop: 20, marginBottom: 12 },
  lectureNoteCard: {
    backgroundColor: '#0F1A2A', borderRadius: 12,
    padding: 14, marginBottom: 10,
    borderLeftWidth: 3, borderLeftColor: '#4CAF50',
  },
  lectureNoteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  lectureNoteSubject: { color: '#4CAF50', fontWeight: '700', fontSize: 13 },
  lectureNoteDate: { color: '#666', fontSize: 11 },
  lectureNoteText: { color: '#D0D0D0', fontSize: 14, lineHeight: 22 },
  expandHint: { color: '#555', fontSize: 11, marginTop: 6 },
  topicNoteCard: {
    backgroundColor: '#1A1A24', borderRadius: 12,
    padding: 14, marginBottom: 10,
    borderLeftWidth: 3, borderLeftColor: '#6C63FF',
  },
  topicNoteName: { color: '#6C63FF', fontWeight: '700', fontSize: 13, marginBottom: 6 },
  topicNoteText: { color: '#D0D0D0', fontSize: 14, lineHeight: 20 },
  tapHint: { color: '#555', fontSize: 11, marginTop: 8 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: '#9E9E9E', fontSize: 16, fontWeight: '600' },
  emptySub: { color: '#555', fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 20 },
});
