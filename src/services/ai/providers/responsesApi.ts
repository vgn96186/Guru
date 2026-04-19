// @ts-nocheck — AI SDK v6 migration; runtime kept, strict types deferred
/**
 * OpenAI Responses API adapter for LanguageModel.
 *
 * The Responses API differs from Chat Completions in shape:
 *   - System prompts go in a top-level `instructions` field, not a message.
 *   - Messages become `input: [{ type: 'message', role, content: [{ type:
 *     'input_text'|'output_text', text }] }]`.
 *   - Tools live at the top level with a flat shape:
 *     `{ type: 'function', name, description, parameters }` (no nested
 *     `function` key like Chat Completions).
 *   - Tool calls come back as `output` items of `type: 'function_call'` with
 *     `call_id` / `name` / `arguments` (JSON string).
 *   - Tool results are fed back as input items of `type: 'function_call_output'`
 *     with `{ call_id, output }`.
 *   - Streaming uses typed SSE events (`response.output_text.delta`,
 *     `response.function_call_arguments.delta`, `response.output_item.done`,
 *     `response.completed`, etc.) instead of Chat Completions' delta objects.
 *
 * Used for ChatGPT Codex (`chatgpt.com/backend-api/codex/responses`) and any
 * future Responses-native endpoints.
 */

import type {
  LanguageModel,
  LanguageModelCallOptions,
  LanguageModelGenerateResult,
  LanguageModelStreamPart,
  LanguageModelUsage,
  LanguageModelMessage as ModelMessage,
  LanguageModelToolCallPart as ToolCallPart,
  LanguageModelFinishReason as FinishReason,
} from '@ai-sdk/provider';

export interface ResponsesApiConfig {
  provider: string;
  modelId: string;
  /** Full Responses endpoint (e.g. `https://chatgpt.com/backend-api/codex/responses`). */
  url: string | (() => string | Promise<string>);
  /** Header builder — called per request so OAuth tokens can refresh. */
  headers: () => Record<string, string> | Promise<Record<string, string>>;
  /** Default instructions if no system message is provided. */
  defaultInstructions?: string;
  /** Extra top-level body fields (e.g. `{ store: false, include: [...] }`). */
  extraBody?: Record<string, unknown>;
  /** Optional request body transform. */
  transformRequestBody?: (body: Record<string, unknown>) => Record<string, unknown>;
  fetch?: typeof fetch;
}

export function createResponsesApiModel(config: ResponsesApiConfig): LanguageModel {
  const doFetch = config.fetch ?? fetch;

  const buildBody = (options: LanguageModelCallOptions, stream: boolean) => {
    const { instructions, input } = convertMessagesToResponses(
      options.prompt,
      config.defaultInstructions,
    );
    const body: Record<string, unknown> = {
      model: config.modelId,
      instructions,
      input,
      ...(config.extraBody ?? {}),
    };
    if (stream) body.stream = true;
    if (options.maxOutputTokens != null) body.max_output_tokens = options.maxOutputTokens;
    if (options.temperature != null) body.temperature = options.temperature;
    if (options.topP != null) body.top_p = options.topP;
    if (options.tools?.length) {
      body.tools = options.tools.map((t) => ({
        type: 'function',
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      if (options.toolChoice) {
        body.tool_choice =
          typeof options.toolChoice === 'string'
            ? options.toolChoice
            : { type: 'function', name: options.toolChoice.toolName };
      }
    }
    if (options.responseFormat?.type === 'json') {
      body.text = options.responseFormat.schema
        ? {
            format: {
              type: 'json_schema',
              name: 'response',
              schema: options.responseFormat.schema,
              strict: true,
            },
          }
        : { format: { type: 'json_object' } };
    }
    return config.transformRequestBody ? config.transformRequestBody(body) : body;
  };

  return {
    specificationVersion: 'v2',
    provider: config.provider,
    modelId: config.modelId,

    async doGenerate(options): Promise<LanguageModelGenerateResult> {
      const url = typeof config.url === 'function' ? await config.url() : config.url;
      const headers = await config.headers();
      const body = buildBody(options, false);
      const response = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: options.abortSignal,
      });
      if (!response.ok) {
        throw new Error(
          `[${config.provider}] ${response.status} ${response.statusText}: ${await response.text()}`,
        );
      }
      const json = await response.json();
      return parseResponsesResult(json);
    },

    async doStream(options) {
      const url = typeof config.url === 'function' ? await config.url() : config.url;
      const headers = await config.headers();
      const body = buildBody(options, true);
      const response = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...headers },
        body: JSON.stringify(body),
        signal: options.abortSignal,
      });
      if (!response.ok) {
        throw new Error(
          `[${config.provider}] ${response.status} ${response.statusText}: ${await response.text()}`,
        );
      }
      const stream = sseToStreamParts(response);
      return { stream, response: { headers: Object.fromEntries(response.headers.entries()) } };
    },
  };
}

