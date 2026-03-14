import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { MenuStackParamList, TabParamList } from '../navigation/types';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { getDb } from '../db/database';
import { getLectureHistory, type LectureHistoryItem } from '../db/queries/aiCache';

type Nav = NativeStackNavigationProp<MenuStackParamList, 'NotesHub'>;

interface TopicNotePreview {
  topicId: number;
  topicName: string;
  subjectId: number;
  subjectName: string;
  userNotes: string;
}

interface NotesStats {
  lectureCount: number;
  topicNoteCount: number;
}

function extractPreview(text: string): string {
  return text
    .replace(/#+\s*/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function NotesHubScreen() {
  const navigation = useNavigation<Nav>();
  const tabsNavigation = navigation.getParent<NavigationProp<TabParamList>>();
  const [stats, setStats] = useState<NotesStats>({ lectureCount: 0, topicNoteCount: 0 });
  const [recentLectures, setRecentLectures] = useState<LectureHistoryItem[]>([]);
  const [topicNotes, setTopicNotes] = useState<TopicNotePreview[]>([]);

  const loadData = useCallback(async () => {
    const db = getDb();
    const [lectureCountRow, topicNoteCountRow, recentTopicNotes] = await Promise.all([
      db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM lecture_notes'),
      db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM topic_progress
         WHERE TRIM(COALESCE(user_notes, '')) <> ''`,
      ),
      db.getAllAsync<{
        topic_id: number;
        topic_name: string;
        subject_id: number;
        subject_name: string;
        user_notes: string;
      }>(
        `SELECT t.id AS topic_id, t.name AS topic_name, s.id AS subject_id, s.name AS subject_name, p.user_notes
         FROM topic_progress p
         JOIN topics t ON t.id = p.topic_id
         JOIN subjects s ON s.id = t.subject_id
         WHERE TRIM(COALESCE(p.user_notes, '')) <> ''
         ORDER BY COALESCE(p.last_studied_at, 0) DESC, t.name ASC
         LIMIT 4`,
      ),
    ]);

    setStats({
      lectureCount: lectureCountRow?.count ?? 0,
      topicNoteCount: topicNoteCountRow?.count ?? 0,
    });
    void getLectureHistory(4).then(setRecentLectures);
    setTopicNotes(
      recentTopicNotes.map((row) => ({
        topicId: row.topic_id,
        topicName: row.topic_name,
        subjectId: row.subject_id,
        subjectName: row.subject_name,
        userNotes: row.user_notes,
      })),
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const emptyState = useMemo(
    () => stats.lectureCount === 0 && stats.topicNoteCount === 0,
    [stats.lectureCount, stats.topicNoteCount],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <ResponsiveContainer>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTextWrap}>
              <Text style={styles.kicker}>KNOWLEDGE VAULT</Text>
              <Text style={styles.title}>My Notes</Text>
              <Text style={styles.subtitle}>
                Search, revisit, and reuse your lecture notes and topic notes from one place.
              </Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.lectureCount}</Text>
              <Text style={styles.statLabel}>Lecture notes</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.topicNoteCount}</Text>
              <Text style={styles.statLabel}>Topic notes</Text>
            </View>
          </View>

          <View style={styles.actionGrid}>
            <TouchableOpacity
              style={[styles.actionCard, styles.actionPrimary]}
              onPress={() => navigation.navigate('NotesSearch')}
              activeOpacity={0.85}
            >
              <Ionicons name="search" size={20} color="#0F0F14" />
              <Text style={styles.actionPrimaryTitle}>Search all notes</Text>
              <Text style={styles.actionPrimarySub}>Find any concept across transcripts and saved topic notes.</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('TranscriptHistory')}
              activeOpacity={0.85}
            >
              <Ionicons name="document-text-outline" size={20} color="#A09CF7" />
              <Text style={styles.actionTitle}>Lecture transcripts</Text>
              <Text style={styles.actionSub}>Browse processed lecture notes and raw transcript history.</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => tabsNavigation?.navigate('ChatTab', {
                screen: 'GuruChat',
                params: { topicName: 'General Medicine' },
              })}
              activeOpacity={0.85}
            >
              <Ionicons name="medkit-outline" size={20} color="#7ED6A7" />
              <Text style={styles.actionTitle}>Ask Guru</Text>
              <Text style={styles.actionSub}>Use your notes as a launch point for grounded medical questions.</Text>
            </TouchableOpacity>
          </View>

          {emptyState ? (
            <View style={styles.emptyCard}>
              <Ionicons name="library-outline" size={28} color="#6C63FF" />
              <Text style={styles.emptyTitle}>No saved notes yet</Text>
              <Text style={styles.emptySub}>
                Lecture returns and topic note edits will show up here once they are saved.
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => tabsNavigation?.navigate('HomeTab', {
                  screen: 'LectureMode',
                  params: {},
                })}
                activeOpacity={0.8}
              >
                <Text style={styles.emptyBtnText}>Start a lecture capture</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent lecture notes</Text>
                <TouchableOpacity onPress={() => navigation.navigate('TranscriptHistory')} activeOpacity={0.7}>
                  <Text style={styles.sectionLink}>View all</Text>
                </TouchableOpacity>
              </View>

              {recentLectures.length === 0 ? (
                <Text style={styles.sectionPlaceholder}>No lecture notes saved yet.</Text>
              ) : (
                recentLectures.map((lecture) => (
                  <TouchableOpacity
                    key={lecture.id}
                    style={styles.lectureCard}
                    onPress={() => navigation.navigate('TranscriptHistory', { noteId: lecture.id })}
                    activeOpacity={0.8}
                  >
                    <View style={styles.lectureMetaRow}>
                      <Text style={styles.lectureSubject}>{lecture.subjectName ?? 'Lecture note'}</Text>
                      <Text style={styles.lectureDate}>{formatDate(lecture.createdAt)}</Text>
                    </View>
                    <Text style={styles.lecturePreview} numberOfLines={4}>
                      {extractPreview(lecture.summary || lecture.note)}
                    </Text>
                    <View style={styles.inlineMetaRow}>
                      {lecture.appName ? <Text style={styles.inlineMeta}>via {lecture.appName}</Text> : <View />}
                      <Ionicons name="chevron-forward" size={16} color="#7A7A91" />
                    </View>
                  </TouchableOpacity>
                ))
              )}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Topic notes</Text>
                <TouchableOpacity onPress={() => navigation.navigate('NotesSearch')} activeOpacity={0.7}>
                  <Text style={styles.sectionLink}>Search notes</Text>
                </TouchableOpacity>
              </View>

              {topicNotes.length === 0 ? (
                <Text style={styles.sectionPlaceholder}>No topic notes saved yet.</Text>
              ) : (
                topicNotes.map((topic) => (
                  <TouchableOpacity
                    key={topic.topicId}
                    style={styles.topicCard}
                    onPress={() => navigation.navigate('NotesSearch')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.topicSubject}>{topic.subjectName}</Text>
                    <Text style={styles.topicTitle}>{topic.topicName}</Text>
                    <Text style={styles.topicPreview} numberOfLines={3}>
                      {extractPreview(topic.userNotes)}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </>
          )}
        </ScrollView>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 8 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1A1A24',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#262634',
    marginTop: 4,
  },
  headerTextWrap: { flex: 1, gap: 4 },
  kicker: { color: '#8B86FF', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: '#fff', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#9A9AAC', fontSize: 14, lineHeight: 21 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: '#171722',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#272738',
    gap: 4,
  },
  statValue: { color: '#fff', fontSize: 28, fontWeight: '800' },
  statLabel: { color: '#9A9AAC', fontSize: 13, fontWeight: '600' },
  actionGrid: { gap: 12 },
  actionCard: {
    backgroundColor: '#171722',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#272738',
    gap: 8,
  },
  actionPrimary: {
    backgroundColor: '#E5E2FF',
    borderColor: '#E5E2FF',
  },
  actionPrimaryTitle: { color: '#0F0F14', fontSize: 18, fontWeight: '800' },
  actionPrimarySub: { color: '#3A3954', fontSize: 13, lineHeight: 19 },
  actionTitle: { color: '#F4F4F8', fontSize: 17, fontWeight: '700' },
  actionSub: { color: '#9A9AAC', fontSize: 13, lineHeight: 19 },
  emptyCard: {
    backgroundColor: '#171722',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#272738',
    alignItems: 'flex-start',
    gap: 10,
  },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  emptySub: { color: '#9A9AAC', fontSize: 14, lineHeight: 21 },
  emptyBtn: {
    marginTop: 4,
    backgroundColor: '#6C63FF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700' },
  sectionHeader: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  sectionLink: { color: '#A09CF7', fontSize: 13, fontWeight: '700' },
  sectionPlaceholder: { color: '#7A7A91', fontSize: 14, lineHeight: 20 },
  lectureCard: {
    backgroundColor: '#15151E',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#242433',
    gap: 10,
  },
  lectureMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  lectureSubject: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1 },
  lectureDate: { color: '#7A7A91', fontSize: 12, fontWeight: '600' },
  lecturePreview: { color: '#C9C9D3', fontSize: 14, lineHeight: 21 },
  inlineMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  inlineMeta: { color: '#8C8CA1', fontSize: 12 },
  topicCard: {
    backgroundColor: '#13131B',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#232333',
    gap: 6,
  },
  topicSubject: { color: '#8B86FF', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  topicTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  topicPreview: { color: '#B5B5C2', fontSize: 13, lineHeight: 19 },
});
