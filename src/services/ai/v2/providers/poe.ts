/**
 * Poe (OAuth) adapter — OpenAI-compatible Chat Completions via API.
 * Auth token comes from poeTokenStore.getValidAccessToken().
 */

import type { LanguageModelV2 } from '../spec';
import { createOpenAICompatibleModel } from './openaiCompatible';
import { getValidAccessToken } from '../../poe/poeTokenStore';

export interface PoeConfig {
  modelId: string;
}

export function createPoeModel(config: PoeConfig): LanguageModelV2 {
  return createOpenAICompatibleModel({
    provider: 'poe',
    modelId: config.modelId,
    url: 'https://api.poe.com/v1/chat/completions',
    headers: async () => ({
      Authorization: `Bearer ${await getValidAccessToken()}`,
    }),
  });
}

