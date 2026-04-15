/**
 * GitLab Duo (OAuth) adapter — wraps callGitLabDuo / streamGitLabDuoChat from
 * llmRouting.ts. Auth token comes from gitlabTokenStore.getValidAccessToken().
 * Tool calling is not supported in this iteration — throws so the fallback
 * chain can pick another provider.
 */

import type {
  LanguageModelV2,
  LanguageModelV2GenerateResult,
  LanguageModelV2StreamPart,
  LanguageModelV2StreamResult,
  ModelMessage,
} from '../spec';
import { callGitLabDuo, streamGitLabDuoChat } from '../../llmRouting';
import { getValidAccessToken } from '../../gitlab/gitlabTokenStore';
import type { Message as LegacyMessage } from '../../types';

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
      const text = await callGitLabDuo(legacy, token, config.modelId, jsonMode);
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

      const { stream, push, end } = makeBridge();
      const textId = 'text-0';
      let textStarted = false;

      void streamGitLabDuoChat(legacy, token, modelId, (delta) => {
        if (!textStarted) {
          textStarted = true;
          push({ type: 'text-start', id: textId });
        }
        push({ type: 'text-delta', id: textId, delta });
      })
        .then(() => {
          if (textStarted) push({ type: 'text-end', id: textId });
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

function toLegacyMessages(messages: ModelMessage[]): LegacyMessage[] {
  const out: LegacyMessage[] = [];
  for (const msg of messages) {
    if (msg.role === 'tool') continue;
    const content =
      typeof msg.content === 'string'
        ? msg.content
        : msg.content
            .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
            .map((p) => p.text)
            .join('\n');
    out.push({ role: msg.role, content });
  }
  return out;
}

function makeBridge() {
  const queue: LanguageModelV2StreamPart[] = [];
  let resolveNext: ((v: IteratorResult<LanguageModelV2StreamPart>) => void) | null = null;
  let done = false;

  const push = (part: LanguageModelV2StreamPart) => {
    if (resolveNext) {
      resolveNext({ value: part, done: false });
      resolveNext = null;
    } else {
      queue.push(part);
    }
  };
  const end = () => {
    done = true;
    if (resolveNext) {
      resolveNext({ value: undefined as unknown as LanguageModelV2StreamPart, done: true });
      resolveNext = null;
    }
  };

  const stream: AsyncIterable<LanguageModelV2StreamPart> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<LanguageModelV2StreamPart>> {
          if (queue.length) {
            return Promise.resolve({ value: queue.shift()!, done: false });
          }
          if (done) {
            return Promise.resolve({
              value: undefined as unknown as LanguageModelV2StreamPart,
              done: true,
            });
          }
          return new Promise((r) => (resolveNext = r));
        },
      };
    },
  };

  return { stream, push, end };
}
