import * as FileSystemLegacy from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { profileRepository } from '../db/repositories';
import { generateSecureRandomString } from './cryptoUtils';
import { buildLectureArtifactFileName } from './lectureIdentity';
import { copyFileToPublicBackup } from '../../modules/app-launcher';

const TRANSCRIPT_DIR = FileSystemLegacy.documentDirectory + 'transcripts/';
const RECOVERY_DIR = FileSystemLegacy.documentDirectory + 'recovery/';
const BACKUP_ROOT = FileSystemLegacy.documentDirectory + 'backups/';
const PUBLIC_TRANSCRIPT_DIR = BACKUP_ROOT + 'Transcripts/';
const PUBLIC_NOTES_DIR = BACKUP_ROOT + 'Notes/';

// Durable external backups on Android should go through SAF when configured.
// The local fallback stays inside app-controlled storage instead of hardcoding /sdcard paths.

export interface LectureStorageIdentity {
  subjectName?: string | null;
  topics?: string[] | null;
}

function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

function fromFileUri(path: string, preserveRawPath: boolean): string {
  return preserveRawPath ? path.replace(/^file:\/\//, '') : path;
}

export async function backupNoteToPublic(
  noteId: number,
  identity: LectureStorageIdentity,
  noteText: string,
) {
  try {
    const profile = await profileRepository.getProfile();
    const fileName = buildLectureArtifactFileName('note', identity, Date.now(), '.txt');

    // 1. Cloud/SAF Backup
    if (Platform.OS === 'android' && profile.backupDirectoryUri) {
      try {
        const { StorageAccessFramework } = FileSystemLegacy;
        const backupUri = await StorageAccessFramework.createFileAsync(
          profile.backupDirectoryUri,
          fileName,
          'text/plain',
        );
        await FileSystemLegacy.writeAsStringAsync(backupUri, noteText, {
          encoding: FileSystemLegacy.EncodingType.UTF8,
        });
        if (__DEV__) console.log('[TranscriptStorage] Note cloud backup saved:', fileName);
      } catch (safErr) {
        console.warn('[TranscriptStorage] Note cloud backup failed:', safErr);
      }
    }

    // 2. Local Public Backup
    const dirInfo = await FileSystemLegacy.getInfoAsync(PUBLIC_NOTES_DIR);
    if (!dirInfo?.exists) {
      await FileSystemLegacy.makeDirectoryAsync(PUBLIC_NOTES_DIR, { intermediates: true });
    }
    const localUri = PUBLIC_NOTES_DIR + fileName;
    await FileSystemLegacy.writeAsStringAsync(localUri, noteText, {
      encoding: FileSystemLegacy.EncodingType.UTF8,
    });
    await copyFileToPublicBackup(localUri.replace('file://', ''), fileName);
    if (__DEV__) console.log('[TranscriptStorage] Note native backup saved:', fileName);
  } catch (e) {
    console.warn('[TranscriptStorage] Note backup failed:', e);
  }
}

export async function moveFileToRecovery(fileUri: string): Promise<string> {
  await FileSystemLegacy.makeDirectoryAsync(RECOVERY_DIR, { intermediates: true });
  const fileName = 'recovery_' + Date.now() + '_' + generateSecureRandomString(7) + '.m4a';
  const targetUri = RECOVERY_DIR + fileName;
  try {
    await FileSystemLegacy.copyAsync({ from: fileUri, to: targetUri });
    return targetUri;
  } catch (err) {
    console.warn('[TranscriptStorage] Failed to move file to recovery:', err);
    return fileUri;
  }
}

export async function saveTranscriptToFile(
  transcriptText: string,
  identity?: LectureStorageIdentity,
): Promise<string | null> {
  const normalized = transcriptText.trim();
  if (!normalized) return null;
  if (normalized.startsWith('file://')) return normalized;

  const profile = await profileRepository.getProfile();
  await FileSystemLegacy.makeDirectoryAsync(TRANSCRIPT_DIR, { intermediates: true });
  const fileName = buildLectureArtifactFileName('transcript', identity ?? {}, Date.now(), '.txt');
  const fileUri = TRANSCRIPT_DIR + fileName;

  await FileSystemLegacy.writeAsStringAsync(fileUri, normalized, {
    encoding: FileSystemLegacy.EncodingType.UTF8,
  });

  // CRITICAL: AUTO-BACKUP to Public/Cloud Storage
  if (!profile) return fileUri.startsWith('file://') ? fileUri : 'file://' + fileUri;

  // 1. Cloud/SAF Backup
  if (Platform.OS === 'android' && profile.backupDirectoryUri) {
    try {
      const { StorageAccessFramework } = FileSystemLegacy;
      const backupUri = await StorageAccessFramework.createFileAsync(
        profile.backupDirectoryUri,
        fileName,
        'text/plain',
      );
      await FileSystemLegacy.writeAsStringAsync(backupUri, normalized, {
        encoding: FileSystemLegacy.EncodingType.UTF8,
      });
      if (__DEV__) console.log('[TranscriptStorage] Transcript cloud backup saved:', fileName);
    } catch (safErr) {
      console.warn('[TranscriptStorage] Transcript cloud backup failed:', safErr);
    }
  }

  // 2. Local Public Backup (Native)
  try {
    await copyFileToPublicBackup(fileUri.replace('file://', ''), fileName);
    if (__DEV__) console.log('[TranscriptStorage] Native public backup saved:', fileName);
  } catch (e) {
    console.warn('[TranscriptStorage] Native public backup failed:', e);
  }
  // Ensure loadTranscriptFromFile can recognize this as a file URI
  return fileUri.startsWith('file://') ? fileUri : 'file://' + fileUri;
}

export async function renameRecordingToLectureIdentity(
  recordingPath: string,
  identity: LectureStorageIdentity,
): Promise<string> {
  if (!recordingPath) return recordingPath;

  const preserveRawPath = !recordingPath.startsWith('file://');
  const sourceUri = toFileUri(recordingPath);
  const sourceInfo = await FileSystemLegacy.getInfoAsync(sourceUri);
  if (!sourceInfo.exists) return recordingPath;

  const extensionMatch = sourceUri.match(/\.[a-z0-9]+$/i);
  const extension = extensionMatch?.[0] ?? '.m4a';
  const targetUri = sourceUri.replace(
    /[^/]+$/,
    buildLectureArtifactFileName('recording', identity, Date.now(), extension),
  );

  if (targetUri === sourceUri) return recordingPath;

  try {
    await FileSystemLegacy.moveAsync({ from: sourceUri, to: targetUri });
    return fromFileUri(targetUri, preserveRawPath);
  } catch (err) {
    console.warn('[TranscriptStorage] Recording rename failed:', err);
    return recordingPath;
  }
}

export async function loadTranscriptFromFile(
  transcriptUriOrText: string | null,
): Promise<string | null> {
  if (!transcriptUriOrText) return null;
  if (!transcriptUriOrText.startsWith('file://')) return transcriptUriOrText;

  try {
    const content = await FileSystemLegacy.readAsStringAsync(transcriptUriOrText, {
      encoding: FileSystemLegacy.EncodingType.UTF8,
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
      const content = await FileSystemLegacy.readAsStringAsync(currentUri, {
        encoding: FileSystemLegacy.EncodingType.UTF8,
      });
      if (__DEV__)
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
