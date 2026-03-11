/**
 * lectureSessionMonitor.ts
 *
 * Monitors active lecture recording sessions for health,
 * handles long-recording chunked transcription, retries
 * failed transcriptions, and sends user notifications on failures.
 *
 * Key responsibilities:
 *  1. Health check: periodically verify recording file is growing
 *  2. Notification: alert user if recording silently fails mid-lecture
 *  3. Chunked transcription: split long recordings (>25MB / >30min) for Groq's limit
 *  4. Audio preservation: never delete audio until transcription succeeds
 *  5. Retry queue: pick up failed transcriptions on next app launch
 */

import * as FileSystem from 'expo-file-system/legacy';
import { AppState } from 'react-native';
import {
  notifyRecordingHealthIssue,
  notifyTranscriptionFailure,
  notifyTranscriptionRecovered,
} from './notificationService';
import {
  transcribeRawWithGroq,
  transcribeRawWithLocalWhisper,
  analyzeTranscript,
  generateADHDNote,
  buildQuickLectureNote,
  markTopicsFromLecture,
  type LectureAnalysis,
} from './transcriptionService';
import { getLectureNoteById, saveLectureTranscript, updateLectureTranscriptNote } from '../db/queries/aiCache';
import { getUserProfile } from '../db/queries/progress';
import {
  getFailedOrPendingTranscriptions,
  getSessionsNeedingNoteEnhancement,
  updateSessionNoteEnhancementStatus,
  updateSessionPipelineTelemetry,
  updateSessionTranscriptionStatus,
} from '../db/queries/externalLogs';
import { getDb } from '../db/database';
import { saveTranscriptToFile } from './transcriptStorage';
import { validateRecordingFile, convertToWav, splitWavIntoChunks } from '../../modules/app-launcher';
import { LEVELS } from '../constants/gamification';

const LOG = '[SessionMonitor]';

export type LecturePipelineStage = 'transcribing' | 'analyzing' | 'saving' | 'enhancing';

export interface LecturePipelineProgress {
  stage: LecturePipelineStage;
  message: string;
}

function emitProgress(
  onProgress: ((progress: LecturePipelineProgress) => void) | undefined,
  stage: LecturePipelineStage,
  message: string,
): void {
  onProgress?.({ stage, message });
}

function stageStart(logId: number | undefined, stage: LecturePipelineStage): number {
  const startedAt = Date.now();
  if (logId) {
    updateSessionPipelineTelemetry(logId, {
      stages: {
        [stage]: { startedAt },
      },
    });
  }
  return startedAt;
}

function stageComplete(
  logId: number | undefined,
  stage: LecturePipelineStage,
  startedAt: number,
): number {
  const completedAt = Date.now();
  if (logId) {
    updateSessionPipelineTelemetry(logId, {
      stages: {
        [stage]: {
          startedAt,
          completedAt,
          durationMs: completedAt - startedAt,
        },
      },
    });
  }
  return completedAt;
}

function execSql(db: any, sql: string): void {
  const maybeExecSync = db.execSync;
  if (typeof maybeExecSync === 'function') {
    maybeExecSync.call(db, sql);
  } else {
    db.runSync(sql);
  }
}

