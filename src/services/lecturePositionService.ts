/**
 * lecturePositionService — computes where a student currently sits within
 * the DBMCI One or BTR lecture schedule, given a batch start date.
 *
 * Weekends are excluded: only Monday–Friday count as teaching days
 * (DBMCI One and BTR are Monday–Friday live batches).
 */

import {
  DBMCI_LECTURE_SCHEDULE,
  BTR_LECTURE_SCHEDULE,
  type LectureSubjectBlock,
} from '../constants/lectureSchedules';
import type { StudyResourceMode } from '../types';

/** Per-subject window including cumulative day offsets (0-based). */
export interface SubjectRange {
  subjectCode: string;
  subjectName: string;
  /** Inclusive start — 0-based teaching day index */
  startDay: number;
  /** Inclusive end — 0-based teaching day index */
  endDay: number;
  days: number;
}

export interface LecturePosition {
  /** 1-based teaching-day number (1 = first day of batch) */
  dayNumber: number;
  /** Total teaching days in this schedule */
  totalDays: number;
  /** Which subject block is currently being covered */
  currentBlock: SubjectRange;
  /** Day within the current subject (1-based) */
  dayInSubject: number;
  /** Days remaining within the current subject */
  daysLeftInSubject: number;
  /** Next subject block, or null if on the last subject */
  nextBlock: SubjectRange | null;
  /** Overall progress 0–100 */
  progressPercent: number;
  /** True when all scheduled subjects have been covered */
  isComplete: boolean;
}

/** Returns the schedule array for a given resource mode. */
function scheduleFor(mode: StudyResourceMode): LectureSubjectBlock[] | null {
  if (mode === 'dbmci_live' || mode === 'hybrid') return DBMCI_LECTURE_SCHEDULE;
  if (mode === 'btr') return BTR_LECTURE_SCHEDULE;
  return null;
}

/** Counts teaching days (Mon–Fri) between startDate and today, inclusive of startDate. */
function countTeachingDaysSince(startDateStr: string): number {
  const start = new Date(startDateStr);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (start > today) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= today) {
    const dow = cursor.getDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/** Build the cumulative subject ranges for a schedule. */
export function buildSubjectRanges(schedule: LectureSubjectBlock[]): SubjectRange[] {
  const ranges: SubjectRange[] = [];
  let cursor = 0;
  for (const block of schedule) {
    ranges.push({
      subjectCode: block.subjectCode,
      subjectName: block.subjectName,
      startDay: cursor,
      endDay: cursor + block.days - 1,
      days: block.days,
    });
    cursor += block.days;
  }
  return ranges;
}

/**
 * Returns the current lecture position given a batch start date ISO string.
 * Returns null if startDate is not set or the mode has no schedule.
 */
export function getCurrentLecturePosition(
  startDateStr: string | null | undefined,
  mode: StudyResourceMode,
): LecturePosition | null {
  if (!startDateStr) return null;
  const schedule = scheduleFor(mode);
  if (!schedule) return null;

  const ranges = buildSubjectRanges(schedule);
  const totalDays = ranges[ranges.length - 1]!.endDay + 1;

  // Clamp to [1, totalDays]
  const rawDay = countTeachingDaysSince(startDateStr);
  const dayNumber = Math.max(1, Math.min(rawDay, totalDays));
  const zeroIdx = dayNumber - 1;

  const isComplete = rawDay > totalDays;

  const blockIdx = ranges.findIndex((r) => zeroIdx >= r.startDay && zeroIdx <= r.endDay);
  const currentBlock = blockIdx >= 0 ? ranges[blockIdx]! : ranges[ranges.length - 1]!;
  const nextBlock = blockIdx >= 0 && blockIdx < ranges.length - 1 ? ranges[blockIdx + 1]! : null;

  const dayInSubject = zeroIdx - currentBlock.startDay + 1;
  const daysLeftInSubject = currentBlock.days - dayInSubject;

  return {
    dayNumber,
    totalDays,
    currentBlock,
    dayInSubject,
    daysLeftInSubject,
    nextBlock,
    progressPercent: Math.round((dayNumber / totalDays) * 100),
    isComplete,
  };
}

/**
 * Returns the subject codes that are "active" for study right now:
 * the current subject + the immediately next one (so revision of upcoming
 * topics can be pre-loaded).
 */
export function getActiveSubjectCodes(
  startDateStr: string | null | undefined,
  mode: StudyResourceMode,
): string[] {
  const pos = getCurrentLecturePosition(startDateStr, mode);
  if (!pos) return [];
  const codes: string[] = [pos.currentBlock.subjectCode];
  if (pos.nextBlock) codes.push(pos.nextBlock.subjectCode);
  return codes;
}
