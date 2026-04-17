import { AppState } from 'react-native';
import * as LocalLlm from '../../../modules/local-llm';
import type { Message } from './types';
import { profileRepository } from '../../db/repositories';
import {
  OPENROUTER_FREE_MODELS,
  GROQ_MODELS,
  GEMINI_MODELS,
  CLOUDFLARE_MODELS,
  DEEPSEEK_MODELS,
  AGENTROUTER_MODELS,
  CHATGPT_MODELS,
  GITHUB_MODELS_CHAT_MODELS,
  orderedGitHubCopilotModels,
  orderedGitLabDuoModels,
  POE_MODELS,
} from './config';
import { RateLimitError } from './schemas';
import { readOpenAiCompatibleSse } from './openaiChatCompletionsSse';
import { callOpenRouter, streamOpenRouterChat } from './providers/openrouter';
import { callCloudflare, streamCloudflareChat } from './providers/cloudflare';
import { callGroq, streamGroqChat } from './providers/groq';
import { callDeepSeek, streamDeepSeekChat } from './providers/deepseek';
import { callGitHubModels, streamGitHubModelsChat } from './providers/githubModels';
import { callGitHubCopilot, streamGitHubCopilotChat } from './providers/githubCopilot';
import { callKilo, streamKiloChat, getKiloPreferredModels } from './providers/kilo';
import { callAgentRouter, streamAgentRouterChat } from './providers/agentrouter';
import { emitPseudoStreamFallback, ensureJsonModeHint, clampMessagesToCharBudget } from './providers/utils';
import { geminiGenerateContentSdk, geminiGenerateContentStreamSdk } from './google/geminiChat';
import { callChatGpt, streamChatGpt } from './chatgpt/chatgptApi';
import { getValidAccessToken as getGitHubCopilotToken } from './github/githubTokenStore';
import { getValidAccessToken as getGitLabDuoToken } from './gitlab/gitlabTokenStore';
import { completeGitLabDuoOpenCodeGateway } from './gitlab/gitlabDuoOpenCode';
import { isGitLabDuoOpenCodeGatewayModel } from './gitlab/gitlabDuoGatewayModels';
import { getValidAccessToken as getPoeToken } from './poe/poeTokenStore';
import type { ChatGptAccountSlot, ProviderId } from '../../types';
import { DEFAULT_PROVIDER_ORDER } from '../../types';
import { logStreamEvent } from './runtimeDebug';

let localLlmLoaded = false;
let currentLlamaPath: string | null = null;
let llamaContextPromise: Promise<void> | null = null;
type AppStateSubscription = { remove?: () => void };
const APPSTATE_SUB_KEY = '__guru_llmRouting_appState_sub_v1';

// Promise-based mutex: prevents concurrent LLM generation which corrupts native context.
// Unlike a boolean flag, this properly queues callers and can't deadlock on thrown errors.
let _contextLockPromise: Promise<void> = Promise.resolve();
let _contextLockCount = 0;

function acquireContextLock(): Promise<() => void> {
  let release!: () => void;
  const prev = _contextLockPromise;
  _contextLockPromise = new Promise<void>((resolve) => {
    release = () => {
      _contextLockCount--;
      resolve();
    };
  });
  _contextLockCount++;
  return prev.then(() => release);
}

function isContextInUse(): boolean {
  return _contextLockCount > 0;
}

async function ensureLocalLlmLoaded(modelPath: string): Promise<void> {
  if (localLlmLoaded && currentLlamaPath === modelPath) return;
  // Mutex: if another caller is already initializing, await the same promise
  if (llamaContextPromise) {
    await llamaContextPromise;
    if (localLlmLoaded && currentLlamaPath === modelPath) return;
  }
  llamaContextPromise = (async () => {
    if (localLlmLoaded) {
      await LocalLlm.release();
      localLlmLoaded = false;
    }
    await LocalLlm.initialize({ modelPath, maxNumTokens: 3072 });
    localLlmLoaded = true;
    currentLlamaPath = modelPath;
  })();
  try {
    await llamaContextPromise;
  } finally {
    llamaContextPromise = null;
  }
}

/** Release the native LLM context to free memory. Safe to call at any time. */
export async function releaseLlamaContext(): Promise<void> {
  if (isContextInUse() || llamaContextPromise) return; // don't interrupt in-flight generation or init
  if (localLlmLoaded) {
    try {
      await LocalLlm.release();
    } catch (err) {
      console.warn('[LLM] Failed to release native context:', err);
    }
    localLlmLoaded = false;
    currentLlamaPath = null;
  }
}

// Release the 200 MB+ LLM context when app goes to background to prevent OOM kills.
// Store the subscription on `globalThis` so hot reload can't stack listeners.
const prevSub = (globalThis as Record<string, unknown>)[APPSTATE_SUB_KEY] as
  | AppStateSubscription
  | undefined;
if (prevSub?.remove) prevSub.remove();
(globalThis as Record<string, unknown>)[APPSTATE_SUB_KEY] = AppState.addEventListener(
  'change',
  async (state) => {
    if (state === 'background' || state === 'inactive') {
      await releaseLlamaContext();
    }
  },
) as AppStateSubscription;