function runInTransaction<T>(db: any, fn: () => T): T {
  execSql(db, 'BEGIN IMMEDIATE');
  try {
    const result = fn();
    execSql(db, 'COMMIT');
    return result;
  } catch (error) {
    try {
      execSql(db, 'ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw error;
  }
}

function addXpInTransaction(db: any, amount: number): void {
  if (amount <= 0) return;
  const currentProfile = db.getFirstSync(
    'SELECT total_xp, current_level FROM user_profile WHERE id = 1',
  ) as { total_xp?: number; current_level?: number } | null;
  const oldTotal = currentProfile?.total_xp ?? 0;
  const newTotal = oldTotal + amount;

  let newLevel = currentProfile?.current_level ?? 1;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (newTotal >= LEVELS[i].xpRequired) {
      newLevel = LEVELS[i].level;
      break;
    }
  }

  db.runSync(
    'UPDATE user_profile SET total_xp = total_xp + ?, current_level = ? WHERE id = 1',
    [amount, newLevel],
  );
}

// ──────────────────────────────────────────────────
// 1. Recording Health Monitor
// ──────────────────────────────────────────────────

let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
let lastKnownFileSize = 0;
let stalledCount = 0;

const HEALTH_CHECK_INTERVAL = 60_000;  // Check every 60s
const STALLED_THRESHOLD = 3;            // 3 consecutive stalls = notification

/**
 * Start monitoring the active recording file.
 * Call when user launches a lecture app.
 */
export function startRecordingHealthCheck(recordingPath: string, appName: string): void {
  stopRecordingHealthCheck(); // Clear any existing
  lastKnownFileSize = 0;
  stalledCount = 0;

  console.log(`${LOG} Starting health check for: ${recordingPath}`);

  // Stop health check when app goes to background to avoid orphaned timers
  const appStateListener = AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') {
      stopRecordingHealthCheck();
      appStateListener.remove();
    }
  });

  healthCheckTimer = setInterval(async () => {
    try {
      const info = await validateRecordingFile(recordingPath);

      if (!info.exists) {
        stalledCount++;
        console.warn(`${LOG} Recording file missing! stalled=${stalledCount}`);
      } else if (info.size <= lastKnownFileSize) {
        stalledCount++;
        console.warn(`${LOG} Recording file not growing: ${info.size} bytes, stalled=${stalledCount}`);
      } else {
        // File is growing — all good
        if (stalledCount > 0) {
          console.log(`${LOG} Recording recovered, file growing again: ${info.size} bytes`);
        }
        stalledCount = 0;
        lastKnownFileSize = info.size;
      }

      if (stalledCount >= STALLED_THRESHOLD) {
        console.error(`${LOG} Recording appears stalled after ${stalledCount} checks!`);
        await notifyRecordingHealthIssue(appName);
        // Don't keep spamming — reset counter but at higher threshold
        stalledCount = 0;
      }
    } catch (e) {
      console.warn(`${LOG} Health check error:`, e);
    }
  }, HEALTH_CHECK_INTERVAL);
}

/** Stop the health check. Call on return to Guru. */
export function stopRecordingHealthCheck(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  lastKnownFileSize = 0;
  stalledCount = 0;
}

// ──────────────────────────────────────────────────
// 2. Chunked Transcription for Long Recordings
// ──────────────────────────────────────────────────

/** Groq's Whisper API has a ~25MB file size limit */
const GROQ_MAX_FILE_SIZE = 24 * 1024 * 1024; // 24MB to be safe
const GROQ_TARGET_CHUNK_BYTES = 18 * 1024 * 1024;
const WAV_BYTES_PER_SECOND = 16_000 * 2; // 16kHz mono 16-bit PCM

/**
 * Estimate whether a recording needs chunking.
 * M4A at 128kbps ≈ ~1MB/min. A 30min lecture ≈ 30MB.
 */
export async function getRecordingInfo(
  filePath: string,
): Promise<{ exists: boolean; sizeBytes: number; estimatedMinutes: number; needsChunking: boolean }> {
  try {
    const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      return { exists: false, sizeBytes: 0, estimatedMinutes: 0, needsChunking: false };
    }
    const sizeBytes = info.size ?? 0;
    const estimatedMinutes = Math.round(sizeBytes / (128_000 / 8 * 60)); // 128kbps
    return {
      exists: true,
      sizeBytes,
      estimatedMinutes,
      needsChunking: sizeBytes > GROQ_MAX_FILE_SIZE,
    };
  } catch {
    return { exists: false, sizeBytes: 0, estimatedMinutes: 0, needsChunking: false };
  }
}