// ─── Message conversion ─────────────────────────────────────────────────────

interface ResponsesInputItem {
  type: 'message' | 'function_call' | 'function_call_output';
  [k: string]: unknown;
}

function convertMessagesToResponses(
  messages: ModelMessage[],
  defaultInstructions?: string,
): { instructions: string; input: ResponsesInputItem[] } {
  const sys: string[] = [];
  const input: ResponsesInputItem[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      const text = typeof msg.content === 'string' ? msg.content : textFromParts(msg.content);
      if (text.trim()) sys.push(text.trim());
      continue;
    }

    if (msg.role === 'user') {
      const parts = typeof msg.content === 'string' ? [{ type: 'text' as const, text: msg.content }] : msg.content;
      const content = parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => ({ type: 'input_text' as const, text: p.text }));
      if (content.length) input.push({ type: 'message', role: 'user', content });
      continue;
    }

    if (msg.role === 'assistant') {
      const parts = typeof msg.content === 'string' ? [{ type: 'text' as const, text: msg.content }] : msg.content;
      const textParts = parts.filter((p): p is { type: 'text'; text: string } => p.type === 'text');
      const toolCalls = parts.filter((p): p is ToolCallPart => p.type === 'tool-call');
      if (textParts.length) {
        input.push({
          type: 'message',
          role: 'assistant',
          content: textParts.map((p) => ({ type: 'output_text' as const, text: p.text })),
        });
      }
      for (const tc of toolCalls) {
        input.push({
          type: 'function_call',
          call_id: tc.toolCallId,
          name: tc.toolName,
          arguments: JSON.stringify(tc.input ?? {}),
        });
      }
      continue;
    }

    // role === 'tool'
    for (const r of msg.content) {
      input.push({
        type: 'function_call_output',
        call_id: r.toolCallId,
        output: typeof r.output === 'string' ? r.output : JSON.stringify(r.output),
      });
    }
  }

  const instructions = sys.join('\n\n') || defaultInstructions || '';
  return { instructions, input };
}

function textFromParts(parts: ReadonlyArray<{ type: string } & Record<string, unknown>>): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
}

// ─── Non-streaming response parse ───────────────────────────────────────────

function parseResponsesResult(json: any): LanguageModelGenerateResult {
  const content: LanguageModelGenerateResult['content'] = [];
  let finishReason: FinishReason = 'stop';

  const output = Array.isArray(json?.output) ? json.output : [];
  for (const item of output) {
    if (item?.type === 'message' && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c?.type === 'output_text' && typeof c.text === 'string' && c.text) {
          content.push({ type: 'text', text: c.text });
        }
      }
    } else if (item?.type === 'function_call') {
      let input: unknown = {};
      try {
        input = item.arguments ? JSON.parse(item.arguments) : {};
      } catch {
        input = { _raw: item.arguments };
      }
      content.push({
        type: 'tool-call',
        toolCallId: item.call_id ?? item.id ?? '',
        toolName: item.name ?? '',
        input,
      });
      finishReason = 'tool-calls';
    }
    // Reasoning items are exposed in streaming via the `reasoning-` id prefix
    // convention; for non-streaming we drop them (spec content is text | tool).
  }

  if (json?.incomplete_details?.reason === 'max_output_tokens') {
    finishReason = 'length';
  } else if (json?.status === 'incomplete') {
    finishReason = 'other';
  }

  return {
    content,
    finishReason,
    usage: {
      inputTokens: json?.usage?.input_tokens,
      outputTokens: json?.usage?.output_tokens,
      totalTokens: json?.usage?.total_tokens,
    },
    response: { body: json },
  };
}

// ─── Streaming SSE → StreamPart ─────────────────────────────────────────────

/**
 * Responses API emits typed SSE events. We care about:
 *   - response.output_text.delta       → text-delta
 *   - response.output_text.done        → text-end
 *   - response.output_item.added       → start tracking function_call item
 *   - response.function_call_arguments.delta → accumulate args
 *   - response.function_call_arguments.done  → finalize args string
 *   - response.output_item.done        → emit tool-call if function_call
 *   - response.completed               → usage + finish
 *   - response.failed / response.error → error + finish
 */
