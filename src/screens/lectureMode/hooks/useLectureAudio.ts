import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import {
  transcribeAudio,
  isMeaningfulLectureAnalysis,
  LectureAnalysis,
} from '../../../services/transcriptionService';
import { moveFileToRecovery } from '../../../services/transcriptStorage';
import { enqueueRequest } from '../../../services/offlineQueue';
import { saveLectureChunk } from '../../../services/lecture/persistence';
import { generateADHDNote } from '../../../services/transcription/noteGeneration';
import { getDb } from '../../../db/database';
import { pickDocumentOnce } from '../../../services/documentPicker';
import { showError, showSuccess } from '../../../components/dialogService';

const AUTO_SCRIBE_CHUNK_MS = 3 * 60 * 1000;

export function useLectureAudio(options: {
  selectedSubjectId: number | null;
  onBreak: boolean;
  elapsed: number;
  shouldContinueAutoScribe: boolean;
  onNoteAdded: (note: string) => void;
  onProofOfLifeDismissed: () => void;
}) {
  const {
    selectedSubjectId,
    onBreak,
    elapsed,
    shouldContinueAutoScribe,
    onNoteAdded,
    onProofOfLifeDismissed,
  } = options;

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecordingEnabled, setIsRecordingEnabled] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingRetryCount, setRecordingRetryCount] = useState(0);
  const previousRecordingEnabledRef = useRef(false);
  const recordingStartTimeRef = useRef<number>(0);
  const elapsedRef = useRef(elapsed);

  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  const startRecording = useCallback(async () => {
    try {
      if (recordingRef.current) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch (e) {
          if (__DEV__) console.warn('[LectureMode] Could not stop previous recording:', e);
        }
        recordingRef.current = null;
        setRecording(null);
      }

      const recordingOptions = {
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {},
      };

      const { recording: newRec } = await Audio.Recording.createAsync(recordingOptions);
      recordingRef.current = newRec;
      setRecording(newRec);
      recordingStartTimeRef.current = Date.now();
      if (__DEV__) console.log('[LectureMode] Fresh recording started:', newRec.getURI());
    } catch (err) {
      if (__DEV__) console.error('[LectureMode] Failed to start recording:', err);
      showError('Could not start microphone. Check permissions.');
    }
  }, []);

  async function enhanceNoteInBackground(noteId: number) {
    try {
      const db = getDb();
      const note = await db.getFirstAsync<{
        id: number;
        summary: string | null;
        topics_json: string | null;
        note: string;
      }>('SELECT id, summary, topics_json, note FROM lecture_notes WHERE id = ?', [noteId]);

      if (!note) return;

      const analysis: LectureAnalysis = {
        lectureSummary: note.summary || '',
        topics: note.topics_json ? JSON.parse(note.topics_json) : [],
        keyConcepts: [],
        highYieldPoints: [],
        subject: '',
        estimatedConfidence: 1,
      };

      const enhancedNote = await generateADHDNote(analysis);
      if (enhancedNote) {
        await db.runAsync('UPDATE lecture_notes SET note = ? WHERE id = ?', [enhancedNote, noteId]);
      }
    } catch (err) {
      console.warn('[LectureMode] Background note enhancement failed:', err);
    }
  }

  const processRecording = useCallback(async () => {
    const currentRec = recordingRef.current;
    if (!currentRec) return;
    setIsTranscribing(true);

    try {
      const status = await currentRec.getStatusAsync();
      if (!status.canRecord && __DEV__) {
        console.warn('[LectureMode] Recording instance is not active');
      }

      await currentRec.stopAndUnloadAsync();
      const uri = currentRec.getURI();
      const recordingDuration = (Date.now() - recordingStartTimeRef.current) / 1000;

      recordingRef.current = null;
      setRecording(null);

      if (uri) {
        try {
          const analysis = await transcribeAudio({ audioFilePath: uri });

          if (!isMeaningfulLectureAnalysis(analysis)) {
            throw new Error('No usable lecture content was detected in this recording.');
          }

          const conceptsText =
            analysis.keyConcepts.length > 0
              ? '\n\n💡 **Key Concepts**\n' +
                analysis.keyConcepts.map((c: string) => `• ${c}`).join('\n')
              : '';
          const hyText =
            analysis.highYieldPoints.length > 0
              ? '\n\n🚀 **High-Yield**\n' +
                analysis.highYieldPoints.map((p: string) => `• ${p}`).join('\n')
              : '';
          const quickNote = `🎯 **Subject**: ${
            analysis.subject
          }\n📌 **Topics**: ${analysis.topics.join(', ')}\n\n📝 **Summary**: ${
            analysis.lectureSummary
          }${conceptsText}${hyText}`;

          const result = await saveLectureChunk({
            analysis,
            subjectId: selectedSubjectId,
            appName: 'LectureMode',
            durationMinutes: Math.round(recordingDuration / 60),
            quickNote,
            embedding: analysis.embedding,
            recordingPath: uri,
          });

          void enhanceNoteInBackground(result.noteId);
          onNoteAdded(quickNote);
          onProofOfLifeDismissed();
        } catch (err) {
          console.warn('[LectureMode] Chunk processing failed, moving to recovery:', err);
          const recoveryUri = await moveFileToRecovery(uri);

          await enqueueRequest('transcribe', {
            audioFilePath: recoveryUri,
            appName: 'LectureMode',
            durationMinutes: 3,
            recordingPath: recoveryUri,
            retryCount: recordingRetryCount + 1,
            error: err instanceof Error ? err.message : String(err),
          });

          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      }
    } catch (err) {
      if (__DEV__) console.error('Transcription failed:', err);
    } finally {
      setIsTranscribing(false);
      setRecordingRetryCount(0);
      if (shouldContinueAutoScribe && elapsedRef.current > 0) {
        void startRecording();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingRetryCount, startRecording, selectedSubjectId, shouldContinueAutoScribe]);

  useEffect(() => {
    if (!isRecordingEnabled || onBreak || isTranscribing) return;

    if (!recording && !recordingRef.current) {
      void startRecording();
      return;
    }

    if (!recording) return;

    const elapsedMs = Math.max(0, Date.now() - recordingStartTimeRef.current);
    const remainingMs = Math.max(1000, AUTO_SCRIBE_CHUNK_MS - elapsedMs);
    const timeout = setTimeout(() => {
      void processRecording();
    }, remainingMs);

    return () => clearTimeout(timeout);
  }, [isRecordingEnabled, onBreak, isTranscribing, recording, processRecording, startRecording]);

  useEffect(() => {
    const wasEnabled = previousRecordingEnabledRef.current;
    previousRecordingEnabledRef.current = isRecordingEnabled;

    if (wasEnabled && !isRecordingEnabled && recordingRef.current && !isTranscribing) {
      void processRecording();
    }
  }, [isRecordingEnabled, isTranscribing, processRecording]);

  useEffect(() => {
    if (!onBreak || !recordingRef.current || isTranscribing) return;
    void processRecording();
  }, [onBreak, isTranscribing, processRecording]);

  async function importAndTranscribeAudio() {
    try {
      const picked = await pickDocumentOnce({ type: ['audio/*'], copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;

      const pickedUri = picked.assets[0].uri;
      const tempUri = `${FileSystem.cacheDirectory}lecture-import-${Date.now()}.m4a`;
      await FileSystem.copyAsync({ from: pickedUri, to: tempUri });

      setIsTranscribing(true);
      const analysis = await transcribeAudio({ audioFilePath: tempUri });

      if (!isMeaningfulLectureAnalysis(analysis)) {
        throw new Error('No usable lecture content was detected.');
      }

      const conceptsText =
        analysis.keyConcepts.length > 0
          ? '\n\n💡 **Key Concepts**\n' +
            analysis.keyConcepts.map((c: string) => `• ${c}`).join('\n')
          : '';
      const hyText =
        analysis.highYieldPoints.length > 0
          ? '\n\n🚀 **High-Yield**\n' +
            analysis.highYieldPoints.map((p: string) => `• ${p}`).join('\n')
          : '';
      const quickNote = `🎯 **Subject**: ${analysis.subject}\n📌 **Topics**: ${analysis.topics.join(
        ', ',
      )}\n\n📝 **Summary**: ${analysis.lectureSummary}${conceptsText}${hyText}`;

      const result = await saveLectureChunk({
        analysis,
        subjectId: selectedSubjectId,
        appName: 'Imported',
        durationMinutes: 0,
        quickNote,
        embedding: analysis.embedding,
      });

      void enhanceNoteInBackground(result.noteId);
      onNoteAdded(quickNote);
      showSuccess('Transcription Complete', analysis.lectureSummary || 'Done');
    } catch (err) {
      showError(err, 'Failed to transcribe imported audio.');
      if (__DEV__) console.error('Import transcription failed:', err);
    } finally {
      setIsTranscribing(false);
    }
  }

  return {
    isRecordingEnabled,
    setIsRecordingEnabled,
    isTranscribing,
    importAndTranscribeAudio,
  };
}
