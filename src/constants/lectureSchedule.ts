/**
 * Lecture schedule definitions for NEET-PG coaching batches.
 *
 * Each batch has an ordered list of lectures. Each lecture maps to a subject
 * (via subject_id matching SUBJECTS_SEED) and has a display title.
 *
 * The user marks lectures as done sequentially. The "next lecture" is the
 * first un-completed lecture in the batch.
 */

export type LectureBatchId = 'btr' | 'dbmci_one';

export interface LectureEntry {
  /** 1-based index within the batch */
  index: number;
  /** Subject ID matching SUBJECTS_SEED */
  subjectId: number;
  /** Display title shown in the card */
  title: string;
  /** Optional estimated duration in minutes */
  estimatedMinutes?: number;
}

export interface LectureBatch {
  id: LectureBatchId;
  name: string;
  shortName: string;
  description: string;
  colorHex: string;
  /** Which external app to launch — matches SupportedMedicalApp keys */
  appId: string;
  lectures: LectureEntry[];
}

import { BTR_LECTURE_SCHEDULE, DBMCI_LECTURE_SCHEDULE } from './lectureSchedules';
import { SUBJECTS_SEED } from './syllabus';

const subjectCodeMap = new Map(SUBJECTS_SEED.map((s) => [s.shortCode, s.id]));

/**
 * BTR (Back to Roots) batch — subject-level lecture schedule.
 * Accurately mapped from the ground-truth BTR_LECTURE_SCHEDULE.
 */
const BTR_LECTURES: LectureEntry[] = BTR_LECTURE_SCHEDULE.map((block, i) => {
  const subjectId = subjectCodeMap.get(block.subjectCode);
  if (!subjectId) throw new Error(`Unknown subject code: ${block.subjectCode}`);
  return {
    index: i + 1,
    subjectId,
    title: block.subjectName,
    estimatedMinutes: block.days * 180, // rough estimate: 3 hours per dedicated revision day
  };
});

/**
 * DBMCI One live batch — the new comprehensive batch.
 * Accurately mapped from the ground-truth DBMCI_LECTURE_SCHEDULE.
 */
const DBMCI_ONE_LECTURES: LectureEntry[] = DBMCI_LECTURE_SCHEDULE.map((block, i) => {
  const subjectId = subjectCodeMap.get(block.subjectCode);
  if (!subjectId) throw new Error(`Unknown subject code: ${block.subjectCode}`);
  return {
    index: i + 1,
    subjectId,
    title: block.subjectName,
    estimatedMinutes: block.days * 300, // rough estimate: 5 hours per full teaching day
  };
});

export const LECTURE_BATCHES: LectureBatch[] = [
  {
    id: 'btr',
    name: 'Back to Roots (BTR)',
    shortName: 'BTR',
    description: 'Foundation revision batch — pre-clinical first, then clinical.',
    colorHex: '#E67E22',
    appId: 'cerebellum',
    lectures: BTR_LECTURES,
  },
  {
    id: 'dbmci_one',
    name: 'DBMCI One',
    shortName: 'DBMCI',
    description: 'Comprehensive live batch — high-yield subjects first.',
    colorHex: '#3498DB',
    appId: 'dbmci',
    lectures: DBMCI_ONE_LECTURES,
  },
];

export function getBatchById(batchId: LectureBatchId): LectureBatch | undefined {
  return LECTURE_BATCHES.find((b) => b.id === batchId);
}
