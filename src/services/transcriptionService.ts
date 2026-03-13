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
import { getDb } from '../db/database';

export type { LectureAnalysis };
export { generateADHDNote, buildQuickLectureNote, analyzeTranscript, markTopicsFromLecture };

/**
 * Unified transcription entry point — Groq first, local Whisper fallback.
 */
export async function transcribeAudio(
  audioFilePath: string,
): Promise<LectureAnalysis & { embedding?: number[] }> {
  const profile = await profileRepository.getProfile();
  const { groqKey } = getApiKeys(profile);
  const hasGroq = !!groqKey?.trim();
  const hasLocal = !!(profile.useLocalWhisper && profile.localWhisperPath);

  if (!hasGroq && !hasLocal) {
    throw new Error(
      'No transcription engine available. Enable Local Whisper or add a Groq API key in Settings.',
    );
  }

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

  let transcript = '';
  if (hasGroq) {
    try {
      transcript = await transcribeRawWithGroq(audioFilePath, groqKey!);
    } catch (err) {
      if (__DEV__) console.warn('[Transcription] Groq failed:', err);
      if (!hasLocal) throw err;
    }
  }

  if (!transcript && hasLocal) {
    try {
      transcript = await transcribeRawWithLocalWhisper(audioFilePath, profile.localWhisperPath!);
    } catch (err) {
      if (__DEV__) console.warn('[Transcription] Local Whisper failed:', err);
      if (!transcript) throw err;
    }
  }

  if (!transcript) {
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

  try {
    await markTopicsFromLecture(
      getDb(),
      analysis.topics,
      analysis.estimatedConfidence,
      analysis.subject,
      analysis.lectureSummary,
      embedding ?? null,
    );
  } catch (err) {
    if (__DEV__) console.warn('[Transcription] Topic matching failed:', err);
  }

  return embedding ? { ...analysis, transcript, embedding } : { ...analysis, transcript };
}
