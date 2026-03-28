import { getDb } from '../database';

export type TranscriptionStatus =
  | 'pending'
  | 'recording'
  | 'transcribing'
  | 'completed'
  | 'failed'
  | 'no_audio'
  | 'dismissed';
export type PipelineStageName = 'transcribing' | 'analyzing' | 'saving' | 'enhancing';
export type NoteEnhancementStatus = 'pending' | 'completed' | 'failed';
export type PipelineProviderName =
  | 'groq'
  | 'cloudflare'
  | 'huggingface'
  | 'deepgram'
  | 'local'
  | 'unknown';

export interface PipelineStageTelemetry {
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
}

export interface SessionPipelineEvent {
  at: number;
  stage: PipelineStageName | 'system';
  message: string;
  detail?: string;
  percent?: number;
  provider?: PipelineProviderName;
}

export interface SessionPipelineTelemetry {
  engine?: 'local_whisper' | 'groq' | 'unknown';
  audioSizeBytes?: number;
  estimatedMinutes?: number;
  validationAttempts?: number;
  usedChunking?: boolean;
  chunkCount?: number;
  transcriptChars?: number;
  topicsDetected?: number;
  keyConceptsDetected?: number;
  errorStage?: 'validation' | 'transcribing' | 'analyzing' | 'saving' | 'enhancing';
  totalForegroundMs?: number;
  enhancementSucceeded?: boolean;
  currentStage?: PipelineStageName;
  currentMessage?: string;
  currentDetail?: string;
  currentPercent?: number;
  currentProvider?: PipelineProviderName;
  lastUpdatedAt?: number;
  providerAttempts?: Partial<Record<PipelineProviderName, number>>;
  events?: SessionPipelineEvent[];
  stages?: Partial<Record<PipelineStageName, PipelineStageTelemetry>>;
}

export interface ExternalAppLog {
  id?: number;
  appName: string;
  launchedAt: number;
  returnedAt?: number | null;
  durationMinutes?: number | null;
  notes?: string;
  recordingPath?: string | null;
  transcriptionStatus?: TranscriptionStatus;
  transcriptionError?: string | null;
  lectureNoteId?: number | null;
  noteEnhancementStatus?: NoteEnhancementStatus | null;
  pipelineTelemetry?: SessionPipelineTelemetry | null;
}

export async function startExternalAppSession(
  appName: string,
  recordingPath?: string,
): Promise<number> {
  const db = getDb();
  const now = Date.now();
  try {
    const result = await db.runAsync(
      'INSERT INTO external_app_logs (app_name, launched_at, recording_path, transcription_status) VALUES (?, ?, ?, ?)',
      [appName, now, recordingPath ?? null, 'recording'],
    );
    return result.lastInsertRowId;
  } catch {
    // Fallback for old schema without transcription_status column
    const result = await db.runAsync(
      'INSERT INTO external_app_logs (app_name, launched_at, recording_path) VALUES (?, ?, ?)',
      [appName, now, recordingPath ?? null],
    );
    return result.lastInsertRowId;
  }
}

export async function finishExternalAppSession(
  logId: number,
  durationMinutes: number,
  notes?: string,
): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db.runAsync(
    'UPDATE external_app_logs SET returned_at = ?, duration_minutes = ?, notes = ? WHERE id = ?',
    [now, durationMinutes, notes || null, logId],
  );
}

export async function updateSessionTranscriptionStatus(
  logId: number,
  status: TranscriptionStatus,
  error?: string,
  lectureNoteId?: number,
): Promise<void> {
  const db = getDb();
  try {
    await db.runAsync(
      `UPDATE external_app_logs SET
                transcription_status = ?,
                transcription_error = ?,
                lecture_note_id = ?
             WHERE id = ?`,
      [status, error ?? null, lectureNoteId ?? null, logId],
    );
  } catch (err: any) {
    const msg = err?.message ?? '';
    // Only swallow errors from genuinely missing columns (old schema)
    if (msg.includes('no such column') || msg.includes('no column named')) {
      if (__DEV__) console.warn('[externalLogs] Update failed, old schema:', msg);
    } else {
      throw err; // real constraint/corruption errors must propagate
    }
  }
}

