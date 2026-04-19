/**
 * Canonical syllabus-seed barrel. Consumers should do:
 *   import { SUBJECTS_SEED, TOPICS_SEED } from '../constants/syllabus';
 * which resolves here once the legacy `syllabus.ts` file is removed.
 */
export { SUBJECTS_SEED } from './subjects';
export { TOPICS_SEED } from './topics';
export type { SubjectSeed, TopicSeed } from './types';
