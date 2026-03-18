/**
 * transcriptionService.ts — Facade for transcription and analysis engines.
 */
import { profileRepository } from '../db/repositories';
import * as FileSystem from 'expo-file-system/legacy';
import { getApiKeys } from './aiService';
import {
  transcribeRawWithGroq,
  transcribeRawWithHuggingFace,
  transcribeRawWithLocalWhisper,
} from './transcription/engines';
import { analyzeTranscript, type LectureAnalysis } from './transcription/analysis';
import {
  generateADHDNote,
  buildQuickLectureNote,
  shouldReplaceLectureNote,
} from './transcription/noteGeneration';
import { markTopicsFromLecture } from './transcription/matching';
import { generateEmbedding } from './ai/embeddingService';
import { BUNDLED_HF_TOKEN, DEFAULT_HF_TRANSCRIPTION_MODEL } from '../config/appConfig';
import type { UserProfile } from '../types';

export type { LectureAnalysis };
export {
  generateADHDNote,
  buildQuickLectureNote,
  shouldReplaceLectureNote,
  analyzeTranscript,
  markTopicsFromLecture,
};

type TranscriptionProvider = NonNullable<UserProfile['transcriptionProvider']>;

function buildProviderOrder(
  preferredProvider: TranscriptionProvider,
  hasGroq: boolean,
  hasHuggingFace: boolean,
  hasLocalWhisper: boolean,
): TranscriptionProvider[] {
  const orderedProviders: TranscriptionProvider[] =
    preferredProvider === 'groq'
      ? ['groq', 'huggingface', 'local']
      : preferredProvider === 'huggingface'
        ? ['huggingface', 'groq', 'local']
        : preferredProvider === 'local'
          ? ['local', 'groq', 'huggingface']
          : ['groq', 'huggingface', 'local'];

  return orderedProviders.filter((provider, index) => {
    if (
      (provider === 'groq' && !hasGroq) ||
      (provider === 'huggingface' && !hasHuggingFace) ||
      (provider === 'local' && !hasLocalWhisper)
    ) {
      return false;
    }
    return orderedProviders.indexOf(provider) === index;
  });
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
  useLocalWhisper?: boolean;
  localWhisperPath?: string;
  transcriptionProvider?: TranscriptionProvider;
  maxRetries?: number;
  logId?: number;
  onProgress?: (progress: { stage: 'transcribing' | 'analyzing'; message: string }) => void;
}): Promise<LectureAnalysis & { embedding?: number[] }> {
  const profile = await profileRepository.getProfile();
  const {
    audioFilePath,
    groqKey = getApiKeys(profile).groqKey,
    huggingFaceToken = profile.huggingFaceToken || BUNDLED_HF_TOKEN,
    huggingFaceModel = profile.huggingFaceTranscriptionModel || DEFAULT_HF_TRANSCRIPTION_MODEL,
    useLocalWhisper = profile.useLocalWhisper,
    localWhisperPath = profile.localWhisperPath,
    transcriptionProvider = profile.transcriptionProvider || 'auto',
    onProgress,
    maxRetries = 2,
    logId,
  } = opts;

  const fileInfo = await FileSystem.getInfoAsync(
    audioFilePath.startsWith('file://') ? audioFilePath : `file://${audioFilePath}`,
  );
  if (!fileInfo?.exists || fileInfo.size === 0) {
    throw new Error(
      `Audio file is missing or empty: ${audioFilePath}. Check that recording started correctly.`,
    );
  }

  onProgress?.({ stage: 'transcribing', message: 'Transcribing lecture audio' });

  let transcript = '';
  const hasGroq = !!groqKey?.trim();
  const hasHuggingFace = !!huggingFaceToken?.trim();
  const hasLocalWhisper = !!(useLocalWhisper && localWhisperPath);
  const providerOrder = buildProviderOrder(
    transcriptionProvider,
    hasGroq,
    hasHuggingFace,
    hasLocalWhisper,
  );
  let lastError: unknown;

  for (const provider of providerOrder) {
    if (transcript) break;

    if (provider === 'groq' && groqKey?.trim()) {
      let attempt = 0;
      while (attempt <= maxRetries) {
        try {
          onProgress?.({ stage: 'transcribing', message: 'Transcribing with Groq Whisper' });
          if (process.env.NODE_ENV === 'test') {
            transcript = await transcribeRawWithGroq(audioFilePath, groqKey);
          } else {
            const { transcribeWithGroqChunking } = await import('./lecture/transcription');
            const res = await transcribeWithGroqChunking(audioFilePath, groqKey, logId);
            transcript = res.transcript;
          }
          if (transcript) break;
        } catch (err) {
          lastError = err;
          attempt++;
          if (attempt > maxRetries) {
            if (__DEV__) {
              console.warn(`[Transcription] Groq failed after ${maxRetries} retries:`, err);
            }
          } else {
            const delay = process.env.NODE_ENV === 'test' ? 10 : Math.pow(2, attempt) * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
    }

    if (!transcript && provider === 'huggingface' && huggingFaceToken?.trim()) {
      onProgress?.({ stage: 'transcribing', message: 'Transcribing with Hugging Face' });
      try {
        transcript = await transcribeRawWithHuggingFace(
          audioFilePath,
          huggingFaceToken,
          huggingFaceModel,
        );
      } catch (err) {
        lastError = err;
        if (__DEV__) console.warn('[Transcription] Hugging Face failed:', err);
      }
    }

    if (!transcript && provider === 'local' && useLocalWhisper && localWhisperPath) {
      onProgress?.({ stage: 'transcribing', message: 'Using local transcription engine...' });
      try {
        transcript = await transcribeRawWithLocalWhisper(audioFilePath, localWhisperPath);
      } catch (err) {
        lastError = err;
        if (__DEV__) console.warn('[Transcription] Local Whisper failed:', err);
      }
    }
  }

  if (!transcript) {
    if (!hasGroq && !hasHuggingFace && !hasLocalWhisper) {
      throw new Error(
        'No transcription engine available. Configure Groq or Hugging Face, or enable local Whisper in Settings.',
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

  onProgress?.({ stage: 'analyzing', message: 'Analyzing transcript with Guru' });
  const analysis = await analyzeTranscript(transcript);

  let embedding: number[] | null | undefined;
  if (analysis.lectureSummary) {
    try {
      embedding = await generateEmbedding(analysis.lectureSummary);
    } catch (err) {
      embedding = null;
      if (__DEV__) console.warn('[Transcription] Embedding generation failed:', err);
    }
  }

  if (embedding) {
    return { ...analysis, transcript, embedding };
  } else {
    const { embedding: _, ...rest } = analysis;
    return { ...rest, transcript };
  }
}
