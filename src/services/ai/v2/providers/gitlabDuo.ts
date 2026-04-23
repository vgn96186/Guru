/**
 * GitLab Duo (OAuth) adapter — wraps callGitLabDuo / streamGitLabDuoChat from
 * llmRouting.ts. Auth token comes from gitlabTokenStore.getValidAccessToken().
 * Tool calling is not supported in this iteration — throws so the fallback
 * chain can pick another provider.
 */

import type {
  LanguageModelV2,
  LanguageModelV2GenerateResult,
  LanguageModelV2StreamResult,
} from '../spec';
import { createStreamBridge, toLegacyMessages } from './streamBridge';
import { completeGitLabDuoOpenCodeGateway } from '../../gitlab/gitlabDuoOpenCode';
import { getValidAccessToken } from '../../gitlab/gitlabTokenStore';

export interface GitLabDuoConfig {
  modelId: string;
}

export function createGitLabDuoModel(config: GitLabDuoConfig): LanguageModelV2 {
  return {
    specificationVersion: 'v2',
    provider: 'gitlab_duo',
    modelId: config.modelId,

    async doGenerate(options): Promise<LanguageModelV2GenerateResult> {
      if (options.tools?.length) {
        throw new Error(
          '[gitlab_duo] tool calling not supported — let fallback pick another provider',
        );
      }
      const token = await getValidAccessToken();
      const legacy = toLegacyMessages(options.prompt);
      const jsonMode = options.responseFormat?.type === 'json';
      const text = await completeGitLabDuoOpenCodeGateway(legacy, token, config.modelId, jsonMode);
      return {
        content: text ? [{ type: 'text', text }] : [],
        finishReason: 'stop',
        usage: {},
      };
    },

    async doStream(options): Promise<LanguageModelV2StreamResult> {
      if (options.tools?.length) {
        throw new Error(
          '[gitlab_duo] tool calling not supported — let fallback pick another provider',
        );
      }
      const token = await getValidAccessToken();
      const legacy = toLegacyMessages(options.prompt);
      const modelId = config.modelId;

      const { stream, push, end } = createStreamBridge();
      const textId = 'text-0';
      let textStarted = false;

      // Pseudo-stream fallback since GitLab AI Gateway doesn't support SSE for these endpoints
      completeGitLabDuoOpenCodeGateway(legacy, token, modelId, false)
        .then((text) => {
          if (!textStarted) {
            textStarted = true;
            push({ type: 'text-start', id: textId });
          }
          // Yield it as a single chunk
          push({ type: 'text-delta', id: textId, delta: text });
          push({ type: 'text-end', id: textId });
          push({ type: 'finish', finishReason: 'stop', usage: {} });
          end();
        })
        .catch((err) => {
          push({ type: 'error', error: err });
          push({ type: 'finish', finishReason: 'error', usage: {} });
          end();
        });

      return { stream };
    },
  };
}

