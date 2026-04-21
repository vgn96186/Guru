/**
 * Local LLM adapter — wraps Guru's custom `local-llm` Expo module (Kotlin
 * LiteRT runtime adapted from Edge Gallery / PokéClaw) into a LanguageModelV2.
 *
 * Uses blocking native `chat` (mutex via `chatWithLocalNative` in
 * llmRouting), then chunks output into stream parts. LiteRT-LM OpenAPI tools
 * are registered natively (`automaticToolCalling = false`); tool execution
 * stays in JS (`streamText` loop).
 */

import type {
  LanguageModelV2,
  LanguageModelV2GenerateResult,
  LanguageModelV2StreamPart,
  LanguageModelV2StreamResult,
  ModelMessage,
  ToolCallPart,
  ToolDescription,
} from '../spec';
import { chatWithLocalNative } from '../../llmRouting';
import type { ChatMessage } from 'local-llm';
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
      const toolsJson = toolsToJsonString(options.tools);
      const chatMessages = modelMessagesToChatMaps(options.prompt);
      const systemText = extractSystemText(options.prompt);
      const native = await chatWithLocalNative({
        chatMessages,
        modelPath: config.modelPath,
        systemInstruction: systemText || undefined,
        toolsJson,
      });
      const content = buildGenerateContent(native.text, native.toolCallsJson);
      const finishReason =
        parseLiteRtToolCallsJson(native.toolCallsJson).length > 0
          ? ('tool-calls' as const)
          : native.text?.trim()
            ? ('stop' as const)
            : ('error' as const);
      return {
        content,
        finishReason,
        usage: {},
        rawResponse: native,
      };
    },

    async doStream(options): Promise<LanguageModelV2StreamResult> {
      const toolsJson = toolsToJsonString(options.tools);
      const chatMessages = modelMessagesToChatMaps(options.prompt);
      const systemText = extractSystemText(options.prompt);
      const modelPath = config.modelPath;

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

      void (async () => {
        try {
          const native = await chatWithLocalNative({
            chatMessages,
            modelPath,
            systemInstruction: systemText || undefined,
            toolsJson,
          });
          const toolCalls = parseLiteRtToolCallsJson(native.toolCallsJson);
          for (const tc of toolCalls) {
            push({
              type: 'tool-call',
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              input: tc.input,
            });
          }
          const text = native.text ?? '';
          if (text.trim()) {
            const CHUNK_SIZE = 12;
            for (let i = 0; i < text.length; i += CHUNK_SIZE) {
              const delta = text.slice(i, i + CHUNK_SIZE);
              push({ type: 'text-delta', id: textId, delta });
            }
          }
          const finishReason =
            toolCalls.length > 0
              ? ('tool-calls' as const)
              : text.trim()
                ? ('stop' as const)
                : ('error' as const);
          if (finishReason === 'error' && __DEV__) {
            console.warn('[v2/localLlm] Native call returned empty text and no tool calls.');
          }
          push({ type: 'finish', finishReason, usage: {} });
          end();
        } catch (err) {
          if (__DEV__) {
            console.warn(
              '[v2/localLlm] Synchronous call error:',
              err instanceof Error ? err.message : err,
            );
          }
          push({ type: 'error', error: err });
          push({ type: 'finish', finishReason: 'error', usage: {} });
          end();
        }
      })();

      // Respect abort.
      options.abortSignal?.addEventListener('abort', () => {
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

function toolsToJsonString(tools: ToolDescription[] | undefined): string | undefined {
  if (!tools?.length) return undefined;
  return JSON.stringify(
    tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    })),
  );
}

function extractSystemText(messages: ModelMessage[]): string {
  const sys = messages.find((m) => m.role === 'system');
  if (!sys) return '';
  return typeof sys.content === 'string' ? sys.content : '';
}

/** Maps v2 messages to native chat rows (`role: tool` carries JSON tool results). */
function modelMessagesToChatMaps(messages: ModelMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    if (msg.role === 'user') {
      const c =
        typeof msg.content === 'string'
          ? msg.content
          : msg.content
              .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
              .map((p) => p.text)
              .join('\n');
      out.push({ role: 'user', content: c });
    } else if (msg.role === 'assistant') {
      const c =
        typeof msg.content === 'string'
          ? msg.content
          : msg.content
              .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
              .map((p) => p.text)
              .join('\n');
      out.push({ role: 'assistant', content: c });
    } else if (msg.role === 'tool') {
      out.push({ role: 'tool', content: JSON.stringify(msg.content) });
    }
  }
  return out;
}

