// @ts-nocheck — AI SDK v6 migration; runtime kept, strict types deferred
/**
 * Poe (OAuth) adapter — wraps callPoe / streamPoeChat from llmRouting.ts.
 * Auth token comes from poeTokenStore.getValidAccessToken(). Tool calling not
 * supported in this iteration — throws so fallback picks another provider.
 */

import type {
  LanguageModel,
  LanguageModelGenerateResult,
  LanguageModelStreamPart,
  LanguageModelStreamResult,
  LanguageModelMessage as ModelMessage,
} from '@ai-sdk/provider';
import { callPoe, streamPoeChat } from '../llmRouting';
import { getValidAccessToken } from '../poe/poeTokenStore';
import type { Message as LegacyMessage } from '../types';

export interface PoeConfig {
  modelId: string;
}

export function createPoeModel(config: PoeConfig): LanguageModel {
  return {
    specificationVersion: 'v2',
    provider: 'poe',
    modelId: config.modelId,

    async doGenerate(options): Promise<LanguageModelGenerateResult> {
      if (options.tools?.length) {
        throw new Error('[poe] tool calling not supported — let fallback pick another provider');
      }
      const token = await getValidAccessToken();
      const legacy = toLegacyMessages(options.prompt);
      const jsonMode = options.responseFormat?.type === 'json';
      const text = await callPoe(legacy, token, config.modelId, jsonMode);
      return {
        content: text ? [{ type: 'text', text }] : [],
        finishReason: 'stop',
        usage: {},
      };
    },

    async doStream(options): Promise<LanguageModelStreamResult> {
      if (options.tools?.length) {
        throw new Error('[poe] tool calling not supported — let fallback pick another provider');
      }
      const token = await getValidAccessToken();
      const legacy = toLegacyMessages(options.prompt);
      const modelId = config.modelId;

      const { stream, push, end } = makeBridge();
      const textId = 'text-0';
      let textStarted = false;

      void streamPoeChat(legacy, token, modelId, (delta) => {
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
  const queue: LanguageModelStreamPart[] = [];
  let resolveNext: ((v: IteratorResult<LanguageModelStreamPart>) => void) | null = null;
  let done = false;

  const push = (part: LanguageModelStreamPart) => {
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
      resolveNext({ value: undefined as unknown as LanguageModelStreamPart, done: true });
      resolveNext = null;
    }
  };

  const stream: AsyncIterable<LanguageModelStreamPart> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<LanguageModelStreamPart>> {
          if (queue.length) {
            return Promise.resolve({ value: queue.shift()!, done: false });
          }
          if (done) {
            return Promise.resolve({
              value: undefined as unknown as LanguageModelStreamPart,
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
