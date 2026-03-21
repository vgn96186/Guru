import * as FileSystemLegacy from 'expo-file-system/legacy';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  getLectureNoteById,
  updateLectureAnalysisMetadata,
  updateLectureRecordingPath,
  updateLectureTranscriptArtifacts,
  updateLectureTranscriptNote,
  type LectureHistoryItem,
} from '../db/queries/aiCache';
import { getSubjectByName } from '../db/queries/topics';
import { analyzeTranscript, generateADHDNote, transcribeAudio } from './transcriptionService';
import { getTranscriptText, saveTranscriptToFile } from './transcriptStorage';
import { toFileUri } from './fileUri';

export type LectureManagerFilter = 'all' | 'recording' | 'transcript' | 'needs_ai' | 'needs_review';

function hasStructuredAiNote(note: string | null | undefined): boolean {
  const trimmed = note?.trim() ?? '';
  return trimmed.startsWith('🎯 **Subject**') && trimmed.includes('📝 **Integrated Summary**');
}

export function lectureNeedsAiNote(item: Pick<LectureHistoryItem, 'note' | 'transcript'>): boolean {
  const hasTranscript = !!item.transcript?.trim();
  if (!hasTranscript) return false;
  return !hasStructuredAiNote(item.note);
}

export function lectureNeedsReview(
  item: Pick<LectureHistoryItem, 'summary' | 'confidence' | 'subjectName' | 'topics'>,
): boolean {
  if (!item.summary?.trim()) return true;
  if ((item.confidence ?? 0) <= 1) return true;
  if (!item.subjectName?.trim()) return true;
  return (item.topics?.length ?? 0) === 0;
}

export function filterLectureHistoryItems(
  items: LectureHistoryItem[],
  filter: LectureManagerFilter,
): LectureHistoryItem[] {
  switch (filter) {
    case 'recording':
      return items.filter((item) => !!item.recordingPath);
    case 'transcript':
      return items.filter((item) => !!item.transcript);
    case 'needs_ai':
      return items.filter((item) => lectureNeedsAiNote(item));
    case 'needs_review':
      return items.filter((item) => lectureNeedsReview(item));
    case 'all':
    default:
      return items;
  }
}

export async function regenerateLectureNoteFromTranscript(
  noteId: number,
): Promise<LectureHistoryItem> {
  const note = await getLectureNoteById(noteId);
  if (!note) {
    throw new Error('Lecture note could not be found.');
  }

  const transcriptText = await getTranscriptText(note.transcript);
  if (!transcriptText?.trim()) {
    throw new Error('This lecture does not have a usable transcript to analyze.');
  }

  const analysis = await analyzeTranscript(transcriptText);
  const normalizedAnalysis = { ...analysis, transcript: transcriptText };
  const generatedNote = await generateADHDNote(normalizedAnalysis);
  const matchedSubject = await getSubjectByName(analysis.subject);

  await updateLectureTranscriptNote(noteId, generatedNote);
  await updateLectureAnalysisMetadata(noteId, {
    subjectId: matchedSubject?.id ?? note.subjectId,
    summary: analysis.lectureSummary,
    topics: analysis.topics,
    confidence: analysis.estimatedConfidence,
  });

  const updated = await getLectureNoteById(noteId);
  if (!updated) {
    throw new Error('Lecture note could not be reloaded after regeneration.');
  }
  return updated;
}

export async function transcribeLectureRecordingToNote(
  noteId: number,
): Promise<LectureHistoryItem> {
  const note = await getLectureNoteById(noteId);
  if (!note) {
    throw new Error('Lecture note could not be found.');
  }
  if (!note.recordingPath?.trim()) {
    throw new Error('This lecture does not have a saved recording to transcribe.');
  }

  const analysis = await transcribeAudio({ audioFilePath: note.recordingPath });
  if (!analysis.transcript?.trim()) {
    throw new Error('No speech was detected in this recording.');
  }

  const generatedNote = await generateADHDNote(analysis);
  const matchedSubject = await getSubjectByName(analysis.subject);
  const transcriptUri = await saveTranscriptToFile(analysis.transcript, {
    subjectName: analysis.subject,
    topics: analysis.topics,
  });

  await updateLectureTranscriptArtifacts(noteId, {
    note: generatedNote,
    transcript: transcriptUri ?? analysis.transcript,
    subjectId: matchedSubject?.id ?? note.subjectId,
    summary: analysis.lectureSummary,
    topics: analysis.topics,
    confidence: analysis.estimatedConfidence,
  });

  const updated = await getLectureNoteById(noteId);
  if (!updated) {
    throw new Error('Lecture note could not be reloaded after transcription.');
  }
  return updated;
}

export async function removeLectureRecording(
  noteId: number,
  recordingPath?: string | null,
): Promise<void> {
  if (recordingPath?.trim()) {
    try {
      await FileSystemLegacy.deleteAsync(toFileUri(recordingPath), { idempotent: true });
    } catch (err) {
      console.warn('[LectureManager] Failed to delete recording file:', err);
    }
  }
  await updateLectureRecordingPath(noteId, null);
}

export async function copyLectureTranscript(transcriptUriOrText: string | null): Promise<boolean> {
  const transcriptText = await getTranscriptText(transcriptUriOrText);
  if (!transcriptText?.trim()) {
    return false;
  }
  Clipboard.setString(transcriptText);
  return true;
}
