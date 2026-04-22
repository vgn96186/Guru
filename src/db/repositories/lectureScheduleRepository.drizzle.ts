import { and, asc, eq } from 'drizzle-orm';
import type { LectureBatchId } from '../../constants/lectureSchedule';
import { getDrizzleDb } from '../drizzle';
import { lectureScheduleProgress } from '../drizzleSchema';

export const lectureScheduleRepositoryDrizzle = {
  async getCompletedLectures(batchId: LectureBatchId): Promise<number[]> {
    const db = getDrizzleDb();
    const rows = await db
      .select()
      .from(lectureScheduleProgress)
      .where(eq(lectureScheduleProgress.batchId, batchId))
      .orderBy(asc(lectureScheduleProgress.lectureIndex));

    return rows.map((row) => row.lectureIndex);
  },

  async markLectureCompleted(batchId: LectureBatchId, lectureIndex: number): Promise<void> {
    const db = getDrizzleDb();
    await db
      .insert(lectureScheduleProgress)
      .values({
        batchId,
        lectureIndex,
        completedAt: Date.now(),
      })
      .onConflictDoNothing({
        target: [lectureScheduleProgress.batchId, lectureScheduleProgress.lectureIndex],
      });
  },

  async unmarkLectureCompleted(batchId: LectureBatchId, lectureIndex: number): Promise<void> {
    const db = getDrizzleDb();
    await db
      .delete(lectureScheduleProgress)
      .where(
        and(
          eq(lectureScheduleProgress.batchId, batchId),
          eq(lectureScheduleProgress.lectureIndex, lectureIndex),
        ),
      );
  },
};
