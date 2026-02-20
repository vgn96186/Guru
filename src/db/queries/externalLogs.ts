import { getDb } from '../database';

export interface ExternalAppLog {
    id?: number;
    appName: string;
    launchedAt: number;
    returnedAt?: number | null;
    durationMinutes?: number | null;
    notes?: string;
    recordingPath?: string | null;
}

export function startExternalAppSession(appName: string, recordingPath?: string): number {
    const db = getDb();
    const now = Date.now();
    const result = db.runSync(
        'INSERT INTO external_app_logs (app_name, launched_at, recording_path) VALUES (?, ?, ?)',
        [appName, now, recordingPath ?? null]
    );
    return result.lastInsertRowId;
}

export function finishExternalAppSession(logId: number, durationMinutes: number, notes?: string): void {
    const db = getDb();
    const now = Date.now();
    db.runSync(
        'UPDATE external_app_logs SET returned_at = ?, duration_minutes = ?, notes = ? WHERE id = ?',
        [now, durationMinutes, notes || null, logId]
    );
}

export function getIncompleteExternalSession(): ExternalAppLog | null {
    const db = getDb();
    const r = db.getFirstSync<{
        id: number; app_name: string; launched_at: number; recording_path: string | null;
    }>('SELECT id, app_name, launched_at, recording_path FROM external_app_logs WHERE returned_at IS NULL ORDER BY launched_at DESC LIMIT 1');

    if (!r) return null;

    return {
        id: r.id,
        appName: r.app_name,
        launchedAt: r.launched_at,
        recordingPath: r.recording_path,
    };
}

export function getTotalExternalStudyMinutes(): number {
    const db = getDb();
    const r = db.getFirstSync<{ total: number }>(
        'SELECT COALESCE(SUM(duration_minutes), 0) as total FROM external_app_logs WHERE duration_minutes IS NOT NULL AND duration_minutes > 0'
    );
    return r?.total ?? 0;
}
