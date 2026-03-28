/**
 * transcribeAudio.ts — Unified transcription entry point.
 *
 * Groq first, Cloudflare / Hugging Face / local Whisper fallback.
 * Includes retry logic, analysis, and embedding.
 */
import { profileRepository } from '../../db/repositories';
import * as FileSystem from 'expo-file-system/legacy';
import { getApiKeys } from '../aiService';
import { toFileUri } from '../fileUri';
import {
  transcribeRawWithGroq,
  transcribeRawWithHuggingFace,
  transcribeRawWithCloudflare,
  transcribeRawWithDeepgram,
  transcribeRawWithLocalWhisper,
} from './engines';
import {
  buildTranscriptionProviderOrder,
  runTranscriptionProviders,
  type RunnableTranscriptionProvider,
  type TranscriptionProvider,
} from './providerFallback';
import {
  analyzeTranscript,
  type LectureAnalysis,
  type TranscriptAnalysisProgress,
} from './analysis';
import { generateEmbedding } from '../ai/embeddingService';
import { BUNDLED_HF_TOKEN, DEFAULT_HF_TRANSCRIPTION_MODEL } from '../../config/appConfig';

export type { LectureAnalysis };

export interface TranscriptionProgressUpdate {
  stage: 'transcribing' | 'analyzing';
  message: string;
  detail?: string;
  percent?: number;
  provider?: RunnableTranscriptionProvider;
  step?: number;
  totalSteps?: number;
  attempt?: number;
  maxAttempts?: number;
}

function previewTranscript(text: string, maxChars = 600): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}...`;
}

function formatAudioSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${bytes} B`;
}

