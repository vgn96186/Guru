/**
 * Local LLM adapter — wraps Guru's custom `local-llm` Expo module (Kotlin
 * LiteRT runtime adapted from Edge Gallery / PokéClaw) into a LanguageModelV2.
 *
 * Uses true native streaming via chatStream + event listeners when available,
 * with fallback to blocking chat + simulated chunking for tools mode.
 * LiteRT-LM OpenAPI tools are registered natively (`automaticToolCalling = false`);
 * tool execution stays in JS (`streamText` loop).
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
import * as samsungPerf from '../../../samsungPerf';
import type { ChatMessage } from 'local-llm';
import * as LocalLlm from 'local-llm';
import type { Message as LegacyMessage } from '../../types';
import { STREAM_TIMEOUT_MS } from '../../constants';

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
      const native = await samsungPerf.runBoosted('llm_inference', () =>
        chatWithLocalNative({
          chatMessages,
          modelPath: config.modelPath,
          systemInstruction: systemText || undefined,
          toolsJson,
        }),
      );
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
      const useTools = !!toolsJson;

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

      // Use true native streaming when no tools are enabled (tools require blocking chat)
      if (!useTools) {
        // Subscription refs stored in a mutable container so abort handler can access them
        const subs = {
          token: null as { remove: () => void } | null,
          complete: null as { remove: () => void } | null,
          error: null as { remove: () => void } | null,
        };
        let completionReceived = false;
        let safetyTimeoutId: ReturnType<typeof setTimeout> | null = null;
        let aborted = false; // Track if abort fired before subscriptions created

        const cleanup = () => {
          if (safetyTimeoutId !== null) {
            clearTimeout(safetyTimeoutId);
            safetyTimeoutId = null;
          }
          subs.token?.remove();
          subs.complete?.remove();
          subs.error?.remove();
          // LiteRT-LM Conversation wedges after one generation on some devices —
          // reset Conversation, keep Engine warm (Edge Gallery pattern).
          void LocalLlm.resetSession().catch(() => {});
        };

        void (async () => {
          // Early exit if aborted before subscriptions were created
          if (aborted) {
            push({ type: 'finish', finishReason: 'stop', usage: {} });
            end();
            return;
          }

          try {
            const cleanPath = modelPath.replace(/^file:\/\//, '');

            // Set up event listeners for native streaming
            subs.token = LocalLlm.addLlmTokenListener(({ token }) => {
              push({ type: 'text-delta', id: textId, delta: token });
            });

            subs.complete = LocalLlm.addLlmCompleteListener(({ text: _text, toolCallsJson }) => {
              completionReceived = true;
              cleanup();

              // Handle any tool calls returned
              const toolCalls = parseLiteRtToolCallsJson(toolCallsJson);
              for (const tc of toolCalls) {
                push({
                  type: 'tool-call',
                  toolCallId: tc.toolCallId,
                  toolName: tc.toolName,
                  input: tc.input,
                });
              }

              const finishReason = toolCalls.length > 0 ? 'tool-calls' : 'stop';
              push({ type: 'finish', finishReason, usage: {} });
              end();
            });

            subs.error = LocalLlm.addLlmErrorListener(({ error }) => {
              completionReceived = true;
              cleanup();
              push({ type: 'error', error: new Error(error) });
              push({ type: 'finish', finishReason: 'error', usage: {} });
              end();
            });

            // Start native streaming with SamsungPerf boost
            await samsungPerf.runBoosted('llm_inference', () =>
              LocalLlm.chatStream(chatMessages, {
                modelPath: cleanPath,
                systemInstruction: systemText || undefined,
                temperature: 0.7,
                topP: 0.9,
              }),
            );

            // Safety timeout - if no completion received, end stream
            safetyTimeoutId = setTimeout(() => {
              if (!completionReceived) {
                cleanup();
                push({ type: 'finish', finishReason: 'stop', usage: {} });
                end();
              }
            }, STREAM_TIMEOUT_MS);
          } catch (err) {
            cleanup();
            if (__DEV__) {
              console.warn(
                '[v2/localLlm] Native stream error:',
                err instanceof Error ? err.message : err,
              );
            }
            push({ type: 'error', error: err });
            push({ type: 'finish', finishReason: 'error', usage: {} });
            end();
          }
        })();

        // Register abort handler (uses `subs` closure, not external refs)
        options.abortSignal?.addEventListener('abort', () => {
          aborted = true; // Mark aborted before cleanup to prevent race
          cleanup();
          void (async () => {
            try {
              await LocalLlm.cancel();
            } catch {
              // ignore
            }
          })();
        });
      } else {
        // With tools enabled, fall back to blocking chat + simulated streaming
        void (async () => {
          try {
            const native = await samsungPerf.runBoosted('llm_inference', () =>
              chatWithLocalNative({
                chatMessages,
                modelPath,
                systemInstruction: systemText || undefined,
                toolsJson,
              }),
            );
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
              // Simulate streaming with 12-char chunks for tools mode
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
      }

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
