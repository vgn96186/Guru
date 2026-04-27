/**
 * createGuruFallbackModel — wires the v2 framework to Guru's real profile.
 *
 * Reads `profile.providerOrder` / `profile.disabledProviders` / per-provider
 * keys and builds a `LanguageModelV2` that tries providers in order until one
 * succeeds. This is the one integration point the rest of the app talks to.
 *
 * All 12 providers are ported (Groq, OpenRouter, DeepSeek, Cloudflare, GitHub
 * Models, Gemini, AgentRouter, Kilo, ChatGPT, GitHub Copilot, GitLab Duo, Poe,
 * Qwen) plus the local LiteRT model.
 *
 * Tool-calling support:
 *   ✓ Native via OpenAI-compat Chat Completions:
 *       Groq, OpenRouter, DeepSeek, Cloudflare, GitHub Models, AgentRouter,
 *       Kilo, GitHub Copilot, Qwen
 *   ✓ Native via OpenAI Responses API: ChatGPT (Codex)
 *   ✓ Native via Gemini function-declarations: Gemini
 *   ✗ Not yet: GitLab Duo, Poe — these adapters throw on tool calls so the
 *     fallback chain skips them for agentic flows.
 */

import { DEFAULT_PROVIDER_ORDER, type ProviderId, type UserProfile } from '../../../../types';
import { isAuthorizationKey } from '../../config';
import type { LanguageModelV2 } from '../spec';
import { createFallbackModel } from './fallback';
import { withMiddleware, createLoggingMiddleware } from '../middleware';
import {
  createGroqModel,
  createOpenRouterModel,
  createDeepSeekModel,
  createCloudflareModel,
  createGitHubModelsModel,
} from './presets';
import { createOpenAICompatibleModel } from './openaiCompatible';
import { createGeminiModel } from './gemini';
import { createLocalLlmModel, createNanoModel } from './localLlm';
import { createChatGptModel } from './chatgpt';
import { createGitHubCopilotModel } from './githubCopilot';
import { createGitLabDuoModel } from './gitlabDuo';
import { createPoeModel } from './poe';
import { createQwenModel } from './qwen';

export interface GuruFallbackOptions {
  profile: UserProfile;
  /** Override model ids per provider. Defaults chosen to match existing routing. */
  modelIds?: Partial<Record<ProviderId, string>>;
  /** Explicit UI-selected model id, e.g. `groq/...`, `gemini/...`, raw OpenRouter id, or `local`. */
  chosenModel?: string;
  /** Force a specific provider chain (ignores profile order). */
  forceOrder?: ProviderId[];
  /** True for plain-text output (chat); false (default) for JSON-mode prompting. Only affects local models. */
  textMode?: boolean;
  /** If true, explicitly bypasses the local model even if enabled in the profile (useful for background meta-tasks). */
  disableLocal?: boolean;
  onProviderError?: (provider: string, modelId: string, error: unknown) => void;
  onProviderSuccess?: (provider: string, modelId: string) => void;
}

const DEFAULT_MODEL_IDS: Record<ProviderId, string> = {
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
  vertex: 'gemini-2.5-flash',
  local: '',
};

type ChosenModelSelection = {
  forceOrder?: ProviderId[];
  modelIds?: Partial<Record<ProviderId, string>>;
  localOnly?: boolean;
};

function resolveChosenModelSelection(chosenModel: string | undefined): ChosenModelSelection {
  if (!chosenModel || chosenModel === 'auto') return {};
  if (chosenModel === 'local') {
    return {
      localOnly: true,
      modelIds: { local: '' },
    };
  }

  const prefixedProviders: Array<{
    prefix: string;
    provider: ProviderId;
  }> = [
    { prefix: 'groq/', provider: 'groq' },
    { prefix: 'gemini/', provider: 'gemini' },
    { prefix: 'cf/', provider: 'cloudflare' },
    { prefix: 'deepseek/', provider: 'deepseek' },
    { prefix: 'github/', provider: 'github' },
    { prefix: 'kilo/', provider: 'kilo' },
    { prefix: 'ar/', provider: 'agentrouter' },
    { prefix: 'chatgpt/', provider: 'chatgpt' },
    { prefix: 'github_copilot/', provider: 'github_copilot' },
    { prefix: 'gitlab_duo/', provider: 'gitlab_duo' },
    { prefix: 'poe/', provider: 'poe' },
    { prefix: 'qwen/', provider: 'qwen' },
    { prefix: 'vertex/', provider: 'vertex' },
  ];

  for (const { prefix, provider } of prefixedProviders) {
    if (chosenModel.startsWith(prefix)) {
      return {
        forceOrder: [provider],
        modelIds: {
          [provider]: chosenModel.slice(prefix.length),
        },
      };
    }
  }

  // Unprefixed explicit ids are treated as OpenRouter selections to match the current picker.
  return {
    forceOrder: ['openrouter'],
    modelIds: {
      openrouter: chosenModel,
    },
  };
}

