/**
 * Lecture schedule progress queries.
 *
 * Tracks which lecture the user has completed in each coaching batch
 * (BTR, DBMCI One). The next lecture = first un-completed in the batch.
 */
import { getDb } from '../database';
import {
  LECTURE_BATCHES,
  getBatchById,
  type LectureBatchId,
  type LectureEntry,
} from '../../constants/lectureSchedule';

export interface LectureProgress {
  batchId: string;
  lectureIndex: number;
  completedAt: number;
}

export interface NextLectureInfo {
  batchId: LectureBatchId;
  batchName: string;
  batchShortName: string;
  batchColor: string;
  /** External app key to launch (matches SupportedMedicalApp) */
  appId: string;
  lecture: LectureEntry;
  completedCount: number;
  totalCount: number;
}

/**
 * Get all completed lecture indices for a batch.
 */
export async function getCompletedLectures(batchId: LectureBatchId): Promise<number[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ lecture_index: number }>(
    `SELECT lecture_index FROM lecture_schedule_progress WHERE batch_id = ? ORDER BY lecture_index`,
    [batchId],
  );
  return rows.map((r) => r.lecture_index);
}

/**
 * Mark a lecture as completed (idempotent).
 */
export async function markLectureCompleted(
  batchId: LectureBatchId,
  lectureIndex: number,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO lecture_schedule_progress (batch_id, lecture_index, completed_at)
     VALUES (?, ?, ?)`,
    [batchId, lectureIndex, Date.now()],
  );
}

/**
 * Unmark a lecture as completed (undo).
 */
export async function unmarkLectureCompleted(
  batchId: LectureBatchId,
  lectureIndex: number,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `DELETE FROM lecture_schedule_progress WHERE batch_id = ? AND lecture_index = ?`,
    [batchId, lectureIndex],
  );
}

export async function getTouchedSubjectIds(): Promise<Set<number>> {
  const db = getDb();
  const rows = await db.getAllAsync<{ subject_id: number }>(
    `SELECT DISTINCT t.subject_id 
     FROM topic_progress tp 
     JOIN topics t ON tp.topic_id = t.id 
     WHERE tp.status != 'unseen'`,
  );
  return new Set(rows.map((r) => r.subject_id));
}

/**
 * Get the next lecture for each active batch.
 * Returns one NextLectureInfo per batch that has remaining lectures.
 */
export async function getNextLectures(): Promise<NextLectureInfo[]> {
  const results: NextLectureInfo[] = [];
  const touchedSubjectIds = await getTouchedSubjectIds();

  for (const batch of LECTURE_BATCHES) {
    const explicitCompleted = await getCompletedLectures(batch.id);
    const completedSet = new Set<number>(explicitCompleted);

    // ── Intelligent Auto-Advancement ──
    // If the user has touched a subject in the sequence, assume lectures before it are done.
    // We stop inferring leaps if they hit a subject they haven't touched (unless explicitly marked).
    for (const lect of batch.lectures) {
      if (touchedSubjectIds.has(lect.subjectId)) {
        for (let i = 1; i < lect.index; i++) {
          completedSet.add(i);
        }
      } else if (!completedSet.has(lect.index)) {
        // If they haven't touched this subject AND haven't explicitly check-marked it done,
        // we halt the auto-advancement leap here. This prevents random MCQ activity
        // from jumping the schedule 15 subjects ahead.
        break;
      }
    }

    const next = batch.lectures.find((l) => !completedSet.has(l.index));

    if (next) {
      results.push({
        batchId: batch.id,
        batchName: batch.name,
        batchShortName: batch.shortName,
        batchColor: batch.colorHex,
        appId: batch.appId,
        lecture: next,
        completedCount: completedSet.size,
        totalCount: batch.lectures.length,
      });
    }
  }

  return results;
}

/**
 * Get full progress for a batch (for a detail screen).
 */
export async function getBatchProgress(batchId: LectureBatchId): Promise<{
  batch: ReturnType<typeof getBatchById>;
  completed: Set<number>;
}> {
  const batch = getBatchById(batchId);
  const completedArr = await getCompletedLectures(batchId);
  return { batch, completed: new Set(completedArr) };
}
