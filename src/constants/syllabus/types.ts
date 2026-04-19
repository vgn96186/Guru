/**
 * Shared types for the syllabus seed data.
 * Keep this file tiny and dependency-free — it is imported by both
 * bundled TS modules and by the codegen scripts under `scripts/syllabus/`.
 */

export interface SubjectSeed {
  id: number;
  name: string;
  shortCode: string;
  colorHex: string;
  inicetWeight: number;
  neetWeight: number;
  displayOrder: number;
}

/**
 * Topic tuple layout:
 *   [subject_id, name, inicet_priority (1-10), estimated_minutes, parent_name?]
 *
 * parent_name, when present, must refer to another topic's `name` in the
 * same subject (enforced by `src/constants/syllabus.unit.test.ts`).
 */
export type TopicSeed = [number, string, number, number, string?];
