// @ts-nocheck — AI SDK v6 migration; runtime kept, strict types deferred
/**
 * ChatGPT Codex adapter — uses OpenAI's **Responses API**.
 *
 * Endpoint: `https://chatgpt.com/backend-api/codex/responses`
 * Auth: OAuth access token + `chatgpt-account-id` header (per-slot).
 *
 * This is the only provider in Guru that doesn't speak Chat Completions,
 * so it goes through `createResponsesApiModel` (our Responses-native adapter)
 * instead of `createOpenAICompatibleModel`. Tool calling works natively via
 * Responses' `function_call` / `function_call_output` input items.
 */

import type { LanguageModel } from '@ai-sdk/provider';
import { createResponsesApiModel } from './responsesApi';
import { getValidAccessToken, getAccountId } from '../chatgpt/chatgptTokenStore';
import type { ChatGptAccountSlot } from '../../../types';

const RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses';
const OPENAI_BETA_HEADER = 'responses=experimental';
const ORIGINATOR_HEADER = 'codex_cli_rs';

const DEFAULT_CODEX_INSTRUCTIONS =
  'You are Codex, a careful coding assistant. Follow the user instructions exactly and return useful plain text.';

export interface ChatGptConfig {
  modelId: string;
  slot?: ChatGptAccountSlot;
}

function getChatGptFetch(): typeof fetch {
  try {
    const expoFetchModule = require('expo/fetch') as { fetch?: typeof fetch };
    if (typeof expoFetchModule.fetch === 'function') {
      return expoFetchModule.fetch.bind(expoFetchModule);
    }
  } catch {
    // Fall through to global fetch in tests.
  }
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis) as typeof fetch;
  }
  throw new Error('No fetch implementation available for ChatGPT transport');
}

export function createChatGptModel(config: ChatGptConfig): LanguageModel {
  const slot: ChatGptAccountSlot = config.slot ?? 'primary';
  return createResponsesApiModel({
    provider: 'chatgpt',
    modelId: config.modelId,
    url: RESPONSES_URL,
    headers: async () => {
      const [accessToken, accountId] = await Promise.all([
        getValidAccessToken(slot),
        getAccountId(slot),
      ]);
      return {
        Authorization: `Bearer ${accessToken}`,
        'OpenAI-Beta': OPENAI_BETA_HEADER,
        Originator: ORIGINATOR_HEADER,
        ...(accountId ? { 'chatgpt-account-id': accountId } : {}),
      };
    },
    defaultInstructions: DEFAULT_CODEX_INSTRUCTIONS,
    extraBody: {
      store: false,
      include: ['reasoning.encrypted_content'],
    },
    fetch: getChatGptFetch(),
  });
}
