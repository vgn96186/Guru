/**
 * transcriptionService.ts — Facade for transcription and analysis engines.
 */
import { profileRepository } from '../db/repositories';
import * as FileSystem from 'expo-file-system/legacy';
import { getApiKeys } from './aiService';
import { transcribeRawWithGroq, transcribeRawWithLocalWhisper } from './transcription/engines';
import { analyzeTranscript, type LectureAnalysis } from './transcription/analysis';
import { generateADHDNote, buildQuickLectureNote } from './transcription/noteGeneration';
import { markTopicsFromLecture } from './transcription/matching';
import { generateEmbedding } from './ai/embeddingService';

export type { LectureAnalysis };
export { generateADHDNote, buildQuickLectureNote, analyzeTranscript, markTopicsFromLecture };

/**
 * Unified transcription entry point — Groq first, local Whisper fallback.
 * Includes retry logic and analysis.
 */
export async function transcribeAudio(opts: {
  audioFilePath: string;
  groqKey?: string;
  useLocalWhisper?: boolean;
  localWhisperPath?: string;
  maxRetries?: number;
  logId?: number;
  onProgress?: (progress: { stage: 'transcribing' | 'analyzing'; message: string }) => void;
}): Promise<LectureAnalysis & { embedding?: number[] }> {
  const profile = await profileRepository.getProfile();
  const {
    audioFilePath,
    groqKey = getApiKeys(profile).groqKey,
    useLocalWhisper = profile.useLocalWhisper,
    localWhisperPath = profile.localWhisperPath,
    onProgress,
    maxRetries = 2,
    logId,
  } = opts;

  const fileInfo = await FileSystem.getInfoAsync(
    audioFilePath.startsWith('file://') ? audioFilePath : `file://${audioFilePath}`,
  );
  if (!fileInfo.exists || fileInfo.size === 0) {
    if (__DEV__) console.warn('[Transcription] File does not exist or is empty:', audioFilePath);
    return {
      subject: 'Unknown',
      topics: [],
      keyConcepts: [],
      lectureSummary: 'No audio recorded (empty file)',
      estimatedConfidence: 1,
      transcript: '',
      highYieldPoints: [],
    };
  }

  onProgress?.({ stage: 'transcribing', message: 'Transcribing lecture audio' });

  let transcript = '';
  if (groqKey?.trim()) {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        if (process.env.NODE_ENV === 'test') {
          transcript = await transcribeRawWithGroq(audioFilePath, groqKey);
        } else {
          // Use chunking-enabled transcription for large files
          const { transcribeWithGroqChunking } = await import('./lecture/transcription');
          const res = await transcribeWithGroqChunking(audioFilePath, groqKey, logId);
          transcript = res.transcript;
        }
        if (transcript) break;
      } catch (err) {
        attempt++;
        if (attempt > maxRetries) {
          if (__DEV__)
            console.warn(`[Transcription] Groq failed after ${maxRetries} retries:`, err);
          if (!useLocalWhisper || !localWhisperPath) throw err;
        } else {
          const delay = process.env.NODE_ENV === 'test' ? 10 : Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  if (!transcript && useLocalWhisper && localWhisperPath) {
    onProgress?.({ stage: 'transcribing', message: 'Using local transcription engine...' });
    try {
      transcript = await transcribeRawWithLocalWhisper(audioFilePath, localWhisperPath);
    } catch (err) {
      if (__DEV__) console.warn('[Transcription] Local Whisper failed:', err);
      if (!transcript) throw err;
    }
  }

  if (!transcript) {
    if (!groqKey?.trim() && (!useLocalWhisper || !localWhisperPath)) {
      throw new Error('No transcription engine available');
    }
    return {
      subject: 'Unknown',
      topics: [],
      keyConcepts: [],
      lectureSummary: 'No speech detected (silent audio)',
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
