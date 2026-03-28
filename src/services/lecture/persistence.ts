import { getDb, nowTs, runInTransaction } from '../../db/database';
import { markTopicsFromLecture } from '../transcription/matching';
import { renameRecordingToLectureIdentity, saveTranscriptToFile } from '../transcriptStorage';
import { embeddingToBlob, generateEmbedding } from '../ai/embeddingService';
import { runAutoPublicBackup } from '../backgroundBackupService';
import { notifyDbUpdate, DB_EVENT_KEYS } from '../databaseEvents';
import {
  appendSessionPipelineEvent,
  updateSessionPipelineTelemetry,
  updateSessionRecordingPath,
} from '../../db/queries/externalLogs';
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
  const saveStageStartedAt = Date.now();
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
    await updateSessionPipelineTelemetry(opts.logId, {
      currentStage: 'saving',
      currentMessage: 'Saving lecture summary',
      currentDetail: 'Writing lecture note, topic matches, and XP updates',
      currentPercent: 98,
      lastUpdatedAt: saveStageStartedAt,
      stages: {
        saving: {
          startedAt: saveStageStartedAt,
        },
      },
    });
    await appendSessionPipelineEvent(opts.logId, {
      at: saveStageStartedAt,
      stage: 'saving',
      message: 'Saving lecture summary',
      detail: 'Persisting the note and applying topic progress updates',
      percent: 98,
      provider: 'unknown',
    });

    const subjectId = await findSubjectId(analysis.subject);

    // Use runInTransaction instead of manual BEGIN/COMMIT to avoid
    // orphaned recording paths and ensure proper rollback on failure.
    const noteId = await runInTransaction(async (tx) => {
      if (analysis.topics.length > 0 || analysis.lectureSummary) {
        await markTopicsFromLecture(
          tx,
          analysis.topics,
          analysis.estimatedConfidence,
          analysis.subject,
          analysis.lectureSummary,
          embeddingForMatching,
        );
        if (analysis.topics.length > 0) {
          await addXpInTx(tx, analysis.topics.length * 8);
        }
      }

      const result = await tx.runAsync(
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
      const id = result.lastInsertRowId;
      await tx.runAsync(
        'UPDATE external_app_logs SET transcription_status = ?, lecture_note_id = ? WHERE id = ?',
        ['completed', id, opts.logId],
      );
      return id;
    });

    // Recording rename is safe outside the transaction — it's cosmetic.
    // If it fails, recording_path still points to the original valid file.
    if (originalRecordingPath) {
      try {
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
      } catch (renameErr) {
        console.warn('[Persistence] Recording rename failed, keeping original path:', renameErr);
      }
    }

    // Notify UI to refresh stats and progress
    notifyDbUpdate(DB_EVENT_KEYS.LECTURE_SAVED);

    const saveCompletedAt = Date.now();
    await updateSessionPipelineTelemetry(opts.logId, {
      currentStage: 'saving',
      currentMessage: 'Lecture note saved',
      currentDetail: 'The recording is now linked to a saved lecture note',
      currentPercent: 100,
      lastUpdatedAt: saveCompletedAt,
      stages: {
        saving: {
          startedAt: saveStageStartedAt,
          completedAt: saveCompletedAt,
          durationMs: saveCompletedAt - saveStageStartedAt,
        },
      },
    });
    await appendSessionPipelineEvent(opts.logId, {
      at: saveCompletedAt,
      stage: 'saving',
      message: 'Lecture note saved',
      detail: 'Topic progress, note text, and recording link were stored successfully',
      percent: 100,
      provider: 'unknown',
    });

    // Silent background backup to public storage after every successful lecture save
    runAutoPublicBackup().catch((e) => console.warn('[AutoBackup] Trigger failed:', e));

    return noteId;
  } catch (e: unknown) {
    const { showToast } = require('../../components/Toast');
    const msg = e instanceof Error ? e.message : 'Unknown error';
    try {
      await appendSessionPipelineEvent(opts.logId, {
        at: Date.now(),
        stage: 'saving',
        message: 'Lecture save failed',
        detail: msg,
        provider: 'unknown',
      });
      await updateSessionPipelineTelemetry(opts.logId, {
        errorStage: 'saving',
        currentStage: 'saving',
        currentMessage: 'Lecture save failed',
        currentDetail: msg,
        lastUpdatedAt: Date.now(),
      });
    } catch {
      // best effort only
    }
    showToast(`Failed to save lecture: ${msg}`, 'error');
    throw e;
  }
}
