import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { MenuStackParamList, TabParamList } from '../navigation/types';
import { navigationRef } from '../navigation/navigationRef';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { theme } from '../constants/theme';
import { MS_PER_DAY } from '../constants/time';
import { getDb } from '../db/database';
import { getLectureHistory, type LectureHistoryItem } from '../db/queries/aiCache';
import { buildLectureDisplayTitle } from '../services/lectureIdentity';
import ConfidenceSelector from '../components/ConfidenceSelector';
import TopicPillRow from '../components/TopicPillRow';
import SubjectChip from '../components/SubjectChip';

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
  return text.replace(/#+\s*/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function getLectureTitle(lecture: Pick<LectureHistoryItem, 'subjectName' | 'topics'>): string {
  return buildLectureDisplayTitle({
    subjectName: lecture.subjectName,
    topics: lecture.topics,
  });
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY);

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

import { transcribeAudio, generateADHDNote, type LectureAnalysis } from '../services/transcriptionService';
import { getSubjectByName } from '../db/queries/topics';
import { saveLectureTranscript } from '../db/queries/aiCache';
import { getFailedOrPendingTranscriptions, type ExternalAppLog } from '../db/queries/externalLogs';
import * as DocumentPicker from 'expo-document-picker';
import { useAppStore } from '../store/useAppStore';
import { dbEvents, DB_EVENT_KEYS } from '../services/databaseEvents';
import { runFullTranscriptionPipeline } from '../services/lectureSessionMonitor';
import { Audio } from 'expo-av';