export async function updateSessionNoteEnhancementStatus(
  logId: number,
  status: NoteEnhancementStatus,
): Promise<void> {
  const db = getDb();
  try {
    await db.runAsync('UPDATE external_app_logs SET note_enhancement_status = ? WHERE id = ?', [
      status,
      logId,
    ]);
  } catch (err: any) {
    const msg = err?.message ?? '';
    if (msg.includes('no such column') || msg.includes('no column named')) {
      if (__DEV__) console.warn('[externalLogs] Query failed, old schema:', msg);
    } else {
      throw err;
    }
  }
}

export async function updateSessionRecordingPath(
  logId: number,
  recordingPath: string,
): Promise<void> {
  const db = getDb();
  try {
    await db.runAsync('UPDATE external_app_logs SET recording_path = ? WHERE id = ?', [
      recordingPath,
      logId,
    ]);
  } catch (err) {
    if (__DEV__) console.warn('[externalLogs] Failed to update recording path:', err);
  }
}

function parseTelemetry(raw: string | null | undefined): SessionPipelineTelemetry | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionPipelineTelemetry;
  } catch {
    return null;
  }
}

function mergeTelemetry(
  current: SessionPipelineTelemetry | null,
  patch: Partial<SessionPipelineTelemetry>,
): SessionPipelineTelemetry {
  return {
    ...(current ?? {}),
    ...patch,
    providerAttempts: {
      ...(current?.providerAttempts ?? {}),
      ...(patch.providerAttempts ?? {}),
    },
    events: patch.events ?? current?.events,
    stages: {
      ...(current?.stages ?? {}),
      ...(patch.stages ?? {}),
    },
  };
}

export async function updateSessionPipelineTelemetry(
  logId: number,
  patch: Partial<SessionPipelineTelemetry>,
): Promise<void> {
  const db = getDb();
  try {
    const row = await db.getFirstAsync<{ pipeline_metrics_json: string | null }>(
      'SELECT pipeline_metrics_json FROM external_app_logs WHERE id = ?',
      [logId],
    );
    const merged = mergeTelemetry(parseTelemetry(row?.pipeline_metrics_json), patch);
    await db.runAsync('UPDATE external_app_logs SET pipeline_metrics_json = ? WHERE id = ?', [
      JSON.stringify(merged),
      logId,
    ]);
  } catch (err: any) {
    const msg = err?.message ?? '';
    if (msg.includes('no such column') || msg.includes('no column named')) {
      if (__DEV__) console.warn('[externalLogs] Query failed, old schema:', msg);
    } else {
      throw err;
    }
  }
}

export async function appendSessionPipelineEvent(
  logId: number,
  event: SessionPipelineEvent,
  patch?: Partial<SessionPipelineTelemetry>,
): Promise<void> {
  const db = getDb();
  try {
    const row = await db.getFirstAsync<{ pipeline_metrics_json: string | null }>(
      'SELECT pipeline_metrics_json FROM external_app_logs WHERE id = ?',
      [logId],
    );
    const current = parseTelemetry(row?.pipeline_metrics_json);
    const nextEvents = [...(current?.events ?? []), event].slice(-20);
    const merged = mergeTelemetry(current, {
      ...(patch ?? {}),
      lastUpdatedAt: event.at,
      events: nextEvents,
    });
    await db.runAsync('UPDATE external_app_logs SET pipeline_metrics_json = ? WHERE id = ?', [
      JSON.stringify(merged),
      logId,
    ]);
  } catch (err: any) {
    const msg = err?.message ?? '';
    if (msg.includes('no such column') || msg.includes('no column named')) {
      if (__DEV__) console.warn('[externalLogs] Query failed, old schema:', msg);
    } else {
      throw err;
    }
  }
}

export async function getIncompleteExternalSession(): Promise<ExternalAppLog | null> {
  const db = getDb();
  let r: {
    id: number;
    app_name: string;
    launched_at: number;
    recording_path?: string | null;
  } | null = null;

  try {
    r = await db.getFirstAsync<{
      id: number;
      app_name: string;
      launched_at: number;
      recording_path: string | null;
    }>(
      'SELECT id, app_name, launched_at, recording_path FROM external_app_logs WHERE returned_at IS NULL ORDER BY launched_at DESC LIMIT 1',
    );
  } catch {
    r = await db.getFirstAsync<{
      id: number;
      app_name: string;
      launched_at: number;
    }>(
      'SELECT id, app_name, launched_at FROM external_app_logs WHERE returned_at IS NULL ORDER BY launched_at DESC LIMIT 1',
    );
  }

  if (!r) return null;

  return {
    id: r.id,
    appName: r.app_name,
    launchedAt: r.launched_at,
    recordingPath: r.recording_path ?? null,
  };
}

