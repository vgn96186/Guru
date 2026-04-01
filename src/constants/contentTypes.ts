import type { ContentType } from '../types';

/** Single source of truth for content type display labels. */
export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  keypoints: 'Key Points',
  must_know: 'Must Know',
  quiz: 'Quiz',
  story: 'Story',
  mnemonic: 'Mnemonic',
  teach_back: 'Teach Back',
  error_hunt: 'Error Hunt',
  detective: 'Detective',
  manual: 'Manual',
  socratic: 'Discussion',
  flashcards: 'Flashcards',
};
