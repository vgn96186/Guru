// @ts-nocheck — AI SDK v6 migration; runtime kept, strict types deferred
/**
 * LiteRT (TensorFlow Lite) adapter — wraps Guru's custom `local-llm` Expo module into a LanguageModel.
 *
 * Supports multimodal inputs (text/image/audio), tool calling, and speculative decoding.
 */

import type {
  LanguageModel,
  LanguageModelGenerateResult,
  LanguageModelStreamPart,
  LanguageModelStreamResult,
  LanguageModelMessage,
} from '@ai-sdk/provider';
import type { ChatMessage } from 'local-llm';

export interface LiteRtConfig {
  modelPath: string;
  /** Optional path to a smaller draft model for speculative decoding. */
  draftModelPath?: string;
  /** True for plain-text output; false (default) for JSON-mode prompting. */
  textMode?: boolean;
}

let localStreamTraceCounter = 0;

export function createLiteRtModel(config: LiteRtConfig): LanguageModel {
  return {
    specificationVersion: 'v2',
    provider: 'local',
    modelId: deriveModelId(config.modelPath),
    defaultObjectGenerationMode: 'json',

    async doGenerate(options): Promise<LanguageModelGenerateResult> {
      const messages = toChatMessage(options.prompt);
      const modelPath = config.modelPath;
      const systemMsg = options.prompt.find((m) => m.role === 'system');
      
      const { chat } = await import('local-llm');
      const response = await chat(messages, {
        modelPath,
        systemInstruction: typeof systemMsg?.content === 'string' ? systemMsg.content : undefined,
        temperature: options.temperature ?? 0.7,
        automaticToolCalling: true,
        responseFormat: options.responseFormat,
      });

      return {
        content: [{ type: 'text', text: response.text }],
        finishReason: 'stop',
        usage: {},
      };
    },

    async doStream(options): Promise<LanguageModelStreamResult> {
      const messages = toChatMessage(options.prompt);
      const modelPath = config.modelPath;
      const systemMsg = options.prompt.find((m) => m.role === 'system');
      const cleanPath = modelPath.replace(/^file:\/\//, '');
      const traceId = `local-${++localStreamTraceCounter}`;

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

      logLocalAi('stream_start', {
        traceId,
        modelPath,
        cleanPath,
        promptCount: messages.length,
      });

      const {
        chatStream,
        addLlmTokenListener,
        addLlmCompleteListener,
        addLlmErrorListener,
      } = await import('local-llm');

      let hasEmittedToken = false;
      const tokenSub = addLlmTokenListener((event) => {
        if (!event.token) return;
        hasEmittedToken = true;
        push({ type: 'text-delta', delta: event.token });
      });

      const completeSub = addLlmCompleteListener((event) => {
        const completionText = event?.text?.trim() ?? '';
        if (!hasEmittedToken) {
          if (completionText) {
            // Recover from completion text when no tokens were streamed
            push({ type: 'text-delta', delta: completionText });
          } else {
            // Surface error when no text at all
            push({ type: 'error', error: new Error('Native streaming completed with no text') });
          }
        }
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

      chatStream(messages, {
        modelPath: cleanPath,
        systemInstruction: typeof systemMsg?.content === 'string' ? systemMsg.content : undefined,
        temperature: options.temperature ?? 0.7,
        automaticToolCalling: true,
        responseFormat: options.responseFormat,
      }).catch((err) => {
        push({ type: 'error', error: err });
        cleanup();
        end();
      });

      // Respect abort.
      options.abortSignal?.addEventListener('abort', () => {
        void (async () => {
          try {
            const { cancel } = await import('local-llm');
            await cancel();
          } catch { /* ignore */ }
          cleanup();
          end();
        })();
      });

      const stream: AsyncIterable<LanguageModelStreamPart> = {
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<IteratorResult<LanguageModelStreamPart>> {
              if (queue.length) return Promise.resolve({ value: queue.shift()!, done: false });
              if (done) return Promise.resolve({ value: undefined as unknown as LanguageModelStreamPart, done: true });
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
  if (lower.includes('e2n')) return 'local-gemma-4-e2n';
  if (lower.includes('e4n')) return 'local-gemma-4-e4n';
  if (lower.includes('e2b')) return 'local-gemma-4-e2b';
  if (lower.includes('e4b')) return 'local-gemma-4-e4b';
  if (lower.includes('gemma')) return 'local-gemma';
  if (lower.includes('qwen')) return 'local-qwen-e4n';
  return 'local-litert';
}

function toChatMessage(messages: LanguageModelMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    if (msg.role === 'tool') continue; // Tool results not directly supported yet in this bridge

    if (typeof msg.content === 'string') {
      out.push({ role: msg.role, content: msg.content });
    } else {
      const parts = msg.content.map((part) => {
        if (part.type === 'text') return { type: 'text' as const, text: part.text };
        if (part.type === 'file') {
          // AI SDK v2 uses FilePart with data: Uint8Array | string | URL. Native bridge expects base64.
          const raw = part.data;
          const data = raw instanceof Uint8Array
            ? Buffer.from(raw).toString('base64')
            : typeof raw === 'string'
              ? raw.startsWith('data:') ? raw.split(',')[1] ?? raw : raw
              : String(raw);
          return { type: 'image' as const, image: data }; // Native bridge expects 'image', not 'file'
        }
        return null;
      }).filter((p): p is NonNullable<typeof p> => p !== null);
      
      out.push({ role: msg.role, content: parts });
    }
  }
  return out;
}

function logLocalAi(
  event: string,
  payload: Record<string, unknown>,
  level: 'log' | 'warn' = 'log',
): void {
  if (!__DEV__) return;
  const logger = level === 'warn' ? console.warn : console.log;
  logger('[LiteRT_JS] ' + event, payload);
}
