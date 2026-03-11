import { getDb } from '../database';

export type TranscriptionStatus = 'pending' | 'recording' | 'transcribing' | 'completed' | 'failed' | 'no_audio';
export type PipelineStageName = 'transcribing' | 'analyzing' | 'saving' | 'enhancing';
export type NoteEnhancementStatus = 'pending' | 'completed' | 'failed';

export interface PipelineStageTelemetry {
    startedAt?: number;
    completedAt?: number;
    durationMs?: number;
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

export function startExternalAppSession(appName: string, recordingPath?: string): number {
    const db = getDb();
    const now = Date.now();
    try {
        const result = db.runSync(
            'INSERT INTO external_app_logs (app_name, launched_at, recording_path, transcription_status) VALUES (?, ?, ?, ?)',
            [appName, now, recordingPath ?? null, 'recording']
        );
        return result.lastInsertRowId;
    } catch {
        // Fallback for old schema without transcription_status column
        const result = db.runSync(
            'INSERT INTO external_app_logs (app_name, launched_at, recording_path) VALUES (?, ?, ?)',
            [appName, now, recordingPath ?? null]
        );
        return result.lastInsertRowId;
    }
}

export function finishExternalAppSession(logId: number, durationMinutes: number, notes?: string): void {
    const db = getDb();
    const now = Date.now();
    db.runSync(
        'UPDATE external_app_logs SET returned_at = ?, duration_minutes = ?, notes = ? WHERE id = ?',
        [now, durationMinutes, notes || null, logId]
    );
}

export function updateSessionTranscriptionStatus(
    logId: number,
    status: TranscriptionStatus,
    error?: string,
    lectureNoteId?: number,
): void {
    const db = getDb();
    try {
        db.runSync(
            `UPDATE external_app_logs SET
                transcription_status = ?,
                transcription_error = ?,
                lecture_note_id = ?
             WHERE id = ?`,
            [status, error ?? null, lectureNoteId ?? null, logId]
        );
    } catch {
        // Old schema — silently ignore
    }
}

export function updateSessionNoteEnhancementStatus(
    logId: number,
    status: NoteEnhancementStatus,
): void {
    const db = getDb();
    try {
        db.runSync(
            'UPDATE external_app_logs SET note_enhancement_status = ? WHERE id = ?',
            [status, logId]
        );
    } catch {
        // Old schema — silently ignore
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
        stages: {
            ...(current?.stages ?? {}),
            ...(patch.stages ?? {}),
        },
    };
}

export function updateSessionPipelineTelemetry(
    logId: number,
    patch: Partial<SessionPipelineTelemetry>,
): void {
    const db = getDb();
    try {
        const row = db.getFirstSync<{ pipeline_metrics_json: string | null }>(
            'SELECT pipeline_metrics_json FROM external_app_logs WHERE id = ?',
            [logId]
        );
        const merged = mergeTelemetry(parseTelemetry(row?.pipeline_metrics_json), patch);
        db.runSync(
            'UPDATE external_app_logs SET pipeline_metrics_json = ? WHERE id = ?',
            [JSON.stringify(merged), logId]
        );
    } catch {
        // Old schema — silently ignore
    }
}

export function getIncompleteExternalSession(): ExternalAppLog | null {
    const db = getDb();
    let r: {
        id: number; app_name: string; launched_at: number; recording_path?: string | null;
    } | null = null;

    try {
        r = db.getFirstSync<{
            id: number; app_name: string; launched_at: number; recording_path: string | null;
        }>('SELECT id, app_name, launched_at, recording_path FROM external_app_logs WHERE returned_at IS NULL ORDER BY launched_at DESC LIMIT 1');
    } catch {
        r = db.getFirstSync<{
            id: number; app_name: string; launched_at: number;
        }>('SELECT id, app_name, launched_at FROM external_app_logs WHERE returned_at IS NULL ORDER BY launched_at DESC LIMIT 1');
    }

    if (!r) return null;

    return {
        id: r.id,
        appName: r.app_name,
        launchedAt: r.launched_at,
        recordingPath: r.recording_path ?? null,
    };
}

/**
 * Get sessions where audio was recorded but transcription failed or never ran.
 * Used for retry-on-launch recovery.
 */
export function getFailedOrPendingTranscriptions(): ExternalAppLog[] {
    const db = getDb();
    try {
        const rows = db.getAllSync<{
            id: number; app_name: string; launched_at: number; returned_at: number;
            duration_minutes: number | null; recording_path: string | null;
            transcription_status: string; transcription_error: string | null; lecture_note_id: number | null;
            note_enhancement_status: string | null;
            pipeline_metrics_json: string | null;
        }>(
            `SELECT id, app_name, launched_at, returned_at, duration_minutes, recording_path,
                    transcription_status, transcription_error, lecture_note_id, note_enhancement_status, pipeline_metrics_json
             FROM external_app_logs
             WHERE returned_at IS NOT NULL
               AND recording_path IS NOT NULL
               AND (
                    transcription_status IN ('failed', 'pending', 'recording', 'transcribing')
                    OR (transcription_status = 'completed' AND lecture_note_id IS NULL)
               )
             ORDER BY launched_at DESC
             LIMIT 10`
        );
        return rows.map(r => ({
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

export function getSessionsNeedingNoteEnhancement(): ExternalAppLog[] {
    const db = getDb();
    try {
        const rows = db.getAllSync<{
            id: number; app_name: string; launched_at: number; returned_at: number | null;
            duration_minutes: number | null; recording_path: string | null;
            transcription_status: string; transcription_error: string | null; lecture_note_id: number | null;
            note_enhancement_status: string | null; pipeline_metrics_json: string | null;
        }>(
            `SELECT id, app_name, launched_at, returned_at, duration_minutes, recording_path,
                    transcription_status, transcription_error, lecture_note_id, note_enhancement_status, pipeline_metrics_json
             FROM external_app_logs
             WHERE lecture_note_id IS NOT NULL
               AND transcription_status = 'completed'
               AND COALESCE(note_enhancement_status, 'pending') IN ('pending', 'failed')
             ORDER BY launched_at DESC
             LIMIT 10`
        );
        return rows.map(r => ({
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

export function getTotalExternalStudyMinutes(): number {
    const db = getDb();
    const r = db.getFirstSync<{ total: number }>(
        'SELECT COALESCE(SUM(duration_minutes), 0) as total FROM external_app_logs WHERE duration_minutes IS NOT NULL AND duration_minutes > 0'
    );
    return r?.total ?? 0;
}
