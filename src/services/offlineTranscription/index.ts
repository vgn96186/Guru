/**
 * Offline Lecture Transcription Engine — Barrel Export
 *
 * Import from this module:
 *   import { getWhisperModelManager, AudioRecorder, ... } from '@/services/offlineTranscription';
 */

// Types
export type {
  TranscriptSegment,
  TranscriptSection,
  LectureTranscript,
  TranscriptMetadata,
  WhisperModelSize,
  WhisperModelInfo,
  ModelState,
  ModelDownloadProgress,
  VadConfig,
  RecordingState,
  AudioChunk,
  TranscriptionMode,
  TranscriptionState,
  TranscriptionProgress,
  RealtimeTranscriptionConfig,
  BatchTranscriptionConfig,
  TranscriptionErrorCode,
  UseLectureTranscriptionReturn,
} from './types';

export {
  TranscriptionError,
  ERROR_MESSAGES,
  DEFAULT_VAD_CONFIG,
  LECTURE_HALL_VAD_CONFIG,
  DEFAULT_REALTIME_CONFIG,
  DEFAULT_BATCH_CONFIG,
} from './types';

// Services
export {
  WhisperModelManager,
  getWhisperModelManager,
  MODEL_REGISTRY,
} from './whisperModelManager';

export {
  AudioRecorder,
  getAudioRecorder,
} from './audioRecorder';
export type { PcmDataCallback, RecordingStateCallback } from './audioRecorder';

export { RealtimeTranscriptionController } from './realtimeTranscriber';
export { BatchTranscriber } from './batchTranscriber';
export { TranscriptMerger } from './transcriptMerger';

// Hook (re-export from hooks for convenience)
export { useLectureTranscription } from '../../hooks/useLectureTranscription';
