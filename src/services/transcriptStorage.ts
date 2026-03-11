
import * as FileSystem from 'expo-file-system/legacy';

const TRANSCRIPT_DIR = FileSystem.documentDirectory + 'transcripts/';

export async function saveTranscriptToFile(transcriptText: string): Promise<string> {
  if (!transcriptText) return '';
  if (transcriptText.startsWith('file://')) return transcriptText;
  
  await FileSystem.makeDirectoryAsync(TRANSCRIPT_DIR, { intermediates: true });
  const fileName = 'transcript_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9) + '.txt';
  const fileUri = TRANSCRIPT_DIR + fileName;
  
  await FileSystem.writeAsStringAsync(fileUri, transcriptText, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return fileUri;
}

export async function loadTranscriptFromFile(transcriptUriOrText: string | null): Promise<string | null> {
  if (!transcriptUriOrText) return null;
  if (!transcriptUriOrText.startsWith('file://')) return transcriptUriOrText;
  
  try {
    const content = await FileSystem.readAsStringAsync(transcriptUriOrText, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return content;
  } catch (err) {
    console.warn('[TranscriptStorage] Failed to read transcript file:', err);
    return 'Transcript file could not be loaded.';
  }
}