function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function splitWavIntoGroqChunks(wavPath: string): Promise<string[]> {
  const wavUri = toFileUri(wavPath);
  const info = await FileSystem.getInfoAsync(wavUri);
  if (!info.exists || !info.size || info.size <= 44) {
    throw new Error('Converted WAV file is empty');
  }

  const totalDataBytes = info.size - 44;
  const chunkBytes = Math.max(
    WAV_BYTES_PER_SECOND * 60, // at least 1 minute
    Math.floor(GROQ_TARGET_CHUNK_BYTES / WAV_BYTES_PER_SECOND) * WAV_BYTES_PER_SECOND,
  );
  const nativeChunks = await splitWavIntoChunks(
    wavPath,
    chunkBytes,
    chunkBytes,
    WAV_BYTES_PER_SECOND,
  );
  const chunks = nativeChunks.map(chunk => chunk.path);

  const estimatedMinutes = Math.round(totalDataBytes / WAV_BYTES_PER_SECOND / 60);
  console.log(`${LOG} Created ${chunks.length} Groq chunks from ~${estimatedMinutes}min recording`);
  return chunks;
}

async function safeDelete(path: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(toFileUri(path), { idempotent: true });
  } catch {
    // best effort cleanup only
  }
}

function mergeChunkTranscripts(chunks: string[]): string {
  return chunks
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .join('\n\n');
}

async function transcribeWithGroqChunking(recordingPath: string, groqKey: string): Promise<{
  transcript: string;
  usedChunking: boolean;
  chunkCount: number;
}> {
  const info = await getRecordingInfo(recordingPath);
  if (!info.needsChunking) {
    return {
      transcript: await transcribeRawWithGroq(recordingPath, groqKey),
      usedChunking: false,
      chunkCount: 1,
    };
  }

  const wavPath = await convertToWav(recordingPath);
  if (!wavPath) {
    throw new Error('Unable to convert long recording for chunked transcription');
  }

  let chunkPaths: string[] = [];
  try {
    chunkPaths = await splitWavIntoGroqChunks(wavPath);
    if (chunkPaths.length === 0) {
      throw new Error('No audio chunks were created');
    }

    const chunkTranscripts: string[] = [];
    for (const chunkPath of chunkPaths) {
      const transcript = await transcribeRawWithGroq(chunkPath, groqKey);
      if (transcript.trim()) {
        chunkTranscripts.push(transcript);
      }
    }

    return {
      transcript: mergeChunkTranscripts(chunkTranscripts),
      usedChunking: true,
      chunkCount: chunkPaths.length,
    };
  } finally {
    for (const chunkPath of chunkPaths) {
      await safeDelete(chunkPath);
    }
    await safeDelete(wavPath);
  }
}

