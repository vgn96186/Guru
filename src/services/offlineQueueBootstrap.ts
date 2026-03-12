import { z } from 'zod';
import type { Message } from './aiService';
import { registerProcessor } from './offlineQueue';

let bootstrapped = false;

const UnknownJsonSchema = z.unknown();

export function registerOfflineQueueProcessors(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  registerProcessor('generate_text', async (item) => {
    const messages = Array.isArray(item.payload.messages) ? item.payload.messages as Message[] : null;
    if (!messages || messages.length === 0) {
      throw new Error('Invalid queued generate_text payload');
    }
    throw new Error('Queued text generation from older app versions cannot be replayed safely. Please retry the original action.');
  });

  registerProcessor('generate_json', async (item) => {
    const messages = Array.isArray(item.payload.messages) ? item.payload.messages as Message[] : null;
    if (!messages || messages.length === 0) {
      throw new Error('Invalid queued generate_json payload');
    }
    UnknownJsonSchema.parse(item.payload);
    throw new Error('Queued structured generation from older app versions cannot be replayed safely. Please retry the original action.');
  });

  registerProcessor('transcribe', async (item) => {
    const audioFilePath = typeof item.payload.audioFilePath === 'string'
      ? item.payload.audioFilePath
      : null;
    if (!audioFilePath) {
      throw new Error('Invalid queued transcribe payload');
    }
    throw new Error('Queued transcription from older app versions cannot be replayed safely. Please retry from lecture history or re-import the audio.');
  });
}