async function callLocalLLM(
  messages: Message[],
  modelPath: string,
  _textMode = false,
): Promise<string> {
  await ensureLocalLlmLoaded(modelPath);
  const release = await acquireContextLock();
  try {
    const chatMessages: LocalLlm.ChatMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const result = await LocalLlm.chat(chatMessages, { temperature: 0.7, topP: 0.9 });
    return result.text;
  } finally {
    release();
  }
}


/**
 * Single ceiling for {@link generateJSONWithRouting} before any cloud/local structured call.
 * Avoids ~hundreds-of-kB prompts that exhaust Groq, Copilot (even after per-provider clamps), and GitLab.
 */
const STRUCTURED_JSON_ROUTING_CHAR_BUDGET = 56_000;

export function clampMessagesForStructuredJsonRouting(messages: Message[]): Message[] {
  return clampMessagesToCharBudget(
    messages,
    STRUCTURED_JSON_ROUTING_CHAR_BUDGET,
    'Structured JSON routing',
  );
}


// ── GitLab Duo (OpenCode gateway only) ─────────────────────────────────
// All models route through: OAuth `read_user api` → `POST .../api/v4/ai/third_party_agents/direct_access`
// → GitLab AI Gateway (`EXPO_PUBLIC_GITLAB_AI_GATEWAY_URL`, default cloud.gitlab.com) Anthropic/OpenAI proxy.
// The legacy `POST {instance}/api/v4/chat/completions` is deprecated (502 on most instances).

export async function callGitLabDuo(
  messages: Message[],
  accessToken: string,
  model: string,
  jsonMode = true,
): Promise<string> {
  if (__DEV__) console.log(`[AI] callGitLabDuo attempt: model=${model} json=${jsonMode}`);
  const clonedMessages = jsonMode ? ensureJsonModeHint(messages) : [...messages];

  if (!isGitLabDuoOpenCodeGatewayModel(model)) {
    throw new Error(
      `GitLab Duo model "${model}" is not mapped to the AI Gateway. Add it to gitlabDuoGatewayModels.ts or remove it from GITLAB_DUO_MODELS.`,
    );
  }

  if (__DEV__) console.log(`[AI] callGitLabDuo OpenCode gateway: model=${model}`);
  return completeGitLabDuoOpenCodeGateway(clonedMessages, accessToken, model, jsonMode);
}

export async function streamGitLabDuoChat(
  messages: Message[],
  accessToken: string,
  model: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  // All GitLab Duo models go through the OpenCode gateway (Anthropic/OpenAI proxy).
  // The gateway doesn't support SSE for the proxy endpoints, so we pseudo-stream.
  const text = await callGitLabDuo(messages, accessToken, model, false);
  await emitPseudoStreamFallback(text, onDelta, {
    provider: 'gitlab_duo',
    model,
    reason: 'gateway_no_sse',
  });
  if (!text.trim()) throw new Error(`Empty response from GitLab Duo model ${model}`);
  return text;
}

