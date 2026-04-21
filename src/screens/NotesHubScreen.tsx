import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Modal,
} from 'react-native';
import ErrorBoundary from '../components/ErrorBoundary';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { MenuStackParamList, TabParamList } from '../navigation/types';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { useScrollRestoration } from '../hooks/useScrollRestoration';
import { linearTheme as n } from '../theme/linearTheme';
import { blackAlpha } from '../theme/colorUtils';
import LinearButton from '../components/primitives/LinearButton';
import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';
import { EmptyState } from '../components/primitives';
import LoadingOrb from '../components/LoadingOrb';
import ScreenHeader from '../components/ScreenHeader';
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
import type * as DocumentPicker from 'expo-document-picker';
import { pickDocumentOnce } from '../services/documentPicker';
import { useRefreshProfile, PROFILE_QUERY_KEY } from '../hooks/queries/useProfile';
import { queryClient } from '../services/queryClient';
import { useAppStore } from '../store/useAppStore';
import type { UserProfile } from '../types';
import { dbEvents, DB_EVENT_KEYS } from '../services/databaseEvents';
import { runFullTranscriptionPipeline } from '../services/lecture/lectureSessionMonitor';
import { Audio } from 'expo-av';
import { showError, showWarning } from '../components/dialogService';

export default function NotesHubScreen() {
  const navigation = useNavigation<Nav>();
  const tabsNavigation = navigation.getParent<NavigationProp<TabParamList>>();
  const { onScroll, onContentSizeChange } = useScrollRestoration('notes-hub');
  const refreshProfile = useRefreshProfile();
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
      showError('Playback Error', 'Could not play this audio file.');
    }
  };

  const handleRetry = async (session: ExternalAppLog) => {
    if (!session.id || !session.recordingPath) return;
    setIsRetrying(session.id);
    try {
      const profileSnapshot = queryClient.getQueryData<UserProfile>(PROFILE_QUERY_KEY);
      await runFullTranscriptionPipeline({
        recordingPath: session.recordingPath,
        appName: session.appName,
        durationMinutes: session.durationMinutes || 0,
        logId: session.id,
        groqKey: profileSnapshot?.groqApiKey || undefined,
      });
      await loadData();
    } catch (e: unknown) {
      showError(e, 'Retry Failed');
    } finally {
      setIsRetrying(null);
    }
  };

  const handleAudioUpload = async () => {
    let res: DocumentPicker.DocumentPickerResult;
    try {
      res = await pickDocumentOnce({ type: ['audio/*'] });
    } catch (error: unknown) {
      showError(error);
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
      showError(e);
    } finally {
      setIsTranscribingUpload(false);
    }
  };

  const handleSaveUpload = async () => {
    if (!uploadResult) return;
    if (uploadSubjectRequired && !selectedUploadSubjectName) {
      showWarning('Subject required', 'Choose the lecture subject before saving this upload.');
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
      showError(e);
    } finally {
      setIsSavingUpload(false);
    }
  };
  const [stats, setStats] = useState<NotesStats>({ lectureCount: 0, topicNoteCount: 0 });
  const [recentLectures, setRecentLectures] = useState<LectureHistoryItem[]>([]);
  const [topicNotes, setTopicNotes] = useState<TopicNotePreview[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
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
    } finally {
      setLoading(false);
    }
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
  const totalNotesCount = stats.lectureCount + stats.topicNoteCount;
  const summaryCards = useMemo<
    Array<{ label: string; value: string; tone: 'primary' | 'accent' | 'success' | 'warning' }>
  >(
    () => [
      { label: 'Total notes', value: totalNotesCount.toString(), tone: 'primary' },
      { label: 'Lectures', value: stats.lectureCount.toString(), tone: 'accent' },
      { label: 'Topic notes', value: stats.topicNoteCount.toString(), tone: 'success' },
      {
        label: 'Pending',
        value: pendingSessions.length.toString(),
        tone: pendingSessions.length > 0 ? 'warning' : 'accent',
      },
    ],
    [pendingSessions.length, stats.lectureCount, stats.topicNoteCount, totalNotesCount],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ErrorBoundary>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
            onScroll={onScroll}
            onContentSizeChange={onContentSizeChange}
            scrollEventThrottle={16}
          >
            {loading ? (
              <View style={styles.loadingState}>
                <LoadingOrb message="Loading..." size={120} />
              </View>
            ) : null}
            {isRecoveringBackground ? (
              <LinearSurface padded={false} style={styles.recoveryGhostRow} pointerEvents="none">
                <ActivityIndicator size="small" color={n.colors.textMuted} />
                <LinearText variant="bodySmall" tone="muted" style={styles.recoveryGhostText}>
                  Recovering unsaved session…
                </LinearText>
              </LinearSurface>
            ) : null}
            <ScreenHeader title="My Notes" showSettings />

            <LinearSurface compact style={styles.overviewCard}>
              <View style={styles.overviewHeader}>
                <View style={styles.overviewCopy}>
                  <LinearText variant="meta" tone="accent" style={styles.overviewEyebrow}>
                    KNOWLEDGE VAULT
                  </LinearText>
                  <LinearText variant="sectionTitle" style={styles.overviewTitle}>
                    Lecture captures and revision notes in one calmer hub
                  </LinearText>
                  <LinearText variant="bodySmall" tone="secondary" style={styles.overviewText}>
                    Reopen saved lecture notes, topic-level notes, and anything that still needs
                    processing before it disappears into backlog.
                  </LinearText>
                </View>
                <View style={styles.overviewPill}>
                  <LinearText
                    variant="chip"
                    tone={pendingSessions.length > 0 ? 'warning' : 'accent'}
                  >
                    {pendingSessions.length > 0 ? 'Needs rescue' : 'Vault synced'}
                  </LinearText>
                </View>
              </View>
              <View style={styles.overviewMetricsRow}>
                {summaryCards.map((card) => (
                  <View key={card.label} style={styles.overviewMetricCard}>
                    <LinearText variant="title" tone={card.tone} style={styles.overviewMetricValue}>
                      {card.value}
                    </LinearText>
                    <LinearText
                      variant="caption"
                      tone="secondary"
                      style={styles.overviewMetricLabel}
                    >
                      {card.label}
                    </LinearText>
                  </View>
                ))}
              </View>
            </LinearSurface>

            {pendingSessions.length > 0 && (
              <LinearSurface compact style={styles.pendingSection}>
                <View style={styles.sectionHeader}>
                  <LinearText
                    variant="sectionTitle"
                    style={[styles.sectionTitle, styles.pendingSectionTitle]}
                  >
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
              </LinearSurface>
            )}

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
                  <LinearText
                    variant="sectionTitle"
                    tone="inverse"
                    style={styles.actionPrimaryTitle}
                  >
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
              <EmptyState
                variant="card"
                icon="library-outline"
                iconSize={28}
                iconColor={n.colors.accent}
                title="No saved notes yet"
                actions={[
                  {
                    label: 'Start a lecture capture',
                    onPress: () =>
                      tabsNavigation?.navigate('HomeTab', {
                        screen: 'LectureMode',
                        params: {},
                      }),
                    buttonVariant: 'primary',
                  },
                ]}
                style={styles.emptyCard}
              />
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
                      onPress={() =>
                        navigation.navigate('TranscriptHistory', { noteId: lecture.id })
                      }
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
                            <LinearText
                              variant="caption"
                              tone="secondary"
                              style={styles.lectureDate}
                            >
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
      </ErrorBoundary>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  overviewCard: {
    gap: 14,
  },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  overviewCopy: { flex: 1, gap: 4 },
  overviewEyebrow: { letterSpacing: 1 },
  overviewTitle: { maxWidth: 420 },
  overviewText: { lineHeight: 20, maxWidth: 480 },
  overviewPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: n.radius.full,
    backgroundColor: n.colors.card,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  overviewMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  overviewMetricCard: {
    flexGrow: 1,
    minWidth: 120,
    borderRadius: n.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: n.colors.card,
    borderWidth: 1,
    borderColor: n.colors.border,
    gap: 2,
  },
  overviewMetricValue: {},
  overviewMetricLabel: { fontWeight: '600' },
  pendingSection: { gap: 10, marginBottom: 8 },
  pendingSectionTitle: { color: n.colors.warning },
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
  pendingDate: { color: n.colors.textMuted, fontSize: 12 },
  pendingStatus: { color: n.colors.warning, fontSize: 12, marginTop: 2 },
  pendingStage: { color: n.colors.textPrimary, fontSize: 12, marginTop: 4, fontWeight: '600' },
  pendingDetail: { color: n.colors.textSecondary, fontSize: 12, lineHeight: 18 },
  pendingEvents: { marginTop: 6, gap: 2 },
  pendingEventText: { color: n.colors.textMuted, fontSize: 11, lineHeight: 16 },
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
  actionGrid: { gap: 12 },
  actionCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  actionPrimary: {
    backgroundColor: `${n.colors.accent}22`,
    borderColor: `${n.colors.accent}42`,
  },
  actionTap: { padding: 16, gap: 8 },
  actionPrimaryTitle: {},
  actionPrimarySub: { lineHeight: 19 },
  actionTitle: {},
  actionSub: { lineHeight: 19 },
  emptyCard: {},
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
  modalOverlay: { flex: 1, backgroundColor: blackAlpha['72'], justifyContent: 'flex-end' },
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
  loadingState: { alignItems: 'center', justifyContent: 'center', padding: 48, flex: 1 },
  loadingText: { color: n.colors.textMuted, fontSize: 14, marginTop: 16 },
});
