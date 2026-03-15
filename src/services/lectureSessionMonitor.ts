/**
 * lectureSessionMonitor.ts — Facade for lecture session health and recovery.
 */
import {
  analyzeTranscript,
  generateADHDNote,
  buildQuickLectureNote,
  transcribeAudio,
  type LectureAnalysis,
} from './transcriptionService';
import {
  updateLectureTranscriptNote,
  getLectureNoteById,
  getLegacyLectureNotes,
} from '../db/queries/aiCache';
import {
  updateSessionTranscriptionStatus,
  updateSessionNoteEnhancementStatus,
  getFailedOrPendingTranscriptions,
  getSessionsNeedingNoteEnhancement,
  updateSessionPipelineTelemetry,
} from '../db/queries/externalLogs';
import { startRecordingHealthCheck, stopRecordingHealthCheck } from './lecture/health';
import { getRecordingInfo } from './lecture/transcription';
import { saveLecturePersistence } from './lecture/persistence';
import { notifyTranscriptionFailure, notifyTranscriptionRecovered } from './notificationService';
import { getTranscriptText, backupNoteToPublic } from './transcriptStorage';
import { generateEmbedding } from './ai/embeddingService';
import { profileRepository } from '../db/repositories';
import { notifyDbUpdate, DB_EVENT_KEYS } from './databaseEvents';

export type LecturePipelineStage = 'transcribing' | 'analyzing' | 'saving' | 'enhancing';
export interface LecturePipelineProgress {
  stage: LecturePipelineStage;
  message: string;
}

export { startRecordingHealthCheck, stopRecordingHealthCheck, getRecordingInfo };

/** Legacy wrapper for saveLecturePersistence */
export async function saveLectureAnalysisQuick(opts: {
  analysis: LectureAnalysis;
  appName: string;
  durationMinutes: number;
  logId: number;
  embedding?: number[] | null;
}) {
  const quickNote = buildQuickLectureNote(opts.analysis);
  return saveLecturePersistence({ ...opts, quickNote });
}

/** Robust transcription with recovery/retry logic */
export async function transcribeLectureWithRecovery(opts: {
  recordingPath: string;
  groqKey?: string;
  useLocalWhisper?: boolean;
  localWhisperPath?: string;
  maxRetries?: number;
  logId?: number;
  onProgress?: (progress: LecturePipelineProgress) => void;
}): Promise<LectureAnalysis & { embedding?: number[] }> {
  return transcribeAudio({
    audioFilePath: opts.recordingPath,
    groqKey: opts.groqKey,
    useLocalWhisper: opts.useLocalWhisper,
    localWhisperPath: opts.localWhisperPath,
    maxRetries: opts.maxRetries,
    onProgress: (p) => {
      // Map transcriptionService stages to pipeline stages
      const stage = p.stage === 'transcribing' ? 'transcribing' : 'analyzing';
      opts.onProgress?.({ stage, message: p.message });
    },
  });
}

export async function retryFailedTranscriptions(groqKey?: string): Promise<number> {
  const pending = await getFailedOrPendingTranscriptions();
  if (pending.length === 0) return 0;
  let recovered = 0;
  for (const session of pending) {
    if (session.recordingPath) {
      const res = await runFullTranscriptionPipeline({
        recordingPath: session.recordingPath,
        appName: session.appName,
        durationMinutes: session.durationMinutes || 0,
        logId: session.id!,
        groqKey,
      });
      if (res.success) recovered++;
    }
  }
  return recovered;
}

export async function retryPendingNoteEnhancements(): Promise<number> {
  const pending = await getSessionsNeedingNoteEnhancement();
  let recovered = 0;
  for (const session of pending) {
    if (session.id && session.lectureNoteId) {
      const note = await getLectureNoteById(session.lectureNoteId);
      if (note) {
        const transcriptText = await getTranscriptText(note.transcript);
        const analysis: LectureAnalysis = {
          subject: note.subjectName || 'Unknown',
          topics: note.topics || [],
          keyConcepts: [],
          highYieldPoints: [],
          lectureSummary: note.summary || '',
          estimatedConfidence: (note.confidence || 2) as 1 | 2 | 3,
          transcript: transcriptText ?? '',
        };
        await enhanceNoteInBackground(session.lectureNoteId, session.id, analysis);
        recovered++;
      }
    }
  }
  return recovered;
}

export async function retryFailedTasks(groqKey?: string) {
  const recoveredTx = await retryFailedTranscriptions(groqKey);
  const recoveredEnh = await retryPendingNoteEnhancements();
  if (recoveredTx > 0 || recoveredEnh > 0) {
    console.log(
      `[Recovery] Recovered ${recoveredTx} transcripts and ${recoveredEnh} note enhancements.`,
    );
  }
}