export function createGuruFallbackModel(opts: GuruFallbackOptions): LanguageModelV2 {
  const { profile } = opts;
  const disabled = new Set<ProviderId>(profile.disabledProviders ?? []);
  const chosenSelection = resolveChosenModelSelection(opts.chosenModel);
  const order: ProviderId[] =
    chosenSelection.forceOrder ??
    opts.forceOrder ??
    (profile.providerOrder?.length ? profile.providerOrder : DEFAULT_PROVIDER_ORDER);
  const ids = {
    ...DEFAULT_MODEL_IDS,
    ...(opts.modelIds ?? {}),
    ...(chosenSelection.modelIds ?? {}),
  };

  const models: LanguageModelV2[] = [];
  const localOnly = chosenSelection.localOnly === true;
  const explicitCloudOnly = Boolean(chosenSelection.forceOrder?.length) && !localOnly;

  if (!explicitCloudOnly && localOnly) {
    models.push(...createLocalProviderModels(profile, ids, opts.textMode ?? false));
  }

  if (localOnly) {
    if (!models.length) {
      throw new Error(
        'createGuruFallbackModel: local model selected but no local model is configured.',
      );
    }
    const loggingMw = createLoggingMiddleware();
    const wrappedModels = models.map((m) => withMiddleware(m, loggingMw));
    return createFallbackModel({
      models: wrappedModels,
      onProviderError: opts.onProviderError,
      onProviderSuccess: opts.onProviderSuccess,
    });
  }

  for (const providerId of order) {
    if (disabled.has(providerId)) continue;
    if (providerId === 'local') {
      if (!opts.disableLocal && !explicitCloudOnly) {
        models.push(...createLocalProviderModels(profile, ids, opts.textMode ?? false));
      }
      continue;
    }

    const model = tryCreateProvider(providerId, profile, ids);
    if (model) models.push(model);
  }

  if (!models.length) {
    throw new Error(
      'createGuruFallbackModel: no providers available. Save an API key or connect OAuth in Settings. (Kilo: startup probe can succeed without a key; routed chat/embeddings still need a stored Kilo API key. Gemini Nano may be available on supported Pixel/Samsung devices via AICore.)',
    );
  }

  // Wrap every model with centralized logging middleware so all providers
  // get consistent request/stream/error tracing without manual logStreamEvent calls.
  const loggingMw = createLoggingMiddleware();
  const wrappedModels = models.map((m) => withMiddleware(m, loggingMw));

  return createFallbackModel({
    models: wrappedModels,
    onProviderError: opts.onProviderError,
    onProviderSuccess: opts.onProviderSuccess,
  });
}

function tryCreateProvider(
  providerId: ProviderId,
  profile: UserProfile,
  ids: Record<ProviderId, string>,
): LanguageModelV2 | null {
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
    case 'gemini_fallback':
      return profile.geminiKey
        ? createGeminiModel({
            modelId: providerId === 'gemini' ? ids.gemini : ids.gemini_fallback,
            apiKey: profile.geminiKey,
          })
        : null;

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

    case 'vertex': {
      // Priority 1: explicit Vertex token with project+location → Vertex AI endpoint
      if (profile.vertexAiToken && profile.vertexAiProject && profile.vertexAiLocation) {
        return createGeminiModel({
          modelId: ids.vertex,
          apiKey: profile.vertexAiToken,
          isVertex: true,
          vertexProject: profile.vertexAiProject,
          vertexLocation: profile.vertexAiLocation,
        });
      }
      // Priority 2: AQ authorization key from AI Studio field + project+location → Vertex AI endpoint
      if (
        profile.geminiKey &&
        isAuthorizationKey(profile.geminiKey) &&
        profile.vertexAiProject &&
        profile.vertexAiLocation
      ) {
        return createGeminiModel({
          modelId: ids.vertex,
          apiKey: profile.geminiKey,
          isVertex: true,
          vertexProject: profile.vertexAiProject,
          vertexLocation: profile.vertexAiLocation,
        });
      }
      // Priority 3: Vertex token without project/location → AI Studio endpoint
      if (profile.vertexAiToken) {
        return createGeminiModel({
          modelId: ids.vertex,
          apiKey: profile.vertexAiToken,
          isVertex: false,
        });
      }
      return null;
    }

    case 'local':
      return null;

    default:
      return null;
  }
}

function createLocalProviderModels(
  profile: UserProfile,
  ids: Record<ProviderId, string>,
  textMode: boolean,
): LanguageModelV2[] {
  const models: LanguageModelV2[] = [];
  const localPath = profile.localModelPath?.trim();

  if (profile.useLocalModel && localPath) {
    models.push(
      createLocalLlmModel({
        modelPath: ids.local || localPath,
        textMode,
      }),
    );
  }

  // Gemini Nano (AICore) lives under the "On-device" routing option. LiteRT is
  // tried first when configured because it has stronger quality and context.
  if (profile.useNano !== false) {
    try {
      models.push(createNanoModel());
    } catch {
      // Nano not available on this device - skip silently.
    }
  }

  return models;
}
