import * as FileSystem from 'expo-file-system/legacy';
import { convertToWav, splitWavIntoChunks } from '../../../modules/app-launcher';
import { transcribeRawWithGroq } from '../transcription/engines';
import { toFileUri } from '../fileUri';
import { showToast } from '../../components/Toast';

const GROQ_MAX_FILE_SIZE = 24 * 1024 * 1024;
const GROQ_TARGET_CHUNK_BYTES = 18 * 1024 * 1024;
const WAV_BYTES_PER_SECOND = 16_000 * 2;

function previewTranscript(text: string, maxChars = 240): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}...`;
}

/**
 * Cleans up any stale transcripts_checkpoint_* directories left by interrupted chunked transcriptions.
 * Call on app boot to prevent accumulation of orphaned temp dirs.
 */
export async function cleanupStaleCheckpointDirs(): Promise<void> {
  try {
    const baseDir = FileSystem.documentDirectory;
    if (!baseDir) return;
    const entries = await FileSystem.readDirectoryAsync(baseDir);
    for (const entry of entries) {
      if (entry.startsWith('transcripts_checkpoint_')) {
        try {
          await FileSystem.deleteAsync(baseDir + entry, { idempotent: true });
          if (__DEV__) console.log(`[Transcription] Cleaned up stale checkpoint dir: ${entry}`);
        } catch (e) {
          console.warn(`[Transcription] Failed to delete stale checkpoint dir ${entry}:`, e);
        }
      }
    }
  } catch (e) {
    console.warn('[Transcription] cleanupStaleCheckpointDirs failed:', e);
  }
}

export async function getRecordingInfo(filePath: string) {
  try {
    const info = await FileSystem.getInfoAsync(toFileUri(filePath));
    if (!info?.exists) return { exists: false, sizeBytes: 0, needsChunking: false };
    return {
      exists: true,
      sizeBytes: info.size ?? 0,
      needsChunking: (info.size ?? 0) > GROQ_MAX_FILE_SIZE,
    };
  } catch {
    return { exists: false, sizeBytes: 0, needsChunking: false };
  }
}

export async function transcribeWithGroqChunking(
  recordingPath: string,
  groqKey: string,
  logId?: number,
  onProgress?: (progress: {
    message: string;
    detail?: string;
    percent?: number;
    step?: number;
    totalSteps?: number;
  }) => void,
) {
  const info = await getRecordingInfo(recordingPath);
  if (__DEV__) {
    console.log('[LectureChunking] Recording inspection', {
      recordingPath,
      sizeBytes: info.sizeBytes,
      needsChunking: info.needsChunking,
      groqLimitBytes: GROQ_MAX_FILE_SIZE,
    });
  }
  if (!info.needsChunking) {
    onProgress?.({
      message: 'Uploading recording to Groq Whisper',
      detail: 'Single upload path for this recording',
      percent: 28,
      step: 1,
      totalSteps: 1,
    });
    const transcript = await transcribeRawWithGroq(recordingPath, groqKey);
    if (__DEV__) {
      console.log('[LectureChunking] Single upload transcript ready', {
        recordingPath,
        transcriptChars: transcript.length,
        preview: previewTranscript(transcript),
      });
    }
    return { transcript, usedChunking: false };
  }

  let wavPath: string | null = null;
  let nativeChunks: { path: string }[] = [];

  // Setup checkpoint directory
  const sessionId = logId ?? 'unknown_' + Date.now();
  const checkpointDir = FileSystem.documentDirectory + `transcripts_checkpoint_${sessionId}/`;

  try {
    const dirInfo = await FileSystem.getInfoAsync(checkpointDir);
    if (!dirInfo?.exists) {
      await FileSystem.makeDirectoryAsync(checkpointDir, { intermediates: true });
    }

    onProgress?.({
      message: 'Preparing large recording for chunked upload',
      detail: 'Converting the lecture audio to WAV first',
      percent: 18,
    });
    wavPath = await convertToWav(recordingPath);
    if (!wavPath) throw new Error('WAV conversion failed');
    if (__DEV__) {
      console.log('[LectureChunking] WAV conversion complete', {
        recordingPath,
        wavPath,
      });
    }

    const chunkBytes =
      Math.floor(GROQ_TARGET_CHUNK_BYTES / WAV_BYTES_PER_SECOND) * WAV_BYTES_PER_SECOND;
    onProgress?.({
      message: 'Splitting recording into Groq-sized chunks',
      detail: 'This reduces upload failures on long lectures',
      percent: 24,
    });
    nativeChunks = await splitWavIntoChunks(wavPath, chunkBytes, chunkBytes, WAV_BYTES_PER_SECOND);
    if (__DEV__) {
      console.log('[LectureChunking] Chunk plan ready', {
        recordingPath,
        wavPath,
        chunkBytes,
        chunkCount: nativeChunks.length,
      });
    }

    const transcripts: string[] = [];

    for (let i = 0; i < nativeChunks.length; i++) {
      const chunk = nativeChunks[i];
      const chunkFileName = `chunk_${String(i).padStart(3, '0')}.txt`;
      const chunkFilePath = checkpointDir + chunkFileName;

      const chunkFileInfo = await FileSystem.getInfoAsync(chunkFilePath);
      let chunkTranscript = '';
      const chunkPercent = 28 + Math.round(((i + 1) / nativeChunks.length) * 30);
      if (__DEV__) {
        console.log('[LectureChunking] Chunk starting', {
          recordingPath,
          chunkIndex: i + 1,
          chunkCount: nativeChunks.length,
          chunkPath: chunk.path,
          checkpointPath: chunkFilePath,
          usingCheckpoint: !!chunkFileInfo?.exists,
        });
      }

      if (chunkFileInfo?.exists) {
        // Resume from checkpoint
        onProgress?.({
          message: `Restoring chunk ${i + 1} of ${nativeChunks.length}`,
          detail: 'Using a saved checkpoint from an earlier attempt',
          percent: chunkPercent,
          step: i + 1,
          totalSteps: nativeChunks.length,
        });
        chunkTranscript = await FileSystem.readAsStringAsync(chunkFilePath, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        if (__DEV__) {
          console.log('[LectureChunking] Resumed chunk from checkpoint', {
            recordingPath,
            chunkIndex: i + 1,
            chunkCount: nativeChunks.length,
            transcriptChars: chunkTranscript.length,
            preview: previewTranscript(chunkTranscript),
          });
        }
      } else {
        // Transcribe with per-chunk retry (up to 2 retries, 1s delay)
        onProgress?.({
          message: `Transcribing chunk ${i + 1} of ${nativeChunks.length}`,
          detail: 'Uploading this audio chunk to Groq Whisper',
          percent: chunkPercent,
          step: i + 1,
          totalSteps: nativeChunks.length,
        });
        if (__DEV__) {
          console.log('[LectureChunking] Uploading chunk to Groq', {
            recordingPath,
            chunkIndex: i + 1,
            chunkCount: nativeChunks.length,
            chunkPath: chunk.path,
          });
        }
        let chunkAttempt = 0;
        const chunkMaxRetries = 2;
        while (true) {
          try {
            chunkTranscript = await transcribeRawWithGroq(chunk.path, groqKey);
            break;
          } catch (chunkErr) {
            chunkAttempt++;
            if (chunkAttempt > chunkMaxRetries) {
              throw chunkErr;
            }
            console.warn(
              `[Transcription] Chunk ${i} attempt ${chunkAttempt} failed, retrying...`,
              chunkErr,
            );
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
        await FileSystem.writeAsStringAsync(chunkFilePath, chunkTranscript, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        if (__DEV__) {
          console.log('[LectureChunking] Chunk transcript saved', {
            recordingPath,
            chunkIndex: i + 1,
            chunkCount: nativeChunks.length,
            transcriptChars: chunkTranscript.length,
            preview: previewTranscript(chunkTranscript),
          });
        }
      }

      if (chunkTranscript.trim()) {
        transcripts.push(chunkTranscript);
      } else if (__DEV__) {
        console.log('[LectureChunking] Chunk transcript was empty', {
          recordingPath,
          chunkIndex: i + 1,
          chunkCount: nativeChunks.length,
        });
      }
    }

    onProgress?.({
      message: 'Combining chunk transcripts',
      detail: 'Reassembling the lecture transcript',
      percent: 60,
      step: nativeChunks.length,
      totalSteps: nativeChunks.length,
    });

    // Cleanup checkpoint directory on success
    try {
      await FileSystem.deleteAsync(checkpointDir, { idempotent: true });
    } catch (_e) {
      console.warn('[Transcription] Failed to delete checkpoint dir:', _e);
    }

    if (__DEV__) {
      const combinedTranscript = transcripts.join('\n\n');
      console.log('[LectureChunking] Combined transcript ready', {
        recordingPath,
        chunkCount: nativeChunks.length,
        transcriptChars: combinedTranscript.length,
        preview: previewTranscript(combinedTranscript, 400),
      });
    }

    return { transcript: transcripts.join('\n\n'), usedChunking: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    showToast(`Transcription failed: ${message}`, 'error');
    throw error;
  } finally {
    // Cleanup temporary files
    if (nativeChunks.length > 0) {
      for (const chunk of nativeChunks) {
        try {
          await FileSystem.deleteAsync(toFileUri(chunk.path), { idempotent: true });
        } catch (_e) {
          console.warn('[Transcription] Failed to delete chunk:', chunk.path, _e);
        }
      }
    }
    if (wavPath) {
      try {
        await FileSystem.deleteAsync(toFileUri(wavPath), { idempotent: true });
      } catch (_e) {
        console.warn('[Transcription] Failed to delete wavPath:', wavPath, _e);
      }
    }
  }
}
