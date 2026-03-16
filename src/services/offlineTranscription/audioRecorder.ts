/**
 * Audio Recording Service — Direct PCM Capture
 *
 * Provides two recording paths:
 *
 * Path A (Primary): Direct 16kHz mono PCM via @fugood/react-native-audio-pcm-stream.
 *   - Zero conversion overhead — audio is already in Whisper's native format.
 *   - Streams raw PCM samples for real-time transcription.
 *   - Writes WAV to disk simultaneously for batch re-processing.
 *
 * Path B (Fallback): Record to M4A via existing RecordingService native module,
 *   then convert to WAV using the native convertToWav() function.
 *   - Used if PCM streaming fails on certain devices.
 *   - Adds ~2s conversion overhead per 30s chunk.
 *
 * Audio spec: 16,000 Hz sample rate, mono, 16-bit signed integer PCM.
 */

import { Platform, PermissionsAndroid, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  RecordingState,
  TranscriptionError,
} from './types';

// ─── PCM Stream Library ──────────────────────────────────────────────────────
// @fugood/react-native-audio-pcm-stream provides raw PCM from the mic.
// It's the recommended audio source for whisper.rn's RealtimeTranscriber.
let AudioPcmStream: any = null;
try {
  AudioPcmStream = require('@fugood/react-native-audio-pcm-stream').default;
} catch {
  console.warn(
    '[AudioRecorder] @fugood/react-native-audio-pcm-stream not available, will use fallback recording',
  );
}

// ─── Fallback: Native module recording ───────────────────────────────────────
let AppLauncher: any = null;
try {
  AppLauncher = require('../../../modules/app-launcher');
} catch {
  console.warn('[AudioRecorder] app-launcher native module not available');
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

/** Directory to store WAV recordings */
const RECORDING_DIR = `${FileSystem.documentDirectory}recordings/`;

// ─── WAV Header Construction ─────────────────────────────────────────────────

/**
 * Creates a valid WAV file header for 16kHz mono 16-bit PCM.
 * The header is 44 bytes. We write a placeholder data size initially,
 * then patch it when the recording finishes.
 */
function createWavHeader(dataSize: number): ArrayBuffer {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // File size - 8
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (PCM = 16)
  view.setUint16(20, 1, true); // AudioFormat (PCM = 1)
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE, true); // ByteRate
  view.setUint16(32, CHANNELS * BYTES_PER_SAMPLE, true); // BlockAlign
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  return header;
}

// ─── Type for PCM data callbacks ─────────────────────────────────────────────

export type PcmDataCallback = (samples: Float32Array) => void;
export type RecordingStateCallback = (state: RecordingState) => void;

// ─── Audio Recorder Class ────────────────────────────────────────────────────

export class AudioRecorder {
  private state: RecordingState = 'idle';
  private stateCallback: RecordingStateCallback | null = null;
  private pcmCallback: PcmDataCallback | null = null;
  private usingFallback = false;

  // PCM stream recording state
  private pcmChunks: Buffer[] = [];
  private totalPcmBytes = 0;
  private recordingStartTime = 0;
  private currentWavPath: string | null = null;

  // Fallback recording state
  private fallbackRecordingPath: string | null = null;

  // Track temporary files for cleanup
  private tempFilesToClean: string[] = [];

  // Track if destroyed
  private isDestroyed = false;