export async function runFullTranscriptionPipeline(opts: {
  recordingPath: string;
  appName: string;
  durationMinutes: number;
  logId: number;
  groqKey?: string;
  onProgress?: (progress: LecturePipelineProgress) => void;
}) {
  const { recordingPath, appName, durationMinutes, logId, onProgress } = opts;

  try {
    const profile = await profileRepository.getProfile();
    await updateSessionTranscriptionStatus(logId, 'transcribing');
    const analysis = await transcribeLectureWithRecovery({
      recordingPath,
      groqKey: opts.groqKey,
      useLocalWhisper: !!(profile.useLocalWhisper && profile.localWhisperPath),
      localWhisperPath: profile.localWhisperPath || undefined,
      logId,
      onProgress,
    });

    if (!analysis.transcript?.trim()) {
      await updateSessionTranscriptionStatus(logId, 'no_audio');
      return { success: false, error: 'No speech detected' };
    }

    const quickNote = buildQuickLectureNote(analysis);
    let embedding: number[] | null | undefined;
    if (analysis.lectureSummary?.trim()) {
      try {
        embedding = await generateEmbedding(analysis.lectureSummary);
      } catch {
        embedding = null;
      }
    }
    const noteId = await saveLecturePersistence({
      analysis,
      appName,
      durationMinutes,
      logId,
      quickNote,
      embedding,
    });

    void enhanceNoteInBackground(noteId as number, logId, analysis).catch(err => {
      console.error('[SessionMonitor] Note enhancement failed:', err);
    });
    return { success: true, analysis, adhdNote: quickNote, lectureNoteId: noteId };
  } catch (e: any) {
    await updateSessionTranscriptionStatus(logId, 'failed', e?.message);
    await notifyTranscriptionFailure(appName, durationMinutes);
    return { success: false, error: e?.message };
  }
}

async function enhanceNoteInBackground(noteId: number, logId: number, analysis: LectureAnalysis) {
  try {
    const enhanced = await generateADHDNote(analysis);
    if (enhanced.trim()) {
      await updateLectureTranscriptNote(noteId, enhanced);
      await updateSessionNoteEnhancementStatus(logId, 'completed');

      // CRITICAL: Backup final note to Public Storage
      await backupNoteToPublic(noteId, analysis.subject, enhanced);
    }
  } catch {
    await updateSessionNoteEnhancementStatus(logId, 'failed');
  }
}

/**
 * Scans the public recordings directory for any audio files
 * NOT referenced in external_app_logs and processes them.
 */
export async function scanAndRecoverOrphanedRecordings(): Promise<number> {
  try {
    const db = (await import('../db/database')).getDb();
    const FileSystem = await import('expo-file-system/legacy');
    const { Platform } = await import('react-native');

    if (Platform.OS !== 'android') return 0;

    const PUBLIC_REC_DIR = FileSystem.documentDirectory + 'recordings/';
    const dirInfo = await FileSystem.getInfoAsync(PUBLIC_REC_DIR);
    if (!dirInfo || !dirInfo.exists) return 0;

    const files = await FileSystem.readDirectoryAsync(PUBLIC_REC_DIR);
    if (files.length === 0) return 0;

    // Get all referenced recordings
    const rows = await db.getAllAsync<{ recording_path: string }>(
      'SELECT recording_path FROM external_app_logs WHERE recording_path IS NOT NULL',
    );
    const referencedFiles = new Set(
      rows.map((r) => {
        const parts = r.recording_path.split('/');
        return parts[parts.length - 1];
      }),
    );

    let recovered = 0;
    for (const fileName of files) {
      if (!fileName.endsWith('.m4a') && !fileName.endsWith('.wav')) continue;
      if (referencedFiles.has(fileName)) continue;

      // Orphan audio found!
      const fileUri = PUBLIC_REC_DIR + fileName;
      console.log(`[Recovery] Found orphaned recording: ${fileName}. Processing...`);

      // Create a dummy log entry
      const logResult = await db.runAsync(
        'INSERT INTO external_app_logs (app_name, launched_at, recording_path, transcription_status) VALUES (?, ?, ?, ?)',
        ['Recovered Audio', Date.now(), fileUri, 'pending'],
      );

      const logId = logResult.lastInsertRowId;

      // Trigger transcription pipeline
      void runFullTranscriptionPipeline({
        recordingPath: fileUri,
        appName: 'Recovered Audio',
        durationMinutes: 0,
        logId: logId as number,
      }).catch(err => {
        console.error(`[Recovery] Pipeline failed for ${fileName}:`, err);
      });

      referencedFiles.add(fileName);
      recovered++;
    }

    if (recovered > 0) {
      notifyDbUpdate(DB_EVENT_KEYS.RECORDING_RECOVERED);
    }

    return recovered;
  } catch (err) {
    console.warn('[Recovery] Orphan recording scan failed:', err);
    return 0;
  }
}

