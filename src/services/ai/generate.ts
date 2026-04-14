import { z } from 'zod';
import type { Message } from './types';
import { profileRepository } from '../../db/repositories';
import { getApiKeys } from './config';
import { parseStructuredJson } from './jsonRepair';
import {
  attemptLocalLLM,
  attemptCloudLLM,
  attemptCloudLLMStream,
  clampMessagesForStructuredJsonRouting,
} from './llmRouting';
import { isTransientNetworkError } from '../offlineQueueErrors';
import {
  getLocalLlmRamWarning,
  isLocalLlmAllowedOnThisDevice,
  isLocalLlmUsable,
} from '../deviceMemory';
import { DEFAULT_PROVIDER_ORDER, type ProviderId, type UserProfile } from '../../types';
import type { ChatGptAccountSlot } from '../../types';
import { geminiGenerateStructuredJsonSdk } from './google/geminiStructured';
import { RateLimitError } from './schemas';
import { createAiRequestTrace, logStreamEvent, previewText } from './runtimeDebug';
import { sanitizeProviderOrder } from '../../utils/providerOrder';

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
    githubCopilotConnected,
    gitlabDuoConnected,
    poeConnected,
  } = getApiKeys(profile);
  const hasLocal = isLocalLlmUsable(profile);
  const disabled = new Set(profile.disabledProviders ?? []);
  const d = (id: ProviderId) => disabled.has(id);

  const hasCloud =
    (!d('openrouter') && !!orKey) ||
    (!d('groq') && !!groqKey) ||
    (!d('gemini') && !!geminiKey) ||
    (!d('gemini_fallback') && !!geminiFallbackKey) ||
    (!d('cloudflare') && !!cfAccountId && !!cfApiToken) ||
    (!d('deepseek') && !!deepseekKey) ||
    (!d('github') && !!githubModelsPat) ||
    (!d('kilo') && !!kiloApiKey) ||
    (!d('agentrouter') && !!agentRouterKey) ||
    (!d('chatgpt') && chatgptConnected) ||
    (!d('github_copilot') && githubCopilotConnected) ||
    (!d('gitlab_duo') && gitlabDuoConnected) ||
    (!d('poe') && poeConnected);

  // Safety fallback:
  // If no cloud providers are configured and a local model file exists on a supported device,
  // still allow local inference even if the persisted toggle is currently off.
  // This avoids "No backend available" lockouts when the toggle was reset unexpectedly.
  const hasNoCloudFallbackLocal = !!(
    !hasLocal &&
    !hasCloud &&
    profile.localModelPath &&
    isLocalLlmAllowedOnThisDevice()
  );

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
  if (hasLocal || hasNoCloudFallbackLocal) attempts.push('local');

  if (attempts.length === 0) {
    if (__DEV__) {
      console.warn('[AI] backend_unavailable', {
        useLocalModel: !!profile.useLocalModel,
        hasLocalModelPath: !!profile.localModelPath,
        localModelFile: profile.localModelPath?.split('/').pop() ?? null,
        localLlmAllowed: isLocalLlmAllowedOnThisDevice(),
        hasCloud,
      });
    }

    if (profile.localModelPath && !profile.useLocalModel && isLocalLlmAllowedOnThisDevice()) {
      throw new Error(
        'Local text model is downloaded but disabled. Enable "Local Text AI" in Settings > On-Device AI.',
      );
    }

    const localLlmWarning = getLocalLlmRamWarning();
    if (profile.localModelPath && localLlmWarning) {
      throw new Error(localLlmWarning);
    }

    throw new Error(
      'No AI backend available. Download a local model or add an API key in Settings.',
    );
  }

  return {
    attempts,
    orKey: d('openrouter') ? '' : orKey,
    groqKey: d('groq') ? '' : groqKey,
    geminiKey: d('gemini') ? '' : geminiKey,
    geminiFallbackKey: d('gemini_fallback') ? '' : geminiFallbackKey,
    cfAccountId: d('cloudflare') ? '' : cfAccountId,
    cfApiToken: d('cloudflare') ? '' : cfApiToken,
    deepseekKey: d('deepseek') ? '' : deepseekKey,
    githubModelsPat: d('github') ? '' : githubModelsPat,
    kiloApiKey: d('kilo') ? '' : kiloApiKey,
    agentRouterKey: d('agentrouter') ? '' : agentRouterKey,
    chatgptConnected: d('chatgpt') ? false : chatgptConnected,
    chatgptSlots: d('chatgpt') ? [] : chatgptSlots,
    githubCopilotConnected: d('github_copilot') ? false : githubCopilotConnected,
    gitlabDuoConnected: d('gitlab_duo') ? false : gitlabDuoConnected,
    poeConnected: d('poe') ? false : poeConnected,
    providerOrder: sanitizeProviderOrder(profile.providerOrder ?? []).filter(
      (p) => !disabled.has(p),
    ),
  };
}