function clampPercent(percent: number | undefined): number | undefined {
  if (typeof percent !== 'number' || Number.isNaN(percent)) return undefined;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function mapAnalysisProgressToOverall(progress: TranscriptAnalysisProgress): number {
  return clampPercent(64 + progress.percent * 0.26) ?? 75;
}

/**
 * Unified transcription entry point — Groq first, local Whisper fallback.
 * Includes retry logic and analysis.
 */
export async function transcribeAudio(opts: {
  audioFilePath: string;
  groqKey?: string;
  huggingFaceToken?: string;
  huggingFaceModel?: string;
  deepgramKey?: string;
  useLocalWhisper?: boolean;
  localWhisperPath?: string;
  transcriptionProvider?: TranscriptionProvider;
  includeEmbedding?: boolean;
  maxRetries?: number;
  logId?: number;
  onProgress?: (progress: TranscriptionProgressUpdate) => void;
}): Promise<LectureAnalysis & { embedding?: number[] }> {
  const profile = await profileRepository.getProfile();
  const {
    audioFilePath,
    groqKey = getApiKeys(profile).groqKey,
    huggingFaceToken = profile.huggingFaceToken || BUNDLED_HF_TOKEN,
    huggingFaceModel = profile.huggingFaceTranscriptionModel || DEFAULT_HF_TRANSCRIPTION_MODEL,
    deepgramKey = (profile as any).deepgramApiKey || getApiKeys(profile).deepgramKey,
    useLocalWhisper = profile.useLocalWhisper,
    localWhisperPath = profile.localWhisperPath,
    transcriptionProvider = profile.transcriptionProvider || 'auto',
    includeEmbedding = true,
    onProgress,
    maxRetries = 2,
    logId,
  } = opts;

  const fileInfo = await FileSystem.getInfoAsync(toFileUri(audioFilePath));
  if (!fileInfo?.exists || fileInfo.size === 0) {
    throw new Error(
      `Audio file is missing or empty: ${audioFilePath}. Check that recording started correctly.`,
    );
  }

  const audioSizeLabel = formatAudioSize(fileInfo.size ?? 0);

  onProgress?.({
    stage: 'transcribing',
    message: 'Preparing lecture transcription',
    detail: `Checking ${audioSizeLabel} recording and choosing the best provider`,
    percent: 6,
  });

  let transcript = '';
  const hasGroq = !!groqKey?.trim();
  const hasHuggingFace = !!huggingFaceToken?.trim();
  const hasDeepgram = !!deepgramKey?.trim();
  const hasLocalWhisper = !!(useLocalWhisper && localWhisperPath);
  const { cfAccountId, cfApiToken } = getApiKeys(profile);
  const hasCloudflare = !!(cfAccountId && cfApiToken);
  const providerAvailability = {
    groq: hasGroq,
    huggingface: hasHuggingFace,
    cloudflare: hasCloudflare,
    deepgram: hasDeepgram,
    local: hasLocalWhisper,
  } as const;
  const providerOrder = buildTranscriptionProviderOrder(
    transcriptionProvider,
    providerAvailability,
  );

  if (__DEV__) {
    console.log('[Transcription] Starting lecture transcription', {
      logId: logId ?? null,
      audioFilePath,
      audioSizeBytes: fileInfo.size ?? 0,
      audioSizeLabel,
      preferredProvider: transcriptionProvider,
      includeEmbedding,
      maxRetries,
    });
    console.log('[Transcription] Provider plan', {
      logId: logId ?? null,
      availability: providerAvailability,
      providerOrder,
    });
  }

  const { result, provider, lastError } = await runTranscriptionProviders<string>({
    preferredProvider: transcriptionProvider,
    availability: providerAvailability,
    isUsableResult: (value) => typeof value === 'string' && value.trim().length > 0,
    fallbackOnError: true,
    onProviderStart: (provider) => {
      if (__DEV__) {
        console.log('[Transcription] Provider starting', {
          logId: logId ?? null,
          provider,
          orderIndex: providerOrder.indexOf(provider) + 1,
          providerOrder,
        });
      }
      if (provider === 'groq') {
        onProgress?.({
          stage: 'transcribing',
          message: 'Transcribing with Groq Whisper',
          detail: `Primary provider selected for ${audioSizeLabel} audio`,
          provider,
          percent: 14,
        });
      } else if (provider === 'cloudflare') {
        onProgress?.({
          stage: 'transcribing',
          message: 'Transcribing with Cloudflare Whisper',
          detail: 'Groq was unavailable, so Guru switched providers',
          provider,
          percent: 14,
        });
      } else if (provider === 'huggingface') {
        onProgress?.({
          stage: 'transcribing',
          message: 'Transcribing with Hugging Face',
          detail: 'Trying the Hugging Face speech model as a fallback',
          provider,
          percent: 14,
        });
      } else if (provider === 'deepgram') {
        onProgress?.({
          stage: 'transcribing',
          message: 'Transcribing with Deepgram Nova-2',
          detail: 'Trying the Deepgram medical speech model',
          provider,
          percent: 14,
        });
      } else {
        onProgress?.({
          stage: 'transcribing',
          message: 'Using local transcription engine',
          detail: 'Running on-device Whisper for this recording',
          provider,
          percent: 14,
        });
      }
    },
    onProviderError: (provider, err) => {
      if (provider === 'groq') {
        if (__DEV__) {
          console.warn(`[Transcription] Groq failed after ${maxRetries} retries:`, err);
        }
      } else if (provider === 'cloudflare') {
        if (__DEV__) console.warn('[Transcription] Cloudflare failed:', err);
      } else if (provider === 'huggingface') {
        if (__DEV__) console.warn('[Transcription] Hugging Face failed:', err);
      } else if (provider === 'deepgram') {
        if (__DEV__) console.warn('[Transcription] Deepgram failed:', err);
      } else {
        if (__DEV__) console.warn('[Transcription] Local Whisper failed:', err);
      }
    },
    onProviderResult: (provider, value, usable) => {
      if (!__DEV__) return;
      const transcriptValue = typeof value === 'string' ? value : '';
      if (usable) {
        console.log('[Transcription] Provider transcript ready', {
          logId: logId ?? null,
          provider,
          transcriptChars: transcriptValue.length,
          preview: previewTranscript(transcriptValue, 220),
        });
      } else {
        console.log('[Transcription] Provider returned empty transcript', {
          logId: logId ?? null,
          provider,
          transcriptChars: transcriptValue.length,
        });
      }
    },
    runners: {
      groq: async () => {
        if (!groqKey?.trim()) return '';

        let attempt = 0;
        let providerError: unknown;
        const maxAttempts = maxRetries + 1;
        while (attempt <= maxRetries) {
          const attemptNumber = attempt + 1;
          onProgress?.({
            stage: 'transcribing',
            message:
              attemptNumber === 1
                ? 'Uploading recording to Groq Whisper'
                : `Retrying Groq Whisper (${attemptNumber}/${maxAttempts})`,
            detail: `Attempt ${attemptNumber} of ${maxAttempts} for ${audioSizeLabel} audio`,
            provider: 'groq',
            attempt: attemptNumber,
            maxAttempts,
            percent: attemptNumber === 1 ? 20 : 24,
          });
          try {
            if (process.env.NODE_ENV === 'test') {
              return await transcribeRawWithGroq(audioFilePath, groqKey);
            }
            const { transcribeWithGroqChunking } = await import('../lecture/transcription');
            const res = await transcribeWithGroqChunking(
              audioFilePath,
              groqKey,
              logId,
              (progress) =>
                onProgress?.({
                  stage: 'transcribing',
                  message: progress.message,
                  detail: progress.detail,
                  provider: 'groq',
                  attempt: attemptNumber,
                  maxAttempts,
                  step: progress.step,
                  totalSteps: progress.totalSteps,
                  percent: progress.percent,
                }),
            );
            return res.transcript;
          } catch (err) {
            providerError = err;
            attempt++;
            if (attempt > maxRetries) {
              throw providerError;
            }
            const delay = process.env.NODE_ENV === 'test' ? 10 : Math.pow(2, attempt) * 1000;
            onProgress?.({
              stage: 'transcribing',
              message: `Groq failed, retrying in ${Math.round(delay / 1000)}s`,
              detail: 'Guru will fall back to other providers if retries keep failing',
              provider: 'groq',
              attempt: attempt + 1,
              maxAttempts,
              percent: 24,
            });
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
        return '';
      },
      cloudflare: async () => {
        if (!cfAccountId || !cfApiToken) return '';
        return transcribeRawWithCloudflare(audioFilePath, cfAccountId, cfApiToken);
      },
      huggingface: async () => {
        if (!huggingFaceToken?.trim()) return '';
        return transcribeRawWithHuggingFace(audioFilePath, huggingFaceToken, huggingFaceModel);
      },
      deepgram: async () => {
        if (!deepgramKey?.trim()) return '';
        return transcribeRawWithDeepgram(audioFilePath, deepgramKey);
      },
      local: async () => {
        if (!(useLocalWhisper && localWhisperPath)) return '';
        return transcribeRawWithLocalWhisper(audioFilePath, localWhisperPath);
      },
    },
  });

  if (result) {
    transcript = result;
  }

  if (__DEV__ && transcript) {
    console.log('[Transcription] Transcript generated', {
      audioFilePath,
      provider: provider ?? 'unknown',
      transcriptChars: transcript.length,
      preview: previewTranscript(transcript),
    });
  }

  if (!transcript) {
    if (__DEV__) {
      console.log('[Transcription] No transcript text returned', {
        logId: logId ?? null,
        audioFilePath,
        providerOrder,
        lastError: lastError instanceof Error ? lastError.message : (lastError ?? null),
      });
    }
    if (!hasGroq && !hasHuggingFace && !hasCloudflare && !hasDeepgram && !hasLocalWhisper) {
      throw new Error(
        'No transcription engine available. Configure Groq, Cloudflare, Deepgram, or Hugging Face, or enable local Whisper in Settings.',
      );
    }
    if (lastError) {
      throw lastError;
    }
    // Transcript is empty but engines were available — likely silence or very short audio
    return {
      subject: 'Unknown',
      topics: [],
      keyConcepts: [],
      lectureSummary: 'No speech detected in recording (silent or very short audio)',
      estimatedConfidence: 1,
      transcript: '',
      highYieldPoints: [],
    };
  }

  if (__DEV__) {
    console.log('[Transcription] Starting lecture analysis', {
      logId: logId ?? null,
      transcriptChars: transcript.length,
      provider: provider ?? 'unknown',
    });
  }

  onProgress?.({
    stage: 'analyzing',
    message: 'Transcript ready, extracting lecture structure',
    detail: 'Finding subject, topics, and high-yield concepts',
    percent: 64,
  });
  const analysis = await analyzeTranscript(transcript, (progress) =>
    onProgress?.({
      stage: 'analyzing',
      message: progress.message,
      detail: progress.detail,
      step: progress.currentStep,
      totalSteps: progress.totalSteps,
      percent: mapAnalysisProgressToOverall(progress),
    }),
  );

  if (__DEV__) {
    console.log('[Transcription] Lecture analysis generated', {
      audioFilePath,
      subject: analysis.subject,
      topics: analysis.topics,
      keyConcepts: analysis.keyConcepts,
      summaryPreview: previewTranscript(analysis.lectureSummary, 240),
    });
  }

  let embedding: number[] | null | undefined;
  if (includeEmbedding && analysis.lectureSummary) {
    try {
      if (__DEV__) {
        console.log('[Transcription] Generating lecture embedding', {
          logId: logId ?? null,
          summaryChars: analysis.lectureSummary.length,
        });
      }
      onProgress?.({
        stage: 'analyzing',
        message: 'Finalizing lecture summary',
        detail: 'Generating a semantic embedding for later search and matching',
        percent: 92,
      });
      embedding = await generateEmbedding(analysis.lectureSummary);
    } catch (err) {
      embedding = null;
      if (__DEV__) console.warn('[Transcription] Embedding generation failed:', err);
    }
  } else if (__DEV__) {
    console.log('[Transcription] Embedding skipped', {
      logId: logId ?? null,
      includeEmbedding,
      hasSummary: !!analysis.lectureSummary,
    });
  }

  if (embedding) {
    return { ...analysis, transcript, embedding };
  } else {
    const { embedding: _, ...rest } = analysis;
    return { ...rest, transcript };
  }
}