// ── Poe (OAuth) ─────────────────────────────────────────────────────────
function poeHeaders(accessToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

const POE_API_URL = 'https://api.poe.com/v1/chat/completions';

export async function callPoe(
  messages: Message[],
  accessToken: string,
  model: string,
  jsonMode = true,
): Promise<string> {
  if (__DEV__) console.log(`[AI] callPoe attempt: model=${model} json=${jsonMode}`);
  const clonedMessages = jsonMode ? ensureJsonModeHint(messages) : [...messages];

  const body: Record<string, unknown> = {
    model,
    messages: clonedMessages,
    temperature: 0.7,
    max_tokens: 4096,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(POE_API_URL, {
    method: 'POST',
    headers: poeHeaders(accessToken),
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    throw new RateLimitError(`Poe rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Poe error ${res.status} (${model}): ${err}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new Error(`Empty response from Poe model ${model}`);
  return text;
}

export async function streamPoeChat(
  messages: Message[],
  accessToken: string,
  model: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const res = await fetch(POE_API_URL, {
    method: 'POST',
    headers: poeHeaders(accessToken),
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    }),
  });

  if (res.status === 429) {
    throw new RateLimitError(`Poe rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Poe error ${res.status} (${model}): ${err}`);
  }

  if (!res.body) {
    logStreamEvent('no_body_fallback', { provider: 'poe', model });
    const text = await callPoe(messages, accessToken, model, false);
    await emitPseudoStreamFallback(text, onDelta, {
      provider: 'poe',
      model,
      reason: 'no_body',
    });
    return text;
  }

  const text = await readOpenAiCompatibleSse(res, onDelta);
  logStreamEvent('sse_complete', {
    provider: 'poe',
    model,
    outputChars: text.length,
  });
  if (!text.trim()) throw new Error(`Empty response from Poe model ${model}`);
  return text;
}


/** Keys bag shared by the provider loop helpers. */
interface ProviderKeys {
  groqKey?: string;
  githubModelsPat?: string;
  kiloApiKey?: string;
  deepseekKey?: string;
  agentRouterKey?: string;
  geminiKey?: string;
  geminiFallbackKey?: string;
  orKey?: string;
  cfAccountId?: string;
  cfApiToken?: string;
  chatgptConnected?: boolean;
  chatgptSlots?: ChatGptAccountSlot[];
  githubCopilotConnected?: boolean;
  /** When set, Copilot auto-routing tries this model id first (must be in {@link GITHUB_COPILOT_MODELS}). */
  githubCopilotPreferredModel?: string;
  gitlabDuoConnected?: boolean;
  /** When set, GitLab Duo auto-routing tries this model id first (must be in {@link GITLAB_DUO_MODELS}). */
  gitlabDuoPreferredModel?: string;
  poeConnected?: boolean;
}

/** Ensure chatgpt is in the provider order (old saved orders won't have it). */
function ensureChatGptInOrder(order: ProviderId[]): ProviderId[] {
  if (order.includes('chatgpt')) return order;
  return ['chatgpt', ...order];
}

/** Check if a provider has a usable key configured. */
function providerHasKey(provider: ProviderId, keys: ProviderKeys): boolean {
  switch (provider) {
    case 'chatgpt':
      return !!keys.chatgptConnected;
    case 'github_copilot':
      return !!keys.githubCopilotConnected;
    case 'gitlab_duo':
      return !!keys.gitlabDuoConnected;
    case 'poe':
      return !!keys.poeConnected;
    case 'groq':
      return !!keys.groqKey;
    case 'github':
      return !!keys.githubModelsPat;
    case 'kilo':
      return true; // kilo-auto/free works without auth
    case 'deepseek':
      return !!keys.deepseekKey;
    case 'agentrouter':
      return !!keys.agentRouterKey;
    case 'gemini':
      return !!keys.geminiKey;
    case 'gemini_fallback':
      return !!keys.geminiFallbackKey;
    case 'openrouter':
      return !!keys.orKey;
    case 'cloudflare':
      return !!(keys.cfAccountId && keys.cfApiToken);
    default:
      return false;
  }
}

/**
 * OAuth providers can show "connected" in SQLite while SecureStore has no refresh token.
 * For accurate `[AI] … available:` dev logs, verify tokens once.
 */
async function refineAvailableProvidersForDevLog(available: ProviderId[]): Promise<ProviderId[]> {
  const out: ProviderId[] = [];
  for (const p of available) {
    if (p === 'github_copilot') {
      try {
        await getGitHubCopilotToken();
      } catch {
        continue;
      }
    } else if (p === 'gitlab_duo') {
      try {
        await getGitLabDuoToken();
      } catch {
        continue;
      }
    } else if (p === 'poe') {
      try {
        await getPoeToken();
      } catch {
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

function getChatGptFallbackSlots(keys: ProviderKeys): ChatGptAccountSlot[] {
  if (keys.chatgptSlots?.length) return keys.chatgptSlots;
  return keys.chatgptConnected ? ['primary'] : [];
}

function shouldRetryChatGptOnBackup(error: Error): boolean {
  if (error instanceof RateLimitError) return true;
  const message = error.message.toLowerCase();
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('failed to fetch') ||
    message.includes('no refresh token') ||
    message.includes('token refresh failed') ||
    message.includes('chatgpt request error (401)') ||
    message.includes('chatgpt stream error (401)') ||
    message.includes('chatgpt request error (429)') ||
    message.includes('chatgpt stream error (429)') ||
    message.includes('chatgpt request error (500)') ||
    message.includes('chatgpt request error (502)') ||
    message.includes('chatgpt request error (503)') ||
    message.includes('chatgpt request error (504)') ||
    message.includes('chatgpt stream error (500)') ||
    message.includes('chatgpt stream error (502)') ||
    message.includes('chatgpt stream error (503)') ||
    message.includes('chatgpt stream error (504)')
  ) {
    return true;
  }
  return false;
}

async function callChatGptWithFallback(
  messages: Message[],
  model: string,
  jsonMode: boolean,
  slots: ChatGptAccountSlot[],
): Promise<string> {
  let lastError: Error | null = null;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    try {
      return await callChatGpt(messages, model, jsonMode, slot);
    } catch (err) {
      lastError = err as Error;
      if (i === slots.length - 1 || !shouldRetryChatGptOnBackup(lastError)) {
        throw lastError;
      }
    }
  }
  throw lastError ?? new Error('ChatGPT failed for all configured accounts');
}

async function streamChatGptWithFallback(
  messages: Message[],
  model: string,
  onDelta: (delta: string) => void,
  slots: ChatGptAccountSlot[],
): Promise<string> {
  let lastError: Error | null = null;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    let emitted = false;
    try {
      return await streamChatGpt(
        messages,
        model,
        (delta) => {
          emitted = true;
          onDelta(delta);
        },
        slot,
      );
    } catch (err) {
      lastError = err as Error;
      if (emitted || i === slots.length - 1 || !shouldRetryChatGptOnBackup(lastError)) {
        throw lastError;
      }
    }
  }
  throw lastError ?? new Error('ChatGPT failed for all configured accounts');
}

/**
 * Try all models for a single provider. Pass `onDelta` for streaming, omit for non-streaming.
 * Returns result or null if no model succeeded.
 */
async function tryProviderUnified(
  provider: ProviderId,
  messages: Message[],
  { json = false, onDelta }: { json?: boolean; onDelta?: (delta: string) => void },
  skipModel: string | undefined,
  keys: ProviderKeys,
): Promise<{ text: string; modelUsed: string } | null> {
  const tryModels = async (
    models: readonly string[],
    fn: (model: string) => Promise<string>,
    prefix: string,
  ): Promise<{ text: string; modelUsed: string } | null> => {
    for (const model of models) {
      if (skipModel && model === skipModel) continue;
      try {
        if (__DEV__) console.log(`[AI] trying ${prefix || 'or'}/${model}...`);
        const text = await fn(model);
        return { text, modelUsed: prefix ? `${prefix}/${model}` : model };
      } catch (err) {
        if (__DEV__)
          console.warn(`[AI] ${prefix || 'or'}/${model} failed:`, (err as Error).message);
        continue;
      }
    }
    return null;
  };

  switch (provider) {
    case 'chatgpt':
      if (!keys.chatgptConnected) return null;
      return tryModels(
        CHATGPT_MODELS,
        onDelta
          ? (m) => streamChatGptWithFallback(messages, m, onDelta, getChatGptFallbackSlots(keys))
          : (m) => callChatGptWithFallback(messages, m, json, getChatGptFallbackSlots(keys)),
        'chatgpt',
      );
    case 'github_copilot': {
      if (!keys.githubCopilotConnected) return null;
      let copilotToken: string;
      try {
        copilotToken = await getGitHubCopilotToken();
      } catch (err) {
        if (__DEV__) console.warn(`[AI] github_copilot skipped:`, (err as Error).message);
        return null;
      }
      return tryModels(
        orderedGitHubCopilotModels(keys.githubCopilotPreferredModel),
        onDelta
          ? (m) => streamGitHubCopilotChat(messages, copilotToken, m, onDelta)
          : (m) => callGitHubCopilot(messages, copilotToken, m, json),
        'github_copilot',
      );
    }
    case 'gitlab_duo':
      if (!keys.gitlabDuoConnected) return null;
      return tryModels(
        orderedGitLabDuoModels(keys.gitlabDuoPreferredModel),
        async (m) => {
          const token = await getGitLabDuoToken();
          return onDelta
            ? streamGitLabDuoChat(messages, token, m, onDelta)
            : callGitLabDuo(messages, token, m, json);
        },
        'gitlab_duo',
      );
    case 'poe':
      if (!keys.poeConnected) return null;
      return tryModels(
        POE_MODELS,
        async (m) => {
          const token = await getPoeToken();
          return onDelta
            ? streamPoeChat(messages, token, m, onDelta)
            : callPoe(messages, token, m, json);
        },
        'poe',
      );
    case 'groq':
      if (!keys.groqKey) return null;
      return tryModels(
        GROQ_MODELS,
        onDelta
          ? (m) => streamGroqChat(messages, keys.groqKey!, m, onDelta)
          : (m) => callGroq(messages, keys.groqKey!, m, json),
        'groq',
      );
    case 'github':
      if (!keys.githubModelsPat) return null;
      return tryModels(
        GITHUB_MODELS_CHAT_MODELS,
        onDelta
          ? (m) => streamGitHubModelsChat(messages, keys.githubModelsPat!, m, onDelta)
          : (m) => callGitHubModels(messages, keys.githubModelsPat!, m, json),
        'github',
      );
    case 'kilo':
      if (!keys.kiloApiKey) return null;
      return tryModels(
        await getKiloPreferredModels(keys.kiloApiKey),
        onDelta
          ? (m) => streamKiloChat(messages, keys.kiloApiKey!, m, onDelta)
          : (m) => callKilo(messages, keys.kiloApiKey!, m, json),
        'kilo',
      );
    case 'deepseek':
      if (!keys.deepseekKey) return null;
      return tryModels(
        DEEPSEEK_MODELS,
        onDelta
          ? (m) => streamDeepSeekChat(messages, keys.deepseekKey!, m, onDelta)
          : (m) => callDeepSeek(messages, keys.deepseekKey!, m, json),
        'deepseek',
      );
    case 'agentrouter':
      if (!keys.agentRouterKey) return null;
      return tryModels(
        AGENTROUTER_MODELS,
        onDelta
          ? (m) => streamAgentRouterChat(messages, keys.agentRouterKey!, m, onDelta)
          : (m) => callAgentRouter(messages, keys.agentRouterKey!, m, json),
        'ar',
      );
    case 'gemini':
      if (!keys.geminiKey) return null;
      return tryModels(
        GEMINI_MODELS,
        onDelta
          ? (m) => geminiGenerateContentStreamSdk(messages, keys.geminiKey!, m, onDelta)
          : (m) => geminiGenerateContentSdk(messages, keys.geminiKey!, m),
        'gemini',
      );
    case 'gemini_fallback':
      if (!keys.geminiFallbackKey) return null;
      return tryModels(
        GEMINI_MODELS,
        onDelta
          ? (m) => geminiGenerateContentStreamSdk(messages, keys.geminiFallbackKey!, m, onDelta)
          : (m) => geminiGenerateContentSdk(messages, keys.geminiFallbackKey!, m),
        'gemini',
      );
    case 'openrouter':
      if (!keys.orKey) return null;
      return tryModels(
        OPENROUTER_FREE_MODELS,
        onDelta
          ? (m) => streamOpenRouterChat(messages, keys.orKey!, m, onDelta)
          : (m) => callOpenRouter(messages, keys.orKey!, m),
        '',
      );
    case 'cloudflare':
      if (!keys.cfAccountId || !keys.cfApiToken) return null;
      return tryModels(
        CLOUDFLARE_MODELS,
        onDelta
          ? (m) => streamCloudflareChat(messages, keys.cfAccountId!, keys.cfApiToken!, m, onDelta)
          : (m) => callCloudflare(messages, keys.cfAccountId!, keys.cfApiToken!, m),
        'cf',
      );
    default:
      return null;
  }
}

interface ParsedChosenModel {
  preferredGroqModel: string | undefined;
  preferredGeminiModel: string | undefined;
  preferredCfModel: string | undefined;
  preferredDeepseekModel: string | undefined;
  preferredGithubModel: string | undefined;
  preferredKiloModel: string | undefined;
  preferredAgentRouterModel: string | undefined;
  preferredChatGptModel: string | undefined;
  preferredGithubCopilotModel: string | undefined;
  preferredGitlabDuoModel: string | undefined;
  preferredPoeModel: string | undefined;
  preferredOpenRouterModel: string | undefined;
}

function parseChosenModel(chosenModel: string | undefined): ParsedChosenModel {
  const preferredGroqModel = chosenModel?.startsWith('groq/')
    ? chosenModel.replace('groq/', '')
    : undefined;
  const preferredGeminiModel = chosenModel?.startsWith('gemini/')
    ? chosenModel.replace('gemini/', '')
    : undefined;
  const preferredCfModel = chosenModel?.startsWith('cf/')
    ? chosenModel.replace('cf/', '')
    : undefined;
  const preferredDeepseekModel = chosenModel?.startsWith('deepseek/')
    ? chosenModel.replace('deepseek/', '')
    : undefined;
  const preferredGithubModel = chosenModel?.startsWith('github/')
    ? chosenModel.replace('github/', '')
    : undefined;
  const preferredKiloModel = chosenModel?.startsWith('kilo/')
    ? chosenModel.replace('kilo/', '')
    : undefined;
  const preferredAgentRouterModel = chosenModel?.startsWith('ar/')
    ? chosenModel.replace('ar/', '')
    : undefined;
  const preferredChatGptModel = chosenModel?.startsWith('chatgpt/')
    ? chosenModel.replace('chatgpt/', '')
    : undefined;
  const preferredGithubCopilotModel = chosenModel?.startsWith('github_copilot/')
    ? chosenModel.replace('github_copilot/', '')
    : undefined;
  const preferredGitlabDuoModel = chosenModel?.startsWith('gitlab_duo/')
    ? chosenModel.replace('gitlab_duo/', '')
    : undefined;
  const preferredPoeModel = chosenModel?.startsWith('poe/')
    ? chosenModel.replace('poe/', '')
    : undefined;
  const preferredOpenRouterModel =
    chosenModel &&
    !preferredGroqModel &&
    !preferredGeminiModel &&
    !preferredCfModel &&
    !preferredDeepseekModel &&
    !preferredGithubModel &&
    !preferredKiloModel &&
    !preferredAgentRouterModel &&
    !preferredChatGptModel &&
    !preferredGithubCopilotModel &&
    !preferredGitlabDuoModel &&
    !preferredPoeModel &&
    chosenModel !== 'local' &&
    chosenModel !== 'auto'
      ? chosenModel
      : undefined;
  return {
    preferredGroqModel,
    preferredGeminiModel,
    preferredCfModel,
    preferredDeepseekModel,
    preferredGithubModel,
    preferredKiloModel,
    preferredAgentRouterModel,
    preferredChatGptModel,
    preferredGithubCopilotModel,
    preferredGitlabDuoModel,
    preferredPoeModel,
    preferredOpenRouterModel,
  };
}

/**
 * Same routing policy as attemptCloudLLM, but streams assistant tokens via onDelta.
 * (JSON / structured output is not streamed — use {@link attemptCloudLLM} instead.)
 */
export async function attemptCloudLLMStream(
  messages: Message[],
  orKey: string | undefined,
  groqKey: string | undefined,
  chosenModel: string | undefined,
  onDelta: (delta: string) => void,
  geminiKey?: string | undefined,
  geminiFallbackKey?: string | undefined,
  cfAccountId?: string | undefined,
  cfApiToken?: string | undefined,
  deepseekKey?: string | undefined,
  githubModelsPat?: string | undefined,
  kiloApiKey?: string | undefined,
  agentRouterKey?: string | undefined,
  providerOrder?: ProviderId[],
  chatgptConnected?: boolean,
  chatgptSlots?: ChatGptAccountSlot[],
  githubCopilotConnected?: boolean,
  gitlabDuoConnected?: boolean,
  poeConnected?: boolean,
  githubCopilotPreferredModel?: string,
  gitlabDuoPreferredModel?: string,
): Promise<{ text: string; modelUsed: string }> {
  const {
    preferredGroqModel,
    preferredGeminiModel,
    preferredCfModel,
    preferredDeepseekModel,
    preferredGithubModel,
    preferredKiloModel,
    preferredAgentRouterModel,
    preferredChatGptModel,
    preferredGithubCopilotModel,
    preferredGitlabDuoModel,
    preferredPoeModel,
    preferredOpenRouterModel,
  } = parseChosenModel(chosenModel);

  let lastCloudError: Error | null = null;

  // 1. Explicit UI Selections
  if (preferredOpenRouterModel && orKey) {
    try {
      const text = await streamOpenRouterChat(messages, orKey, preferredOpenRouterModel, onDelta);
      return { text, modelUsed: preferredOpenRouterModel };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGroqModel && groqKey) {
    try {
      const text = await streamGroqChat(messages, groqKey, preferredGroqModel, onDelta);
      return { text, modelUsed: `groq/${preferredGroqModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGeminiModel && geminiKey) {
    try {
      const text = await geminiGenerateContentStreamSdk(
        messages,
        geminiKey,
        preferredGeminiModel,
        onDelta,
      );
      return { text, modelUsed: `gemini/${preferredGeminiModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredCfModel && cfAccountId && cfApiToken) {
    try {
      const text = await streamCloudflareChat(
        messages,
        cfAccountId,
        cfApiToken,
        preferredCfModel,
        onDelta,
      );
      return { text, modelUsed: `cf/${preferredCfModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGithubModel && githubModelsPat) {
    try {
      const text = await streamGitHubModelsChat(
        messages,
        githubModelsPat,
        preferredGithubModel,
        onDelta,
      );
      return { text, modelUsed: `github/${preferredGithubModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredKiloModel && kiloApiKey) {
    try {
      const text = await streamKiloChat(messages, kiloApiKey, preferredKiloModel, onDelta);
      return { text, modelUsed: `kilo/${preferredKiloModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredDeepseekModel && deepseekKey) {
    try {
      const text = await streamDeepSeekChat(messages, deepseekKey, preferredDeepseekModel, onDelta);
      return { text, modelUsed: `deepseek/${preferredDeepseekModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredAgentRouterModel && agentRouterKey) {
    try {
      const text = await streamAgentRouterChat(
        messages,
        agentRouterKey,
        preferredAgentRouterModel,
        onDelta,
      );
      return { text, modelUsed: `ar/${preferredAgentRouterModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredChatGptModel && chatgptConnected) {
    try {
      const text = await streamChatGptWithFallback(
        messages,
        preferredChatGptModel,
        onDelta,
        chatgptSlots?.length ? chatgptSlots : ['primary'],
      );
      return { text, modelUsed: `chatgpt/${preferredChatGptModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGithubCopilotModel && githubCopilotConnected) {
    try {
      const token = await getGitHubCopilotToken();
      const text = await streamGitHubCopilotChat(
        messages,
        token,
        preferredGithubCopilotModel,
        onDelta,
      );
      return { text, modelUsed: `github_copilot/${preferredGithubCopilotModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGitlabDuoModel && gitlabDuoConnected) {
    try {
      const token = await getGitLabDuoToken();
      const text = await streamGitLabDuoChat(messages, token, preferredGitlabDuoModel, onDelta);
      return { text, modelUsed: `gitlab_duo/${preferredGitlabDuoModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredPoeModel && poeConnected) {
    try {
      const token = await getPoeToken();
      const text = await streamPoeChat(messages, token, preferredPoeModel, onDelta);
      return { text, modelUsed: `poe/${preferredPoeModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  const userPickedSpecificModel =
    !!chosenModel && chosenModel !== 'auto' && chosenModel !== 'local';
  if (userPickedSpecificModel) {
    // #region agent log
    fetch('http://127.0.0.1:7507/ingest/f6a0734c-b45d-4770-9e51-aa07e5c2da6e', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ca9385' },
      body: JSON.stringify({
        sessionId: 'ca9385',
        hypothesisId: 'H3',
        location: 'llmRouting.attemptCloudLLMStream',
        message: 'explicit_model_failed_no_fallback',
        data: {
          chosenModel,
          lastError: lastCloudError?.message ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (lastCloudError) throw lastCloudError;
    throw new Error(
      `Could not use the selected chat model (${chosenModel}). Check API keys in Settings.`,
    );
  }

  // 2. Default Routing — iterate providers in user-defined (or default) order
  const order = ensureChatGptInOrder(
    providerOrder?.length ? providerOrder : DEFAULT_PROVIDER_ORDER,
  );
  const keys: ProviderKeys = {
    groqKey,
    githubModelsPat,
    kiloApiKey,
    deepseekKey,
    agentRouterKey,
    geminiKey,
    geminiFallbackKey,
    orKey,
    cfAccountId,
    cfApiToken,
    chatgptConnected,
    chatgptSlots,
    githubCopilotConnected,
    githubCopilotPreferredModel: (githubCopilotPreferredModel ?? '').trim() || undefined,
    gitlabDuoConnected,
    gitlabDuoPreferredModel: (gitlabDuoPreferredModel ?? '').trim() || undefined,
    poeConnected,
  };
  const skipModels: Record<string, string | undefined> = {
    chatgpt: preferredChatGptModel,
    groq: preferredGroqModel,
    github: preferredGithubModel,
    kilo: preferredKiloModel,
    deepseek: preferredDeepseekModel,
    agentrouter: preferredAgentRouterModel,
    gemini: preferredGeminiModel,
    gemini_fallback: preferredGeminiModel,
    openrouter: preferredOpenRouterModel,
    cloudflare: preferredCfModel,
    github_copilot: preferredGithubCopilotModel,
    gitlab_duo: preferredGitlabDuoModel,
    poe: preferredPoeModel,
  };

  if (__DEV__) {
    const flagged = order.filter((p) => providerHasKey(p, keys));
    const available = await refineAvailableProvidersForDevLog(flagged);
    console.log(
      `[AI] stream routing order: [${order.join(' → ')}] (available: ${available.join(', ')})`,
    );
  }

  for (const provider of order) {
    if (!providerHasKey(provider, keys)) {
      if (__DEV__) console.log(`[AI] skip ${provider} (no key)`);
      continue;
    }
    const skip = skipModels[provider];
    const result = await tryProviderUnified(provider, messages, { onDelta }, skip, keys);
    if (result) return result;
  }

  if (lastCloudError) {
    throw lastCloudError;
  }

  throw new Error('No AI backend available. Download a local model or add an API key in Settings.');
}

export async function attemptLocalLLM(
  messages: Message[],
  localModelPath: string,
  textMode: boolean,
): Promise<{ text: string; modelUsed: string }> {
  const isQwen = localModelPath.toLowerCase().includes('qwen');
  const isMedGemma = localModelPath.toLowerCase().includes('medgemma');
  const modelUsed = isMedGemma
    ? 'local-medgemma-4b'
    : isQwen
      ? 'local-qwen-2.5-3b'
      : 'local-llama-3.2-1b';
  try {
    const text = await callLocalLLM(messages, localModelPath, textMode);
    if (!text || !text.trim()) {
      throw new Error('Local model returned an empty response');
    }
    return { text, modelUsed };
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? String(err);
    // If the model file failed to load (corrupt/missing), clear the stored path
    // so the bootstrap will re-download it on next startup.
    if (
      msg.toLowerCase().includes('failed to load') ||
      msg.toLowerCase().includes('no such file') ||
      msg.toLowerCase().includes('invalid model')
    ) {
      // Important: free native memory on load failures to prevent leaks.
      if (!isContextInUse() && localLlmLoaded) {
        try {
          await LocalLlm.release();
        } catch (releaseErr) {
          console.warn('[LLM] Failed to release native context after load error:', releaseErr);
        }
      }
      localLlmLoaded = false;
      currentLlamaPath = null;
      llamaContextPromise = null;
      profileRepository
        .updateProfile({ localModelPath: null, useLocalModel: false })
        .catch(() => {});
      throw new Error(
        'Local model file is missing or corrupt — it will re-download on next startup.',
        { cause: err },
      );
    }
    throw err;
  }
}

export async function attemptLocalLLMStream(
  messages: Message[],
  localModelPath: string,
  _textMode: boolean,
  onDelta: (delta: string) => void,
): Promise<void> {
  await ensureLocalLlmLoaded(localModelPath);
  const release = await acquireContextLock();
  return new Promise<void>((resolve, reject) => {
    const chatMessages: LocalLlm.ChatMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const tokenSub = LocalLlm.addLlmTokenListener(({ token }) => {
      onDelta(token);
    });
    const completeSub = LocalLlm.addLlmCompleteListener(() => {
      tokenSub.remove();
      completeSub.remove();
      errorSub.remove();
      release();
      resolve();
    });
    const errorSub = LocalLlm.addLlmErrorListener(({ error }) => {
      tokenSub.remove();
      completeSub.remove();
      errorSub.remove();
      release();
      reject(new Error(error));
    });
    LocalLlm.chatStream(chatMessages, { temperature: 0.7, topP: 0.9 }).catch((err: unknown) => {
      tokenSub.remove();
      completeSub.remove();
      errorSub.remove();
      release();
      reject(err);
    });
  });
}

export async function attemptCloudLLM(
  messages: Message[],
  orKey: string | undefined,
  textMode: boolean,
  groqKey?: string | undefined,
  chosenModel?: string,
  geminiKey?: string | undefined,
  geminiFallbackKey?: string | undefined,
  cfAccountId?: string | undefined,
  cfApiToken?: string | undefined,
  deepseekKey?: string | undefined,
  githubModelsPat?: string | undefined,
  kiloApiKey?: string | undefined,
  agentRouterKey?: string | undefined,
  providerOrder?: ProviderId[],
  chatgptConnected?: boolean,
  chatgptSlots?: ChatGptAccountSlot[],
  githubCopilotConnected?: boolean,
  gitlabDuoConnected?: boolean,
  poeConnected?: boolean,
  githubCopilotPreferredModel?: string,
  gitlabDuoPreferredModel?: string,
): Promise<{ text: string; modelUsed: string }> {
  const {
    preferredGroqModel,
    preferredGeminiModel,
    preferredCfModel,
    preferredDeepseekModel,
    preferredGithubModel,
    preferredKiloModel,
    preferredAgentRouterModel,
    preferredChatGptModel,
    preferredGithubCopilotModel,
    preferredGitlabDuoModel,
    preferredPoeModel,
    preferredOpenRouterModel,
  } = parseChosenModel(chosenModel);

  let lastCloudError: Error | null = null;

  // 1. Explicit UI Selections
  if (preferredChatGptModel && chatgptConnected) {
    try {
      const text = await callChatGptWithFallback(
        messages,
        preferredChatGptModel,
        !textMode,
        chatgptSlots?.length ? chatgptSlots : ['primary'],
      );
      return { text, modelUsed: `chatgpt/${preferredChatGptModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredDeepseekModel && deepseekKey) {
    try {
      const text = textMode
        ? await callDeepSeek(messages, deepseekKey, preferredDeepseekModel, false)
        : await callDeepSeek(messages, deepseekKey, preferredDeepseekModel);
      return { text, modelUsed: `deepseek/${preferredDeepseekModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGithubModel && githubModelsPat) {
    try {
      const text = textMode
        ? await callGitHubModels(messages, githubModelsPat, preferredGithubModel, false)
        : await callGitHubModels(messages, githubModelsPat, preferredGithubModel);
      return { text, modelUsed: `github/${preferredGithubModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredKiloModel && kiloApiKey) {
    try {
      const text = textMode
        ? await callKilo(messages, kiloApiKey, preferredKiloModel, false)
        : await callKilo(messages, kiloApiKey, preferredKiloModel);
      return { text, modelUsed: `kilo/${preferredKiloModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredAgentRouterModel && agentRouterKey) {
    try {
      const text = textMode
        ? await callAgentRouter(messages, agentRouterKey, preferredAgentRouterModel, false)
        : await callAgentRouter(messages, agentRouterKey, preferredAgentRouterModel);
      return { text, modelUsed: `ar/${preferredAgentRouterModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredOpenRouterModel && orKey) {
    try {
      const text = await callOpenRouter(messages, orKey, preferredOpenRouterModel);
      return { text, modelUsed: preferredOpenRouterModel };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGroqModel && groqKey) {
    try {
      const text = textMode
        ? await callGroq(messages, groqKey, preferredGroqModel, false)
        : await callGroq(messages, groqKey, preferredGroqModel);
      return { text, modelUsed: `groq/${preferredGroqModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGeminiModel && geminiKey) {
    try {
      const text = await geminiGenerateContentSdk(messages, geminiKey, preferredGeminiModel);
      return { text, modelUsed: `gemini/${preferredGeminiModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredCfModel && cfAccountId && cfApiToken) {
    try {
      const text = await callCloudflare(messages, cfAccountId, cfApiToken, preferredCfModel);
      return { text, modelUsed: `cf/${preferredCfModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGithubCopilotModel && githubCopilotConnected) {
    try {
      const token = await getGitHubCopilotToken();
      const text = textMode
        ? await callGitHubCopilot(messages, token, preferredGithubCopilotModel, false)
        : await callGitHubCopilot(messages, token, preferredGithubCopilotModel);
      return { text, modelUsed: `github_copilot/${preferredGithubCopilotModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGitlabDuoModel && gitlabDuoConnected) {
    try {
      const token = await getGitLabDuoToken();
      const text = textMode
        ? await callGitLabDuo(messages, token, preferredGitlabDuoModel, false)
        : await callGitLabDuo(messages, token, preferredGitlabDuoModel);
      return { text, modelUsed: `gitlab_duo/${preferredGitlabDuoModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredPoeModel && poeConnected) {
    try {
      const token = await getPoeToken();
      const text = textMode
        ? await callPoe(messages, token, preferredPoeModel, false)
        : await callPoe(messages, token, preferredPoeModel);
      return { text, modelUsed: `poe/${preferredPoeModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  // 2. Default Routing — iterate providers in user-defined (or default) order
  const order = ensureChatGptInOrder(
    providerOrder?.length ? providerOrder : DEFAULT_PROVIDER_ORDER,
  );
  const keys2: ProviderKeys = {
    groqKey,
    githubModelsPat,
    kiloApiKey,
    deepseekKey,
    agentRouterKey,
    geminiKey,
    geminiFallbackKey,
    orKey,
    cfAccountId,
    cfApiToken,
    chatgptConnected,
    chatgptSlots,
    githubCopilotConnected,
    githubCopilotPreferredModel: (githubCopilotPreferredModel ?? '').trim() || undefined,
    gitlabDuoConnected,
    gitlabDuoPreferredModel: (gitlabDuoPreferredModel ?? '').trim() || undefined,
    poeConnected,
  };
  const skipModels: Record<string, string | undefined> = {
    chatgpt: preferredChatGptModel,
    groq: preferredGroqModel,
    github: preferredGithubModel,
    kilo: preferredKiloModel,
    deepseek: preferredDeepseekModel,
    agentrouter: preferredAgentRouterModel,
    gemini: preferredGeminiModel,
    gemini_fallback: preferredGeminiModel,
    openrouter: preferredOpenRouterModel,
    cloudflare: preferredCfModel,
    github_copilot: preferredGithubCopilotModel,
    gitlab_duo: preferredGitlabDuoModel,
    poe: preferredPoeModel,
  };

  if (__DEV__) {
    const flagged = order.filter((p) => providerHasKey(p, keys2));
    const available = await refineAvailableProvidersForDevLog(flagged);
    console.log(
      `[AI] routing order: [${order.join(' → ')}] (available: ${available.join(
        ', ',
      )}) textMode=${textMode}`,
    );
  }

  for (const provider of order) {
    if (!providerHasKey(provider, keys2)) continue;
    const skip = skipModels[provider];
    const result = await tryProviderUnified(provider, messages, { json: !textMode }, skip, keys2);
    if (result) return result;
  }

  if (lastCloudError) {
    throw lastCloudError;
  }

  throw new Error('No AI backend available. Download a local model or add an API key in Settings.');
}
