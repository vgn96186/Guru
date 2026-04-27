/**
 * Preset factories for OpenAI-compatible providers Guru already uses.
 *
 * Each factory takes the auth material and returns a LanguageModelV2. For
 * providers with non-OpenAI wire formats (Gemini, ChatGPT web, Copilot web),
 * write a dedicated adapter — these presets only cover the easy cases.
 */

import { createOpenAICompatibleModel } from './openaiCompatible';
import type { LanguageModelV2 } from '../spec';
import { G4F_PROXY_URL } from '../../../../config/appConfig';

export function createGroqModel(opts: { modelId: string; apiKey: string }): LanguageModelV2 {
  return createOpenAICompatibleModel({
    provider: 'groq',
    modelId: opts.modelId,
    url: 'https://api.groq.com/openai/v1/chat/completions',
    headers: () => ({ Authorization: `Bearer ${opts.apiKey}` }),
  });
}

export function createOpenRouterModel(opts: {
  modelId: string;
  apiKey: string;
  referer?: string;
  title?: string;
}): LanguageModelV2 {
  return createOpenAICompatibleModel({
    provider: 'openrouter',
    modelId: opts.modelId,
    url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: () => ({
      Authorization: `Bearer ${opts.apiKey}`,
      ...(opts.referer ? { 'HTTP-Referer': opts.referer } : {}),
      ...(opts.title ? { 'X-Title': opts.title } : {}),
    }),
  });
}

export function createDeepSeekModel(opts: { modelId: string; apiKey: string }): LanguageModelV2 {
  return createOpenAICompatibleModel({
    provider: 'deepseek',
    modelId: opts.modelId,
    url: 'https://api.deepseek.com/v1/chat/completions',
    headers: () => ({ Authorization: `Bearer ${opts.apiKey}` }),
    transformRequestBody: (body, options) => {
      if (options.webSearch) {
        body.web_search = true;
      }
      return body;
    },
  });
}

export function createCloudflareModel(opts: {
  modelId: string;
  accountId: string;
  apiToken: string;
}): LanguageModelV2 {
  return createOpenAICompatibleModel({
    provider: 'cloudflare',
    modelId: opts.modelId,
    url: `https://api.cloudflare.com/client/v4/accounts/${opts.accountId}/ai/v1/chat/completions`,
    headers: () => ({ Authorization: `Bearer ${opts.apiToken}` }),
  });
}

export function createGitHubModelsModel(opts: { modelId: string; token: string }): LanguageModelV2 {
  return createOpenAICompatibleModel({
    provider: 'github-models',
    modelId: opts.modelId,
    url: 'https://models.inference.ai.azure.com/chat/completions',
    headers: () => ({ Authorization: `Bearer ${opts.token}` }),
  });
}

export function createG4FModel(
  opts: {
    modelId?: string;
    url?: string;
    apiKey?: string;
  } = {},
): LanguageModelV2 {
  const url = opts.url ?? G4F_PROXY_URL ?? '';
  if (!url) {
    throw new Error(
      'G4F proxy URL not configured. Set EXPO_PUBLIC_G4F_URL in .env ' +
        '(see deploy/g4f/README.md) or pass { url } explicitly.',
    );
  }
  return createOpenAICompatibleModel({
    provider: 'g4f',
    modelId: opts.modelId ?? 'auto',
    url,
    headers: () => {
      const h: Record<string, string> = {};
      if (opts.apiKey) h.Authorization = `Bearer ${opts.apiKey}`;
      return h;
    },
  });
}
