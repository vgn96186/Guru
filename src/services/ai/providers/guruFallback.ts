// @ts-nocheck — AI SDK v6 migration; runtime kept, strict types deferred
/**
 * createGuruFallbackModel — wires the v2 framework to Guru's real profile.
 *
 * Reads `profile.providerOrder` / `profile.disabledProviders` / per-provider
 * keys and builds a `LanguageModel` that tries providers in order until one
 * succeeds. This is the one integration point the rest of the app talks to.
 */

import { DEFAULT_PROVIDER_ORDER, type ProviderId, type UserProfile } from '../../../types';
import { BUNDLED_GEMINI_FALLBACK_KEY } from '../../../config/appConfig';
import type { LanguageModel } from '@ai-sdk/provider';
import { createFallbackModel } from './fallback';
import {
  createGroqModel,
  createOpenRouterModel,
  createDeepSeekModel,
  createCloudflareModel,
  createGitHubModelsModel,
} from './presets';
import { createOpenAICompatibleModel } from './openaiCompatible';
import { createGeminiModel } from './gemini';
import { createLiteRtModel } from './liteRtLm';
import { createChatGptModel } from './chatgpt';
import { createGitHubCopilotModel } from './githubCopilot';
import { createGitLabDuoModel } from './gitlabDuo';
import { createPoeModel } from './poe';
import { createQwenModel } from './qwen';
import { createGeminiNanoModel } from './geminiNano';
import { Platform } from 'react-native';

export interface GuruFallbackOptions {
  profile: UserProfile;
  /** Override model ids per provider. Defaults chosen to match existing routing. */
  modelIds?: Partial<Record<ProviderId | 'local', string>>;
  /** Force a specific provider chain (ignores profile order). */
  forceOrder?: ProviderId[];
  /** True for plain-text output (chat); false (default) for JSON-mode prompting. Only affects local models. */
  textMode?: boolean;
  /** If true, explicitly bypasses the local model even if enabled in the profile. */
  disableLocal?: boolean;
  onProviderError?: (provider: string, modelId: string, error: unknown) => void;
  onProviderSuccess?: (provider: string, modelId: string) => void;
}

const DEFAULT_MODEL_IDS: Record<ProviderId | 'local', string> = {
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  deepseek: 'deepseek-chat',
  cloudflare: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  github: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  gemini_fallback: 'gemini-1.5-flash',
  agentrouter: 'gpt-4o-mini',
  kilo: 'gpt-4o-mini',
  chatgpt: 'gpt-4o-mini',
  github_copilot: 'gpt-4o',
  gitlab_duo: 'gpt-4o',
  poe: 'GPT-4o-Mini',
  qwen: 'qwen2.5-72b-instruct',
  local: '',
};

export function createGuruFallbackModel(opts: GuruFallbackOptions): LanguageModel {
  const { profile } = opts;
  const disabled = new Set<ProviderId>(profile.disabledProviders ?? []);
  const order: ProviderId[] =
    opts.forceOrder ??
    (profile.providerOrder?.length ? profile.providerOrder : DEFAULT_PROVIDER_ORDER);
  const ids = { ...DEFAULT_MODEL_IDS, ...(opts.modelIds ?? {}) };

  const models: LanguageModel[] = [];

  // Local models go first if enabled.
  if (profile.useLocalModel && !opts.disableLocal) {
    // 1. Gemini Nano (AICore) — High performance OS-managed local model
    if (Platform.OS === 'android') {
      models.push(
        createGeminiNanoModel({
          temperature: opts.textMode ? 0.2 : 0.1,
        }),
      );
    }

    // 2. LiteRT (TensorFlow Lite) — Backup local model
    const localPath = profile.localModelPath?.trim();
    if (localPath) {
      models.push(
        createLiteRtModel({
          modelPath: localPath,
          textMode: opts.textMode ?? false,
        }),
      );
    }
  }

  for (const providerId of order) {
    if (disabled.has(providerId)) continue;
    const model = tryCreateProvider(providerId, profile, ids);
    if (model) models.push(model);
  }

  if (!models.length) {
    throw new Error(
      'createGuruFallbackModel: no providers available. Save an API key or connect OAuth in Settings.',
    );
  }

  return createFallbackModel({
    models,
    onProviderError: opts.onProviderError,
    onProviderSuccess: opts.onProviderSuccess,
  });
}

function tryCreateProvider(
  providerId: ProviderId,
  profile: UserProfile,
  ids: Record<ProviderId | 'local', string>,
): LanguageModel | null {
  switch (providerId) {
    case 'groq':
      return profile.groqApiKey
        ? createGroqModel({ modelId: ids.groq, apiKey: profile.groqApiKey })
        : null;

    case 'openrouter':
      return profile.openrouterKey
        ? createOpenRouterModel({
            modelId: ids.openrouter,
            apiKey: profile.openrouterKey,
            title: 'Guru',
          })
        : null;

    case 'deepseek':
      return profile.deepseekKey
        ? createDeepSeekModel({ modelId: ids.deepseek, apiKey: profile.deepseekKey })
        : null;

    case 'cloudflare':
      return profile.cloudflareAccountId && profile.cloudflareApiToken
        ? createCloudflareModel({
            modelId: ids.cloudflare,
            accountId: profile.cloudflareAccountId,
            apiToken: profile.cloudflareApiToken,
          })
        : null;

    case 'github':
      return profile.githubModelsPat
        ? createGitHubModelsModel({ modelId: ids.github, token: profile.githubModelsPat })
        : null;

    case 'gemini':
      return profile.geminiKey
        ? createGeminiModel({
            modelId: ids.gemini,
            apiKey: profile.geminiKey,
          })
        : null;

    case 'gemini_fallback': {
      const fallbackKey = BUNDLED_GEMINI_FALLBACK_KEY || profile.geminiKey;
      return fallbackKey
        ? createGeminiModel({
            modelId: ids.gemini_fallback,
            apiKey: fallbackKey,
          })
        : null;
    }

    case 'kilo':
      return profile.kiloApiKey
        ? createOpenAICompatibleModel({
            provider: 'kilo',
            modelId: ids.kilo,
            url: 'https://api.kilo.ai/v1/chat/completions',
            headers: () => ({ Authorization: `Bearer ${profile.kiloApiKey}` }),
          })
        : null;

    case 'agentrouter':
      return profile.agentRouterKey
        ? createOpenAICompatibleModel({
            provider: 'agentrouter',
            modelId: ids.agentrouter,
            url: 'https://agentrouter.org/v1/chat/completions',
            headers: () => ({ Authorization: `Bearer ${profile.agentRouterKey}` }),
          })
        : null;

    case 'chatgpt':
      return profile.chatgptConnected ? createChatGptModel({ modelId: ids.chatgpt }) : null;

    case 'github_copilot':
      return profile.githubCopilotConnected
        ? createGitHubCopilotModel({
            modelId: profile.githubCopilotPreferredModel || ids.github_copilot,
          })
        : null;

    case 'gitlab_duo':
      return profile.gitlabDuoConnected ? createGitLabDuoModel({ modelId: ids.gitlab_duo }) : null;

    case 'poe':
      return profile.poeConnected ? createPoeModel({ modelId: ids.poe }) : null;

    case 'qwen':
      return profile.qwenConnected ? createQwenModel({ modelId: ids.qwen }) : null;

    default:
      return null;
  }
}
