import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { profileRepository } from '../db/repositories';
import { generateSecureRandomString } from './cryptoUtils';

const TRANSCRIPT_DIR = FileSystem.documentDirectory + 'transcripts/';
const RECOVERY_DIR = FileSystem.documentDirectory + 'recovery/';

// Persistent storage that survives reinstall on Android
// Points to /sdcard/Documents/Guru/
const PUBLIC_ROOT =
  Platform.OS === 'android'
    ? 'file:///sdcard/Documents/Guru/'
    : FileSystem.documentDirectory + 'backups/';
const PUBLIC_TRANSCRIPT_DIR = PUBLIC_ROOT + 'Transcripts/';
const PUBLIC_NOTES_DIR = PUBLIC_ROOT + 'Notes/';

export async function backupNoteToPublic(noteId: number, subject: string, noteText: string) {
  try {
    const profile = await profileRepository.getProfile();
    const safeSubject = subject.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `note_${safeSubject}_${noteId}_${Date.now()}.txt`;

    // 1. Cloud/SAF Backup
    if (Platform.OS === 'android' && profile.backupDirectoryUri) {
      try {
        const { StorageAccessFramework } = FileSystem;
        const backupUri = await StorageAccessFramework.createFileAsync(
          profile.backupDirectoryUri,
          fileName,
          'text/plain',
        );
        await FileSystem.writeAsStringAsync(backupUri, noteText, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        console.log('[TranscriptStorage] Note cloud backup saved:', fileName);
      } catch (safErr) {
        console.warn('[TranscriptStorage] Note cloud backup failed:', safErr);
      }
    }

    // 2. Local Public Backup
    const dirInfo = await FileSystem.getInfoAsync(PUBLIC_NOTES_DIR);
    if (!dirInfo || !dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(PUBLIC_NOTES_DIR, { intermediates: true });
    }
    await FileSystem.writeAsStringAsync(PUBLIC_NOTES_DIR + fileName, noteText, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    console.log('[TranscriptStorage] Note local backup saved:', fileName);
  } catch (e) {
    console.warn('[TranscriptStorage] Note backup failed:', e);
  }
}

export async function moveFileToRecovery(fileUri: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(RECOVERY_DIR, { intermediates: true });
  const fileName = 'recovery_' + Date.now() + '_' + generateSecureRandomString(7) + '.m4a';
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

  const profile = await profileRepository.getProfile();
  await FileSystem.makeDirectoryAsync(TRANSCRIPT_DIR, { intermediates: true });
  const fileName =
    'transcript_' + Date.now() + '_' + generateSecureRandomString(7) + '.txt';
  const fileUri = TRANSCRIPT_DIR + fileName;

  await FileSystem.writeAsStringAsync(fileUri, normalized, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  // CRITICAL: AUTO-BACKUP to Public/Cloud Storage
  if (!profile) return fileUri.startsWith('file://') ? fileUri : 'file://' + fileUri;

  // 1. Cloud/SAF Backup
  if (Platform.OS === 'android' && profile.backupDirectoryUri) {
    try {
      const { StorageAccessFramework } = FileSystem;
      const backupUri = await StorageAccessFramework.createFileAsync(
        profile.backupDirectoryUri,
        fileName,
        'text/plain',
      );
      await FileSystem.writeAsStringAsync(backupUri, normalized, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      console.log('[TranscriptStorage] Transcript cloud backup saved:', fileName);
    } catch (safErr) {
      console.warn('[TranscriptStorage] Transcript cloud backup failed:', safErr);
    }
  }

  // 2. Local Public Backup
  try {
    const publicExists = await FileSystem.getInfoAsync(PUBLIC_TRANSCRIPT_DIR);
    if (!publicExists || !publicExists.exists) {
      await FileSystem.makeDirectoryAsync(PUBLIC_TRANSCRIPT_DIR, { intermediates: true });
    }
    await FileSystem.copyAsync({ from: fileUri, to: PUBLIC_TRANSCRIPT_DIR + fileName });
    console.log('[TranscriptStorage] Public local backup saved:', PUBLIC_TRANSCRIPT_DIR + fileName);
  } catch (e) {
    console.warn('[TranscriptStorage] Public local backup failed:', e);
  }

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
    // FAILED — it might be a stale absolute path from a previous app version/install
    // Extract filename and try to find it in current TRANSCRIPT_DIR
    const parts = transcriptUriOrText.split('/');
    const fileName = parts[parts.length - 1];
    const currentUri = TRANSCRIPT_DIR + fileName;

    if (currentUri === transcriptUriOrText) {
      // It's already the current path, so it really is missing
      console.warn('[TranscriptStorage] Failed to read transcript file (not found):', err);
      return 'Transcript file could not be loaded.';
    }

    try {
      const content = await FileSystem.readAsStringAsync(currentUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      console.log(
        '[TranscriptStorage] Successfully recovered transcript from new path:',
        currentUri,
      );
      return content;
    } catch (err2) {
      console.warn(
        '[TranscriptStorage] Failed to read transcript file from both old and new paths:',
        err,
        err2,
      );
      return 'Transcript file could not be loaded.';
    }
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