export async function getTodaysExternalStudyMinutes(): Promise<number> {
  const db = getDb();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  try {
    const row = await db.getFirstAsync<{ total_minutes: number | null }>(
      `SELECT COALESCE(SUM(duration_minutes), 0) AS total_minutes
       FROM external_app_logs
       WHERE returned_at IS NOT NULL
         AND returned_at >= ?`,
      [startOfDay.getTime()],
    );
    return row?.total_minutes ?? 0;
  } catch (err) {
    if (__DEV__) console.warn('[externalLogs] Failed to read today external study minutes:', err);
    return 0;
  }
}

/**
 * Get sessions where audio was recorded but transcription failed or never ran.
 * Used for retry-on-launch recovery.
 */
export async function getFailedOrPendingTranscriptions(): Promise<ExternalAppLog[]> {
  const db = getDb();
  try {
    const rows = await db.getAllAsync<{
      id: number;
      app_name: string;
      launched_at: number;
      returned_at: number;
      duration_minutes: number | null;
      recording_path: string | null;
      transcription_status: string;
      transcription_error: string | null;
      lecture_note_id: number | null;
      note_enhancement_status: string | null;
      pipeline_metrics_json: string | null;
    }>(
      `SELECT id, app_name, launched_at, returned_at, duration_minutes, recording_path,
                    transcription_status, transcription_error, lecture_note_id, note_enhancement_status, pipeline_metrics_json
             FROM external_app_logs
             WHERE returned_at IS NOT NULL
               AND recording_path IS NOT NULL
               AND launched_at > ?
               AND (
                    transcription_status IN ('failed', 'pending', 'recording', 'transcribing')
                    OR (transcription_status = 'completed' AND lecture_note_id IS NULL)
               )
             ORDER BY launched_at DESC
             LIMIT 10`,
      [Date.now() - 7 * 24 * 60 * 60 * 1000],
    );
    return rows.map((r) => ({
      id: r.id,
      appName: r.app_name,
      launchedAt: r.launched_at,
      returnedAt: r.returned_at,
      durationMinutes: r.duration_minutes,
      recordingPath: r.recording_path,
      transcriptionStatus: r.transcription_status as TranscriptionStatus,
      transcriptionError: r.transcription_error,
      noteEnhancementStatus: (r.note_enhancement_status as NoteEnhancementStatus | null) ?? null,
      pipelineTelemetry: parseTelemetry(r.pipeline_metrics_json),
    }));
  } catch {
    return []; // Old schema
  }
}

export async function getSessionsNeedingNoteEnhancement(): Promise<ExternalAppLog[]> {
  const db = getDb();
  try {
    const rows = await db.getAllAsync<{
      id: number;
      app_name: string;
      launched_at: number;
      returned_at: number | null;
      duration_minutes: number | null;
      recording_path: string | null;
      transcription_status: string;
      transcription_error: string | null;
      lecture_note_id: number | null;
      note_enhancement_status: string | null;
      pipeline_metrics_json: string | null;
    }>(
      `SELECT id, app_name, launched_at, returned_at, duration_minutes, recording_path,
                    transcription_status, transcription_error, lecture_note_id, note_enhancement_status, pipeline_metrics_json
             FROM external_app_logs
             WHERE lecture_note_id IS NOT NULL
               AND transcription_status = 'completed'
               AND COALESCE(note_enhancement_status, 'pending') IN ('pending', 'failed')
             ORDER BY launched_at DESC
             LIMIT 10`,
    );
    return rows.map((r) => ({
      id: r.id,
      appName: r.app_name,
      launchedAt: r.launched_at,
      returnedAt: r.returned_at,
      durationMinutes: r.duration_minutes,
      recordingPath: r.recording_path,
      transcriptionStatus: r.transcription_status as TranscriptionStatus,
      transcriptionError: r.transcription_error,
      lectureNoteId: r.lecture_note_id,
      noteEnhancementStatus: (r.note_enhancement_status as NoteEnhancementStatus | null) ?? null,
      pipelineTelemetry: parseTelemetry(r.pipeline_metrics_json),
    }));
  } catch {
    return [];
  }
}

export async function getTotalExternalStudyMinutes(): Promise<number> {
  const db = getDb();
  const r = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(duration_minutes), 0) as total FROM external_app_logs WHERE duration_minutes IS NOT NULL AND duration_minutes > 0',
  );
  return r?.total ?? 0;
}
