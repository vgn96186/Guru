/**
 * Offline Lecture Transcription Engine — Type Definitions
 *
 * All shared interfaces for the transcription pipeline.
 * Future-proofed with optional fields for speaker diarization,
 * topic segmentation, and embedding-based search.
 */

// ─── Transcript Output Schema ────────────────────────────────────────────────

export interface TranscriptSegment {
  id: number;
  /** Seconds from recording start */
  start: number;
  /** Seconds from recording start */
  end: number;
  /** Trimmed transcript text */
  text: string;
  /** 0.0–1.0 if available from engine */
  confidence?: number;
  /** Future: speaker diarization label */
  speaker?: string;
  /** Future: topic/section this segment belongs to */
  sectionId?: string;
}

export interface TranscriptSection {
  id: string;
  title: string;
  startSegmentId: number;
  endSegmentId: number;
}

export interface LectureTranscript {
  id: string;
  title: string;
  /** ISO 8601 */
  recordedAt: string;
  durationSeconds: number;
  /** e.g. "ggml-small.en" or "ggml-base.en" */
  modelUsed: string;
  /** Full concatenated transcript */
  text: string;
  segments: TranscriptSegment[];
  /** Future: topic sections detected in the lecture */
  sections?: TranscriptSection[];
  metadata: TranscriptMetadata;
}

export interface TranscriptMetadata {
  deviceModel: string;
  processingTimeSeconds: number;
  audioFormat: string;
  /** Total silence skipped by VAD (seconds) */
  vadSkippedSeconds: number;
  /** Real-time factor: processing_time / audio_duration */
  realtimeFactor?: number;
  /** Number of chunks processed (batch mode) */
  chunksProcessed?: number;
  /** Number of chunks that returned empty (batch mode) */
  emptyChunks?: number;
}

// ─── Model Management ────────────────────────────────────────────────────────

export type WhisperModelSize = 'tiny' | 'base' | 'small' | 'medium';

export interface WhisperModelInfo {
  size: WhisperModelSize;
  filename: string;
  /** Expected file size in bytes for integrity check */
  expectedBytes: number;
  /** SHA256 checksum for validation */
  sha256: string;
  /** Download URL (Hugging Face) */
  downloadUrl: string;
  /** Minimum RAM in GB recommended for this model */
  minRamGb: number;
  /** Approximate VRAM/memory usage during inference */
  memoryUsageMb: number;
}

export interface ModelDownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
  estimatedSecondsRemaining: number;
}

export interface ModelState {
  /** Whether a model file exists on disk */
  isDownloaded: boolean;
  /** Whether the model is currently loaded into memory */
  isLoaded: boolean;
  /** Whether a download is in progress */
  isDownloading: boolean;
  /** Current download progress (if downloading) */
  downloadProgress?: ModelDownloadProgress;
  /** Active model size */
  activeSize?: WhisperModelSize;
  /** Path to the model file on disk */
  modelPath?: string;
  /** Error message if last operation failed */
  error?: string;
}

// ─── VAD Configuration ───────────────────────────────────────────────────────

export interface VadConfig {
  /** Probability threshold for speech detection (0.0–1.0). Default: 0.45 */
  speechThreshold: number;
  /** Minimum silence duration (ms) to trigger end-of-speech. Default: 1500 */
  minSilenceDurationMs: number;
  /** Padding added before speech segment (ms). Default: 300 */
  speechPadMs: number;
  /** Maximum speech duration before forced split (seconds). Default: 30 */
  maxSpeechDurationSec: number;
}

export const DEFAULT_VAD_CONFIG: VadConfig = {
  speechThreshold: 0.45,
  minSilenceDurationMs: 1500,
  speechPadMs: 300,
  maxSpeechDurationSec: 30,
};

/** Tuned for lecture halls: higher tolerance for ambient noise */
export const LECTURE_HALL_VAD_CONFIG: VadConfig = {
  speechThreshold: 0.35,
  minSilenceDurationMs: 2000,
  speechPadMs: 500,
  maxSpeechDurationSec: 30,
};

// ─── Audio Recording ─────────────────────────────────────────────────────────

export type RecordingState =
  | 'idle'
  | 'requesting_permission'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'error';

