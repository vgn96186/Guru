import { z } from 'zod';
import type { Message } from './types';
import { profileRepository } from '../../db/repositories';
import { getApiKeys } from './config';
import { parseStructuredJson } from './jsonRepair';
import { attemptLocalLLM, attemptCloudLLM, attemptCloudLLMStream } from './llmRouting';
import { isTransientNetworkError } from '../offlineQueueErrors';
import { getLocalLlmRamWarning, isLocalLlmUsable } from '../deviceMemory';
import type { ProviderId, UserProfile } from '../../types';
import type { ChatGptAccountSlot } from '../../types';
import { geminiGenerateStructuredJsonSdk } from './google/geminiStructured';
import { RateLimitError } from './schemas';
import { createAiRequestTrace, logStreamEvent, previewText } from './runtimeDebug';

/** Resolve backend attempt order from profile. Used by both JSON and text routing. */
function getBackendAttemptOrder(profile: UserProfile) {
  const {
    orKey,
    groqKey,
    geminiKey,
    geminiFallbackKey,
    cfAccountId,
    cfApiToken,
    deepseekKey,
    githubModelsPat,
    kiloApiKey,
    agentRouterKey,
    chatgptConnected,
  } = getApiKeys(profile);
  const hasLocal = isLocalLlmUsable(profile);
  const hasCloud =
    !!orKey ||
    !!groqKey ||
    !!geminiKey ||
    !!geminiFallbackKey ||
    (!!cfAccountId && !!cfApiToken) ||
    !!deepseekKey ||
    !!githubModelsPat ||
    !!kiloApiKey ||
    !!agentRouterKey ||
    chatgptConnected;

  const attempts: ('local' | 'cloud')[] = [];
  const chatgptSlots: ChatGptAccountSlot[] = [];
  if (profile.chatgptAccounts?.primary?.enabled && profile.chatgptAccounts?.primary?.connected) {
    chatgptSlots.push('primary');
  }
  if (
    profile.chatgptAccounts?.secondary?.enabled &&
    profile.chatgptAccounts?.secondary?.connected
  ) {
    chatgptSlots.push('secondary');
  }
  if (hasCloud) attempts.push('cloud');
  if (hasLocal) attempts.push('local');

  if (attempts.length === 0)
    throw new Error(
      'No AI backend available. Download a local model or add an API key in Settings.',
    );

  return {
    attempts,
    orKey,
    groqKey,
    geminiKey,
    geminiFallbackKey,
    cfAccountId,
    cfApiToken,
    deepseekKey,
    githubModelsPat,
    kiloApiKey,
    agentRouterKey,
    chatgptConnected,
    chatgptSlots,
    providerOrder: profile.providerOrder,
  };
}

function isExplicitCloudModel(chosenModel?: string): boolean {
  return !!chosenModel && chosenModel !== 'auto' && chosenModel !== 'local';
}

function resolveProviderOrderOverride(override?: ProviderId[]): ProviderId[] | undefined {
  return override?.length ? override : undefined;
}

