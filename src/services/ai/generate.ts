import { z } from 'zod';
import type { Message } from './types';
import { profileRepository } from '../../db/repositories';
import { getApiKeys } from './config';
import { parseStructuredJson } from './jsonRepair';
import { attemptLocalLLM, attemptCloudLLM, attemptCloudLLMStream } from './llmRouting';
import { isTransientNetworkError } from '../offlineQueueErrors';
import { getLocalLlmRamWarning, isLocalLlmUsable } from '../deviceMemory';
import type { UserProfile } from '../../types';
import { geminiGenerateStructuredJsonSdk } from './google/geminiStructured';
import { RateLimitError } from './schemas';

/** Resolve backend attempt order from profile. Used by both JSON and text routing. */
function getBackendAttemptOrder(profile: UserProfile): any {
  const { orKey, groqKey, geminiKey, geminiFallbackKey, cfAccountId, cfApiToken, deepseekKey, mulerouterKey } = getApiKeys(profile);
  const hasLocal = isLocalLlmUsable(profile);
  const hasCloud = !!orKey || !!groqKey || !!geminiKey || !!geminiFallbackKey || (!!cfAccountId && !!cfApiToken) || !!deepseekKey || !!mulerouterKey;

  const attempts: ('local' | 'cloud')[] = [];
  if (hasCloud) attempts.push('cloud');
  if (hasLocal) attempts.push('local');

  if (attempts.length === 0)
    throw new Error(
      'No AI backend available. Download a local model or add an API key in Settings.',
    );

  return { attempts, orKey, groqKey, geminiKey, geminiFallbackKey, cfAccountId, cfApiToken, deepseekKey, mulerouterKey };
}

export async function generateJSONWithRouting<T>(
  messages: Message[],
  schema: z.ZodType<T>,
  taskComplexity: 'low' | 'high' = 'low',
  queueOnFailure = true,
): Promise<{ parsed: T; modelUsed: string }> {
  const profile = await profileRepository.getProfile();
  const { attempts, orKey, groqKey, geminiKey, geminiFallbackKey, cfAccountId, cfApiToken, deepseekKey, mulerouterKey } =
    getBackendAttemptOrder(profile);

  // 1. High Performance Native Path: Gemini SDK Structured JSON
  if (geminiKey && (profile.preferGeminiStructuredJson ?? true)) {
    try {
      return await geminiGenerateStructuredJsonSdk(messages, schema, geminiKey, taskComplexity);
    } catch (err) {
      if (__DEV__) console.warn('[AI] Gemini native structured JSON failed, falling back:', err);
      // Fall through to traditional text fallback loop if not a rate limit
      if (err instanceof RateLimitError) throw err;
    }
  }

  let lastError: Error | null = null;
  for (const backend of attempts) {
    try {
      if (backend === 'cloud' && geminiKey && profile.preferGeminiStructuredJson !== false) {
        try {
          const structured = await geminiGenerateStructuredJsonSdk(
            messages,
            schema,
            geminiKey,
            taskComplexity,
          );
          if (__DEV__) {
            console.log(
              `[AI] structured JSON native_gemini_ok model=${structured.modelUsed} complexity=${taskComplexity}`,
            );
          }
          return structured;
        } catch (err) {
          if (err instanceof RateLimitError) {
            if (__DEV__) {
              console.warn('[AI] Gemini structured JSON rate limited; falling back to text backends');
            }
            lastError = err as Error;
          } else {
            if (__DEV__) {
              console.warn(
                '[AI] Gemini structured JSON failed, fallback_text_repair:',
                (err as Error).message,
              );
            }
          }
        }
      }

      const { text, modelUsed } =
        backend === 'local'
          ? await attemptLocalLLM(messages, profile.localModelPath!, false)
          : await attemptCloudLLM(
              messages,
              orKey,
              false,
              groqKey,
              undefined,
              geminiKey,
              geminiFallbackKey,
              cfAccountId,
              cfApiToken,
              deepseekKey,
              mulerouterKey,
            );
      const parsed = await parseStructuredJson(text, schema);
      if (__DEV__) {
        console.log(
          `[AI] structured_json_parse path=fallback_text_repair model=${modelUsed} (Zod parse after text)`,
        );
      }
      return { parsed, modelUsed };
    } catch (err) {
      if (__DEV__)
        console.warn(`[AI] ${backend} inference/parsing failed:`, (err as Error).message);
      lastError = err as Error;
      continue;
    }
  }

  if (queueOnFailure && lastError && isTransientNetworkError(lastError) && __DEV__) {
    console.warn(
      '[AI] Skipping offline queue for structured generation because the original side effect cannot be replayed safely.',
    );
  }

  if (__DEV__) {
    console.warn('[AI] structured_json_parse path=failed', lastError?.message ?? 'unknown');
  }
  throw lastError || new Error('All AI attempts failed');
}