export interface AudioChunk {
  /** Absolute index of this chunk in the recording */
  index: number;
  /** PCM audio data as Float32Array (16kHz mono) */
  samples?: Float32Array;
  /** File path if chunk was written to disk */
  filePath?: string;
  /** Start time relative to recording start (seconds) */
  startTime: number;
  /** Duration of this chunk (seconds) */
  durationSeconds: number;
}

// ─── Transcription Engine ────────────────────────────────────────────────────

export type TranscriptionMode = 'realtime' | 'batch';

export type TranscriptionState =
  | 'idle'
  | 'initializing'
  | 'loading_model'
  | 'transcribing'
  | 'paused'
  | 'merging'
  | 'completed'
  | 'error';

export interface TranscriptionProgress {
  state: TranscriptionState;
  /** For batch mode: current chunk / total chunks */
  currentChunk?: number;
  totalChunks?: number;
  /** Percentage complete (0–100) */
  percentage: number;
  /** Partial transcript accumulated so far */
  partialTranscript: string;
  /** Segments transcribed so far */
  segments: TranscriptSegment[];
  /** Elapsed processing time (seconds) */
  elapsedSeconds: number;
  /** Estimated remaining time (seconds, batch mode only) */
  estimatedRemainingSeconds?: number;
}

export interface RealtimeTranscriptionConfig {
  /** Seconds per audio slice sent to Whisper. Default: 25 */
  audioSliceSec: number;
  /** Auto-slice when VAD detects end of speech. Default: true */
  autoSliceOnSpeechEnd: boolean;
  /** Use greedy decoding for speed. Default: true (beamSize=1) */
  greedyDecoding: boolean;
  /** Number of CPU threads. Default: 4 */
  nThreads: number;
  /** Overlap between consecutive slices (seconds). Default: 0.5 */
  overlapSec: number;
}

export const DEFAULT_REALTIME_CONFIG: RealtimeTranscriptionConfig = {
  audioSliceSec: 25,
  autoSliceOnSpeechEnd: true,
  greedyDecoding: true,
  nThreads: 4,
  overlapSec: 0.5,
};

export interface BatchTranscriptionConfig {
  /** Target chunk duration (seconds). Default: 30 */
  chunkDurationSec: number;
  /** Overlap between chunks (seconds). Default: 1.0 */
  overlapSec: number;
  /** Beam size for better accuracy. Default: 5 */
  beamSize: number;
  /** Best-of candidates. Default: 5 */
  bestOf: number;
  /** Number of CPU threads. Default: 4 */
  nThreads: number;
  /** Max memory usage before pausing for GC (MB). Default: 512 */
  maxMemoryMb: number;
}

export const DEFAULT_BATCH_CONFIG: BatchTranscriptionConfig = {
  chunkDurationSec: 30,
  overlapSec: 1.0,
  beamSize: 5,
  bestOf: 5,
  nThreads: 4,
  maxMemoryMb: 512,
};

// ─── Error Types ─────────────────────────────────────────────────────────────

export type TranscriptionErrorCode =
  | 'MODEL_LOAD_FAILED'
  | 'MODEL_CORRUPT'
  | 'MODEL_MISSING'
  | 'MODEL_INCOMPATIBLE'
  | 'MIC_PERMISSION_DENIED'
  | 'MIC_IN_USE'
  | 'INSUFFICIENT_STORAGE'
  | 'INSUFFICIENT_RAM'
  | 'EMPTY_TRANSCRIPTION'
  | 'RECORDING_INTERRUPTED'
  | 'THERMAL_THROTTLING'
  | 'AUDIO_FORMAT_ERROR'
  | 'VAD_INIT_FAILED'
  | 'DOWNLOAD_FAILED'
  | 'CHECKSUM_MISMATCH'
  | 'RECORDER_DESTROYED'
  | 'PCM_INIT_FAILED'
  | 'PCM_START_FAILED'
  | 'NO_AUDIO_DATA'
  | 'RECORDING_TOO_LONG'
  | 'BUFFER_CONCAT_FAILED'
  | 'FILE_WRITE_FAILED'
  | 'NATIVE_MODULE_MISSING'
  | 'FALLBACK_START_FAILED'
  | 'FILE_COPY_FAILED'
  | 'DOWNLOAD_SIZE_MISMATCH'
  | 'VAD_CHECKSUM_MISMATCH'
  | 'UNKNOWN';