/**
 * Automatically repairs legacy or incomplete notes by re-analyzing their transcripts.
 */
export async function autoRepairLegacyNotes(): Promise<number> {
  const legacy = await getLegacyLectureNotes(3); // Small batch
  if (legacy.length === 0) return 0;

  let repaired = 0;
  for (const note of legacy) {
    const transcriptText = await getTranscriptText(note.transcript);
    if (!transcriptText?.trim()) continue;
    try {
      console.log(`[Repair] Repairing note ${note.id}...`);
      const analysis = await analyzeTranscript(transcriptText);
      if (
        analysis.subject === 'Unknown' &&
        analysis.lectureSummary === 'Lecture content recorded'
      ) {
        continue; // Failed to get better results
      }

      // 1. Update the note text with the new quick format
      const newNote = buildQuickLectureNote(analysis);
      await updateLectureTranscriptNote(note.id, newNote);

      // 2. Update metadata in the DB if possible
      const db = (await import('../db/database')).getDb();
      await db.runAsync(
        'UPDATE lecture_notes SET summary = ?, topics_json = ?, confidence = ?, subject_id = (SELECT id FROM subjects WHERE name = ? LIMIT 1) WHERE id = ?',
        [
          analysis.lectureSummary,
          JSON.stringify(analysis.topics),
          analysis.estimatedConfidence,
          analysis.subject,
          note.id,
        ],
      );

      repaired++;
    } catch (err) {
      console.warn(`[Repair] Failed to repair note ${note.id}:`, err);
    }
  }
  return repaired;
}

/**
 * Scans the transcripts directory (and public backup directory) for any files
 * NOT referenced in the database and creates lecture notes for them.
 */
export async function scanAndRecoverOrphanedTranscripts(): Promise<number> {
  try {
    const db = (await import('../db/database')).getDb();
    const FileSystem = await import('expo-file-system/legacy');
    const { Platform } = await import('react-native');

    const TRANSCRIPT_DIR = FileSystem.documentDirectory + 'transcripts/';
    const PUBLIC_BACKUP_DIR = FileSystem.documentDirectory + 'backups/Transcripts/';

    // Get all referenced transcripts
    const rows = await db.getAllAsync<{ transcript: string }>(
      'SELECT transcript FROM lecture_notes WHERE transcript IS NOT NULL',
    );
    const referencedFiles = new Set(
      rows.map((r) => {
        const parts = r.transcript.split('/');
        return parts[parts.length - 1];
      }),
    );

    let recovered = 0;

    async function scanDir(dir: string) {
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo || !dirInfo.exists) return;

      const files = await FileSystem.readDirectoryAsync(dir);
      const orphanedFiles = files.filter(
        (fileName) => fileName.endsWith('.txt') && !referencedFiles.has(fileName)
      );

      // Process in chunks of 5
      const concurrencyLimit = 5;
      for (let i = 0; i < orphanedFiles.length; i += concurrencyLimit) {
        const chunk = orphanedFiles.slice(i, i + concurrencyLimit);

        await Promise.all(
          chunk.map(async (fileName) => {
            // Orphan found!
            const fileUri = dir + fileName;
            const content = await FileSystem.readAsStringAsync(fileUri);

            if (!content.trim()) return;

            console.log(`[Recovery] Found orphaned transcript in ${dir}: ${fileName}. Recovering...`);

            const analysis = await analyzeTranscript(content);
            const quickNote = buildQuickLectureNote(analysis);

            const { saveLecturePersistence } = await import('./lecture/persistence');
            await saveLecturePersistence({
              analysis: { ...analysis, transcript: content },
              appName: 'Recovered Folder',
              durationMinutes: 0,
              logId: -1,
              quickNote,
            });

            // Add to set so we don't recover it twice if it exists in both dirs
            referencedFiles.add(fileName);
            recovered++;
          })
        );
      }
    }

    await scanDir(TRANSCRIPT_DIR);
    await scanDir(PUBLIC_BACKUP_DIR);

    if (recovered > 0) {
      notifyDbUpdate(DB_EVENT_KEYS.TRANSCRIPT_RECOVERED);
    }

    return recovered;
  } catch (err) {
    console.warn('[Recovery] Orphan scan failed:', err);
    return 0;
  }
}
