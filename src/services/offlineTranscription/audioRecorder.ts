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

import { Platform, PermissionsAndroid } from 'react-native';
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
        this.setState('error');
        throw new TranscriptionError(
          'MIC_IN_USE',
          `Both recording paths failed: ${err}`,
          'Could not start recording. The microphone may be in use by another app.',
        );
      }
    }

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
    if (this.state !== 'recording' && this.state !== 'paused') {
      throw new TranscriptionError(
        'UNKNOWN',
        `Cannot stop recording in state: ${this.state}`,
        'No active recording to stop.',
      );
    }

    this.setState('stopping');

    let wavPath: string;

    if (this.usingFallback) {
      wavPath = await this.stopFallbackRecording();
    } else {
      wavPath = await this.stopPcmRecording();
    }

    this.setState('idle');
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
   */
  destroy(): void {
    if (this.state === 'recording' || this.state === 'paused') {
      // Best-effort stop without waiting
      this.stopRecording().catch((error) => {
        console.warn('[AudioRecorder] Background stopRecording failed during destroy:', error);
      });
    }
    this.pcmCallback = null;
    this.stateCallback = null;
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

    AudioPcmStream.init(options);

    AudioPcmStream.on('data', (base64Chunk: string) => {
      if (this.state !== 'recording') return;

      // Decode base64 to raw bytes
      const rawBuffer = Buffer.from(base64Chunk, 'base64');
      this.pcmChunks.push(rawBuffer);
      this.totalPcmBytes += rawBuffer.length;

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
    });

    await AudioPcmStream.start();
  }

  private async stopPcmRecording(): Promise<string> {
    await AudioPcmStream.stop();

    // Concatenate all PCM chunks
    const totalBuffer = Buffer.concat(this.pcmChunks, this.totalPcmBytes);

    // Write WAV file: header + PCM data
    const wavHeader = createWavHeader(totalBuffer.length);
    const headerBuffer = Buffer.from(wavHeader);
    const wavBuffer = Buffer.concat([headerBuffer, totalBuffer]);

    // Write to file
    const base64Wav = wavBuffer.toString('base64');
    await FileSystem.writeAsStringAsync(this.currentWavPath!, base64Wav, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Free memory
    this.pcmChunks = [];
    this.totalPcmBytes = 0;

    return this.currentWavPath!;
  }

  // ── Fallback Path: Native Module M4A → WAV ─────────────────────────────

  private async startFallbackRecording(): Promise<void> {
    // Use the existing native RecordingService (records to M4A)
    this.fallbackRecordingPath = await AppLauncher.startRecording('');
    if (!this.fallbackRecordingPath) {
      throw new Error('Native recording returned null path');
    }
  }

  private async stopFallbackRecording(): Promise<string> {
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

    // Copy to our expected output path
    if (wavPath !== this.currentWavPath) {
      await FileSystem.copyAsync({ from: wavPath, to: this.currentWavPath! });
    }

    return this.currentWavPath!;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private setState(state: RecordingState): void {
    this.state = state;
    this.stateCallback?.(state);
  }

  private async requestMicPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;

    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'Guru needs microphone access to record lectures.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        },
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
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
}

// ─── Singleton Export ────────────────────────────────────────────────────────

let _recorder: AudioRecorder | null = null;

export function getAudioRecorder(): AudioRecorder {
  if (!_recorder) {
    _recorder = new AudioRecorder();
  }
  return _recorder;
}
