/**
 * lectureSessionMonitor.ts — Facade for lecture session health and recovery.
 */
import {
  analyzeTranscript,
  generateADHDNote,
  buildQuickLectureNote,
  shouldReplaceLectureNote,
  isMeaningfulLectureAnalysis,
  transcribeAudio,
  type LectureAnalysis,
} from '../transcriptionService';
import {
  updateLectureTranscriptNote,
  getLectureNoteById,
  getLegacyLectureNotes,
} from '../../db/queries/aiCache';
import {
  updateSessionTranscriptionStatus,
  updateSessionNoteEnhancementStatus,
  getFailedOrPendingTranscriptions,
  getSessionsNeedingNoteEnhancement,
  updateSessionPipelineTelemetry,
} from '../../db/queries/externalLogs';
import { startRecordingHealthCheck, stopRecordingHealthCheck } from './health';
import { getRecordingInfo } from './transcription';
import { saveLecturePersistence } from './persistence';
import { notifyTranscriptionFailure, notifyTranscriptionRecovered } from '../notificationService';
import { getTranscriptText, backupNoteToPublic } from '../transcriptStorage';
import { generateEmbedding } from '../ai/embeddingService';
import { profileRepository } from '../../db/repositories';
import { notifyDbUpdate, DB_EVENT_KEYS } from '../databaseEvents';
import * as FileSystem from 'expo-file-system/legacy';
import { toFileUri } from '../fileUri';

export type LecturePipelineStage = 'transcribing' | 'analyzing' | 'saving' | 'enhancing';
export interface LecturePipelineProgress {
  stage: LecturePipelineStage;
  message: string;
}

export { startRecordingHealthCheck, stopRecordingHealthCheck, getRecordingInfo };

const inFlightLecturePipelines = new Set<number>();

interface SaveLectureAnalysisQuickOpts {
  analysis: LectureAnalysis;
  appName: string;
  durationMinutes: number;
  logId: number;
  embedding?: number[] | null;
  noteOverride?: string;
  recordingPath?: string | null;
}

/** Legacy wrapper for saveLecturePersistence */
export async function saveLectureAnalysisQuick(opts: SaveLectureAnalysisQuickOpts) {
  const quickNote = opts.noteOverride ?? buildQuickLectureNote(opts.analysis);
  const { noteOverride: _, ...rest } = opts;
  return saveLecturePersistence({ ...rest, quickNote });
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

  // Hard cap: never retry more than 3 sessions per boot to prevent runaway API usage
  const MAX_RETRIES_PER_BOOT = 3;
  let recovered = 0;
  let attempted = 0;

  for (const session of pending) {
    if (attempted >= MAX_RETRIES_PER_BOOT) break;

    // Guard: skip sessions already being transcribed by another caller
    if (!session.recordingPath || inFlightLecturePipelines.has(session.id!)) continue;

    // Dismiss sessions whose audio file no longer exists
    try {
      const info = await FileSystem.getInfoAsync(toFileUri(session.recordingPath));
      if (!info?.exists) {
        await updateSessionTranscriptionStatus(session.id!, 'dismissed', 'Recording file deleted');
        continue;
      }
    } catch { /* proceed if check fails */ }

    // Dismiss duplicate recordings (same filename already has a completed note)
    try {
      const fileName = session.recordingPath.split('/').pop() ?? '';
      if (fileName) {
        const db = (await import('../../db/database')).getDb();
        const existing = await db.getFirstAsync<{ id: number }>(
          `SELECT ln.id FROM lecture_notes ln
           JOIN external_app_logs el ON el.lecture_note_id = ln.id
           WHERE el.recording_path LIKE ? AND el.transcription_status = 'completed'
           LIMIT 1`,
          [`%${fileName}`],
        );
        if (existing) {
          await updateSessionTranscriptionStatus(session.id!, 'dismissed', 'Duplicate of existing note');
          continue;
        }
      }
    } catch { /* proceed if check fails */ }

    attempted++;
    try {
      const res = await runFullTranscriptionPipeline({
        recordingPath: session.recordingPath,
        appName: session.appName,
        durationMinutes: session.durationMinutes || 0,
        logId: session.id!,
        groqKey,
      });
      if (res.success) recovered++;
    } catch (err) {
      console.error(
        `[SessionMonitor] retryFailedTranscriptions: session ${session.id} failed:`,
        err,
      );
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
          estimatedConfidence: Math.max(1, note.confidence || 1) as 1 | 2 | 3,
          transcript: transcriptText ?? '',
        };
        await enhanceNoteInBackground(session.lectureNoteId, session.id, analysis);
        recovered++;
      }
    }
  }
  return recovered;
}

