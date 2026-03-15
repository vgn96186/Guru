import { z } from 'zod';
import type { Message } from './types';
import { profileRepository } from '../../db/repositories';
import { getApiKeys } from './config';
import { parseStructuredJson } from './jsonRepair';
import { attemptLocalLLM, attemptCloudLLM } from './llmRouting';
import { isTransientNetworkError } from '../offlineQueueErrors';
import { getLocalLlmRamWarning, isLocalLlmUsable } from '../deviceMemory';

export async function generateJSONWithRouting<T>(
  messages: Message[],
  schema: z.ZodType<T>,
  _taskComplexity: 'low' | 'high' = 'low',
  queueOnFailure = true,
): Promise<{ parsed: T; modelUsed: string }> {
  const profile = await profileRepository.getProfile();
  const { orKey, groqKey } = getApiKeys(profile);
  const hasLocal = isLocalLlmUsable(profile);
  const hasCloud = !!orKey || !!groqKey;

  // Define the order of backends to try — cloud first for reliability
  const attempts: ('local' | 'cloud')[] = [];
  if (hasCloud) attempts.push('cloud');
  if (hasLocal) attempts.push('local');

  if (attempts.length === 0) throw new Error('No AI backend available. Download a local model or add an API key in Settings.');

  let lastError: Error | null = null;
  for (const backend of attempts) {
    try {
      const { text, modelUsed } = backend === 'local'
        ? await attemptLocalLLM(messages, profile.localModelPath!, false)
        : await attemptCloudLLM(messages, orKey, false, groqKey);
      const parsed = parseStructuredJson(text, schema);
      return { parsed, modelUsed };
    } catch (err) {
      if (__DEV__) console.warn(`[AI] ${backend} inference/parsing failed:`, (err as Error).message);
      lastError = err as Error;
      continue;
    }
  }

  if (queueOnFailure && lastError && isTransientNetworkError(lastError) && __DEV__) {
    console.warn('[AI] Skipping offline queue for structured generation because the original side effect cannot be replayed safely.');
  }

  throw lastError || new Error('All AI attempts failed');
}

export async function generateTextWithRouting(
  messages: Message[],
  options?: { preferCloud?: boolean; chosenModel?: string },
  queueOnFailure = true,
): Promise<{ text: string; modelUsed: string }> {
  const profile = await profileRepository.getProfile();
  const { orKey, groqKey } = getApiKeys(profile);
  const hasLocal = isLocalLlmUsable(profile);
  const hasCloud = !!orKey || !!groqKey;

  // If a specific model is chosen and it's local (e.g., matching the local model path name or 'local')
  if (options?.chosenModel === 'local' && profile.localModelPath && !hasLocal) {
    throw new Error(
      getLocalLlmRamWarning() ?? 'On-device text AI is disabled on this device to avoid low-memory crashes.',
    );
  }
  if (options?.chosenModel === 'local' && hasLocal) {
    return await attemptLocalLLM(messages, profile.localModelPath!, true);
  }

  // Enforce consistent backend order for all text pipelines:
  // Groq -> OpenRouter free models -> local model fallback.
  const attempts: ('local' | 'cloud')[] = [];
  if (hasCloud) attempts.push('cloud');
  if (hasLocal) attempts.push('local');

  if (attempts.length === 0) throw new Error('No AI backend available. Download a local model or add an API key in Settings.');

  let lastError: Error | null = null;
  for (const backend of attempts) {
    try {
      const { text, modelUsed } = backend === 'local'
        ? await attemptLocalLLM(messages, profile.localModelPath!, true)
        : await attemptCloudLLM(messages, orKey, true, groqKey, options?.chosenModel);
      return { text, modelUsed };
    } catch (err) {
      if (__DEV__) console.warn(`[AI] ${backend} inference failed:`, (err as Error).message);
      lastError = err as Error;
      continue;
    }
  }

  if (queueOnFailure && lastError && isTransientNetworkError(lastError) && __DEV__) {
    console.warn('[AI] Skipping offline queue for text generation because the original side effect cannot be replayed safely.');
  }

  throw lastError || new Error('All AI attempts failed');
}
