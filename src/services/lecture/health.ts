import { AppState } from 'react-native';
import { validateRecordingFile } from '../../../modules/app-launcher';
import {
  notifyRecordingHealthIssue,
  notifyTranscriptionEvidenceOk,
  notifyTranscriptionEvidenceNoSpeech,
  notifyTranscriptionEvidenceError,
} from '../notificationService';
import {
  transcribeRawWithGroq,
  transcribeRawWithHuggingFace,
  transcribeRawWithLocalWhisper,
} from '../transcription/engines';
import { runTranscriptionProviders } from '../transcription/providerFallback';

let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
let evidenceCheckTimeout: ReturnType<typeof setTimeout> | null = null;
let lastKnownFileSize = 0;
let stalledCount = 0;
let currentGeneration = 0;

const HEALTH_CHECK_INTERVAL = 60_000;
const STALLED_THRESHOLD = 3;
/** Run a short transcription after this delay to prove capture + API work (so user isn't blind for hours). */
const TRANSCRIPTION_EVIDENCE_DELAY_MS = 90_000;

export interface RecordingHealthCheckOptions {
  /** If set, run an early transcription test and notify success/failure. */
  groqKey?: string;
  /** If set, try Hugging Face when Groq is unavailable. */
  huggingFaceToken?: string;
  huggingFaceModel?: string;
  /** If set and no Groq key, use local Whisper for the evidence check. */
  localWhisperPath?: string;
}

export function startRecordingHealthCheck(
  recordingPath: string,
  appName: string,
  options?: RecordingHealthCheckOptions,
): void {
  stopRecordingHealthCheck();
  lastKnownFileSize = 0;
  stalledCount = 0;
  const generation = ++currentGeneration;

  const appStateListener = AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') {
      stopRecordingHealthCheck();
      appStateListener.remove();
    }
  });

  healthCheckTimer = setInterval(async () => {
    if (generation !== currentGeneration) return;
    try {
      const info = await validateRecordingFile(recordingPath);
      if (generation !== currentGeneration) return;
      if (!info?.exists || info.size <= lastKnownFileSize) {
        stalledCount++;
      } else {
        stalledCount = 0;
        lastKnownFileSize = info.size;
      }

      if (stalledCount >= STALLED_THRESHOLD) {
        await notifyRecordingHealthIssue(appName);
        stalledCount = 0;
      }
    } catch (e) {
      console.warn('[Health] Health check error:', e);
    }
  }, HEALTH_CHECK_INTERVAL);

  const groqKey = options?.groqKey?.trim();
  const huggingFaceToken = options?.huggingFaceToken?.trim();
  const localWhisperPath = options?.localWhisperPath?.trim();
  if (groqKey || huggingFaceToken || localWhisperPath) {
    evidenceCheckTimeout = setTimeout(() => {
      evidenceCheckTimeout = null;
      runTranscriptionEvidenceCheck(recordingPath, appName, {
        groqKey,
        huggingFaceToken,
        huggingFaceModel: options?.huggingFaceModel,
        localWhisperPath,
      });
    }, TRANSCRIPTION_EVIDENCE_DELAY_MS);
  }
}

async function runTranscriptionEvidenceCheck(
  recordingPath: string,
  appName: string,
  opts: {
    groqKey?: string;
    huggingFaceToken?: string;
    huggingFaceModel?: string;
    localWhisperPath?: string;
  },
): Promise<void> {
  try {
    const { result: transcript } = await runTranscriptionProviders<string>({
      preferredProvider: 'auto',
      availability: {
        groq: !!opts.groqKey,
        huggingface: !!opts.huggingFaceToken,
        cloudflare: false,
        deepgram: false,
        local: !!opts.localWhisperPath,
      },
      isUsableResult: (value) => value.trim().length > 0,
      fallbackOnError: false,
      onProviderError: (provider, error) => {
        if (provider === 'groq') {
          console.warn('[Health] Transcription evidence (Groq) failed:', error);
        } else if (provider === 'huggingface') {
          console.warn('[Health] Transcription evidence (Hugging Face) failed:', error);
        } else {
          console.warn('[Health] Transcription evidence (local) failed:', error);
        }
      },
      runners: {
        groq: async () => {
          if (!opts.groqKey) return '';
          return transcribeRawWithGroq(recordingPath, opts.groqKey);
        },
        huggingface: async () => {
          if (!opts.huggingFaceToken) return '';
          return transcribeRawWithHuggingFace(
            recordingPath,
            opts.huggingFaceToken,
            opts.huggingFaceModel,
          );
        },
        local: async () => {
          if (!opts.localWhisperPath) return '';
          return transcribeRawWithLocalWhisper(recordingPath, opts.localWhisperPath);
        },
      },
    });

    if (transcript?.trim()) {
      await notifyTranscriptionEvidenceOk(appName);
    } else {
      await notifyTranscriptionEvidenceNoSpeech(appName);
    }
  } catch (e) {
    console.warn('[Health] Transcription evidence check error:', e);
    await notifyTranscriptionEvidenceError(appName);
  }
}

export function stopRecordingHealthCheck(): void {
  if (evidenceCheckTimeout) {
    clearTimeout(evidenceCheckTimeout);
    evidenceCheckTimeout = null;
  }
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}
