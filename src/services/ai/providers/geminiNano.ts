// @ts-nocheck — AI SDK v6 migration; runtime kept, strict types deferred
/**
 * Gemini Nano (AICore) adapter — bridges to the unified `local-llm` module.
 * 
 * Provides on-device inference for compatible Android devices (Pixel 8+, S24+).
 * Now supports proper native streaming and bridge-less token pushing.
 */

import type {
  LanguageModel,
  LanguageModelStreamPart,
} from '@ai-sdk/provider';

export interface GeminiNanoConfig {
  temperature?: number;
  topK?: number;
  maxOutputTokens?: number;
}

export function createGeminiNanoModel(config: GeminiNanoConfig = {}): LanguageModel {
  return {
    specificationVersion: 'v2',
    provider: 'google-nano',
    modelId: 'gemini-nano',

    async doGenerate(options) {
      const { chat, initialize, isSupported } = await import('local-llm');
      
      const supported = await isSupported('aicore');
      if (!supported) {
        throw new Error('[gemini-nano] Device not supported or AICore not available.');
      }

      await initialize({
        provider: 'aicore',
        temperature: config.temperature ?? 0.2,
        topK: config.topK ?? 16,
        maxNumTokens: config.maxOutputTokens ?? 2048
      });

      const response = await chat(toChatMessage(options.prompt), {
        temperature: options.temperature,
      });

      return {
        content: [{ type: 'text', text: response.text }],
        finishReason: 'stop',
        usage: {},
      };
    },

    async doStream(options) {
      const { chatStream, initialize, isSupported, addLlmTokenListener, addLlmCompleteListener, addLlmErrorListener } = await import('local-llm');
      
      const supported = await isSupported('aicore');
      if (!supported) {
        throw new Error('[gemini-nano] Device not supported or AICore not available.');
      }

      await initialize({
        provider: 'aicore',
        temperature: config.temperature ?? 0.2,
        topK: config.topK ?? 16,
        maxNumTokens: config.maxOutputTokens ?? 2048
      });

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
          resolveNext({ value: undefined as any, done: true });
          resolveNext = null;
        }
      };

      const textId = 'text-0';
      let textStarted = false;

      const tokenSub = addLlmTokenListener((event) => {
        if (!textStarted) {
          textStarted = true;
          push({ type: 'text-start', id: textId });
        }
        push({ type: 'text-delta', id: textId, delta: event.token });
      });

      const completeSub = addLlmCompleteListener((event) => {
        if (textStarted) push({ type: 'text-end', id: textId });
        push({ type: 'finish', finishReason: 'stop', usage: {} });
        cleanup();
        end();
      });

      const errorSub = addLlmErrorListener((event) => {
        push({ type: 'error', error: new Error(event.error) });
        cleanup();
        end();
      });

      const cleanup = () => {
        tokenSub.remove();
        completeSub.remove();
        errorSub.remove();
      };

      chatStream(toChatMessage(options.prompt), {
        temperature: options.temperature,
      }).catch((err) => {
        push({ type: 'error', error: err });
        cleanup();
        end();
      });

      const stream: AsyncIterable<LanguageModelStreamPart> = {
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<IteratorResult<LanguageModelStreamPart>> {
              if (queue.length) return Promise.resolve({ value: queue.shift()!, done: false });
              if (done) return Promise.resolve({ value: undefined as any, done: true });
              return new Promise((r) => (resolveNext = r));
            },
          };
        },
      };

      return { stream };
    },
  };
}

function toChatMessage(messages: any[]) {
  return messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
  }));
}
