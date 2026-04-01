/**
 * Structured lecture schedules for DBMCI One and BTR (Back to Roots).
 *
 * DBMCI One: ~137-day main batch covering all 19 NEET-PG subjects in a fixed sequence.
 * BTR:       ~57-day intensive revision batch — same subject order but compressed.
 *
 * Each entry = { subjectCode, days } where `days` is lecture days allocated to that subject.
 * The order matches how each batch progresses through subjects.
 */

export interface LectureSubjectBlock {
  subjectCode: string;
  /** Display name for the subject */
  subjectName: string;
  /** Number of lecture days allocated in this batch */
  days: number;
}

/**
 * DBMCI One ~137 teaching-day schedule.
 * Days derived from DBMCI_WORKLOAD_OVERRIDES × 7.21 (average days per subject),
 * ordered per DBMCI_SUBJECT_ORDER.
 */
export const DBMCI_LECTURE_SCHEDULE: LectureSubjectBlock[] = [
  { subjectCode: 'PATH', subjectName: 'Pathology', days: 8 },
  { subjectCode: 'PHYS', subjectName: 'Physiology', days: 8 },
  { subjectCode: 'PSM', subjectName: 'Community Medicine', days: 6 },
  { subjectCode: 'FMT', subjectName: 'Forensic Medicine', days: 4 },
  { subjectCode: 'ANES', subjectName: 'Anaesthesia', days: 3 },
  { subjectCode: 'PEDS', subjectName: 'Paediatrics', days: 7 },
  { subjectCode: 'BIOC', subjectName: 'Biochemistry', days: 6 },
  { subjectCode: 'PSY', subjectName: 'Psychiatry', days: 3 },
  { subjectCode: 'ENT', subjectName: 'ENT', days: 5 },
  { subjectCode: 'OBG', subjectName: 'Obstetrics & Gynaecology', days: 11 },
  { subjectCode: 'OPTH', subjectName: 'Ophthalmology', days: 6 },
  { subjectCode: 'DERM', subjectName: 'Dermatology', days: 3 },
  { subjectCode: 'ANAT', subjectName: 'Anatomy', days: 14 },
  { subjectCode: 'PHAR', subjectName: 'Pharmacology', days: 10 },
  { subjectCode: 'MED', subjectName: 'Internal Medicine', days: 12 },
  { subjectCode: 'RADI', subjectName: 'Radiology', days: 6 },
  { subjectCode: 'MICR', subjectName: 'Microbiology', days: 9 },
  { subjectCode: 'SURG', subjectName: 'General Surgery', days: 12 },
  { subjectCode: 'ORTH', subjectName: 'Orthopaedics', days: 4 },
];

/**
 * BTR (Back to Roots) ~57 teaching-day revision schedule.
 * Same subject order as DBMCI_SUBJECT_ORDER but compressed — each subject
 * gets roughly 2–6 days depending on volume.
 */
export const BTR_LECTURE_SCHEDULE: LectureSubjectBlock[] = [
  { subjectCode: 'PATH', subjectName: 'Pathology', days: 4 },
  { subjectCode: 'PHYS', subjectName: 'Physiology', days: 3 },
  { subjectCode: 'PSM', subjectName: 'Community Medicine', days: 3 },
  { subjectCode: 'FMT', subjectName: 'Forensic Medicine', days: 2 },
  { subjectCode: 'ANES', subjectName: 'Anaesthesia', days: 2 },
  { subjectCode: 'PEDS', subjectName: 'Paediatrics', days: 4 },
  { subjectCode: 'BIOC', subjectName: 'Biochemistry', days: 2 },
  { subjectCode: 'PSY', subjectName: 'Psychiatry', days: 2 },
  { subjectCode: 'ENT', subjectName: 'ENT', days: 3 },
  { subjectCode: 'OBG', subjectName: 'Obstetrics & Gynaecology', days: 4 },
  { subjectCode: 'OPTH', subjectName: 'Ophthalmology', days: 3 },
  { subjectCode: 'DERM', subjectName: 'Dermatology', days: 2 },
  { subjectCode: 'ANAT', subjectName: 'Anatomy', days: 4 },
  { subjectCode: 'PHAR', subjectName: 'Pharmacology', days: 4 },
  { subjectCode: 'MED', subjectName: 'Internal Medicine', days: 6 },
  { subjectCode: 'RADI', subjectName: 'Radiology', days: 2 },
  { subjectCode: 'MICR', subjectName: 'Microbiology', days: 4 },
  { subjectCode: 'SURG', subjectName: 'General Surgery', days: 5 },
  { subjectCode: 'ORTH', subjectName: 'Orthopaedics', days: 2 },
];
