import { getDrizzleDb } from '../../db/drizzle';
import { runInTransaction, nowTs } from '../../db/database';
import { subjects, lectureNotes, externalAppLogs } from '../../db/drizzleSchema';
import { sql, eq } from 'drizzle-orm';
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
import type { LectureAnalysis } from '../transcriptionService';

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
  const db = getDrizzleDb();
  const normalized = name.toLowerCase().trim();

  // 1. Direct match
  let res = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(sql`LOWER(${subjects.name}) = LOWER(${normalized})`)
    .limit(1)
    .then((r) => r[0]);
  if (res) return res.id;

  // 2. Fuzzy mapping match
  const mapped = SUBJECT_MAPPINGS[normalized];
  if (mapped) {
    res = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(sql`LOWER(${subjects.name}) = LOWER(${mapped})`)
      .limit(1)
      .then((r) => r[0]);
    if (res) return res.id;
  }

  // 3. Partial substring match (fallback)
  res = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(sql`LOWER(${subjects.name}) LIKE ${`%${normalized}%`}`)
    .limit(1)
    .then((r) => r[0]);
  return res?.id ?? null;
}

export async function saveLecturePersistence(opts: {
  analysis: LectureAnalysis;
  appName: string;
  durationMinutes: number;
  logId: number;
  quickNote: string;
  embedding?: number[] | null;
  recordingPath?: string | null;
}) {
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
      if (__DEV__) {
        console.log(
          '[Persistence] generateEmbedding failed, proceeding without embedding:',
          embErr,
        );
      }
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
    const db = getDrizzleDb();

    // Use runInTransaction instead of manual BEGIN/COMMIT to avoid
    // orphaned recording paths and ensure proper rollback on failure.
    const noteId = await runInTransaction(async (txDb) => {
      if (analysis.topics.length > 0 || analysis.lectureSummary) {
        await markTopicsFromLecture(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
          txDb as any, // Drizzle tx not perfectly typed with expo-sqlite interface here, but ok
          analysis.topics,
          analysis.estimatedConfidence,
          analysis.subject,
          analysis.lectureSummary,
          embeddingForMatching,
        );
        if (analysis.topics.length > 0) {
          await addXpInTx(analysis.topics.length * 8);
        }
      }

      const result = await db
        .insert(lectureNotes)
        .values({
          subjectId: subjectId ?? null,
          note: opts.quickNote,
          createdAt: nowTs(),
          transcript: transcriptUri ?? analysis.transcript ?? null,
          summary: analysis.lectureSummary ?? null,
          topicsJson: analysis.topics ? JSON.stringify(analysis.topics) : null,
          appName: opts.appName,
          durationMinutes: opts.durationMinutes,
          confidence: analysis.estimatedConfidence,
          embedding: embeddingForMatching ? embeddingToBlob(embeddingForMatching) : null,
          recordingPath: originalRecordingPath,
        })
        .returning({ id: lectureNotes.id });
      const id = result[0].id;

      await db
        .update(externalAppLogs)
        .set({ transcriptionStatus: 'completed', lectureNoteId: id })
        .where(eq(externalAppLogs.id, opts.logId));
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
          await getDrizzleDb()
            .update(lectureNotes)
            .set({ recordingPath: renamedRecordingPath })
            .where(eq(lectureNotes.id, noteId));
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

/**
 * Shared save function for in-app lecture chunks (Pipeline B — LectureModeScreen).
 * Uses the same 5-level topic matching, XP awarding, and persistence as Pipeline A,
 * but without the external_app_logs telemetry (since there's no external session).
 *
 * Both pipelines now share the same core save path via `runInTransaction` with
 * `markTopicsFromLecture` + `addXpInTx` + `INSERT lecture_notes`.
 */
export async function saveLectureChunk(opts: {
  analysis: LectureAnalysis;
  subjectId: number | null;
  appName?: string;
  durationMinutes: number;
  quickNote: string;
  embedding?: number[] | null;
  recordingPath?: string | null;
}): Promise<{ noteId: number; topicsMatched: number; xpAwarded: number }> {
  const { analysis } = opts;

  // Compute embedding before the transaction
  let embeddingForMatching: number[] | null = opts.embedding ?? null;
  if (embeddingForMatching === null && analysis.lectureSummary) {
    try {
      embeddingForMatching = await generateEmbedding(analysis.lectureSummary);
    } catch (embErr) {
      if (__DEV__) {
        console.log('[saveLectureChunk] Embedding failed, proceeding without:', embErr);
      }
      embeddingForMatching = null;
    }
  }

  // Save transcript to file system
  const lectureIdentity = {
    subjectName: analysis.subject,
    topics: analysis.topics,
  };
  const transcriptUri = await saveTranscriptToFile(analysis.transcript || '', lectureIdentity);

  const subjectId = opts.subjectId ?? (await findSubjectId(analysis.subject));

  const result = await runInTransaction(async (txDb) => {
    if (analysis.topics.length > 0 || analysis.lectureSummary) {
      // Use the same 5-level matching as Pipeline A:
      // 1. exact match in subject, 2. LIKE contains, 3. reverse contains,
      // 4. semantic/cosine similarity, 5. queue unmatched
      await markTopicsFromLecture(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
        txDb as any,
        analysis.topics,
        analysis.estimatedConfidence,
        analysis.subject,
        analysis.lectureSummary,
        embeddingForMatching,
      );

      // Award XP: same as Pipeline A (topics.length * 8)
      if (analysis.topics.length > 0) {
        await addXpInTx(analysis.topics.length * 8);
      }
    }

    const insertResult = await getDrizzleDb()
      .insert(lectureNotes)
      .values({
        subjectId: subjectId ?? null,
        note: opts.quickNote,
        createdAt: nowTs(),
        transcript: transcriptUri,
        summary: analysis.lectureSummary ?? null,
        topicsJson: analysis.topics ? JSON.stringify(analysis.topics) : null,
        appName: opts.appName ?? 'LectureMode',
        durationMinutes: opts.durationMinutes,
        confidence: analysis.estimatedConfidence,
        embedding: embeddingForMatching ? embeddingToBlob(embeddingForMatching) : null,
        recordingPath: opts.recordingPath ?? null,
      })
      .returning({ id: lectureNotes.id });
    const noteId = insertResult[0].id;

    return { noteId, topicsMatched: analysis.topics.length, xpAwarded: analysis.topics.length * 8 };
  });

  // Rename recording to descriptive identity (outside transaction — cosmetic only)
  if (opts.recordingPath) {
    try {
      const renamedPath = await renameRecordingToLectureIdentity(
        opts.recordingPath,
        lectureIdentity,
      );
      if (renamedPath !== opts.recordingPath) {
        await getDrizzleDb()
          .update(lectureNotes)
          .set({ recordingPath: renamedPath })
          .where(eq(lectureNotes.id, result.noteId));
      }
    } catch (renameErr) {
      console.warn('[saveLectureChunk] Recording rename failed:', renameErr);
    }
  }

  // Notify UI
  notifyDbUpdate(DB_EVENT_KEYS.LECTURE_SAVED);

  // Silent background backup
  runAutoPublicBackup().catch((e) => console.warn('[AutoBackup] Trigger failed:', e));

  return result;
}
