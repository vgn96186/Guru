import { z } from 'zod';
import type { Message } from './aiService';
import { registerProcessor, markCompleted } from './offlineQueue';
import { runFullTranscriptionPipeline } from './lectureSessionMonitor';
import { profileRepository } from '../db/repositories';
import { BUNDLED_GROQ_KEY } from '../config/appConfig';

let bootstrapped = false;

const UnknownJsonSchema = z.unknown();

export function registerOfflineQueueProcessors(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  registerProcessor('generate_text', async (item) => {
    // Legacy/Transient tasks: skip for now as they usually depend on live UI state
    throw new Error('Real-time task cannot be replayed safely.');
  });

  registerProcessor('generate_json', async (item) => {
    throw new Error('Real-time task cannot be replayed safely.');
  });

  registerProcessor('transcribe', async (item) => {
    const { audioFilePath, appName, durationMinutes, logId } = item.payload;

    if (typeof audioFilePath !== 'string' || !logId) {
      throw new Error('Invalid transcription payload');
    }

    const profile = await profileRepository.getProfile();
    const groqKey = profile.groqApiKey?.trim() || BUNDLED_GROQ_KEY;

    const result = await runFullTranscriptionPipeline({
      recordingPath: audioFilePath,
      appName: (appName as string) || 'Manual Upload',
      durationMinutes: (durationMinutes as number) || 0,
      logId: logId as number,
      groqKey: groqKey || undefined,
    });

    if (result.success) {
      await markCompleted(item.id);
    } else {
      throw new Error(result.error || 'Transcription failed during retry');
    }
  });
}