export async function transcribeLectureWithRecovery(opts: {
  recordingPath: string;
  groqKey?: string;
  useLocalWhisper?: boolean;
  localWhisperPath?: string;
  maxRetries?: number;
  logId?: number;
  onProgress?: (progress: LecturePipelineProgress) => void;
}): Promise<LectureAnalysis> {
  const retries = Math.max(0, opts.maxRetries ?? 1);
  let lastError: Error | null = null;
  const recordingInfo = await getRecordingInfo(opts.recordingPath);

  if (opts.logId) {
    updateSessionPipelineTelemetry(opts.logId, {
      engine: opts.useLocalWhisper && opts.localWhisperPath ? 'local_whisper' : opts.groqKey ? 'groq' : 'unknown',
      audioSizeBytes: recordingInfo.sizeBytes,
      estimatedMinutes: recordingInfo.estimatedMinutes,
      usedChunking: recordingInfo.needsChunking,
    });
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    let currentStage: 'transcribing' | 'analyzing' = 'transcribing';
    try {
      emitProgress(opts.onProgress, 'transcribing', 'Transcribing lecture audio');
      const transcribingStartedAt = stageStart(opts.logId, 'transcribing');
      let transcript = '';
      if (opts.useLocalWhisper && opts.localWhisperPath) {
        transcript = await transcribeRawWithLocalWhisper(opts.recordingPath, opts.localWhisperPath);
      } else if (opts.groqKey) {
        const groqResult = await transcribeWithGroqChunking(opts.recordingPath, opts.groqKey);
        transcript = groqResult.transcript;
        if (opts.logId) {
          updateSessionPipelineTelemetry(opts.logId, {
            usedChunking: groqResult.usedChunking,
            chunkCount: groqResult.chunkCount,
          });
        }
      } else {
        throw new Error('No transcription engine available');
      }
      stageComplete(opts.logId, 'transcribing', transcribingStartedAt);

      if (!transcript.trim()) {
        if (opts.logId) updateSessionPipelineTelemetry(opts.logId, { transcriptChars: 0 });
        return {
          subject: 'Unknown',
          topics: [],
          keyConcepts: [],
          lectureSummary: 'No speech detected',
          estimatedConfidence: 1,
          transcript,
        };
      }

      emitProgress(opts.onProgress, 'analyzing', 'Extracting topics and key concepts');
      currentStage = 'analyzing';
      const analyzingStartedAt = stageStart(opts.logId, 'analyzing');
      const analysis = await analyzeTranscript(transcript);
      stageComplete(opts.logId, 'analyzing', analyzingStartedAt);
      if (opts.logId) {
        updateSessionPipelineTelemetry(opts.logId, {
          transcriptChars: transcript.length,
          topicsDetected: analysis.topics.length,
          keyConceptsDetected: analysis.keyConcepts.length,
        });
      }
      return { ...analysis, transcript };
    } catch (e: any) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (opts.logId) {
        updateSessionPipelineTelemetry(opts.logId, { errorStage: currentStage });
      }
      if (attempt < retries) {
        const backoffMs = (attempt + 1) * 1500;
        console.warn(`${LOG} Transcription attempt ${attempt + 1} failed. Retrying in ${backoffMs}ms`);
        await sleep(backoffMs);
      }
    }
  }
  throw lastError ?? new Error('Transcription failed');
}

// ──────────────────────────────────────────────────
// 3. Full Transcription Pipeline (with robustness)
// ──────────────────────────────────────────────────

export interface TranscriptionResult {
  success: boolean;
  analysis?: LectureAnalysis;
  adhdNote?: string;
  lectureNoteId?: number;
  error?: string;
}

export interface SavedLectureResult {
  noteId: number;
  note: string;
}

function buildAnalysisFromSavedNote(noteId: number): LectureAnalysis | null {
  const note = getLectureNoteById(noteId);
  if (!note) return null;

  return {
    subject: note.subjectName ?? 'Unknown',
    topics: note.topics ?? [],
    keyConcepts: [],
    lectureSummary: note.summary ?? 'Lecture content recorded',
    estimatedConfidence: Math.max(1, Math.min(3, note.confidence ?? 2)) as 1 | 2 | 3,
    transcript: note.transcript ?? '',
  };
}

