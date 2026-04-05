import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
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
import { ResponsiveContainer } from '../hooks/useResponsive';
import { linearTheme as n } from '../theme/linearTheme';
import LinearButton from '../components/primitives/LinearButton';
import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';
import { MS_PER_DAY } from '../constants/time';
import { getDb } from '../db/database';
import { getLectureHistory, type LectureHistoryItem } from '../db/queries/aiCache';
import { buildLectureDisplayTitle } from '../services/lecture/lectureIdentity';
import { resolveLectureSubjectRequirement } from '../services/lecture/lectureSubjectRequirement';
import ConfidenceSelector from '../components/ConfidenceSelector';
import TopicPillRow from '../components/TopicPillRow';
import SubjectChip from '../components/SubjectChip';
import SubjectSelectionCard from '../components/SubjectSelectionCard';

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

function getLectureTitle(
  lecture: Pick<LectureHistoryItem, 'subjectName' | 'topics' | 'note' | 'summary'>,
): string {
  return buildLectureDisplayTitle({
    subjectName: lecture.subjectName,
    topics: lecture.topics,
    note: lecture.note,
    summary: lecture.summary,
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

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

import {
  transcribeAudio,
  generateADHDNote,
  isMeaningfulLectureAnalysis,
  type LectureAnalysis,
} from '../services/transcriptionService';
import { getSubjectByName } from '../db/queries/topics';
import { saveLectureTranscript } from '../db/queries/aiCache';
import { getFailedOrPendingTranscriptions, type ExternalAppLog } from '../db/queries/externalLogs';
import * as DocumentPicker from 'expo-document-picker';
import { useAppStore } from '../store/useAppStore';
import { dbEvents, DB_EVENT_KEYS } from '../services/databaseEvents';
import { runFullTranscriptionPipeline } from '../services/lecture/lectureSessionMonitor';
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
  const [uploadSubjectRequired, setUploadSubjectRequired] = useState(false);
  const [selectedUploadSubjectName, setSelectedUploadSubjectName] = useState<string | null>(null);
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

  const showErrorAlert = (title: string, error: unknown) => {
    Alert.alert(title, error instanceof Error ? error.message : String(error));
  };

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
    } catch {
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
    } catch (e: unknown) {
      showErrorAlert('Retry Failed', e);
    } finally {
      setIsRetrying(null);
    }
  };

  const handleAudioUpload = async () => {
    let res: DocumentPicker.DocumentPickerResult;
    try {
      res = await DocumentPicker.getDocumentAsync({ type: ['audio/*'] });
    } catch (error: unknown) {
      showErrorAlert('Error', error);
      return;
    }
    if (res.canceled || !res.assets[0]) return;
    setIsTranscribingUpload(true);
    try {
      const analysis = await transcribeAudio({ audioFilePath: res.assets[0].uri });
      if (!isMeaningfulLectureAnalysis(analysis)) {
        throw new Error('No usable lecture content was detected in this recording.');
      }
      setUploadResult(analysis);
      setUploadConfidence(analysis.estimatedConfidence as 1 | 2 | 3);
      const resolution = await resolveLectureSubjectRequirement(analysis.subject);
      setUploadSubjectRequired(resolution.requiresSelection);
      setSelectedUploadSubjectName(
        resolution.requiresSelection
          ? null
          : (resolution.matchedSubject?.name ?? resolution.normalizedSubjectName),
      );
    } catch (e: unknown) {
      showErrorAlert('Error', e);
    } finally {
      setIsTranscribingUpload(false);
    }
  };

  const handleSaveUpload = async () => {
    if (!uploadResult) return;
    if (uploadSubjectRequired && !selectedUploadSubjectName) {
      showErrorAlert('Subject required', 'Choose the lecture subject before saving this upload.');
      return;
    }
    setIsSavingUpload(true);
    try {
      const finalConfidence = uploadConfidence ?? (uploadResult.estimatedConfidence as 1 | 2 | 3);
      const subjectName = selectedUploadSubjectName ?? uploadResult.subject;
      const analysisToSave = {
        ...uploadResult,
        subject: subjectName,
        estimatedConfidence: finalConfidence,
      };
      const note = await generateADHDNote(analysisToSave);
      const sub = await getSubjectByName(subjectName);
      await saveLectureTranscript({
        subjectId: sub?.id ?? null,
        subjectName: subjectName,
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
      setUploadSubjectRequired(false);
      setSelectedUploadSubjectName(null);
      loadData();
    } catch (e: unknown) {
      showErrorAlert('Error', e);
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
    return () => {
      dbEvents.off(DB_EVENT_KEYS.LECTURE_SAVED, onLectureSaved);
    };
  }, [loadData]);

  const emptyState = useMemo(
    () => stats.lectureCount === 0 && stats.topicNoteCount === 0,
    [stats.lectureCount, stats.topicNoteCount],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {isRecoveringBackground ? (
            <LinearSurface padded={false} style={styles.recoveryGhostRow} pointerEvents="none">
              <ActivityIndicator size="small" color={n.colors.textMuted} />
              <LinearText variant="bodySmall" tone="muted" style={styles.recoveryGhostText}>
                Recovering unsaved session…
              </LinearText>
            </LinearSurface>
          ) : null}
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={20} color={n.colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.headerTextWrap}>
              <LinearText variant="badge" tone="accent" style={styles.kicker}>
                KNOWLEDGE VAULT
              </LinearText>
              <LinearText variant="display" style={styles.title}>
                My Notes
              </LinearText>
              <LinearText variant="body" tone="secondary" style={styles.subtitle}>
                Search, revisit, and reuse your lecture notes and topic notes from one place.
              </LinearText>
            </View>
          </View>

          {pendingSessions.length > 0 && (
            <View style={styles.pendingSection}>
              <View style={styles.sectionHeader}>
                <LinearText style={[styles.sectionTitle, { color: n.colors.warning }]}>
                  Unprocessed Recordings ({pendingSessions.length})
                </LinearText>
              </View>
              <ScrollView style={styles.pendingList} nestedScrollEnabled>
                {pendingSessions.map((session) => (
                  <LinearSurface key={session.id} padded={false} style={styles.pendingCard}>
                    <View style={styles.pendingInfo}>
                      <LinearText variant="body" style={styles.pendingAppName}>
                        {session.appName}
                      </LinearText>
                      <LinearText variant="caption" tone="secondary" style={styles.pendingDate}>
                        {formatDate(session.launchedAt)}
                      </LinearText>
                      <LinearText variant="caption" tone="warning" style={styles.pendingStatus}>
                        Status:{' '}
                        <LinearText style={{ fontWeight: '700' }}>
                          {session.transcriptionStatus?.toUpperCase()}
                        </LinearText>
                      </LinearText>
                      {session.pipelineTelemetry?.currentMessage ? (
                        <LinearText variant="caption" style={styles.pendingStage}>
                          {session.pipelineTelemetry.currentMessage}
                          {typeof session.pipelineTelemetry.currentPercent === 'number'
                            ? ` (${Math.round(session.pipelineTelemetry.currentPercent)}%)`
                            : ''}
                        </LinearText>
                      ) : null}
                      {session.pipelineTelemetry?.currentDetail ? (
                        <LinearText
                          variant="caption"
                          tone="secondary"
                          style={styles.pendingDetail}
                          numberOfLines={3}
                        >
                          {session.pipelineTelemetry.currentDetail}
                        </LinearText>
                      ) : null}
                      {session.pipelineTelemetry?.events?.length ? (
                        <View style={styles.pendingEvents}>
                          {session.pipelineTelemetry.events
                            .slice(-2)
                            .reverse()
                            .map((event, index) => (
                              <LinearText
                                key={`${event.at}-${index}`}
                                variant="meta"
                                tone="muted"
                                style={styles.pendingEventText}
                              >
                                {formatTime(event.at)} - {event.message}
                              </LinearText>
                            ))}
                        </View>
                      ) : null}
                      {session.transcriptionError && (
                        <LinearText
                          variant="caption"
                          tone="error"
                          style={styles.pendingError}
                          numberOfLines={2}
                        >
                          {session.transcriptionError}
                        </LinearText>
                      )}
                    </View>
                    <View style={styles.pendingActions}>
                      <TouchableOpacity
                        style={[styles.miniActionBtn, { backgroundColor: n.colors.border }]}
                        onPress={() => handlePlayPending(session)}
                      >
                        <Ionicons
                          name={activePlaybackId === session.id ? 'stop' : 'play'}
                          size={16}
                          color={n.colors.textPrimary}
                        />
                      </TouchableOpacity>
                      <LinearButton
                        label={isRetrying === session.id ? 'Transcribing…' : 'Retry'}
                        variant="primary"
                        style={styles.retryBtn}
                        onPress={() => handleRetry(session)}
                        disabled={isRetrying === session.id}
                        leftIcon={
                          isRetrying === session.id ? (
                            <ActivityIndicator size="small" color={n.colors.textInverse} />
                          ) : (
                            <Ionicons name="refresh" size={16} color={n.colors.textInverse} />
                          )
                        }
                      />
                    </View>
                  </LinearSurface>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.statsRow}>
            <LinearSurface padded={false} style={styles.statCard}>
              <LinearText variant="display" style={styles.statValue}>
                {stats.lectureCount}
              </LinearText>
              <LinearText variant="bodySmall" tone="secondary" style={styles.statLabel}>
                Lecture notes
              </LinearText>
            </LinearSurface>
            <LinearSurface padded={false} style={styles.statCard}>
              <LinearText variant="display" style={styles.statValue}>
                {stats.topicNoteCount}
              </LinearText>
              <LinearText variant="bodySmall" tone="secondary" style={styles.statLabel}>
                Topic notes
              </LinearText>
            </LinearSurface>
          </View>

          <View style={styles.actionGrid}>
            <LinearSurface padded={false} style={[styles.actionCard, styles.actionPrimary]}>
              <TouchableOpacity
                style={styles.actionTap}
                onPress={() => navigation.navigate('NotesSearch')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Search all notes"
              >
                <Ionicons name="search" size={20} color={n.colors.textInverse} />
                <LinearText variant="sectionTitle" tone="inverse" style={styles.actionPrimaryTitle}>
                  Search all notes
                </LinearText>
                <LinearText variant="bodySmall" tone="inverse" style={styles.actionPrimarySub}>
                  Find any concept across transcripts and saved topic notes.
                </LinearText>
              </TouchableOpacity>
            </LinearSurface>

            <LinearSurface padded={false} style={styles.actionCard}>
              <TouchableOpacity
                style={styles.actionTap}
                onPress={() => navigation.navigate('TranscriptHistory')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Transcript Vault"
              >
                <Ionicons name="document-text-outline" size={20} color={n.colors.accent} />
                <LinearText variant="sectionTitle" style={styles.actionTitle}>
                  Transcript Vault
                </LinearText>
                <LinearText variant="bodySmall" tone="secondary" style={styles.actionSub}>
                  Browse lecture notes, raw transcripts, and search your vault.
                </LinearText>
              </TouchableOpacity>
            </LinearSurface>

            <LinearSurface padded={false} style={styles.actionCard}>
              <TouchableOpacity
                style={styles.actionTap}
                onPress={() =>
                  tabsNavigation?.navigate('ChatTab', {
                    screen: 'GuruChat',
                    params: { topicName: 'General Medicine', autoFocusComposer: true },
                  })
                }
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Ask Guru"
              >
                <Ionicons name="medkit-outline" size={20} color={n.colors.success} />
                <LinearText variant="sectionTitle" style={styles.actionTitle}>
                  Ask Guru
                </LinearText>
                <LinearText variant="bodySmall" tone="secondary" style={styles.actionSub}>
                  Use your notes as a launch point for grounded medical questions.
                </LinearText>
              </TouchableOpacity>
            </LinearSurface>

            <LinearSurface padded={false} style={styles.actionCard}>
              <TouchableOpacity
                style={styles.actionTap}
                onPress={handleAudioUpload}
                disabled={isTranscribingUpload}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={isTranscribingUpload ? 'Transcribing' : 'Upload audio'}
              >
                <Ionicons name="cloud-upload-outline" size={20} color={n.colors.warning} />
                <LinearText variant="sectionTitle" style={styles.actionTitle}>
                  {isTranscribingUpload ? 'Transcribing...' : 'Upload Audio'}
                </LinearText>
                <LinearText variant="bodySmall" tone="secondary" style={styles.actionSub}>
                  Convert external lecture audio files into elite ADHD notes.
                </LinearText>
              </TouchableOpacity>
            </LinearSurface>

            <LinearSurface padded={false} style={styles.actionCard}>
              <TouchableOpacity
                style={styles.actionTap}
                onPress={() => navigation.navigate('ManualNoteCreation')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Paste transcript"
              >
                <Ionicons name="clipboard-outline" size={20} color={n.colors.error} />
                <LinearText variant="sectionTitle" style={styles.actionTitle}>
                  Paste Transcript
                </LinearText>
                <LinearText variant="bodySmall" tone="secondary" style={styles.actionSub}>
                  Manually enter text to generate formatted medical notes.
                </LinearText>
              </TouchableOpacity>
            </LinearSurface>
          </View>

          {emptyState ? (
            <LinearSurface padded={false} style={styles.emptyCard}>
              <Ionicons name="library-outline" size={28} color={n.colors.accent} />
              <LinearText variant="title" style={styles.emptyTitle}>
                No saved notes yet
              </LinearText>
              <LinearText variant="body" tone="secondary" style={styles.emptySub}>
                Lecture returns and topic note edits will show up here once they are saved.
              </LinearText>
              <LinearButton
                label="Start a lecture capture"
                variant="primary"
                style={styles.emptyBtn}
                onPress={() =>
                  tabsNavigation?.navigate('HomeTab', {
                    screen: 'LectureMode',
                    params: {},
                  })
                }
                accessibilityRole="button"
                accessibilityLabel="Start a lecture capture"
              />
            </LinearSurface>
          ) : (
            <>
              <View style={styles.sectionHeader}>
                <LinearText variant="sectionTitle" style={styles.sectionTitle}>
                  Recent lecture notes
                </LinearText>
                <TouchableOpacity
                  onPress={() => navigation.navigate('TranscriptHistory')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="View all transcripts"
                >
                  <LinearText variant="label" tone="accent" style={styles.sectionLink}>
                    View all
                  </LinearText>
                </TouchableOpacity>
              </View>

              {recentLectures.length === 0 ? (
                <LinearText variant="bodySmall" tone="muted" style={styles.sectionPlaceholder}>
                  No lecture notes saved yet.
                </LinearText>
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
                    <LinearSurface padded={false} style={styles.lectureCard}>
                      <View style={styles.lectureMetaRow}>
                        <LinearText
                          variant="body"
                          style={styles.lectureSubject}
                          numberOfLines={2}
                          ellipsizeMode="tail"
                        >
                          {getLectureTitle(lecture)}
                        </LinearText>
                        <LinearSurface padded={false} style={styles.lectureDateBadge}>
                          <LinearText variant="caption" tone="secondary" style={styles.lectureDate}>
                            {formatDate(lecture.createdAt)}
                          </LinearText>
                        </LinearSurface>
                      </View>
                      <LinearText
                        variant="bodySmall"
                        tone="secondary"
                        style={styles.lecturePreview}
                        numberOfLines={5}
                      >
                        {extractPreview(lecture.summary || lecture.note)}
                      </LinearText>
                      <View style={styles.inlineMetaRow}>
                        {lecture.appName ? (
                          <LinearText variant="caption" tone="muted" style={styles.inlineMeta}>
                            via {lecture.appName}
                          </LinearText>
                        ) : (
                          <View />
                        )}
                        <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
                      </View>
                    </LinearSurface>
                  </TouchableOpacity>
                ))
              )}

              <View style={styles.sectionHeader}>
                <LinearText variant="sectionTitle" style={styles.sectionTitle}>
                  Topic notes
                </LinearText>
                <TouchableOpacity
                  onPress={() => navigation.navigate('NotesSearch')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Search notes"
                >
                  <LinearText variant="label" tone="accent" style={styles.sectionLink}>
                    Search notes
                  </LinearText>
                </TouchableOpacity>
              </View>

              {topicNotes.length === 0 ? (
                <LinearText variant="bodySmall" tone="muted" style={styles.sectionPlaceholder}>
                  No topic notes saved yet.
                </LinearText>
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
                    <LinearSurface padded={false} style={styles.topicCard}>
                      <LinearText variant="badge" tone="accent" style={styles.topicSubject}>
                        {topic.subjectName}
                      </LinearText>
                      <LinearText
                        variant="body"
                        style={styles.topicTitle}
                        numberOfLines={3}
                        ellipsizeMode="tail"
                      >
                        {topic.topicName}
                      </LinearText>
                      <LinearText
                        variant="bodySmall"
                        tone="secondary"
                        style={styles.topicPreview}
                        numberOfLines={4}
                      >
                        {extractPreview(topic.userNotes)}
                      </LinearText>
                    </LinearSurface>
                  </TouchableOpacity>
                ))
              )}
            </>
          )}
        </ScrollView>
      </ResponsiveContainer>

      {/* Upload Review Modal */}
      <Modal
        visible={!!uploadResult}
        transparent
        animationType="slide"
        onRequestClose={() => setUploadResult(null)}
      >
        <View style={styles.modalOverlay}>
          <LinearSurface padded={false} style={styles.modalSheet}>
            <LinearText variant="sectionTitle" style={styles.modalTitle}>
              Lecture Transcribed
            </LinearText>

            {uploadResult && uploadResult.topics.length > 0 ? (
              <>
                {uploadSubjectRequired ? (
                  <SubjectSelectionCard
                    detectedSubjectName={uploadResult.subject}
                    selectedSubjectName={selectedUploadSubjectName}
                    onSelectSubject={setSelectedUploadSubjectName}
                  />
                ) : (
                  <SubjectChip subject={selectedUploadSubjectName ?? uploadResult.subject} />
                )}
                <LinearText
                  variant="bodySmall"
                  tone="secondary"
                  style={styles.modalSummary}
                  numberOfLines={5}
                >
                  {uploadResult.lectureSummary}
                </LinearText>
                <LinearText variant="badge" tone="muted" style={styles.modalSectionLabel}>
                  TOPICS DETECTED
                </LinearText>
                <TopicPillRow topics={uploadResult.topics} />
                <LinearText variant="badge" tone="muted" style={styles.modalSectionLabel}>
                  YOUR CONFIDENCE LEVEL
                </LinearText>
                <ConfidenceSelector
                  value={uploadConfidence ?? (uploadResult.estimatedConfidence as 1 | 2 | 3)}
                  onChange={setUploadConfidence}
                />
              </>
            ) : (
              <View style={styles.noTopicsBlock}>
                <LinearText style={styles.noTopicsIcon}>🔇</LinearText>
                <LinearText variant="bodySmall" tone="muted" centered style={styles.noTopicsText}>
                  No medical topics detected in this recording.
                </LinearText>
              </View>
            )}

            <LinearButton
              label={isSavingUpload ? 'Saving…' : 'Save to Notes Vault'}
              variant="primary"
              style={[styles.modalSaveBtn, isSavingUpload && { opacity: 0.6 }]}
              onPress={handleSaveUpload}
              disabled={
                isSavingUpload ||
                !uploadResult?.topics.length ||
                (uploadSubjectRequired && !selectedUploadSubjectName)
              }
              leftIcon={
                isSavingUpload ? (
                  <ActivityIndicator color={n.colors.textInverse} size="small" />
                ) : undefined
              }
            />
            <TouchableOpacity
              style={styles.modalDismissBtn}
              onPress={() => {
                setUploadResult(null);
                setUploadConfidence(null);
                setUploadSubjectRequired(false);
                setSelectedUploadSubjectName(null);
              }}
            >
              <LinearText variant="bodySmall" tone="muted" style={styles.modalDismissText}>
                Discard
              </LinearText>
            </TouchableOpacity>
          </LinearSurface>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  pendingSection: { gap: 10, marginBottom: 8 },
  pendingList: { maxHeight: 220 },
  pendingCard: {
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  pendingInfo: { flex: 1, minWidth: 0, gap: 2 },
  pendingAppName: { color: n.colors.textPrimary, fontSize: 15, fontWeight: '700' },
  pendingDate: { color: '#9A9AAC', fontSize: 12 },
  pendingStatus: { color: '#FFB74D', fontSize: 12, marginTop: 2 },
  pendingStage: { color: '#E8E8F0', fontSize: 12, marginTop: 4, fontWeight: '600' },
  pendingDetail: { color: '#B7B7C7', fontSize: 12, lineHeight: 18 },
  pendingEvents: { marginTop: 6, gap: 2 },
  pendingEventText: { color: '#8F8FA7', fontSize: 11, lineHeight: 16 },
  pendingError: { color: n.colors.error, fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
  pendingActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtn: { minWidth: 128 },
  recoveryGhostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 4,
  },
  recoveryGhostText: {
    fontSize: 13,
    color: n.colors.textMuted,
    fontWeight: '600',
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 8 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: n.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: n.colors.border,
    marginTop: 4,
  },
  headerTextWrap: { flex: 1, gap: 4 },
  kicker: { letterSpacing: 1.1 },
  title: {},
  subtitle: { lineHeight: 21 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    borderRadius: 18,
    padding: 16,
    gap: 4,
  },
  statValue: {},
  statLabel: { fontWeight: '600' },
  actionGrid: { gap: 12 },
  actionCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  actionPrimary: {
    backgroundColor: '#E5E2FF',
  },
  actionTap: { padding: 16, gap: 8 },
  actionPrimaryTitle: {},
  actionPrimarySub: { lineHeight: 19 },
  actionTitle: {},
  actionSub: { lineHeight: 19 },
  emptyCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'flex-start',
    gap: 10,
  },
  emptyTitle: {},
  emptySub: { lineHeight: 21 },
  emptyBtn: { marginTop: 4 },
  sectionHeader: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {},
  sectionLink: {},
  sectionPlaceholder: { lineHeight: 20 },
  lectureCard: {
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  lectureMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
  },
  lectureSubject: { flex: 1 },
  lectureDateBadge: {
    marginLeft: 'auto',
    minHeight: 28,
    minWidth: 78,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lectureDate: { textAlign: 'center' },
  lecturePreview: { lineHeight: 22 },
  inlineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inlineMeta: { lineHeight: 18 },
  topicCard: {
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  topicSubject: { letterSpacing: 0.8 },
  topicTitle: {},
  topicPreview: { lineHeight: 20 },
  // Upload review modal
  modalOverlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
    gap: 12,
  },
  modalTitle: { color: n.colors.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  modalSummary: { color: n.colors.textSecondary, fontSize: 14, lineHeight: 21 },
  modalSectionLabel: {
    color: n.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 4,
  },
  noTopicsBlock: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  noTopicsIcon: { fontSize: 36 },
  noTopicsText: { color: n.colors.textMuted, fontSize: 13, textAlign: 'center' },
  modalSaveBtn: {
    backgroundColor: n.colors.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  modalDismissBtn: { alignItems: 'center', paddingVertical: 8 },
  modalDismissText: {},
});
