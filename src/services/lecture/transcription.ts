import * as FileSystem from 'expo-file-system/legacy';
import { convertToWav, splitWavIntoChunks } from '../../../modules/app-launcher';
import { transcribeRawWithGroq } from '../transcription/engines';

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

export async function transcribeWithGroqChunking(recordingPath: string, groqKey: string) {
  const info = await getRecordingInfo(recordingPath);
  if (!info.needsChunking) return { transcript: await transcribeRawWithGroq(recordingPath, groqKey), usedChunking: false };

  const wavPath = await convertToWav(recordingPath);
  if (!wavPath) throw new Error('WAV conversion failed');

  const chunkBytes = Math.floor(GROQ_TARGET_CHUNK_BYTES / WAV_BYTES_PER_SECOND) * WAV_BYTES_PER_SECOND;
  const nativeChunks = await splitWavIntoChunks(wavPath, chunkBytes, chunkBytes, WAV_BYTES_PER_SECOND);
  
  const transcripts = [];
  for (const chunk of nativeChunks) {
    const t = await transcribeRawWithGroq(chunk.path, groqKey);
    if (t.trim()) transcripts.push(t);
    await FileSystem.deleteAsync(chunk.path.startsWith('file://') ? chunk.path : `file://${chunk.path}`, { idempotent: true });
  }
  await FileSystem.deleteAsync(wavPath.startsWith('file://') ? wavPath : `file://${wavPath}`, { idempotent: true });

  return { transcript: transcripts.join('\n\n'), usedChunking: true };
}
