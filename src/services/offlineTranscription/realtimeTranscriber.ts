/**
 * Real-Time Transcription Controller
 *
 * Uses whisper.rn's RealtimeTranscriber with AudioPcmStreamAdapter for
 * live speech-to-text during lecture recording. Text appears as the
 * professor speaks — the primary UX mode.
 *
 * Pipeline:
 *   Mic → AudioPcmStream (16kHz PCM) → AudioPcmStreamAdapter
 *     → Silero VAD (speech detection) → Auto-slice on silence
 *     → Whisper inference (greedy, beamSize=1) → TranscriptSegment
 *     → Accumulate in running transcript
 *
 * The RealtimeTranscriber handles:
 *   - Audio buffering and slicing (configurable audioSliceSec)
 *   - Silero VAD integration (skip silence, auto-slice on speech end)
 *   - Memory management (releases processed audio buffers)
 *   - Overlapping windows to avoid mid-word splits
 *
 * Known edge cases handled:
 *   - Mid-sentence chunk boundaries: 0.5s overlap + post-merge dedup
 *   - Long pauses (Q&A, slide transitions): VAD skips silence
 *   - Background noise (lecture hall HVAC): lowered speechThreshold
 *   - Empty chunks: logged and skipped, not errors
 */

import { initWhisper } from 'whisper.rn';

type WhisperContextType = Awaited<ReturnType<typeof initWhisper>>;
import {
  TranscriptSegment,
  TranscriptionProgress,
  RealtimeTranscriptionConfig,
  VadConfig,
  DEFAULT_REALTIME_CONFIG,
  LECTURE_HALL_VAD_CONFIG,
  TranscriptionError,
} from './types';
import { WhisperModelManager } from './whisperModelManager';

// ─── whisper.rn RealtimeTranscriber imports ──────────────────────────────────
// These come from whisper.rn v0.5.x's new streaming API

let RealtimeTranscriber: any = null;
let AudioPcmStreamAdapter: any = null;
let initWhisperVad: any = null;