export async function retryFailedTasks(groqKey?: string): Promise<number> {
  const recoveredTx = await retryFailedTranscriptions(groqKey);
  const recoveredEnh = await retryPendingNoteEnhancements();
  if (recoveredTx > 0 || recoveredEnh > 0) {
    if (__DEV__)
      console.log(
        `[Recovery] Recovered ${recoveredTx} transcripts and ${recoveredEnh} note enhancements.`,
      );
  }
  return recoveredTx + recoveredEnh;
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
  if (inFlightLecturePipelines.has(logId)) {
    return { success: false, error: 'Transcription already in progress for this lecture' };
  }
  inFlightLecturePipelines.add(logId);

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
      recordingPath,
    });

    void enhanceNoteInBackground(noteId as number, logId, analysis);
    return { success: true, analysis, adhdNote: quickNote, lectureNoteId: noteId };
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await updateSessionTranscriptionStatus(logId, 'failed', errMsg);
    await notifyTranscriptionFailure(appName, durationMinutes);
    return { success: false, error: errMsg };
  } finally {
    inFlightLecturePipelines.delete(logId);
  }
}

async function enhanceNoteInBackground(noteId: number, logId: number, analysis: LectureAnalysis) {
  try {
    // If the transcript yielded no useful medical context, mark as completed to prevent endless retries
    if (
      !analysis.subject ||
      analysis.subject.toLowerCase().includes('unclear') ||
      (analysis.topics.length === 0 && analysis.keyConcepts.length === 0)
    ) {
      if (__DEV__)
        console.log(`[SessionMonitor] Skipping enhancement for empty/unclear note ${noteId}`);
      await updateSessionNoteEnhancementStatus(logId, 'completed');
      return;
    }

    const existingNote = await getLectureNoteById(noteId);
    const currentNote = existingNote?.note?.trim() ?? '';
    const enhanced = await generateADHDNote(analysis);
    const normalizedEnhanced = enhanced.trim();
    const shouldReplace = shouldReplaceLectureNote(currentNote, normalizedEnhanced);
    const finalNote = shouldReplace ? normalizedEnhanced : currentNote || normalizedEnhanced;

    if (!finalNote) {
      await updateSessionNoteEnhancementStatus(logId, 'failed');
      return;
    }

    if (shouldReplace) {
      await updateLectureTranscriptNote(noteId, normalizedEnhanced);
    }
    await updateSessionNoteEnhancementStatus(logId, 'completed');

    // Always back up the final kept note, even if enhancement was skipped.
    await backupNoteToPublic(
      noteId,
      { subjectName: analysis.subject, topics: analysis.topics },
      finalNote,
    );
  } catch (err) {
    console.error('[SessionMonitor] enhanceNoteInBackground failed for noteId', noteId, ':', err);
    await updateSessionNoteEnhancementStatus(logId, 'failed');
  }
}

/**
 * Orphan recording scanner — DISABLED.
 * Was auto-creating duplicate transcriptions on every boot by misidentifying
 * already-processed recordings as orphans due to path format mismatches.
 * Use Recording Vault to manually re-process files instead.
 */
export async function scanAndRecoverOrphanedRecordings(): Promise<number> {
  return 0;
}

/**
 * Automatically repairs legacy or incomplete notes by re-analyzing their transcripts.
 */
