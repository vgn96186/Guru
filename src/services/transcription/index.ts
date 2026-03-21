/**
 * transcription/ — barrel re-export.
 *
 * Public API for transcription, analysis, note generation, and topic matching.
 */
export { transcribeAudio } from './transcribeAudio';
export { analyzeTranscript, isMeaningfulLectureAnalysis } from './analysis';
export type { LectureAnalysis } from './analysis';
export {
  generateADHDNote,
  buildQuickLectureNote,
  shouldReplaceLectureNote,
} from './noteGeneration';
export { markTopicsFromLecture } from './matching';