export class TranscriptionError extends Error {
  code: TranscriptionErrorCode;
  userMessage: string;

  constructor(code: TranscriptionErrorCode, technicalMessage: string, userMessage: string) {
    super(technicalMessage);
    this.name = 'TranscriptionError';
    this.code = code;
    this.userMessage = userMessage;
  }
}

export const ERROR_MESSAGES: Record<TranscriptionErrorCode, string> = {
  MODEL_LOAD_FAILED: 'Failed to load the speech recognition model. Try restarting the app.',
  MODEL_CORRUPT: 'The speech model file is corrupted. Please re-download it from Settings.',
  MODEL_MISSING: 'No speech recognition model found. Please download one from Settings.',
  MODEL_INCOMPATIBLE: 'This model is not compatible with your device. Try a smaller model size.',
  MIC_PERMISSION_DENIED:
    'Microphone access is required for recording. Please grant permission in Settings.',
  MIC_IN_USE:
    'The microphone is being used by another app. Close other recording apps and try again.',
  INSUFFICIENT_STORAGE:
    'Not enough storage space to download the model. Free up some space and try again.',
  INSUFFICIENT_RAM: 'Not enough memory to load this model. Try the Base model instead of Small.',
  EMPTY_TRANSCRIPTION:
    'No speech was detected in this audio segment. The recording may be too quiet.',
  RECORDING_INTERRUPTED: 'Recording was interrupted. Your progress has been saved.',
  THERMAL_THROTTLING:
    'Your device is getting warm. Transcription speed has been reduced to prevent overheating.',
  AUDIO_FORMAT_ERROR: 'Could not process the audio file. The format may be unsupported.',
  VAD_INIT_FAILED:
    'Voice detection failed to initialize. Transcription will proceed without silence skipping.',
  DOWNLOAD_FAILED: 'Model download failed. Check your internet connection and try again.',
  CHECKSUM_MISMATCH: 'Downloaded model file is corrupted. Please try downloading again.',
  RECORDER_DESTROYED: 'Recording system was shut down.',
  PCM_INIT_FAILED: 'Audio capture initialization failed.',
  PCM_START_FAILED: 'Could not start audio capture.',
  NO_AUDIO_DATA: 'No audio data was received.',
  RECORDING_TOO_LONG: 'Recording is too long for this device.',
  BUFFER_CONCAT_FAILED: 'Audio processing error.',
  FILE_WRITE_FAILED: 'Failed to save recording to disk.',
  NATIVE_MODULE_MISSING: 'Native audio module is not available.',
  FALLBACK_START_FAILED: 'Failed to start backup recording.',
  FILE_COPY_FAILED: 'File system error during processing.',
  DOWNLOAD_SIZE_MISMATCH: 'The model file download was incomplete.',
  VAD_CHECKSUM_MISMATCH: 'Voice detection data is corrupted.',
  UNKNOWN: 'An unexpected error occurred. Please try again.',
};

// ─── Hook API ────────────────────────────────────────────────────────────────

export interface UseLectureTranscriptionReturn {
  // ── State ──
  modelState: ModelState;
  recordingState: RecordingState;
  transcriptionState: TranscriptionState;
  progress: TranscriptionProgress;
  transcript: LectureTranscript | null;
  error: TranscriptionError | null;

  // ── Model Management ──
  downloadModel: (size: WhisperModelSize) => Promise<void>;
  cancelDownload: () => void;
  deleteModel: (size: WhisperModelSize) => Promise<void>;
  loadModel: (size?: WhisperModelSize) => Promise<void>;
  unloadModel: () => void;

  // ── Real-time Mode ──
  startRealtimeSession: (title?: string) => Promise<void>;
  stopRealtimeSession: () => Promise<LectureTranscript>;

  // ── Batch Mode ──
  transcribeFile: (audioFilePath: string, title?: string) => Promise<LectureTranscript>;
  cancelBatchTranscription: () => void;

  // ── Shared ──
  pauseTranscription: () => void;
  resumeTranscription: () => void;
  reset: () => void;
}
