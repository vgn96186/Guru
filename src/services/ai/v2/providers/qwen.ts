/**
 * Qwen (OAuth) adapter — OpenAI-compatible Chat Completions via DashScope.
 *
 * The resolved `apiBaseUrl` + `/chat/completions` accepts the standard OpenAI
 * wire format, so this goes through `createOpenAICompatibleModel` and gets
 * native tool calling. Auth + base URL come from the Qwen OAuth session
 * (`getQwenAccessToken()` → { apiKey | accessToken, resourceUrl }).
 */

import type { LanguageModelV2 } from '../spec';
import { createOpenAICompatibleModel } from './openaiCompatible';
import { getQwenAccessToken, resolveQwenBaseUrl } from '../../qwen/qwenAuth';

export interface QwenConfig {
  modelId: string;
}

export function createQwenModel(config: QwenConfig): LanguageModelV2 {
  // We resolve token + base URL once per request. Cache within a single call
  // so `url()` and `headers()` don't double-fetch the token store.
  let pending: Promise<{ url: string; authKey: string }> | null = null;
  const resolveOnce = () => {
    if (!pending) {
      pending = (async () => {
        const tokenResult = await getQwenAccessToken();
        if (!tokenResult?.accessToken) {
          throw new Error('Qwen OAuth token not available. Please authenticate in Settings.');
        }
        const authKey = tokenResult.apiKey || tokenResult.accessToken;
        const base = resolveQwenBaseUrl(tokenResult.resourceUrl);
        return { url: `${base}/chat/completions`, authKey };
      })();
      // Clear cache on next tick so concurrent calls share, but sequential
      // calls re-fetch (tokens may refresh).
      pending.finally(() => {
        setTimeout(() => {
          pending = null;
        }, 0);
      });
    }
    return pending;
  };

  return createOpenAICompatibleModel({
    provider: 'qwen',
    modelId: config.modelId,
    url: async () => (await resolveOnce()).url,
    headers: async () => ({
      Authorization: `Bearer ${(await resolveOnce()).authKey}`,
    }),
  });
}