export async function generateJSONWithRouting<T>(
  messages: Message[],
  schema: z.ZodType<T>,
  taskComplexity: 'low' | 'high' = 'low',
  queueOnFailure = true,
  forceProvider?: 'groq' | 'gemini',
  providerOrderOverride?: ProviderId[],
): Promise<{ parsed: T; modelUsed: string }> {
  const trace = createAiRequestTrace('json', messages, {
    taskComplexity,
    queueOnFailure,
    forceProvider: forceProvider ?? 'auto',
    providerOrderOverride: providerOrderOverride?.join(' -> ') ?? 'default',
  });
  const profile = await profileRepository.getProfile();
  let {
    attempts,
    orKey,
    groqKey,
    geminiKey,
    geminiFallbackKey,
    cfAccountId,
    cfApiToken,
    deepseekKey,
    githubModelsPat,
    kiloApiKey,
    agentRouterKey,
    chatgptConnected,
    chatgptSlots,
    providerOrder: profileProviderOrder,
  } = getBackendAttemptOrder(profile);
  let providerOrder = resolveProviderOrderOverride(providerOrderOverride) ?? profileProviderOrder;

  if (forceProvider === 'groq') {
    attempts = ['cloud'];
    orKey = undefined;
    geminiKey = undefined;
    geminiFallbackKey = undefined;
    cfAccountId = undefined;
    cfApiToken = undefined;
    deepseekKey = undefined;
    githubModelsPat = undefined;
    kiloApiKey = undefined;
    agentRouterKey = undefined;
    providerOrder = ['groq'];
  } else if (forceProvider === 'gemini') {
    attempts = ['cloud'];
    orKey = undefined;
    groqKey = undefined;
    cfAccountId = undefined;
    cfApiToken = undefined;
    deepseekKey = undefined;
    githubModelsPat = undefined;
    kiloApiKey = undefined;
    agentRouterKey = undefined;
    providerOrder = ['gemini', 'gemini_fallback'];
  }

  let lastError: Error | null = null;
  for (const backend of attempts) {
    try {
      if (backend === 'local') {
        const { text, modelUsed } = await attemptLocalLLM(messages, profile.localModelPath!, false);
        const parsed = await parseStructuredJson(text, schema);
        trace.success({
          backend,
          modelUsed,
          responseChars: text.length,
          responsePreview: previewText(text),
          responseText: text,
        });
        return { parsed, modelUsed };
      }

      const { text, modelUsed } = await attemptCloudLLM(
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
        githubModelsPat,
        kiloApiKey,
        agentRouterKey,
        providerOrder,
        chatgptConnected,
        chatgptSlots,
      );
      const parsed = await parseStructuredJson(text, schema);
      trace.success({
        backend,
        modelUsed,
        responseChars: text.length,
        responsePreview: previewText(text),
        responseText: text,
        providerOrder:
          providerOrder?.length && backend === 'cloud' ? providerOrder.join(' -> ') : undefined,
      });
      return { parsed, modelUsed };
    } catch (err) {
      trace.fail(err, { backend });
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
  trace.fail(lastError, { final: true });
  throw lastError || new Error('All AI attempts failed');
}

export async function generateTextWithRouting(
  messages: Message[],
  options?: { preferCloud?: boolean; chosenModel?: string; providerOrderOverride?: ProviderId[] },
  queueOnFailure = true,
): Promise<{ text: string; modelUsed: string }> {
  const trace = createAiRequestTrace('text', messages, {
    chosenModel: options?.chosenModel ?? 'auto',
    preferCloud: options?.preferCloud ?? false,
    providerOrderOverride: options?.providerOrderOverride?.join(' -> ') ?? 'default',
    queueOnFailure,
  });
  const profile = await profileRepository.getProfile();

  // If a specific model is chosen and it's local
  if (options?.chosenModel === 'local' && profile.localModelPath && !isLocalLlmUsable(profile)) {
    throw new Error(
      getLocalLlmRamWarning() ??
        'On-device text AI is disabled on this device to avoid low-memory crashes.',
    );
  }
  if (options?.chosenModel === 'local' && isLocalLlmUsable(profile)) {
    const result = await attemptLocalLLM(messages, profile.localModelPath!, true);
    trace.success({
      backend: 'local',
      modelUsed: result.modelUsed,
      responseChars: result.text.length,
      responsePreview: previewText(result.text),
      responseText: result.text,
    });
    return result;
  }

  const {
    attempts: initialAttempts,
    orKey,
    groqKey,
    geminiKey,
    geminiFallbackKey,
    cfAccountId,
    cfApiToken,
    deepseekKey,
    githubModelsPat,
    kiloApiKey,
    agentRouterKey,
    chatgptConnected,
    chatgptSlots,
    providerOrder: profileProviderOrder,
  } = getBackendAttemptOrder(profile);
  const textProviderOrder =
    resolveProviderOrderOverride(options?.providerOrderOverride) ?? profileProviderOrder;
  const attempts = isExplicitCloudModel(options?.chosenModel)
    ? ['cloud' as const]
    : initialAttempts;

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
              githubModelsPat,
              kiloApiKey,
              agentRouterKey,
              textProviderOrder,
              chatgptConnected,
              chatgptSlots,
            );
      if (__DEV__) console.log(`[AI] ✓ Text via ${modelUsed}`);
      trace.success({
        backend,
        modelUsed,
        responseChars: text.length,
        responsePreview: previewText(text),
        responseText: text,
        providerOrder:
          textProviderOrder?.length && backend === 'cloud'
            ? textProviderOrder.join(' -> ')
            : undefined,
      });
      return { text, modelUsed };
    } catch (err) {
      trace.fail(err, { backend });
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

  trace.fail(lastError, { final: true });
  throw lastError || new Error('All AI attempts failed');
}

/**
 * Like {@link generateTextWithRouting}, but streams cloud tokens through `onDelta`.
 * Local LLM emits one chunk (full text) when complete — no native streaming.
 */
export async function generateTextWithRoutingStream(
  messages: Message[],
  options: { chosenModel?: string; providerOrderOverride?: ProviderId[] } | undefined,
  onDelta: (delta: string) => void,
  queueOnFailure = true,
): Promise<{ text: string; modelUsed: string }> {
  const trace = createAiRequestTrace('stream', messages, {
    chosenModel: options?.chosenModel ?? 'auto',
    providerOrderOverride: options?.providerOrderOverride?.join(' -> ') ?? 'default',
    queueOnFailure,
  });
  const profile = await profileRepository.getProfile();

  if (options?.chosenModel === 'local' && profile.localModelPath && !isLocalLlmUsable(profile)) {
    throw new Error(
      getLocalLlmRamWarning() ??
        'On-device text AI is disabled on this device to avoid low-memory crashes.',
    );
  }
  if (options?.chosenModel === 'local' && isLocalLlmUsable(profile)) {
    const { text, modelUsed } = await attemptLocalLLM(messages, profile.localModelPath!, true);
    logStreamEvent('local_single_chunk', {
      modelUsed,
      outputChars: text.length,
      chosenModel: options?.chosenModel ?? 'auto',
    });
    onDelta(text);
    trace.success({
      backend: 'local',
      modelUsed,
      responseChars: text.length,
      responsePreview: previewText(text),
      responseText: text,
    });
    return { text, modelUsed };
  }

  const {
    attempts: initialAttempts,
    orKey,
    groqKey,
    geminiKey,
    geminiFallbackKey,
    cfAccountId,
    cfApiToken,
    deepseekKey,
    githubModelsPat,
    kiloApiKey,
    agentRouterKey,
    chatgptConnected,
    chatgptSlots,
    providerOrder: profileProviderOrder,
  } = getBackendAttemptOrder(profile);
  const streamProviderOrder =
    resolveProviderOrderOverride(options?.providerOrderOverride) ?? profileProviderOrder;
  const attempts = isExplicitCloudModel(options?.chosenModel)
    ? ['cloud' as const]
    : initialAttempts;

  let lastError: Error | null = null;
  for (const backend of attempts) {
    try {
      if (backend === 'local') {
        const { text, modelUsed } = await attemptLocalLLM(messages, profile.localModelPath!, true);
        logStreamEvent('local_single_chunk', {
          modelUsed,
          outputChars: text.length,
          chosenModel: options?.chosenModel ?? 'auto',
        });
        onDelta(text);
        trace.success({
          backend,
          modelUsed,
          responseChars: text.length,
          responsePreview: previewText(text),
          responseText: text,
        });
        return { text, modelUsed };
      }
      const result = await attemptCloudLLMStream(
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
        githubModelsPat,
        kiloApiKey,
        agentRouterKey,
        streamProviderOrder,
        chatgptConnected,
        chatgptSlots,
      );
      trace.success({
        backend,
        modelUsed: result.modelUsed,
        responseChars: result.text.length,
        responsePreview: previewText(result.text),
        responseText: result.text,
        providerOrder:
          streamProviderOrder?.length && backend === 'cloud'
            ? streamProviderOrder.join(' -> ')
            : undefined,
      });
      return result;
    } catch (err) {
      trace.fail(err, { backend });
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

  trace.fail(lastError, { final: true });
  throw lastError || new Error('All AI attempts failed');
}
