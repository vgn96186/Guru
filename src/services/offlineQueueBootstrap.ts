import { z } from 'zod';
import { generateTextWithRouting, type Message, transcribeAndSummarizeAudio } from './aiService';
import { markCompleted, registerProcessor } from './offlineQueue';

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
    await generateTextWithRouting(messages, item.payload.options as any, false);
    markCompleted(item.id);
  });

  registerProcessor('generate_json', async (item) => {
    const messages = Array.isArray(item.payload.messages) ? item.payload.messages as Message[] : null;
    if (!messages || messages.length === 0) {
      throw new Error('Invalid queued generate_json payload');
    }

    // Queue replay uses structural validation only; schema-specific validation
    // is done in the original online request path.
    const { text } = await generateTextWithRouting(messages, { preferCloud: true }, false);
    UnknownJsonSchema.parse(JSON.parse(text));
    markCompleted(item.id);
  });

  registerProcessor('transcribe', async (item) => {
    const audioFilePath = typeof item.payload.audioFilePath === 'string'
      ? item.payload.audioFilePath
      : null;
    if (!audioFilePath) {
      throw new Error('Invalid queued transcribe payload');
    }
    await transcribeAndSummarizeAudio(audioFilePath);
    markCompleted(item.id);
  });
}