function parseLiteRtToolCallsJson(json: string | null | undefined): ToolCallPart[] {
  if (!json?.trim()) return [];
  try {
    const arr = JSON.parse(json) as Array<{
      toolCallId: string;
      toolName: string;
      arguments?: unknown;
    }>;
    if (!Array.isArray(arr)) return [];
    return arr.map((t) => ({
      type: 'tool-call' as const,
      toolCallId: t.toolCallId,
      toolName: t.toolName,
      input: t.arguments ?? {},
    }));
  } catch {
    return [];
  }
}

function buildGenerateContent(
  text: string | undefined,
  toolCallsJson: string | null,
): LanguageModelV2GenerateResult['content'] {
  const content: LanguageModelV2GenerateResult['content'] = [];
  if (text?.trim()) content.push({ type: 'text', text });
  for (const tc of parseLiteRtToolCallsJson(toolCallsJson)) content.push(tc);
  return content;
}

function warnIfNanoTools(tools: unknown): void {
  if (Array.isArray(tools) && tools.length) {
    console.warn(
      '[v2/nano] Tool declarations are not wired to ML Kit GenAI in this adapter — dropping.',
    );
  }
}

// ── Gemini Nano (AICore) ────────────────────────────────────────────────

/**
 * Gemini Nano adapter — wraps ML Kit GenAI Prompt API (AICore) into a
 * LanguageModelV2. No model file or API key needed — runs on-device via
 * Android system service.
 *
 * Limitations: max ~256 output tokens, ~4000 input tokens, per-app quota.
 * Best for quick tasks: quiz grading, confidence checks, short summaries.
 */
export function createNanoModel(): LanguageModelV2 {
  return {
    specificationVersion: 'v2',
    provider: 'nano',
    modelId: 'gemini-nano',

    async doGenerate(options): Promise<LanguageModelV2GenerateResult> {
      warnIfNanoTools(options.tools);
      const legacy = toLegacyMessages(options.prompt);
      const systemMsg = legacy.find((m) => m.role === 'system');
      const prompt = legacy
        .filter((m) => m.role !== 'system')
        .map((m) => m.content)
        .join('\n');

      const { nanoGenerate } = await import('../../../../../modules/local-llm');
      const result = await nanoGenerate({
        prompt,
        systemInstruction: systemMsg?.content,
        temperature: 0.3,
        topK: 40,
        maxOutputTokens: 256,
      });

      return {
        content: result.text ? [{ type: 'text', text: result.text }] : [],
        finishReason: 'stop',
        usage: {},
      };
    },

    async doStream(options): Promise<LanguageModelV2StreamResult> {
      warnIfNanoTools(options.tools);
      const legacy = toLegacyMessages(options.prompt);
      const systemMsg = legacy.find((m) => m.role === 'system');
      const prompt = legacy
        .filter((m) => m.role !== 'system')
        .map((m) => m.content)
        .join('\n');

      const { nanoGenerate } = await import('../../../../../modules/local-llm');

      // Nano doesn't support streaming — generate then chunk
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

      void (async () => {
        try {
          const result = await nanoGenerate({
            prompt,
            systemInstruction: systemMsg?.content,
            temperature: 0.3,
            topK: 40,
            maxOutputTokens: 256,
          });
          if (result.text?.trim()) {
            const CHUNK_SIZE = 12;
            for (let i = 0; i < result.text.length; i += CHUNK_SIZE) {
              const delta = result.text.slice(i, i + CHUNK_SIZE);
              push({ type: 'text-delta', id: textId, delta });
            }
            push({ type: 'finish', finishReason: 'stop', usage: {} });
          } else {
            push({ type: 'finish', finishReason: 'error', usage: {} });
          }
          end();
        } catch (err) {
          push({ type: 'error', error: err });
          push({ type: 'finish', finishReason: 'error', usage: {} });
          end();
        }
      })();

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
