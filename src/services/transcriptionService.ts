/**
 * transcriptionService.ts — Facade for transcription and analysis engines.
 */
import { profileRepository } from '../db/repositories';
import { getApiKeys } from './aiService';
import { transcribeRawWithGroq, transcribeRawWithLocalWhisper } from './transcription/engines';
import { analyzeTranscript, type LectureAnalysis } from './transcription/analysis';
import { generateADHDNote, buildQuickLectureNote } from './transcription/noteGeneration';
import { markTopicsFromLecture } from './transcription/matching';

export type { LectureAnalysis };
export { generateADHDNote, buildQuickLectureNote, analyzeTranscript, markTopicsFromLecture };

/**
 * Unified transcription entry point — Groq first, local Whisper fallback.
 */
export async function transcribeAudio(audioFilePath: string): Promise<LectureAnalysis> {
  const profile = await profileRepository.getProfile();
  const { groqKey } = getApiKeys(profile);
  const hasGroq = !!groqKey?.trim();
  const hasLocal = !!(profile.useLocalWhisper && profile.localWhisperPath);

  if (!hasGroq && !hasLocal) {
    throw new Error('No transcription engine available. Enable Local Whisper or add a Groq API key in Settings.');
  }

  let transcript = '';
  if (hasGroq) {
    try {
      transcript = await transcribeRawWithGroq(audioFilePath, groqKey!);
    } catch (err) {
      if (!hasLocal) throw err;
    }
  }

  if (!transcript && hasLocal) {
    transcript = await transcribeRawWithLocalWhisper(audioFilePath, profile.localWhisperPath!);
  }

  if (!transcript) {
    return {
      subject: 'Unknown',
      topics: [],
      keyConcepts: [],
      lectureSummary: 'No speech detected',
      estimatedConfidence: 1,
      transcript: '',
    };
  }

  const analysis = await analyzeTranscript(transcript);
  return { ...analysis, transcript };
}