export default function NotesHubScreen() {
  const navigation = useNavigation<Nav>();
  const tabsNavigation = navigation.getParent<NavigationProp<TabParamList>>();
  const refreshProfile = useAppStore((s) => s.refreshProfile);
  const isRecoveringBackground = useAppStore((s) => s.isRecoveringBackground);
  const [isTranscribingUpload, setIsTranscribingUpload] = useState(false);
  const [uploadResult, setUploadResult] = useState<LectureAnalysis | null>(null);
  const [uploadConfidence, setUploadConfidence] = useState<1 | 2 | 3 | null>(null);
  const [isSavingUpload, setIsSavingUpload] = useState(false);
  const [pendingSessions, setPendingSessions] = useState<ExternalAppLog[]>([]);
  const [isRetrying, setIsRetrying] = useState<number | null>(null);
  const [activePlaybackId, setActivePlaybackId] = useState<number | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const handlePlayPending = async (session: ExternalAppLog) => {
    if (!session.id || !session.recordingPath) return;

    if (activePlaybackId === session.id) {
      await soundRef.current?.unloadAsync();
      soundRef.current = null;
      setActivePlaybackId(null);
      return;
    }

    try {
      if (soundRef.current) await soundRef.current.unloadAsync();
      const { sound } = await Audio.Sound.createAsync(
        { uri: session.recordingPath },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded && !status.isPlaying && status.didJustFinish) {
            setActivePlaybackId(null);
          }
        },
      );
      soundRef.current = sound;
      setActivePlaybackId(session.id);
    } catch (e: any) {
      Alert.alert('Playback Error', 'Could not play this audio file.');
    }
  };

  const handleRetry = async (session: ExternalAppLog) => {
    if (!session.id || !session.recordingPath) return;
    setIsRetrying(session.id);
    try {
      const { profile } = useAppStore.getState();
      await runFullTranscriptionPipeline({
        recordingPath: session.recordingPath,
        appName: session.appName,
        durationMinutes: session.durationMinutes || 0,
        logId: session.id,
        groqKey: profile?.groqApiKey || undefined,
      });
      await loadData();
    } catch (e: any) {
      Alert.alert('Retry Failed', e.message);
    } finally {
      setIsRetrying(null);
    }
  };

  const handleAudioUpload = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['audio/*'] });
    if (res.canceled || !res.assets[0]) return;
    setIsTranscribingUpload(true);
    try {
      const analysis = await transcribeAudio({ audioFilePath: res.assets[0].uri });
      const hasTranscript = !!analysis.transcript?.trim();
      const hasMeaningfulSummary =
        !!analysis.lectureSummary &&
        ![
          'No audio recorded (empty file)',
          'No speech detected (silent audio)',
          'No speech detected',
          'Lecture content recorded',
          'No medical content detected',
        ].includes(analysis.lectureSummary);
      if (!hasTranscript || !hasMeaningfulSummary) {
        throw new Error('No usable lecture content was detected in this recording.');
      }
      setUploadResult(analysis);
      setUploadConfidence(analysis.estimatedConfidence as 1 | 2 | 3);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsTranscribingUpload(false);
    }
  };

  const handleSaveUpload = async () => {
    if (!uploadResult) return;
    setIsSavingUpload(true);
    try {
      const finalConfidence = uploadConfidence ?? (uploadResult.estimatedConfidence as 1 | 2 | 3);
      const analysisToSave = { ...uploadResult, estimatedConfidence: finalConfidence };
      const note = await generateADHDNote(analysisToSave);
      const sub = await getSubjectByName(analysisToSave.subject);
      await saveLectureTranscript({
        subjectId: sub?.id ?? null,
        subjectName: analysisToSave.subject,
        note,
        transcript: analysisToSave.transcript,
        summary: analysisToSave.lectureSummary,
        topics: analysisToSave.topics,
        appName: 'Upload',
        confidence: finalConfidence,
        embedding: analysisToSave.embedding,
      });
      refreshProfile();
      setUploadResult(null);
      setUploadConfidence(null);
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsSavingUpload(false);
    }
  };
  const [stats, setStats] = useState<NotesStats>({ lectureCount: 0, topicNoteCount: 0 });
  const [recentLectures, setRecentLectures] = useState<LectureHistoryItem[]>([]);
  const [topicNotes, setTopicNotes] = useState<TopicNotePreview[]>([]);

  const loadData = useCallback(async () => {
    const db = getDb();
    const [lectureCountRow, topicNoteCountRow, recentTopicNotes, failed] = await Promise.all([
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
      getFailedOrPendingTranscriptions(),
    ]);

    setStats({
      lectureCount: lectureCountRow?.count ?? 0,
      topicNoteCount: topicNoteCountRow?.count ?? 0,
    });
    setPendingSessions(failed);
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

  useEffect(() => {
    const onLectureSaved = () => void loadData();
    dbEvents.on(DB_EVENT_KEYS.LECTURE_SAVED, onLectureSaved);
    return () => { dbEvents.off(DB_EVENT_KEYS.LECTURE_SAVED, onLectureSaved); };
  }, [loadData]);

  const emptyState = useMemo(
    () => stats.lectureCount === 0 && stats.topicNoteCount === 0,
    [stats.lectureCount, stats.topicNoteCount],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ResponsiveContainer>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {isRecoveringBackground ? (
            <View style={styles.recoveryGhostRow} pointerEvents="none">
              <ActivityIndicator size="small" color={theme.colors.textMuted} />
              <Text style={styles.recoveryGhostText}>Recovering unsaved session…</Text>
            </View>
          ) : null}
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={20} color={theme.colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.headerTextWrap}>
              <Text style={styles.kicker}>KNOWLEDGE VAULT</Text>
              <Text style={styles.title}>My Notes</Text>
              <Text style={styles.subtitle}>
                Search, revisit, and reuse your lecture notes and topic notes from one place.
              </Text>
            </View>
          </View>

          {pendingSessions.length > 0 && (
            <View style={styles.pendingSection}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.colors.warning }]}>
                  Unprocessed Recordings ({pendingSessions.length})
                </Text>
              </View>
              {pendingSessions.map((session) => (
                <View key={session.id} style={styles.pendingCard}>
                  <View style={styles.pendingInfo}>
                    <Text style={styles.pendingAppName}>{session.appName}</Text>
                    <Text style={styles.pendingDate}>{formatDate(session.launchedAt)}</Text>
                    <Text style={styles.pendingStatus}>
                      Status:{' '}
                      <Text style={{ fontWeight: '700' }}>
                        {session.transcriptionStatus?.toUpperCase()}
                      </Text>
                    </Text>
                    {session.transcriptionError && (
                      <Text style={styles.pendingError} numberOfLines={1}>
                        {session.transcriptionError}
                      </Text>
                    )}
                  </View>
                  <View style={styles.pendingActions}>
                    <TouchableOpacity
                      style={[styles.miniActionBtn, { backgroundColor: '#333' }]}
                      onPress={() => handlePlayPending(session)}
                    >
                      <Ionicons
                        name={activePlaybackId === session.id ? 'stop' : 'play'}
                        size={16}
                        color="#fff"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.retryBtn}
                      onPress={() => handleRetry(session)}
                      disabled={isRetrying === session.id}
                    >
                      {isRetrying === session.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="refresh" size={16} color="#fff" />
                          <Text style={styles.retryBtnText}>Retry</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

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
              accessibilityRole="button"
              accessibilityLabel="Search all notes"
            >
              <Ionicons name="search" size={20} color={theme.colors.background} />
              <Text style={styles.actionPrimaryTitle}>Search all notes</Text>
              <Text style={styles.actionPrimarySub}>
                Find any concept across transcripts and saved topic notes.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('TranscriptHistory')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Lecture transcripts"
            >
              <Ionicons name="document-text-outline" size={20} color={theme.colors.primaryLight} />
              <Text style={styles.actionTitle}>Lecture transcripts</Text>
              <Text style={styles.actionSub}>
                Browse processed lecture notes and raw transcript history.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() =>
                tabsNavigation?.navigate('ChatTab', {
                  screen: 'GuruChat',
                  params: { topicName: 'General Medicine' },
                })
              }
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Ask Guru"
            >
              <Ionicons name="medkit-outline" size={20} color={theme.colors.success} />
              <Text style={styles.actionTitle}>Ask Guru</Text>
              <Text style={styles.actionSub}>
                Use your notes as a launch point for grounded medical questions.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={handleAudioUpload}
              disabled={isTranscribingUpload}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={isTranscribingUpload ? 'Transcribing' : 'Upload audio'}
            >
              <Ionicons name="cloud-upload-outline" size={20} color={theme.colors.warning} />
              <Text style={styles.actionTitle}>
                {isTranscribingUpload ? 'Transcribing...' : 'Upload Audio'}
              </Text>
              <Text style={styles.actionSub}>
                Convert external lecture audio files into elite ADHD notes.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => {
                if (navigationRef.isReady()) navigationRef.navigate('ManualNoteCreation' as never);
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Paste transcript"
            >
              <Ionicons name="clipboard-outline" size={20} color={theme.colors.accent} />
              <Text style={styles.actionTitle}>Paste Transcript</Text>
              <Text style={styles.actionSub}>
                Manually enter text to generate formatted medical notes.
              </Text>
            </TouchableOpacity>
          </View>

          {emptyState ? (
            <View style={styles.emptyCard}>
              <Ionicons name="library-outline" size={28} color={theme.colors.primary} />
              <Text style={styles.emptyTitle}>No saved notes yet</Text>
              <Text style={styles.emptySub}>
                Lecture returns and topic note edits will show up here once they are saved.
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() =>
                  tabsNavigation?.navigate('HomeTab', {
                    screen: 'LectureMode',
                    params: {},
                  })
                }
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Start a lecture capture"
              >
                <Text style={styles.emptyBtnText}>Start a lecture capture</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent lecture notes</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('TranscriptHistory')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="View all transcripts"
                >
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
                    accessibilityRole="button"
                    accessibilityLabel={`Open lecture note: ${getLectureTitle(lecture)}`}
                  >
                    <View style={styles.lectureMetaRow}>
                      <Text style={styles.lectureSubject} numberOfLines={1} ellipsizeMode="tail">
                        {getLectureTitle(lecture)}
                      </Text>
                      <Text style={styles.lectureDate}>{formatDate(lecture.createdAt)}</Text>
                    </View>
                    <Text style={styles.lecturePreview} numberOfLines={4}>
                      {extractPreview(lecture.summary || lecture.note)}
                    </Text>
                    <View style={styles.inlineMetaRow}>
                      {lecture.appName ? (
                        <Text style={styles.inlineMeta}>via {lecture.appName}</Text>
                      ) : (
                        <View />
                      )}
                      <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                ))
              )}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Topic notes</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('NotesSearch')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Search notes"
                >
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
                    accessibilityRole="button"
                    accessibilityLabel={`Topic note: ${topic.topicName}`}
                  >
                    <Text style={styles.topicSubject}>{topic.subjectName}</Text>
                    <Text style={styles.topicTitle} numberOfLines={2} ellipsizeMode="tail">
                      {topic.topicName}
                    </Text>
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

      {/* Upload Review Modal */}
      <Modal visible={!!uploadResult} transparent animationType="slide" onRequestClose={() => setUploadResult(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Lecture Transcribed</Text>

            {uploadResult && uploadResult.topics.length > 0 ? (
              <>
                <SubjectChip subject={uploadResult.subject} />
                <Text style={styles.modalSummary} numberOfLines={4}>
                  {uploadResult.lectureSummary}
                </Text>
                <Text style={styles.modalSectionLabel}>TOPICS DETECTED</Text>
                <TopicPillRow topics={uploadResult.topics} />
                <Text style={styles.modalSectionLabel}>YOUR CONFIDENCE LEVEL</Text>
                <ConfidenceSelector
                  value={uploadConfidence ?? (uploadResult.estimatedConfidence as 1 | 2 | 3)}
                  onChange={setUploadConfidence}
                />
              </>
            ) : (
              <View style={styles.noTopicsBlock}>
                <Text style={styles.noTopicsIcon}>🔇</Text>
                <Text style={styles.noTopicsText}>No medical topics detected in this recording.</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.modalSaveBtn, isSavingUpload && { opacity: 0.6 }]}
              onPress={handleSaveUpload}
              disabled={isSavingUpload || !uploadResult?.topics.length}
              activeOpacity={0.8}
            >
              {isSavingUpload
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.modalSaveBtnText}>Save to Notes Vault</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalDismissBtn} onPress={() => { setUploadResult(null); setUploadConfidence(null); }}>
              <Text style={styles.modalDismissText}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  pendingSection: { gap: 10, marginBottom: 8 },
  pendingCard: {
    backgroundColor: '#2A1A1A',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#4A2A2A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pendingInfo: { flex: 1, gap: 2 },
  pendingAppName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  pendingDate: { color: '#9A9AAC', fontSize: 12 },
  pendingStatus: { color: '#FFB74D', fontSize: 11, marginTop: 2 },
  pendingError: { color: '#EF5350', fontSize: 11, fontStyle: 'italic' },
  pendingActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtn: {
    backgroundColor: '#6C63FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  retryBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  recoveryGhostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 4,
  },
  recoveryGhostText: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
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
  lectureMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  lectureSubject: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1 },
  lectureDate: { color: '#7A7A91', fontSize: 12, fontWeight: '600' },
  lecturePreview: { color: '#C9C9D3', fontSize: 14, lineHeight: 21 },
  inlineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
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
  // Upload review modal
  modalOverlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: theme.colors.panel, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36, gap: 12 },
  modalTitle: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  modalSummary: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 20 },
  modalSectionLabel: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 4 },
  noTopicsBlock: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  noTopicsIcon: { fontSize: 36 },
  noTopicsText: { color: theme.colors.textMuted, fontSize: 13, textAlign: 'center' },
  modalSaveBtn: { backgroundColor: theme.colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4 },
  modalSaveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  modalDismissBtn: { alignItems: 'center', paddingVertical: 8 },
  modalDismissText: { color: theme.colors.textMuted, fontSize: 14 },
});
