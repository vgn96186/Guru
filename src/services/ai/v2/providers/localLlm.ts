/**
 * Local LLM adapter — wraps Guru's custom `local-llm` Expo module (Kotlin
 * LiteRT runtime adapted from Edge Gallery / PokéClaw) into a LanguageModelV2.
 *
 * Uses `attemptLocalLLMStream()` from llmRouting.ts for real token-by-token
 * streaming (LocalLlm.chatStream + onLlmToken event listeners). `doGenerate`
 * uses the non-streaming `attemptLocalLLM()`.
 *
 * Tool calling is NOT supported by LiteRT today. If tools are provided we
 * drop them with a warning. Follow-up: prompt-level tool-call protocol
 * (model emits `<tool_call>{...}</tool_call>` JSON, we parse + invoke).
 */

import type {
  LanguageModelV2,
  LanguageModelV2GenerateResult,
  LanguageModelV2StreamPart,
  LanguageModelV2StreamResult,
  ModelMessage,
} from '../spec';
import { attemptLocalLLM, attemptLocalLLMStream } from '../../llmRouting';
import type { Message as LegacyMessage } from '../../types';

export interface LocalLlmConfig {
  modelPath: string;
  /** True for plain-text output; false (default) for JSON-mode prompting. */
  textMode?: boolean;
}

export function createLocalLlmModel(config: LocalLlmConfig): LanguageModelV2 {
  return {
    specificationVersion: 'v2',
    provider: 'local',
    modelId: deriveModelId(config.modelPath),

    async doGenerate(options): Promise<LanguageModelV2GenerateResult> {
      warnIfTools(options.tools);
      const legacy = toLegacyMessages(options.prompt);
      const { text } = await attemptLocalLLM(legacy, config.modelPath, config.textMode ?? false);
      return {
        content: text ? [{ type: 'text', text }] : [],
        finishReason: 'stop',
        usage: {},
      };
    },

    async doStream(options): Promise<LanguageModelV2StreamResult> {
      warnIfTools(options.tools);
      const legacy = toLegacyMessages(options.prompt);
      const modelPath = config.modelPath;
      const textMode = config.textMode ?? false;

      // Bridge event-stream → async iterator.
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
          resolveNext({
            value: undefined as unknown as LanguageModelV2StreamPart,
            done: true,
          });
          resolveNext = null;
        }
      };

      const textId = 'text-0';
      let textStarted = false;

      // Kick off streaming in the background.
      void attemptLocalLLMStream(
        legacy,
        modelPath,
        textMode,
        (delta) => {
          if (!textStarted) {
            textStarted = true;
            push({ type: 'text-start', id: textId });
          }
          push({ type: 'text-delta', id: textId, delta });
        },
      )
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

      // Respect abort.
      options.abortSignal?.addEventListener('abort', () => {
        // Native cancel. Not awaited — fire and forget.
        void (async () => {
          try {
            const { cancel } = await import('local-llm');
            await cancel();
          } catch {
            // ignore
          }
        })();
      });

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

      return { stream };
    },
  };
}

function deriveModelId(path: string): string {
  const lower = path.toLowerCase();
  if (lower.includes('e2b')) return 'local-gemma-4-e2b';
  if (lower.includes('e4b')) return 'local-gemma-4-e4b';
  if (lower.includes('gemma')) return 'local-gemma';
  if (lower.includes('qwen')) return 'local-qwen';
  return 'local-litert';
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

function warnIfTools(tools: unknown): void {
  if (Array.isArray(tools) && tools.length) {
    // eslint-disable-next-line no-console
    console.warn('[v2/localLlm] tools not supported on local LiteRT — dropping');
  }
}
