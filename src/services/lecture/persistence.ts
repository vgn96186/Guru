import { getDb, nowTs } from '../../db/database';
import { grantXp } from '../xpService';
import { markTopicsFromLecture } from '../transcription/matching';
import { saveTranscriptToFile } from '../transcriptStorage';
import { embeddingToBlob } from '../ai/embeddingService';
import { runAutoPublicBackup } from '../backgroundBackupService';
import { notifyDbUpdate, DB_EVENT_KEYS } from '../databaseEvents';

export async function saveLecturePersistence(opts: {
  analysis: any;
  appName: string;
  durationMinutes: number;
  logId: number;
  quickNote: string;
  embedding?: number[] | null;
}) {
  const db = getDb();
  const { analysis } = opts;
  const transcriptUri = await saveTranscriptToFile(analysis.transcript || '');

  await db.execAsync('BEGIN IMMEDIATE');
  try {
    if (analysis.topics.length > 0 || analysis.lectureSummary) {
      await markTopicsFromLecture(
        db,
        analysis.topics,
        analysis.estimatedConfidence,
        analysis.subject,
        analysis.lectureSummary,
        opts.embedding ?? null,
      );
      if (analysis.topics.length > 0) await grantXp(analysis.topics.length * 8);
    }

    const subj = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM subjects WHERE LOWER(name) = LOWER(?)',
      [analysis.subject],
    );

    const result = await db.runAsync(
      `INSERT INTO lecture_notes (subject_id, note, created_at, transcript, summary, topics_json, app_name, duration_minutes, confidence, embedding)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        subj?.id ?? null,
        opts.quickNote,
        nowTs(),
        transcriptUri ?? analysis.transcript ?? null,
        analysis.lectureSummary,
        analysis.topics ? JSON.stringify(analysis.topics) : null,
        opts.appName,
        opts.durationMinutes,
        analysis.estimatedConfidence,
        opts.embedding ? embeddingToBlob(opts.embedding) : null,
      ],
    );

    const noteId = result.lastInsertRowId;
    await db.runAsync(
      'UPDATE external_app_logs SET transcription_status = ?, lecture_note_id = ? WHERE id = ?',
      ['completed', noteId, opts.logId],
    );
    await db.execAsync('COMMIT');

    // Notify UI to refresh stats and progress
    notifyDbUpdate(DB_EVENT_KEYS.LECTURE_SAVED);

    // Silent background backup to public storage after every successful lecture save
    runAutoPublicBackup().catch((e) => console.warn('[AutoBackup] Trigger failed:', e));

    return noteId;
  } catch (e: any) {
    await db.execAsync('ROLLBACK');
    const { showToast } = require('../../components/Toast');
    showToast(`Failed to save lecture: ${e.message || 'Unknown error'}`, 'error');
    throw e;
  }
}

export async function getFailedTranscriptions() {
  const db = getDb();
  return db.getAllAsync<any>(
    "SELECT * FROM external_app_logs WHERE returned_at IS NOT NULL AND recording_path IS NOT NULL AND transcription_status IN ('pending', 'failed', 'transcribing')",
  );
}
