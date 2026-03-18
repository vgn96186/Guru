import { getDb, nowTs } from '../../db/database';
import { markTopicsFromLecture } from '../transcription/matching';
import { renameRecordingToLectureIdentity, saveTranscriptToFile } from '../transcriptStorage';
import { embeddingToBlob, generateEmbedding } from '../ai/embeddingService';
import { runAutoPublicBackup } from '../backgroundBackupService';
import { notifyDbUpdate, DB_EVENT_KEYS } from '../databaseEvents';
import { updateSessionRecordingPath } from '../../db/queries/externalLogs';
import { addXpInTx } from '../../db/queries/progress';

/** Dictionary for fuzzy subject name mapping */
const SUBJECT_MAPPINGS: Record<string, string> = {
  anat: 'Anatomy',
  physio: 'Physiology',
  phys: 'Physiology',
  biochem: 'Biochemistry',
  bio: 'Biochemistry',
  path: 'Pathology',
  patho: 'Pathology',
  micro: 'Microbiology',
  microbio: 'Microbiology',
  pharm: 'Pharmacology',
  phar: 'Pharmacology',
  pharma: 'Pharmacology',
  fmt: 'Forensic Medicine',
  forensic: 'Forensic Medicine',
  med: 'Medicine',
  surg: 'Surgery',
  peds: 'Pediatrics',
  paeds: 'Pediatrics',
  paediatrics: 'Pediatrics',
  ortho: 'Orthopedics',
  optha: 'Ophthalmology',
  opthal: 'Ophthalmology',
  ophthal: 'Ophthalmology',
  psych: 'Psychiatry',
  derm: 'Dermatology',
  derma: 'Dermatology',
  radio: 'Radiology',
  anes: 'Anesthesia',
  anaes: 'Anesthesia',
  psm: 'Community Medicine',
  community: 'Community Medicine',
  obg: 'OBG',
  obgy: 'OBG',
  gyne: 'OBG',
  gyn: 'OBG',
  obs: 'OBG',
};

async function findSubjectId(name: string): Promise<number | null> {
  const db = getDb();
  const normalized = name.toLowerCase().trim();

  // 1. Direct match
  let res = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM subjects WHERE LOWER(name) = LOWER(?)',
    [normalized],
  );
  if (res) return res.id;

  // 2. Fuzzy mapping match
  const mapped = SUBJECT_MAPPINGS[normalized];
  if (mapped) {
    res = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM subjects WHERE LOWER(name) = LOWER(?)',
      [mapped],
    );
    if (res) return res.id;
  }

  // 3. Partial substring match (fallback)
  res = await db.getFirstAsync<{ id: number }>('SELECT id FROM subjects WHERE LOWER(name) LIKE ?', [
    `%${normalized}%`,
  ]);
  return res?.id ?? null;
}

import type { LectureAnalysis } from '../transcriptionService';

export async function saveLecturePersistence(opts: {
  analysis: LectureAnalysis;
  appName: string;
  durationMinutes: number;
  logId: number;
  quickNote: string;
  embedding?: number[] | null;
  recordingPath?: string | null;
}) {
  const db = getDb();
  const { analysis } = opts;
  const lectureIdentity = {
    subjectName: analysis.subject,
    topics: analysis.topics,
  };
  const transcriptUri = await saveTranscriptToFile(analysis.transcript || '', lectureIdentity);
  const originalRecordingPath = opts.recordingPath ?? null;

  // Compute embedding before the transaction so we don't block the UI with AI/network inside BEGIN
  let embeddingForMatching: number[] | null = opts.embedding ?? null;
  if (embeddingForMatching === null && analysis.lectureSummary) {
    try {
      embeddingForMatching = await generateEmbedding(analysis.lectureSummary);
    } catch (embErr) {
      console.warn('[Persistence] generateEmbedding failed, proceeding without embedding:', embErr);
      embeddingForMatching = null;
    }
  }

  try {
    const subjectId = await findSubjectId(analysis.subject);

    let noteId!: number;
    await db.execAsync('BEGIN IMMEDIATE');
    try {
      if (analysis.topics.length > 0 || analysis.lectureSummary) {
        await markTopicsFromLecture(
          db,
          analysis.topics,
          analysis.estimatedConfidence,
          analysis.subject,
          analysis.lectureSummary,
          embeddingForMatching,
        );
        if (analysis.topics.length > 0) {
          await addXpInTx(db, analysis.topics.length * 8);
        }
      }

      const result = await db.runAsync(
        `INSERT INTO lecture_notes (
           subject_id, note, created_at, transcript, summary, topics_json, app_name,
           duration_minutes, confidence, embedding, recording_path
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          subjectId,
          opts.quickNote,
          nowTs(),
          transcriptUri ?? analysis.transcript ?? null,
          analysis.lectureSummary,
          analysis.topics ? JSON.stringify(analysis.topics) : null,
          opts.appName,
          opts.durationMinutes,
          analysis.estimatedConfidence,
          embeddingForMatching ? embeddingToBlob(embeddingForMatching) : null,
          originalRecordingPath,
        ],
      );
      noteId = result.lastInsertRowId;
      await db.runAsync(
        'UPDATE external_app_logs SET transcription_status = ?, lecture_note_id = ? WHERE id = ?',
        ['completed', noteId, opts.logId],
      );
      await db.execAsync('COMMIT');
    } catch (innerErr) {
      await db.execAsync('ROLLBACK');
      throw innerErr;
    }

    if (originalRecordingPath) {
      const renamedRecordingPath = await renameRecordingToLectureIdentity(
        originalRecordingPath,
        lectureIdentity,
      );
      if (renamedRecordingPath !== originalRecordingPath) {
        await db.runAsync('UPDATE lecture_notes SET recording_path = ? WHERE id = ?', [
          renamedRecordingPath,
          noteId,
        ]);
        await updateSessionRecordingPath(opts.logId, renamedRecordingPath);
      }
    }

    // Notify UI to refresh stats and progress
    notifyDbUpdate(DB_EVENT_KEYS.LECTURE_SAVED);

    // Silent background backup to public storage after every successful lecture save
    runAutoPublicBackup().catch((e) => console.warn('[AutoBackup] Trigger failed:', e));

    return noteId;
  } catch (e: unknown) {
    const { showToast } = require('../../components/Toast');
    const msg = e instanceof Error ? e.message : 'Unknown error';
    showToast(`Failed to save lecture: ${msg}`, 'error');
    throw e;
  }
}

export async function getFailedTranscriptions() {
  const db = getDb();
  return db.getAllAsync<{
    id: number;
    app_name: string;
    duration_minutes: number;
    recording_path: string;
    transcription_status: string;
  }>(
    "SELECT * FROM external_app_logs WHERE returned_at IS NOT NULL AND recording_path IS NOT NULL AND transcription_status IN ('pending', 'failed', 'transcribing')",
  );
}
