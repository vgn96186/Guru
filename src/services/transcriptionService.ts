/**
 * transcriptionService.ts — Facade for transcription and analysis engines.
 */
import { profileRepository } from '../db/repositories';
import * as FileSystem from 'expo-file-system/legacy';
import { getApiKeys } from './aiService';
import { toFileUri } from './fileUri';
import {
  transcribeRawWithGroq,
  transcribeRawWithHuggingFace,
  transcribeRawWithLocalWhisper,
} from './transcription/engines';
import {
  runTranscriptionProviders,
  type TranscriptionProvider,
} from './transcription/providerFallback';
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

  const fileInfo = await FileSystem.getInfoAsync(toFileUri(audioFilePath));
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
  const { result, lastError } = await runTranscriptionProviders<string>({
    preferredProvider: transcriptionProvider,
    availability: {
      groq: hasGroq,
      huggingface: hasHuggingFace,
      local: hasLocalWhisper,
    },
    isUsableResult: (value) => value.trim().length > 0,
    fallbackOnError: true,
    onProviderStart: (provider) => {
      if (provider === 'groq') {
        onProgress?.({ stage: 'transcribing', message: 'Transcribing with Groq Whisper' });
      } else if (provider === 'huggingface') {
        onProgress?.({ stage: 'transcribing', message: 'Transcribing with Hugging Face' });
      } else {
        onProgress?.({ stage: 'transcribing', message: 'Using local transcription engine...' });
      }
    },
    onProviderError: (provider, err) => {
      if (provider === 'groq') {
        if (__DEV__) {
          console.warn(`[Transcription] Groq failed after ${maxRetries} retries:`, err);
        }
      } else if (provider === 'huggingface') {
        if (__DEV__) console.warn('[Transcription] Hugging Face failed:', err);
      } else {
        if (__DEV__) console.warn('[Transcription] Local Whisper failed:', err);
      }
    },
    runners: {
      groq: async () => {
        if (!groqKey?.trim()) return '';

        let attempt = 0;
        let providerError: unknown;
        while (attempt <= maxRetries) {
          try {
            if (process.env.NODE_ENV === 'test') {
              return await transcribeRawWithGroq(audioFilePath, groqKey);
            }
            const { transcribeWithGroqChunking } = await import('./lecture/transcription');
            const res = await transcribeWithGroqChunking(audioFilePath, groqKey, logId);
            return res.transcript;
          } catch (err) {
            providerError = err;
            attempt++;
            if (attempt > maxRetries) {
              throw providerError;
            }
            const delay = process.env.NODE_ENV === 'test' ? 10 : Math.pow(2, attempt) * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
        return '';
      },
      huggingface: async () => {
        if (!huggingFaceToken?.trim()) return '';
        return transcribeRawWithHuggingFace(audioFilePath, huggingFaceToken, huggingFaceModel);
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