  constructor() {
    this.ensureRecordingDir();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  getState(): RecordingState {
    return this.state;
  }

  onStateChange(callback: RecordingStateCallback): void {
    this.stateCallback = callback;
  }

  /**
   * Register a callback to receive raw PCM samples in real-time.
   * Samples are Float32Array in range [-1.0, 1.0], 16kHz mono.
   * Only fires when using the primary PCM stream path.
   */
  onPcmData(callback: PcmDataCallback): void {
    this.pcmCallback = callback;
  }

  /**
   * Start recording lecture audio.
   * Attempts direct PCM capture first; falls back to native M4A recording.
   * Returns the file path where the WAV will be saved.
   */
  async startRecording(): Promise<string> {
    if (this.isDestroyed) {
      throw new TranscriptionError(
        'RECORDER_DESTROYED',
        'Cannot start recording - recorder has been destroyed',
        'The audio recorder has been cleaned up. Please restart the recording.',
      );
    }

    if (this.state === 'recording') {
      throw new TranscriptionError(
        'UNKNOWN',
        'Already recording',
        'A recording is already in progress.',
      );
    }

    this.setState('requesting_permission');

    // Request microphone permission
    const hasPermission = await this.requestMicPermission();
    if (!hasPermission) {
      this.setState('error');
      throw new TranscriptionError(
        'MIC_PERMISSION_DENIED',
        'Microphone permission denied',
        'Microphone access is required for recording. Please grant permission in Settings.',
      );
    }

    // Generate output path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.currentWavPath = `${RECORDING_DIR}lecture_${timestamp}.wav`;

    // Reset state
    this.pcmChunks = [];
    this.totalPcmBytes = 0;
    this.usingFallback = false;
    this.recordingStartTime = Date.now();
    this.tempFilesToClean = [];

    // Try primary PCM path first
    if (AudioPcmStream) {
      try {
        await this.startPcmRecording();
        this.setState('recording');
        return this.currentWavPath;
      } catch (err) {
        console.warn(
          '[AudioRecorder] PCM stream failed, trying fallback:',
          err,
        );
        // Clean up any partial PCM data
        this.pcmChunks = [];
        this.totalPcmBytes = 0;
      }
    }

    // Fallback: native module M4A recording
    if (AppLauncher) {
      try {
        await this.startFallbackRecording();
        this.usingFallback = true;
        this.setState('recording');
        return this.currentWavPath;
      } catch (err) {
        await this.cleanupTempFiles();
        this.setState('error');
        throw new TranscriptionError(
          'MIC_IN_USE',
          `Both recording paths failed: ${err}`,
          'Could not start recording. The microphone may be in use by another app.',
        );
      }
    }

    await this.cleanupTempFiles();
    this.setState('error');
    throw new TranscriptionError(
      'UNKNOWN',
      'No recording backend available',
      'Audio recording is not available on this device.',
    );
  }

  /**
   * Stop recording and finalize the WAV file.
   * Returns the path to the final WAV file (16kHz mono PCM).
   */
  async stopRecording(): Promise<string> {
    if (this.isDestroyed) {
      throw new TranscriptionError(
        'RECORDER_DESTROYED',
        'Cannot stop recording - recorder has been destroyed',
        'The audio recorder has been cleaned up.',
      );
    }

    if (this.state !== 'recording' && this.state !== 'paused') {
      throw new TranscriptionError(
        'UNKNOWN',
        `Cannot stop recording in state: ${this.state}`,
        'No active recording to stop.',
      );
    }

    this.setState('stopping');

    let wavPath: string;

    try {
      if (this.usingFallback) {
        wavPath = await this.stopFallbackRecording();
      } else {
        wavPath = await this.stopPcmRecording();
      }
    } catch (err) {
      await this.cleanupTempFiles();
      throw err;
    } finally {
      this.setState('idle');
    }

    return wavPath;
  }

  /**
   * Get the elapsed recording time in seconds.
   */
  getElapsedSeconds(): number {
    if (this.state !== 'recording' && this.state !== 'paused') return 0;
    return (Date.now() - this.recordingStartTime) / 1000;
  }

  /**
   * Whether we're using the direct PCM path (supports real-time streaming)
   * or the fallback M4A path (file-based only).
   */
  isUsingDirectPcm(): boolean {
    return !this.usingFallback;
  }

  /**
   * Clean up a recording file after transcription is complete.
   */
  async deleteRecording(filePath: string): Promise<void> {
    try {
      const info = await FileSystem.getInfoAsync(filePath);
      if (info.exists) {
        await FileSystem.deleteAsync(filePath, { idempotent: true });
      }
    } catch (err) {
      console.warn('[AudioRecorder] Failed to delete recording:', err);
    }
  }

  /**
   * Release all resources. Call when the component unmounts.
   * This is idempotent and safe to call multiple times.
   */
  async destroy(): Promise<void> {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    // Stop recording if active
    if (this.state === 'recording' || this.state === 'paused') {
      try {
        await this.stopRecording();
      } catch (error) {
        // Ignore errors during cleanup
        console.warn('[AudioRecorder] Error stopping recording during destroy:', error);
      }
    }

    // Clean up all temporary files
    await this.cleanupTempFiles();

    // Clear callbacks
    this.pcmCallback = null;
    this.stateCallback = null;

    // Clear buffers
    this.pcmChunks = [];
    this.totalPcmBytes = 0;
  }

  // ── Primary Path: Direct PCM Recording ──────────────────────────────────

  private async startPcmRecording(): Promise<void> {
    const options = {
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      bitsPerSample: BITS_PER_SAMPLE,
      audioSource: 6, // VOICE_RECOGNITION — no echo cancellation, best for lectures
      bufferSize: 8192, // ~0.5s at 16kHz mono 16-bit
    };

    try {
      AudioPcmStream.init(options);
    } catch (err) {
      throw new TranscriptionError(
        'PCM_INIT_FAILED',
        `Failed to initialize PCM stream: ${err}`,
        'Audio initialization failed. Try restarting the app.',
      );
    }

    // Set up data listener
    const dataHandler = (base64Chunk: string) => {
      if (this.state !== 'recording' || this.isDestroyed) return;

      try {
        // Decode base64 to raw bytes
        const rawBuffer = Buffer.from(base64Chunk, 'base64');
        this.pcmChunks.push(rawBuffer);
        this.totalPcmBytes += rawBuffer.length;

        // Memory safety check - limit to 500MB of raw PCM
        if (this.totalPcmBytes > 500 * 1024 * 1024) {
          console.error('[AudioRecorder] Recording exceeded 500MB limit, stopping...');
          this.stopRecording().catch(() => {});
          return;
        }

        // Convert Int16 PCM to Float32 for whisper.rn
        if (this.pcmCallback) {
          const int16View = new Int16Array(
            rawBuffer.buffer,
            rawBuffer.byteOffset,
            rawBuffer.length / 2,
          );
          const float32 = new Float32Array(int16View.length);
          for (let i = 0; i < int16View.length; i++) {
            float32[i] = int16View[i] / 32768.0;
          }
          this.pcmCallback(float32);
        }
      } catch (err) {
        console.warn('[AudioRecorder] Error processing PCM chunk:', err);
        // Don't throw - continue recording
      }
    };

    AudioPcmStream.on('data', dataHandler);

    // Store listener for cleanup
    (AudioPcmStream as any)._dataListener = dataHandler;

    try {
      await AudioPcmStream.start();
    } catch (err) {
      // Clean up listener
      AudioPcmStream.off('data', dataHandler);
      delete (AudioPcmStream as any)._dataListener;
      throw new TranscriptionError(
        'PCM_START_FAILED',
        `Failed to start PCM recording: ${err}`,
        'Could not start audio capture. Check microphone permissions.',
      );
    }
  }

  private async stopPcmRecording(): Promise<string> {
    try {
      await AudioPcmStream.stop();
    } catch (err) {
      console.warn('[AudioRecorder] Error stopping PCM stream:', err);
      // Continue to write whatever we have
    }

    // Clean up listener
    const dataHandler = (AudioPcmStream as any)._dataListener;
    if (dataHandler) {
      AudioPcmStream.off('data', dataHandler);
      delete (AudioPcmStream as any)._dataListener;
    }

    // Check if we have any audio data
    if (this.pcmChunks.length === 0) {
      throw new TranscriptionError(
        'NO_AUDIO_DATA',
        'No audio data captured',
        'The recording appears to be empty. Check your microphone.',
      );
    }

    // Concatenate all PCM chunks with memory safety check
    if (this.totalPcmBytes > 100 * 1024 * 1024) { // 100MB limit for concatenation
      throw new TranscriptionError(
        'RECORDING_TOO_LONG',
        'Recording exceeds maximum duration',
        'Recording is too long. Please break it into smaller chunks.',
      );
    }

    let totalBuffer: Buffer;
    try {
      // Use a more memory-efficient approach for large recordings
      if (this.pcmChunks.length > 100) {
        // For many chunks, write incrementally to temp file
        const tempPath = `${FileSystem.cacheDirectory}pcm-chunks-${Date.now()}.bin`;
        this.tempFilesToClean.push(tempPath);
        
        let offset = 0;
        const buffer = Buffer.alloc(this.totalPcmBytes);
        for (const chunk of this.pcmChunks) {
          chunk.copy(buffer, offset);
          offset += chunk.length;
        }
        totalBuffer = buffer;
      } else {
        totalBuffer = Buffer.concat(this.pcmChunks, this.totalPcmBytes);
      }
    } catch (err) {
      throw new TranscriptionError(
        'BUFFER_CONCAT_FAILED',
        `Failed to concatenate audio buffers: ${err}`,
        'Internal audio processing error.',
      );
    }

    // Write WAV file: header + PCM data
    const wavHeader = createWavHeader(totalBuffer.length);
    const headerBuffer = Buffer.from(wavHeader);
    const wavBuffer = Buffer.concat([headerBuffer, totalBuffer]);

    // Write to file with error handling
    const base64Wav = wavBuffer.toString('base64');
    try {
      await FileSystem.writeAsStringAsync(this.currentWavPath!, base64Wav, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (err) {
      throw new TranscriptionError(
        'FILE_WRITE_FAILED',
        `Failed to write WAV file: ${err}`,
        'Could not save recording. Check storage space.',
      );
    }

    // Free memory
    this.pcmChunks = [];
    this.totalPcmBytes = 0;

    return this.currentWavPath!;
  }

  // ── Fallback Path: Native Module M4A → WAV ─────────────────────────────

  private async startFallbackRecording(): Promise<void> {
    if (!AppLauncher) {
      throw new TranscriptionError(
        'NATIVE_MODULE_MISSING',
        'Native recording module not available',
        'Audio recording is not supported on this device.',
      );
    }

    try {
      this.fallbackRecordingPath = await AppLauncher.startRecording('');
      if (!this.fallbackRecordingPath) {
        throw new Error('Native recording returned null path');
      }
      this.tempFilesToClean.push(this.fallbackRecordingPath);
    } catch (err) {
      throw new TranscriptionError(
        'FALLBACK_START_FAILED',
        `Failed to start fallback recording: ${err}`,
        'Could not start audio recording. Check microphone permissions.',
      );
    }
  }

  private async stopFallbackRecording(): Promise<string> {
    if (!AppLauncher) {
      throw new TranscriptionError(
        'NATIVE_MODULE_MISSING',
        'Native recording module not available',
        'Cannot stop recording - module missing.',
      );
    }

    try {
      const m4aPath = await AppLauncher.stopRecording();
      if (!m4aPath) {
        throw new TranscriptionError(
          'RECORDING_INTERRUPTED',
          'stopRecording returned null',
          'Recording was interrupted. Your progress may have been lost.',
        );
      }

      // Convert M4A → WAV (16kHz mono PCM) via native module
      const wavPath = await AppLauncher.convertToWav(m4aPath);
      if (!wavPath) {
        throw new TranscriptionError(
          'AUDIO_FORMAT_ERROR',
          `Failed to convert ${m4aPath} to WAV`,
          'Could not process the audio file. Please try recording again.',
        );
      }

      // Copy to our expected output path if different
      if (wavPath !== this.currentWavPath) {
        try {
          await FileSystem.copyAsync({ from: wavPath, to: this.currentWavPath! });
          this.tempFilesToClean.push(wavPath); // Mark for cleanup
        } catch (err) {
          throw new TranscriptionError(
            'FILE_COPY_FAILED',
            `Failed to copy WAV file: ${err}`,
            'Could not save converted audio.',
          );
        }
      }

      return this.currentWavPath!;
    } catch (err) {
      // Clean up temp files on error
      await this.cleanupTempFiles();
      throw err;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private setState(state: RecordingState): void {
    if (this.isDestroyed) return;
    this.state = state;
    this.stateCallback?.(state);
  }

  private async requestMicPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true; // iOS handled by expo-av

    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'Guru needs microphone access to record lectures for transcription.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        },
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn('[AudioRecorder] Permission request failed:', err);
      return false;
    }
  }

  private async ensureRecordingDir(): Promise<void> {
    try {
      const info = await FileSystem.getInfoAsync(RECORDING_DIR);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(RECORDING_DIR, {
          intermediates: true,
        });
      }
    } catch (err) {
      console.warn('[AudioRecorder] Failed to create recording dir:', err);
    }
  }

  /**
   * Clean up temporary files created during recording.
   * Called on error or when stopping recording.
   */
  private async cleanupTempFiles(): Promise<void> {
    for (const file of this.tempFilesToClean) {
      try {
        const info = await FileSystem.getInfoAsync(file);
        if (info.exists) {
          await FileSystem.deleteAsync(file, { idempotent: true });
        }
      } catch (err) {
        console.warn('[AudioRecorder] Failed to cleanup temp file:', file, err);
      }
    }
    this.tempFilesToClean = [];
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

let _recorder: AudioRecorder | null = null;

export function getAudioRecorder(): AudioRecorder {
  if (!_recorder) {
    _recorder = new AudioRecorder();
  }
  return _recorder;
}