/** DISABLED — was burning API credits on boot. */
export async function autoRepairLegacyNotes(): Promise<number> {
  return 0;
}
async function _autoRepairLegacyNotes_DISABLED(): Promise<number> {
  const legacy = await getLegacyLectureNotes(3); // Small batch
  if (legacy.length === 0) return 0;

  let repaired = 0;
  for (const note of legacy) {
    const transcriptText = await getTranscriptText(note.transcript);
    if (!transcriptText?.trim()) continue;
    try {
      if (__DEV__) console.log(`[Repair] Repairing note ${note.id}...`);
      const analysis = await analyzeTranscript(transcriptText);
      if (!isMeaningfulLectureAnalysis({ ...analysis, transcript: transcriptText })) {
        continue; // Failed to get better results
      }

      // 1. Update the note text with the new quick format
      const newNote = buildQuickLectureNote(analysis);
      await updateLectureTranscriptNote(note.id, newNote);

      // 2. Update metadata in the DB if possible
      const db = (await import('../../db/database')).getDb();
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
/**
 * Orphan transcript scanner — DISABLED.
 * Was auto-creating duplicate lecture notes on every boot.
 */
export async function scanAndRecoverOrphanedTranscripts(): Promise<number> {
  return 0;
}

async function _scanAndRecoverOrphanedTranscripts_DISABLED(): Promise<number> {
  const { useAppStore } = await import('../../store/useAppStore');
  try {
    const db = (await import('../../db/database')).getDb();
    const FileSystem = await import('expo-file-system/legacy');
    const { Platform } = await import('react-native');
    const { listPublicBackups, getPublicBackupDir } = await import('../../../modules/app-launcher');

    const TRANSCRIPT_DIR = FileSystem.documentDirectory + 'transcripts/';
    const INTERNAL_BACKUP_DIR = FileSystem.documentDirectory + 'backups/Transcripts/';

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
    let recoveryStarted = false;

    async function processOrphanFiles(files: string[], dirUri: string) {
      if (!files || files.length === 0) return;
      for (const fileName of files) {
        if (!fileName.endsWith('.txt')) continue;
        // Don't recover "-cache.txt" or "-legacy.txt"
        if (fileName.includes('cache') || fileName.includes('legacy')) continue;
        if (referencedFiles.has(fileName)) continue;

        if (!recoveryStarted) {
          recoveryStarted = true;
          useAppStore.getState().setRecoveringBackground(true);
        }

        const fileUri = (dirUri.endsWith('/') ? dirUri : dirUri + '/') + fileName;
        const content = await FileSystem.readAsStringAsync(fileUri);

        if (!content.trim()) continue;

        if (__DEV__)
          console.log(
            `[Recovery] Found orphaned transcript in ${dirUri}: ${fileName}. Recovering...`,
          );

        const analysis = await analyzeTranscript(content);
        const quickNote = buildQuickLectureNote(analysis);

        const { saveLecturePersistence } = await import('./persistence');
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
      }
    }

    // 1. Scan internal directories
    async function scanInternalDir(dir: string) {
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) return;
      const files = await FileSystem.readDirectoryAsync(dir);
      await processOrphanFiles(files, dir);
    }
    await scanInternalDir(TRANSCRIPT_DIR);
    await scanInternalDir(INTERNAL_BACKUP_DIR);

    // 2. Scan native public backups
    if (Platform.OS === 'android') {
      try {
        const publicFiles = await listPublicBackups();
        const publicDirPath = await getPublicBackupDir();
        const publicDirUri = 'file://' + publicDirPath;
        await processOrphanFiles(publicFiles, publicDirUri);
      } catch (err) {
        console.warn('[Recovery] Failed to scan native public backups:', err);
      }
    }

    if (recovered > 0) {
      notifyDbUpdate(DB_EVENT_KEYS.TRANSCRIPT_RECOVERED);
    }

    return recovered;
  } catch (err) {
    console.warn('[Recovery] Orphan scan failed:', err);
    return 0;
  } finally {
    useAppStore.getState().setRecoveringBackground(false);
  }
}