async function* sseToStreamParts(
  response: Response,
): AsyncGenerator<LanguageModelStreamPart> {
  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: 'error', error: new Error('No readable body') };
    return;
  }
  const decoder = new TextDecoder();
  let buffer = '';
  const textId = 'text-0';
  const reasoningId = 'reasoning-0';
  let textStarted = false;
  let reasoningStarted = false;
  let finishReason: FinishReason = 'stop';
  const usage: LanguageModelUsage = {};

  // function_call items we're still building (keyed by output_item_id or index).
  const toolCalls = new Map<
    string,
    { call_id: string; name: string; args: string; emitted: boolean }
  >();

  const emitToolCall = (key: string) => {
    const tc = toolCalls.get(key);
    if (!tc || tc.emitted) return null;
    tc.emitted = true;
    let input: unknown = {};
    try {
      input = tc.args ? JSON.parse(tc.args) : {};
    } catch {
      input = { _raw: tc.args };
    }
    finishReason = 'tool-calls';
    return {
      type: 'tool-call' as const,
      toolCallId: tc.call_id,
      toolName: tc.name,
      input: JSON.stringify(input),
    };
  };

  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    if (done) buffer += decoder.decode();

    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      // Each event is lines of `event: foo` / `data: {...}`. We only act on data.
      for (const line of rawEvent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        let evt: any;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue;
        }

        switch (evt.type) {
          case 'response.output_text.delta': {
            const delta: string = evt.delta ?? '';
            if (!delta) break;
            if (!textStarted) {
              textStarted = true;
              yield { type: 'text-start', id: textId };
            }
            yield { type: 'text-delta', id: textId, delta };
            break;
          }

          case 'response.output_text.done': {
            if (textStarted) {
              yield { type: 'text-end', id: textId };
              textStarted = false;
            }
            break;
          }

          case 'response.reasoning_summary_text.delta': {
            const delta: string = evt.delta ?? '';
            if (!delta) break;
            if (!reasoningStarted) {
              reasoningStarted = true;
              yield { type: 'reasoning-start', id: reasoningId };
            }
            yield { type: 'reasoning-delta', id: reasoningId, delta };
            break;
          }

          case 'response.output_item.added': {
            const item = evt.item;
            if (item?.type === 'function_call') {
              const key = String(item.id ?? evt.output_index ?? toolCalls.size);
              toolCalls.set(key, {
                call_id: item.call_id ?? item.id ?? '',
                name: item.name ?? '',
                args: item.arguments ?? '',
                emitted: false,
              });
            }
            break;
          }

          case 'response.function_call_arguments.delta': {
            const key = String(evt.item_id ?? evt.output_index ?? '');
            const delta: string = evt.delta ?? '';
            if (!delta) break;
            const existing = toolCalls.get(key);
            if (existing) {
              existing.args += delta;
            } else {
              toolCalls.set(key, {
                call_id: evt.call_id ?? '',
                name: evt.name ?? '',
                args: delta,
                emitted: false,
              });
            }
            break;
          }

          case 'response.function_call_arguments.done': {
            const key = String(evt.item_id ?? evt.output_index ?? '');
            const existing = toolCalls.get(key);
            if (existing && typeof evt.arguments === 'string') {
              // Prefer the final args from the `.done` event if provided.
              existing.args = evt.arguments;
            }
            break;
          }

          case 'response.output_item.done': {
            const item = evt.item;
            if (item?.type === 'function_call') {
              const key = String(item.id ?? evt.output_index ?? '');
              // Patch up with the final item in case call_id/name arrived late.
              const existing = toolCalls.get(key);
              if (existing) {
                if (item.call_id) existing.call_id = item.call_id;
                if (item.name) existing.name = item.name;
                if (typeof item.arguments === 'string' && item.arguments) {
                  existing.args = item.arguments;
                }
              } else {
                toolCalls.set(key, {
                  call_id: item.call_id ?? item.id ?? '',
                  name: item.name ?? '',
                  args: item.arguments ?? '',
                  emitted: false,
                });
              }
              const part = emitToolCall(key);
              if (part) yield part;
            }
            break;
          }

          case 'response.completed': {
            const resp = evt.response;
            if (resp?.usage) {
              usage.inputTokens = resp.usage.input_tokens;
              usage.outputTokens = resp.usage.output_tokens;
              usage.totalTokens = resp.usage.total_tokens;
            }
            if (resp?.incomplete_details?.reason === 'max_output_tokens') {
              finishReason = 'length';
            }
            break;
          }

          case 'response.failed':
          case 'response.error':
          case 'error': {
            const message =
              evt?.error?.message ?? evt?.response?.error?.message ?? 'Responses API error';
            yield { type: 'error', error: new Error(message) };
            finishReason = 'error';
            break;
          }

          default:
            break;
        }
      }
    }

    if (done) {
      // Flush any tool calls that somehow weren't emitted (defensive).
      for (const key of toolCalls.keys()) {
        const part = emitToolCall(key);
        if (part) yield part;
      }
      if (reasoningStarted) yield { type: 'reasoning-end', id: reasoningId };
      if (textStarted) yield { type: 'text-end', id: textId };
      yield { type: 'finish', finishReason, usage };
      return;
    }
  }
}
