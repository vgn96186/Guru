/**
 * transcriptionService.ts — Thin barrel re-exporting from transcription/.
 *
 * Kept for backward compatibility so existing consumers don't need import changes.
 * New code should import from './transcription' directly.
 */
export {
  transcribeAudio,
  analyzeTranscript,
  isMeaningfulLectureAnalysis,
  generateADHDNote,
  buildQuickLectureNote,
  shouldReplaceLectureNote,
  markTopicsFromLecture,
} from './transcription';
export type { LectureAnalysis } from './transcription';