export async function saveLectureAnalysisQuick(opts: {
  analysis: LectureAnalysis;
  appName: string;
  durationMinutes: number;
  logId: number;
  recordingPath: string;
  onProgress?: (progress: LecturePipelineProgress) => void;
}): Promise<SavedLectureResult> {
  emitProgress(opts.onProgress, 'saving', 'Saving lecture summary');
  const saveStartedAt = stageStart(opts.logId, 'saving');

  try {
    const db = getDb();
    const { analysis } = opts;
    const quickNote = buildQuickLectureNote(analysis);
    const transcriptUri = await saveTranscriptToFile(analysis.transcript || '');
    const noteId = runInTransaction(db, () => {
      if (analysis.topics.length > 0) {
        markTopicsFromLecture(db, analysis.topics, analysis.estimatedConfidence, analysis.subject);
        addXpInTransaction(db, analysis.topics.length * 8);
      }

      const subj = db.getFirstSync<{ id: number }>(
        'SELECT id FROM subjects WHERE LOWER(name) = LOWER(?)',
        [analysis.subject],
      );
      const createdNoteId = saveLectureTranscript({
        subjectId: subj?.id ?? null,
        note: quickNote,
        transcript: typeof transcriptUri !== 'undefined' ? transcriptUri : analysis.transcript,
        summary: analysis.lectureSummary,
        topics: analysis.topics,
        appName: opts.appName,
        durationMinutes: opts.durationMinutes,
        confidence: analysis.estimatedConfidence,
      });

      updateSessionTranscriptionStatus(opts.logId, 'completed', undefined, createdNoteId);
      updateSessionNoteEnhancementStatus(opts.logId, 'pending');
      return createdNoteId;
    });
    stageComplete(opts.logId, 'saving', saveStartedAt);

    void enhanceLectureNoteInBackground({
      analysis,
      noteId,
      logId: opts.logId,
      onProgress: opts.onProgress,
    });

    return { noteId, note: quickNote };
  } catch (e: any) {
    updateSessionPipelineTelemetry(opts.logId, { errorStage: 'saving' });
    updateSessionTranscriptionStatus(opts.logId, 'failed', e?.message ?? 'Save failed');
    throw e;
  }
}

async function enhanceLectureNoteInBackground(opts: {
  analysis: LectureAnalysis;
  noteId: number;
  logId?: number;
  onProgress?: (progress: LecturePipelineProgress) => void;
}): Promise<void> {
  emitProgress(opts.onProgress, 'enhancing', 'Improving the saved lecture note');
  const enhancingStartedAt = stageStart(opts.logId, 'enhancing');
  try {
    const enhancedNote = await generateADHDNote(opts.analysis);
    if (enhancedNote.trim()) {
      updateLectureTranscriptNote(opts.noteId, enhancedNote);
    }
    stageComplete(opts.logId, 'enhancing', enhancingStartedAt);
    if (opts.logId) {
      updateSessionNoteEnhancementStatus(opts.logId, 'completed');
      updateSessionPipelineTelemetry(opts.logId, {
        enhancementSucceeded: true,
      });
    }
  } catch (e) {
    if (opts.logId) {
      updateSessionNoteEnhancementStatus(opts.logId, 'failed');
      updateSessionPipelineTelemetry(opts.logId, {
        enhancementSucceeded: false,
        errorStage: 'enhancing',
      });
    }
    console.warn(`${LOG} Background note enhancement failed:`, e);
  }
}

/**
 * Run the full transcription + note generation pipeline.
 * - Handles file validation
 * - Warns about long files
 * - Preserves audio on failure
 * - Updates session status in DB
 */
export async function runFullTranscriptionPipeline(opts: {
  recordingPath: string;
  appName: string;
  durationMinutes: number;
  logId: number;
  groqKey?: string;
  useLocalWhisper?: boolean;
  localWhisperPath?: string;
  onProgress?: (progress: LecturePipelineProgress) => void;
}): Promise<TranscriptionResult> {
  const { recordingPath, appName, durationMinutes, logId } = opts;

  // 1. Validate file
  const fileInfo = await getRecordingInfo(recordingPath);
  if (!fileInfo.exists || fileInfo.sizeBytes < 100) {
    updateSessionTranscriptionStatus(logId, 'no_audio', 'Recording file empty or missing');
    return { success: false, error: 'No audio recorded' };
  }

  // 2. Update status to transcribing
  updateSessionTranscriptionStatus(logId, 'transcribing');

  // 3. Transcribe with retry + chunking fallback
  let analysis: LectureAnalysis;
  try {
    analysis = await transcribeLectureWithRecovery({
      recordingPath,
      groqKey: opts.groqKey,
      useLocalWhisper: opts.useLocalWhisper,
      localWhisperPath: opts.localWhisperPath,
      maxRetries: 1,
      logId,
      onProgress: opts.onProgress,
    });
  } catch (e: any) {
    const errMsg = e?.message ?? 'Transcription failed';
    console.error(`${LOG} Transcription failed:`, errMsg);
    updateSessionPipelineTelemetry(logId, { errorStage: 'transcribing' });
    updateSessionTranscriptionStatus(logId, 'failed', errMsg);

    await notifyTranscriptionFailure(appName, durationMinutes);

    return { success: false, error: errMsg };
  }

  try {
    const saved = await saveLectureAnalysisQuick({
      analysis,
      appName,
      durationMinutes,
      logId,
      recordingPath,
      onProgress: opts.onProgress,
    });
    return { success: true, analysis, adhdNote: saved.note, lectureNoteId: saved.noteId };
  } catch (e: any) {
    updateSessionPipelineTelemetry(logId, { errorStage: 'saving' });
    return { success: false, analysis, error: e?.message };
  }
}

