import * as FileSystem from 'expo-file-system/legacy';
import { convertToWav, splitWavIntoChunks } from '../../../modules/app-launcher';
import { transcribeRawWithGroq } from '../transcription/engines';
import { showToast } from '../../components/Toast';

const GROQ_MAX_FILE_SIZE = 24 * 1024 * 1024;
const GROQ_TARGET_CHUNK_BYTES = 18 * 1024 * 1024;
const WAV_BYTES_PER_SECOND = 16_000 * 2;

export async function getRecordingInfo(filePath: string) {
  try {
    const info = await FileSystem.getInfoAsync(filePath.startsWith('file://') ? filePath : `file://${filePath}`);
    if (!info.exists) return { exists: false, sizeBytes: 0, needsChunking: false };
    return { exists: true, sizeBytes: info.size ?? 0, needsChunking: (info.size ?? 0) > GROQ_MAX_FILE_SIZE };
  } catch { return { exists: false, sizeBytes: 0, needsChunking: false }; }
}

export async function transcribeWithGroqChunking(recordingPath: string, groqKey: string, logId?: number) {
  const info = await getRecordingInfo(recordingPath);
  if (!info.needsChunking) return { transcript: await transcribeRawWithGroq(recordingPath, groqKey), usedChunking: false };

  let wavPath: string | null = null;
  let nativeChunks: { path: string }[] = [];

  // Setup checkpoint directory
  const sessionId = logId ?? 'unknown_' + Date.now();
  const checkpointDir = FileSystem.documentDirectory + `transcripts_checkpoint_${sessionId}/`;

  try {
    const dirInfo = await FileSystem.getInfoAsync(checkpointDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(checkpointDir, { intermediates: true });
    }

    wavPath = await convertToWav(recordingPath);
    if (!wavPath) throw new Error('WAV conversion failed');

    const chunkBytes = Math.floor(GROQ_TARGET_CHUNK_BYTES / WAV_BYTES_PER_SECOND) * WAV_BYTES_PER_SECOND;
    nativeChunks = await splitWavIntoChunks(wavPath, chunkBytes, chunkBytes, WAV_BYTES_PER_SECOND);
    
    const transcripts: string[] = [];

    for (let i = 0; i < nativeChunks.length; i++) {
      const chunk = nativeChunks[i];
      const chunkFileName = `chunk_${String(i).padStart(3, '0')}.txt`;
      const chunkFilePath = checkpointDir + chunkFileName;

      const chunkFileInfo = await FileSystem.getInfoAsync(chunkFilePath);
      let chunkTranscript = '';

      if (chunkFileInfo.exists) {
        // Resume from checkpoint
        chunkTranscript = await FileSystem.readAsStringAsync(chunkFilePath, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        console.log(`[Transcription] Resuming chunk ${i} from checkpoint`);
      } else {
        // Transcribe and save checkpoint
        console.log(`[Transcription] Transcribing chunk ${i}...`);
        chunkTranscript = await transcribeRawWithGroq(chunk.path, groqKey);
        await FileSystem.writeAsStringAsync(chunkFilePath, chunkTranscript, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      if (chunkTranscript.trim()) {
        transcripts.push(chunkTranscript);
      }
    }

    // Cleanup checkpoint directory on success
    try {
      await FileSystem.deleteAsync(checkpointDir, { idempotent: true });
    } catch (e) {
      console.warn('[Transcription] Failed to delete checkpoint dir:', e);
    }

    return { transcript: transcripts.join('\n\n'), usedChunking: true };
  } catch (error: any) {
    showToast(`Transcription failed: ${error.message || 'Unknown error'}`, 'error');
    throw error;
  } finally {
    // Cleanup temporary files
    if (nativeChunks.length > 0) {
      for (const chunk of nativeChunks) {
        try {
          await FileSystem.deleteAsync(chunk.path.startsWith('file://') ? chunk.path : `file://${chunk.path}`, { idempotent: true });
        } catch (e) {
          console.warn('[Transcription] Failed to delete chunk:', chunk.path, e);
        }
      }
    }
    if (wavPath) {
      try {
        await FileSystem.deleteAsync(wavPath.startsWith('file://') ? wavPath : `file://${wavPath}`, { idempotent: true });
      } catch (e) {
        console.warn('[Transcription] Failed to delete wavPath:', wavPath, e);
      }
    }
  }
}