function isExplicitCloudModel(chosenModel?: string): boolean {
  return !!chosenModel && chosenModel !== 'auto' && chosenModel !== 'local';
}

function resolveProviderOrderOverride(override?: ProviderId[]): ProviderId[] | undefined {
  return override?.length ? override : undefined;
}

function isLocalCrashContainmentError(error: unknown): boolean {
  const msg = (error as Error)?.message?.toLowerCase?.() ?? String(error).toLowerCase();
  return (
    msg.includes('temporarily disabled after a native failure') ||
    msg.includes('temporarily disabled to prevent repeated app crashes') ||
    msg.includes('caused a native crash on the last attempt') ||
    msg.includes('crashed during initialization')
  );
}

export async function generateJSONWithRouting<T>(
  messages: Message[],
  schema: z.ZodType<T>,
  taskComplexity: 'low' | 'high' = 'low',
  queueOnFailure = true,
  forceProvider?: 'groq' | 'gemini',
  providerOrderOverride?: ProviderId[],
): Promise<{ parsed: T; modelUsed: string }> {
  const jsonRouteMessages = clampMessagesForStructuredJsonRouting(messages);
  const profile = await profileRepository.getProfile();
  const {
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
    githubCopilotConnected,
    gitlabDuoConnected,
    poeConnected,
    providerOrder: profileProviderOrder,
  } = getBackendAttemptOrder(profile);
  let providerOrder = resolveProviderOrderOverride(providerOrderOverride) ?? profileProviderOrder;

  if (forceProvider === 'groq') {
    // First card: only try the primary Groq model (gpt-oss-120b) for speed.
    // No silent fallback to Llama — if it fails, fall through to next provider.
    const base =
      providerOrder && providerOrder.length > 0 ? providerOrder : [...DEFAULT_PROVIDER_ORDER];
    const rest = base.filter((p) => p !== 'groq');
    providerOrder = ['groq', ...rest];
  } else if (forceProvider === 'gemini') {
    const base =
      providerOrder && providerOrder.length > 0 ? providerOrder : [...DEFAULT_PROVIDER_ORDER];
    const rest = base.filter((p) => p !== 'gemini' && p !== 'gemini_fallback');
    providerOrder = ['gemini', 'gemini_fallback', ...rest];
  }

  const trace = createAiRequestTrace('json', jsonRouteMessages, {
    taskComplexity,
    queueOnFailure,
    forceProvider: forceProvider ?? 'auto',
    providerOrderOverride: providerOrderOverride?.join(' -> ') ?? 'default',
  });

  let lastError: Error | null = null;
  for (const backend of attempts) {
    try {
      if (backend === 'local') {
        try {
          const { text, modelUsed } = await attemptLocalLLM(
            jsonRouteMessages,
            profile.localModelPath!,
            false,
          );
          const parsed = await parseStructuredJson(text, schema);
          trace.success({
            backend,
            modelUsed,
            responseChars: text.length,
            responsePreview: previewText(text),
            responseText: text,
          });
          return { parsed, modelUsed };
        } catch (err) {
          if (!isLocalCrashContainmentError(err)) throw err;
          trace.fail(err, { backend: 'local', contained: true });
          lastError = err as Error;
          continue;
        }
      }

      const { text, modelUsed } = await attemptCloudLLM(
        jsonRouteMessages,
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
        githubCopilotConnected,
        gitlabDuoConnected,
        poeConnected,
        profile.githubCopilotPreferredModel,
        profile.gitlabDuoPreferredModel,
        forceProvider === 'groq',
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
  const profile = await profileRepository.getProfile();

  // If a specific model is chosen and it's local
  if (options?.chosenModel === 'local' && profile.localModelPath && !isLocalLlmUsable(profile)) {
    throw new Error(
      getLocalLlmRamWarning() ??
        'On-device text AI is disabled on this device to avoid low-memory crashes.',
    );
  }
  if (options?.chosenModel === 'local' && isLocalLlmUsable(profile)) {
    const trace = createAiRequestTrace('text', messages, {
      chosenModel: options?.chosenModel ?? 'auto',
      preferCloud: options?.preferCloud ?? false,
      providerOrderOverride: options?.providerOrderOverride?.join(' -> ') ?? 'default',
      queueOnFailure,
    });
    try {
      const result = await attemptLocalLLM(messages, profile.localModelPath!, true);
      trace.success({
        backend: 'local',
        modelUsed: result.modelUsed,
        responseChars: result.text.length,
        responsePreview: previewText(result.text),
        responseText: result.text,
      });
      return result;
    } catch (err) {
      if (isLocalCrashContainmentError(err) && options?.chosenModel === 'local') {
        trace.fail(err, { backend: 'local', contained: true, fallbackBlocked: true });
      }
      trace.fail(err, { backend: 'local' });
      throw err;
    }
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
    githubCopilotConnected,
    gitlabDuoConnected,
    poeConnected,
    providerOrder: profileProviderOrder,
  } = getBackendAttemptOrder(profile);

  const trace = createAiRequestTrace('text', messages, {
    chosenModel: options?.chosenModel ?? 'auto',
    preferCloud: options?.preferCloud ?? false,
    providerOrderOverride: options?.providerOrderOverride?.join(' -> ') ?? 'default',
    queueOnFailure,
  });
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
              githubCopilotConnected,
              gitlabDuoConnected,
              poeConnected,
              profile.githubCopilotPreferredModel,
              profile.gitlabDuoPreferredModel,
              false, // groqPrimaryOnly — only true for forceProvider==='groq' in generateJSON
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
      if (backend === 'local' && isLocalCrashContainmentError(err)) {
        trace.fail(err, { backend, contained: true });
        lastError = err as Error;
        continue;
      }
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
  const profile = await profileRepository.getProfile();

  if (options?.chosenModel === 'local' && profile.localModelPath && !isLocalLlmUsable(profile)) {
    throw new Error(
      getLocalLlmRamWarning() ??
        'On-device text AI is disabled on this device to avoid low-memory crashes.',
    );
  }
  if (options?.chosenModel === 'local' && isLocalLlmUsable(profile)) {
    const trace = createAiRequestTrace('stream', messages, {
      chosenModel: options?.chosenModel ?? 'auto',
      providerOrderOverride: options?.providerOrderOverride?.join(' -> ') ?? 'default',
      queueOnFailure,
    });
    try {
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
    } catch (err) {
      if (isLocalCrashContainmentError(err) && options?.chosenModel === 'local') {
        trace.fail(err, { backend: 'local', contained: true, fallbackBlocked: true });
      }
      trace.fail(err, { backend: 'local' });
      throw err;
    }
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
    githubCopilotConnected,
    gitlabDuoConnected,
    poeConnected,
    providerOrder: profileProviderOrder,
  } = getBackendAttemptOrder(profile);

  const trace = createAiRequestTrace('stream', messages, {
    chosenModel: options?.chosenModel ?? 'auto',
    providerOrderOverride: options?.providerOrderOverride?.join(' -> ') ?? 'default',
    queueOnFailure,
  });
  const streamProviderOrder =
    resolveProviderOrderOverride(options?.providerOrderOverride) ?? profileProviderOrder;
  const attempts = isExplicitCloudModel(options?.chosenModel)
    ? ['cloud' as const]
    : initialAttempts;

  let lastError: Error | null = null;
  for (const backend of attempts) {
    try {
      if (backend === 'local') {
        try {
          const { text, modelUsed } = await attemptLocalLLM(
            messages,
            profile.localModelPath!,
            true,
          );
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
        } catch (err) {
          if (!isLocalCrashContainmentError(err)) throw err;
          trace.fail(err, { backend, contained: true });
          lastError = err as Error;
          continue;
        }
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
        githubCopilotConnected,
        gitlabDuoConnected,
        poeConnected,
        profile.githubCopilotPreferredModel,
        profile.gitlabDuoPreferredModel,
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
