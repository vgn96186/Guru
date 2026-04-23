/**
 * Lecture schedule progress queries.
 *
 * Tracks which lecture the user has completed in each coaching batch
 * (BTR, DBMCI One). The next lecture = first un-completed in the batch.
 */
import {
  LECTURE_BATCHES,
  getBatchById,
  type LectureBatchId,
  type LectureEntry,
} from '../../constants/lectureSchedule';
import { lectureScheduleRepositoryDrizzle } from '../repositories/lectureScheduleRepository.drizzle';
import { getDrizzleDb } from '../drizzle';
import { topicProgress, topics } from '../drizzleSchema';
import { isNotNull, sql, ne } from 'drizzle-orm';

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
  return lectureScheduleRepositoryDrizzle.getCompletedLectures(batchId);
}

/**
 * Mark a lecture as completed (idempotent).
 */
export async function markLectureCompleted(
  batchId: LectureBatchId,
  lectureIndex: number,
): Promise<void> {
  return lectureScheduleRepositoryDrizzle.markLectureCompleted(batchId, lectureIndex);
}

/**
 * Unmark a lecture as completed (undo).
 */
export async function unmarkLectureCompleted(
  batchId: LectureBatchId,
  lectureIndex: number,
): Promise<void> {
  return lectureScheduleRepositoryDrizzle.unmarkLectureCompleted(batchId, lectureIndex);
}

export async function getTouchedSubjectIds(): Promise<Set<number>> {
  const db = getDrizzleDb();
  const rows = await db
    .selectDistinct({ subjectId: topics.subjectId })
    .from(topicProgress)
    .innerJoin(topics, sql`${topicProgress.topicId} = ${topics.id}`)
    .where(ne(topicProgress.status, 'unseen'));

  return new Set(rows.map((r) => r.subjectId).filter((id): id is number => id !== null));
}

/**
 * Get the next lecture for each active batch.
 * Returns one NextLectureInfo per batch that has remaining lectures.
 *
 * Auto-advancement is NON-LINEAR: each subject is checked independently.
 * A lecture is auto-completed if >=90% of its subject's leaf topics are
 * non-unseen (catches bulk "Mark Watched" actions at 100% while ignoring
 * scattered MCQ/session activity which is typically <20%).
 */
export async function getNextLectures(): Promise<NextLectureInfo[]> {
  const results: NextLectureInfo[] = [];
  const db = getDrizzleDb();

  // Per-subject: count leaf topics and how many are non-unseen
  const stats = await db
    .select({
      subjectId: topics.subjectId,
      total: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      studied: sql<number>`CAST(SUM(CASE WHEN COALESCE(${topicProgress.status}, 'unseen') != 'unseen' THEN 1 ELSE 0 END) AS INTEGER)`,
    })
    .from(topics)
    .leftJoin(topicProgress, sql`${topicProgress.topicId} = ${topics.id}`)
    .where(isNotNull(topics.parentTopicId))
    .groupBy(topics.subjectId);

  const AUTO_COMPLETE_THRESHOLD = 0.9;
  const watchedSubjectIds = new Set<number>();
  for (const s of stats) {
    if (s.subjectId != null && s.total > 0 && s.studied / s.total >= AUTO_COMPLETE_THRESHOLD) {
      watchedSubjectIds.add(s.subjectId);
    }
  }

  for (const batch of LECTURE_BATCHES) {
    const explicitCompleted = await lectureScheduleRepositoryDrizzle.getCompletedLectures(batch.id);
    const completedSet = new Set<number>(explicitCompleted);

    // Non-linear: independently check each lecture's subject.
    // No linear break — handles out-of-order lecture watching correctly.
    for (const lect of batch.lectures) {
      if (watchedSubjectIds.has(lect.subjectId)) {
        completedSet.add(lect.index);
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
 * Find the lecture index for a subject within a batch.
 * Returns undefined if the batch or subject is not found.
 */
export function getLectureIndexForSubject(
  batchId: LectureBatchId,
  subjectId: number,
): number | undefined {
  const batch = getBatchById(batchId);
  if (!batch) return undefined;
  return batch.lectures.find((l) => l.subjectId === subjectId)?.index;
}

/**
 * Get full progress for a batch (for a detail screen).
 */
export async function getBatchProgress(batchId: LectureBatchId): Promise<{
  batch: ReturnType<typeof getBatchById>;
  completed: Set<number>;
}> {
  const batch = getBatchById(batchId);
  const completedArr = await lectureScheduleRepositoryDrizzle.getCompletedLectures(batchId);
  return { batch, completed: new Set(completedArr) };
}