export async function generateTextWithRouting(
  messages: Message[],
  options?: { preferCloud?: boolean; chosenModel?: string },
  queueOnFailure = true,
): Promise<{ text: string; modelUsed: string }> {
  const profile = await profileRepository.getProfile();

  // If a specific model is chosen and it's local
  if (options?.chosenModel === 'local' && profile.localModelPath && !isLocalLlmUsable(profile)) {
    throw new Error(
      getLocalLlmRamWarning() ??
        'On-device text AI is disabled on this device to avoid low-memory crashes.',
    );
  }
  if (options?.chosenModel === 'local' && isLocalLlmUsable(profile)) {
    return await attemptLocalLLM(messages, profile.localModelPath!, true);
  }

  const { attempts, orKey, groqKey, geminiKey, geminiFallbackKey, cfAccountId, cfApiToken, deepseekKey, mulerouterKey } =
    getBackendAttemptOrder(profile);

  let lastError: Error | null = null;
  for (const backend of attempts) {
    try {
      const { text, modelUsed } =
        backend === 'local'
          ? await attemptLocalLLM(messages, profile.localModelPath!, true)
          : await attemptCloudLLM(
              messages,
              orKey,
              true,
              groqKey,
              options?.chosenModel,
              geminiKey,
              geminiFallbackKey,
              cfAccountId,
              cfApiToken,
              deepseekKey,
              mulerouterKey,
            );
      if (__DEV__) console.log(`[AI] ✓ Text via ${modelUsed}`);
      return { text, modelUsed };
    } catch (err) {
      if (__DEV__) console.warn(`[AI] ${backend} inference failed:`, (err as Error).message);
      lastError = err as Error;
      continue;
    }
  }

  if (queueOnFailure && lastError && isTransientNetworkError(lastError) && __DEV__) {
    console.warn(
      '[AI] Skipping offline queue for text generation because the original side effect cannot be replayed safely.',
    );
  }

  throw lastError || new Error('All AI attempts failed');
}

/**
 * Like {@link generateTextWithRouting}, but streams cloud tokens through `onDelta`.
 * Local LLM emits one chunk (full text) when complete — no native streaming.
 */
export async function generateTextWithRoutingStream(
  messages: Message[],
  options: { chosenModel?: string } | undefined,
  onDelta: (delta: string) => void,
  queueOnFailure = true,
): Promise<{ text: string; modelUsed: string }> {
  const profile = await profileRepository.getProfile();

  if (options?.chosenModel === 'local' && profile.localModelPath && !isLocalLlmUsable(profile)) {
    throw new Error(
      getLocalLlmRamWarning() ??
        'On-device text AI is disabled on this device to avoid low-memory crashes.',
    );
  }
  if (options?.chosenModel === 'local' && isLocalLlmUsable(profile)) {
    const { text, modelUsed } = await attemptLocalLLM(messages, profile.localModelPath!, true);
    onDelta(text);
    return { text, modelUsed };
  }

  const { attempts, orKey, groqKey, geminiKey, geminiFallbackKey, cfAccountId, cfApiToken, deepseekKey, mulerouterKey } =
    getBackendAttemptOrder(profile);

  let lastError: Error | null = null;
  for (const backend of attempts) {
    try {
      if (backend === 'local') {
        const { text, modelUsed } = await attemptLocalLLM(messages, profile.localModelPath!, true);
        onDelta(text);
        return { text, modelUsed };
      }
      return await attemptCloudLLMStream(
        messages,
        orKey,
        groqKey,
        options?.chosenModel,
        onDelta,
        geminiKey,
        geminiFallbackKey,
        cfAccountId,
        cfApiToken,
        deepseekKey,
        mulerouterKey,
      );
    } catch (err) {
      if (__DEV__) console.warn(`[AI] ${backend} stream inference failed:`, (err as Error).message);
      lastError = err as Error;
      continue;
    }
  }

  if (queueOnFailure && lastError && isTransientNetworkError(lastError) && __DEV__) {
    console.warn(
      '[AI] Skipping offline queue for streaming text generation because the original side effect cannot be replayed safely.',
    );
  }

  throw lastError || new Error('All AI attempts failed');
}
