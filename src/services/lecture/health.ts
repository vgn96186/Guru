import { AppState } from 'react-native';
import { validateRecordingFile } from '../../../modules/app-launcher';
import {
  notifyRecordingHealthIssue,
  notifyTranscriptionEvidenceOk,
  notifyTranscriptionEvidenceNoSpeech,
  notifyTranscriptionEvidenceError,
} from '../notificationService';
import { transcribeRawWithGroq, transcribeRawWithLocalWhisper } from '../transcription/engines';

let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
let evidenceCheckTimeout: ReturnType<typeof setTimeout> | null = null;
let lastKnownFileSize = 0;
let stalledCount = 0;

const HEALTH_CHECK_INTERVAL = 60_000;
const STALLED_THRESHOLD = 3;
/** Run a short transcription after this delay to prove capture + API work (so user isn't blind for hours). */
const TRANSCRIPTION_EVIDENCE_DELAY_MS = 90_000;

export interface RecordingHealthCheckOptions {
  /** If set, run an early transcription test and notify success/failure. */
  groqKey?: string;
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

  const appStateListener = AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') {
      stopRecordingHealthCheck();
      appStateListener.remove();
    }
  });

  healthCheckTimer = setInterval(async () => {
    try {
      const info = await validateRecordingFile(recordingPath);
      if (!(info?.exists) || info.size <= lastKnownFileSize) {
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
  const localWhisperPath = options?.localWhisperPath?.trim();
  if (groqKey || localWhisperPath) {
    evidenceCheckTimeout = setTimeout(() => {
      evidenceCheckTimeout = null;
      runTranscriptionEvidenceCheck(recordingPath, appName, { groqKey, localWhisperPath });
    }, TRANSCRIPTION_EVIDENCE_DELAY_MS);
  }
}

async function runTranscriptionEvidenceCheck(
  recordingPath: string,
  appName: string,
  opts: { groqKey?: string; localWhisperPath?: string },
): Promise<void> {
  try {
    let transcript = '';
    if (opts.groqKey) {
      try {
        transcript = await transcribeRawWithGroq(recordingPath, opts.groqKey);
      } catch (e) {
        console.warn('[Health] Transcription evidence (Groq) failed:', e);
        await notifyTranscriptionEvidenceError(appName);
        return;
      }
    }
    if (!transcript?.trim() && opts.localWhisperPath) {
      try {
        transcript = await transcribeRawWithLocalWhisper(recordingPath, opts.localWhisperPath);
      } catch (e) {
        console.warn('[Health] Transcription evidence (local) failed:', e);
        await notifyTranscriptionEvidenceError(appName);
        return;
      }
    }
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
