import * as FileSystem from 'expo-file-system/legacy';

const TRANSCRIPT_DIR = FileSystem.documentDirectory + 'transcripts/';
const RECOVERY_DIR = FileSystem.documentDirectory + 'recovery/';

export async function moveFileToRecovery(fileUri: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(RECOVERY_DIR, { intermediates: true });
  const fileName = 'recovery_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9) + '.m4a';
  const targetUri = RECOVERY_DIR + fileName;
  try {
    await FileSystem.copyAsync({ from: fileUri, to: targetUri });
    return targetUri;
  } catch (err) {
    console.warn('[TranscriptStorage] Failed to move file to recovery:', err);
    return fileUri;
  }
}

export async function saveTranscriptToFile(transcriptText: string): Promise<string> {
  const normalized = transcriptText.trim();
  if (!normalized) return '';
  if (normalized.startsWith('file://')) return normalized;

  await FileSystem.makeDirectoryAsync(TRANSCRIPT_DIR, { intermediates: true });
  const fileName =
    'transcript_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9) + '.txt';
  const fileUri = TRANSCRIPT_DIR + fileName;

  await FileSystem.writeAsStringAsync(fileUri, normalized, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  // Ensure loadTranscriptFromFile can recognize this as a file URI
  return fileUri.startsWith('file://') ? fileUri : 'file://' + fileUri;
}

export async function loadTranscriptFromFile(
  transcriptUriOrText: string | null,
): Promise<string | null> {
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

/**
 * Resolves transcript column value (file URI or raw text) to actual transcript text.
 * Use when re-analyzing or enhancing notes so the LLM always receives text, not a path.
 */
export async function getTranscriptText(uriOrText: string | null): Promise<string | null> {
  if (uriOrText == null || uriOrText.trim() === '') return null;
  return loadTranscriptFromFile(uriOrText);
}