// ──────────────────────────────────────────────────
// 4. Retry Queue — Recover Failed Transcriptions
// ──────────────────────────────────────────────────

/**
 * Check for any sessions with failed/pending transcription and retry them.
 * Called on app launch (HomeScreen mount).
 * Returns count of successfully recovered sessions.
 */
export async function retryFailedTranscriptions(): Promise<number> {
  const pending = getFailedOrPendingTranscriptions();
  if (pending.length === 0) return 0;

  console.log(`${LOG} Found ${pending.length} sessions to retry transcription`);

  const profile = getUserProfile();
  const groqKey = profile.groqApiKey?.trim() || undefined;
  const useLocalWhisper = !!(profile.useLocalWhisper && profile.localWhisperPath);
  const localWhisperPath = profile.localWhisperPath || undefined;

  if (!groqKey && !useLocalWhisper) {
    console.log(`${LOG} No transcription engine available, skipping retry`);
    return 0;
  }

  let recovered = 0;

  for (const session of pending) {
    if (!session.recordingPath) {
      updateSessionTranscriptionStatus(session.id!, 'no_audio', 'No recording path');
      continue;
    }

    // Check if file still exists
    const fileInfo = await getRecordingInfo(session.recordingPath);
    if (!fileInfo.exists) {
      updateSessionTranscriptionStatus(session.id!, 'no_audio', 'Recording file deleted or missing');
      continue;
    }

    console.log(`${LOG} Retrying transcription for session ${session.id} (${session.appName})`);

    const result = await runFullTranscriptionPipeline({
      recordingPath: session.recordingPath,
      appName: session.appName,
      durationMinutes: session.durationMinutes ?? 0,
      logId: session.id!,
      groqKey,
      useLocalWhisper,
      localWhisperPath,
    });

    if (result.success) {
      recovered++;
      await notifyTranscriptionRecovered(session.appName);
    }
  }

  if (recovered > 0) {
    console.log(`${LOG} Recovered ${recovered}/${pending.length} failed transcriptions`);
  }

  return recovered;
}

export async function retryPendingNoteEnhancements(): Promise<number> {
  const pending = getSessionsNeedingNoteEnhancement();
  if (pending.length === 0) return 0;

  let recovered = 0;

  for (const session of pending) {
    if (!session.id || !session.lectureNoteId) continue;

    const analysis = buildAnalysisFromSavedNote(session.lectureNoteId);
    if (!analysis) {
      updateSessionNoteEnhancementStatus(session.id, 'failed');
      continue;
    }

    await enhanceLectureNoteInBackground({
      analysis,
      noteId: session.lectureNoteId,
      logId: session.id,
    });

    const refreshed = getSessionsNeedingNoteEnhancement().find(item => item.id === session.id);
    if (!refreshed) {
      recovered++;
    }
  }

  if (recovered > 0) {
    console.log(`${LOG} Recovered ${recovered}/${pending.length} pending note enhancements`);
  }

  return recovered;
}