try {
  const whisperRn = require('whisper.rn');
  RealtimeTranscriber = whisperRn.RealtimeTranscriber;
  AudioPcmStreamAdapter = whisperRn.AudioPcmStreamAdapter;
  initWhisperVad = whisperRn.initWhisperVad;
} catch (err) {
  console.error('[RealtimeTranscriber] Failed to import whisper.rn:', err);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type RealtimeTranscriptCallback = (
  progress: TranscriptionProgress,
) => void;

interface SliceResult {
  text: string;
  startSec: number;
  endSec: number;
}

// ─── Real-Time Transcription Controller ──────────────────────────────────────

export class RealtimeTranscriptionController {
  private modelManager: WhisperModelManager;
  private config: RealtimeTranscriptionConfig;
  private vadConfig: VadConfig;

  // whisper.rn instances
  private transcriber: any = null;
  private audioAdapter: any = null;
  private vadContext: any = null;

  // State
  private isRunning = false;
  private isPaused = false;
  private segments: TranscriptSegment[] = [];
  private segmentCounter = 0;
  private sessionStartTime = 0;
  private totalVadSkippedSeconds = 0;
  private processingStartTime = 0;
  private callback: RealtimeTranscriptCallback | null = null;

  // Deduplication: track last few segment texts to detect overlapping repeats
  private recentTexts: string[] = [];
  private readonly DEDUP_WINDOW = 3;

  constructor(
    modelManager: WhisperModelManager,
    config?: Partial<RealtimeTranscriptionConfig>,
    vadConfig?: Partial<VadConfig>,
  ) {
    this.modelManager = modelManager;
    this.config = { ...DEFAULT_REALTIME_CONFIG, ...config };
    this.vadConfig = { ...LECTURE_HALL_VAD_CONFIG, ...vadConfig };
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Start real-time transcription.
   * Requires a loaded WhisperContext from the model manager.
   * The callback fires every time a new segment is transcribed.
   */
  async start(callback: RealtimeTranscriptCallback): Promise<void> {
    if (this.isRunning) {
      throw new TranscriptionError(
        'UNKNOWN',
        'RealtimeTranscriber already running',
        'Real-time transcription is already active.',
      );
    }

    if (!RealtimeTranscriber || !AudioPcmStreamAdapter) {
      throw new TranscriptionError(
        'UNKNOWN',
        'whisper.rn RealtimeTranscriber not available',
        'Real-time transcription requires whisper.rn v0.5+. Please update the library.',
      );
    }

    this.callback = callback;
    this.segments = [];
    this.segmentCounter = 0;
    this.totalVadSkippedSeconds = 0;
    this.recentTexts = [];
    this.sessionStartTime = Date.now();
    this.processingStartTime = Date.now();

    const whisperContext = this.modelManager.getContext();

    // Initialize VAD if available
    await this.initVad();

    // Create audio adapter (bridges @fugood/react-native-audio-pcm-stream to whisper.rn)
    this.audioAdapter = new AudioPcmStreamAdapter({
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      audioSource: 6, // VOICE_RECOGNITION
      bufferSize: 8192,
    });

    // Create the real-time transcriber
    this.transcriber = new RealtimeTranscriber(whisperContext, {
      audioAdapter: this.audioAdapter,
      audioSliceSec: this.config.audioSliceSec,
      autoSliceOnSpeechEnd: this.config.autoSliceOnSpeechEnd,
      vadContext: this.vadContext,

      // Whisper inference params
      language: 'en',
      beamSize: this.config.greedyDecoding ? 1 : 3,
      bestOf: this.config.greedyDecoding ? 1 : 3,
      temperature: 0,
      maxLen: 0, // No length limit
      tokenTimestamps: true,
      nThreads: this.config.nThreads,

      // Callbacks
      onTranscription: (result: any) => {
        this.handleTranscriptionResult(result);
      },
      onSliceStart: (sliceIndex: number, startSec: number) => {
        // A new audio slice has started — the previous one is being transcribed
        console.log(
          `[Realtime] Slice ${sliceIndex} started at ${startSec.toFixed(1)}s`,
        );
      },
      onSilenceDetected: (startSec: number, durationSec: number) => {
        this.totalVadSkippedSeconds += durationSec;
        console.log(
          `[Realtime] Silence: ${durationSec.toFixed(1)}s at ${startSec.toFixed(1)}s`,
        );
      },
    });

    // Start capture + transcription
    await this.transcriber.start();
    this.isRunning = true;
    this.isPaused = false;

    // Emit initial progress
    this.emitProgress();
  }

  /**
   * Stop real-time transcription and return all accumulated segments.
   */
  async stop(): Promise<TranscriptSegment[]> {
    if (!this.isRunning) return this.segments;

    try {
      // Stop captures any remaining audio and transcribes it
      if (this.transcriber) {
        const finalResult = await this.transcriber.stop();
        if (finalResult?.text?.trim()) {
          this.handleTranscriptionResult(finalResult);
        }
      }
    } catch (err) {
      console.warn('[RealtimeTranscriber] Error during stop:', err);
    }

    this.isRunning = false;
    this.isPaused = false;

    // Clean up
    await this.cleanup();

    return this.segments;
  }

  /**
   * Pause transcription (stops processing audio but keeps state).
   */
  pause(): void {
    if (!this.isRunning || this.isPaused) return;
    this.transcriber?.pause?.();
    this.isPaused = true;
    this.emitProgress();
  }

  /**
   * Resume transcription after pause.
   */
  resume(): void {
    if (!this.isRunning || !this.isPaused) return;
    this.transcriber?.resume?.();
    this.isPaused = false;
    this.emitProgress();
  }

  /**
   * Get current segments (without stopping).
   */
  getSegments(): TranscriptSegment[] {
    return [...this.segments];
  }

  /**
   * Get total seconds of silence skipped by VAD.
   */
  getVadSkippedSeconds(): number {
    return this.totalVadSkippedSeconds;
  }

  /**
   * Release all resources.
   */
  async destroy(): Promise<void> {
    if (this.isRunning) {
      await this.stop();
    }
    await this.cleanup();
  }

  // ── Private Methods ─────────────────────────────────────────────────────

  private async initVad(): Promise<void> {
    if (!initWhisperVad) {
      console.warn(
        '[RealtimeTranscriber] initWhisperVad not available, proceeding without VAD',
      );
      return;
    }

    try {
      const vadModelPath = await this.modelManager.getVadModelPath();
      this.vadContext = await initWhisperVad({
        modelPath: vadModelPath,
        threshold: this.vadConfig.speechThreshold,
        minSilenceDurationMs: this.vadConfig.minSilenceDurationMs,
        speechPadMs: this.vadConfig.speechPadMs,
      });
    } catch (err) {
      console.warn('[RealtimeTranscriber] VAD init failed:', err);
      // Continue without VAD — transcription still works, just processes silence too
      this.vadContext = null;
    }
  }

  private handleTranscriptionResult(result: any): void {
    if (!result?.text) return;

    const text = result.text.trim();
    if (!text || text === '[BLANK_AUDIO]' || text === '(blank audio)') {
      return; // Empty or hallucinated silence marker
    }

    // Hallucination detection: skip repeated phrases
    if (this.isLikelyHallucination(text)) {
      console.warn('[Realtime] Skipping likely hallucination:', text.slice(0, 50));
      return;
    }

    // Deduplication: check if this segment overlaps with recent ones
    if (this.isDuplicate(text)) {
      return;
    }

    const elapsedSec = (Date.now() - this.sessionStartTime) / 1000;
    const segmentDuration = result.endSec
      ? result.endSec - (result.startSec ?? 0)
      : this.config.audioSliceSec;

    const segment: TranscriptSegment = {
      id: this.segmentCounter++,
      start: result.startSec ?? Math.max(0, elapsedSec - segmentDuration),
      end: result.endSec ?? elapsedSec,
      text,
      confidence: result.confidence,
    };

    this.segments.push(segment);
    this.recentTexts.push(text);
    if (this.recentTexts.length > this.DEDUP_WINDOW) {
      this.recentTexts.shift();
    }

    this.emitProgress();
  }

  /**
   * Detect Whisper hallucinations:
   * - Repeated short phrases (e.g., "Thank you. Thank you. Thank you.")
   * - Common hallucination patterns on silence
   */
  private isLikelyHallucination(text: string): boolean {
    // Common whisper hallucination patterns
    const hallucinationPatterns = [
      /^(thank you\.?\s*){3,}/i,
      /^(you\.?\s*){5,}/i,
      /^(\.\s*){3,}$/,
      /^(♪\s*)+$/,
      /^\[music\]$/i,
      /^(okay\.?\s*){3,}/i,
      /^(um\.?\s*){5,}/i,
      /^(uh\.?\s*){5,}/i,
    ];

    return hallucinationPatterns.some((pattern) => pattern.test(text));
  }

  /**
   * Check if this text substantially overlaps with a recent segment.
   * This handles the overlap window at chunk boundaries.
   */
  private isDuplicate(text: string): boolean {
    const normalized = text.toLowerCase().trim();
    if (normalized.length < 10) return false; // Too short to reliably dedup

    for (const recent of this.recentTexts) {
      const recentNorm = recent.toLowerCase().trim();

      // Exact match
      if (normalized === recentNorm) return true;

      // Starts with the last ~60% of the previous segment (overlap artifact)
      const overlapThreshold = Math.floor(recentNorm.length * 0.6);
      const recentTail = recentNorm.slice(-overlapThreshold);
      if (recentTail.length > 20 && normalized.startsWith(recentTail)) {
        return true;
      }
    }

    return false;
  }

  private emitProgress(): void {
    if (!this.callback) return;

    const elapsedSeconds =
      (Date.now() - this.processingStartTime) / 1000;

    const progress: TranscriptionProgress = {
      state: this.isPaused
        ? 'paused'
        : this.isRunning
          ? 'transcribing'
          : 'completed',
      percentage: -1, // Indeterminate for real-time mode
      partialTranscript: this.segments.map((s) => s.text).join(' '),
      segments: [...this.segments],
      elapsedSeconds,
    };

    this.callback(progress);
  }

  private async cleanup(): Promise<void> {
    if (this.vadContext) {
      try {
        await this.vadContext.release?.();
      } catch {
        // Ignore
      }
      this.vadContext = null;
    }
    this.transcriber = null;
    this.audioAdapter = null;
    this.callback = null;
  }
}
