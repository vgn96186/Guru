/**
 * lectureSessionMonitor.ts — Facade for lecture session health and recovery.
 */
import {
  analyzeTranscript,
  generateADHDNote,
  buildQuickLectureNote,
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
import { transcribeWithGroqChunking } from './lecture/transcription';
import { saveLecturePersistence } from './lecture/persistence';
import { notifyTranscriptionFailure, notifyTranscriptionRecovered } from './notificationService';
import { transcribeRawWithLocalWhisper } from './transcription/engines';
import { getTranscriptText } from './transcriptStorage';
import { generateEmbedding } from './ai/embeddingService';
import { profileRepository } from '../db/repositories';

export type LecturePipelineStage = 'transcribing' | 'analyzing' | 'saving' | 'enhancing';
export interface LecturePipelineProgress {
  stage: LecturePipelineStage;
  message: string;
}

export { startRecordingHealthCheck, stopRecordingHealthCheck, getRecordingInfo };

/** Legacy wrapper for saveLecturePersistence */
export async function saveLectureAnalysisQuick(opts: any) {
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
}): Promise<LectureAnalysis> {
  const { recordingPath, groqKey, useLocalWhisper, localWhisperPath, logId, onProgress } = opts;

  onProgress?.({ stage: 'transcribing', message: 'Transcribing lecture audio' });

  let transcript = '';
  if (groqKey) {
    try {
      const res = await transcribeWithGroqChunking(recordingPath, groqKey);
      transcript = res.transcript;
    } catch (err) {
      if (!useLocalWhisper || !localWhisperPath) throw err;
    }
  }

  if (!transcript && useLocalWhisper && localWhisperPath) {
    transcript = await transcribeRawWithLocalWhisper(recordingPath, localWhisperPath);
  }

  if (!transcript) {
    return {
      subject: 'Unknown',
      topics: [],
      keyConcepts: [],
      lectureSummary: 'No speech detected',
      estimatedConfidence: 1,
      transcript: '',
      highYieldPoints: [],
    };
  }

  onProgress?.({ stage: 'analyzing', message: 'Extracting topics and concepts' });
  const analysis = await analyzeTranscript(transcript);
  return { ...analysis, transcript };
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

    void enhanceNoteInBackground(noteId as number, logId, analysis);
    return { success: true, analysis, adhdNote: quickNote, lectureNoteId: noteId };
  } catch (e: any) {
    await updateSessionTranscriptionStatus(logId, 'failed', e?.message);
    await notifyTranscriptionFailure(appName, durationMinutes);
    return { success: false, error: e?.message };
  }
}

async function enhanceNoteInBackground(noteId: number, logId: number, analysis: any) {
  try {
    const enhanced = await generateADHDNote(analysis);
    if (enhanced.trim()) {
      await updateLectureTranscriptNote(noteId, enhanced);
      await updateSessionNoteEnhancementStatus(logId, 'completed');
    }
  } catch {
    await updateSessionNoteEnhancementStatus(logId, 'failed');
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
