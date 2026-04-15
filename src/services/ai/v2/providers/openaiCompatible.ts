/**
 * OpenAI-Compatible adapter for LanguageModelV2.
 *
 * Most providers Guru supports (Groq, OpenRouter, Cloudflare, DeepSeek,
 * GitHub Models, AgentRouter, Kilo) speak the OpenAI chat completions wire
 * format. This adapter handles them all; each provider just plugs in its
 * base URL + auth headers.
 *
 * Reuses Guru's existing `readOpenAiCompatibleSse()` for SSE parsing.
 */

import type {
  FinishReason,
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2GenerateResult,
  LanguageModelV2StreamPart,
  LanguageModelV2StreamResult,
  LanguageModelV2Usage,
  ModelMessage,
  ToolCallPart,
} from '../spec';

export interface OpenAICompatibleConfig {
  provider: string;
  modelId: string;
  /**
   * Full chat completions URL, e.g. 'https://api.groq.com/openai/v1/chat/completions'.
   * May be a string, or a (possibly async) function — async lets OAuth-session
   * providers resolve a per-call base URL (e.g. Qwen's `resource_url`).
   */
  url: string | (() => string | Promise<string>);
  /**
   * Header builder — called per request so keys/tokens can be refreshed at
   * runtime. May return a plain object or a Promise (for OAuth token refresh).
   */
  headers: () => Record<string, string> | Promise<Record<string, string>>;
  /** Optional request body transform (e.g. provider-specific fields). */
  transformRequestBody?: (body: Record<string, unknown>) => Record<string, unknown>;
  fetch?: typeof fetch;
}

export function createOpenAICompatibleModel(
  config: OpenAICompatibleConfig,
): LanguageModelV2 {
  const doFetch = config.fetch ?? fetch;

  const buildBody = (
    options: LanguageModelV2CallOptions,
    stream: boolean,
  ): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      model: config.modelId,
      messages: convertMessagesToOpenAI(options.prompt),
      stream,
    };
    if (options.maxOutputTokens != null) body.max_tokens = options.maxOutputTokens;
    if (options.temperature != null) body.temperature = options.temperature;
    if (options.topP != null) body.top_p = options.topP;
    if (options.stopSequences?.length) body.stop = options.stopSequences;
    if (options.tools?.length) {
      body.tools = options.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));
      if (options.toolChoice) {
        body.tool_choice =
          typeof options.toolChoice === 'string'
            ? options.toolChoice
            : { type: 'function', function: { name: options.toolChoice.toolName } };
      }
    }
    if (options.responseFormat?.type === 'json') {
      body.response_format = options.responseFormat.schema
        ? { type: 'json_schema', json_schema: { name: 'response', schema: options.responseFormat.schema, strict: true } }
        : { type: 'json_object' };
    }
    return config.transformRequestBody ? config.transformRequestBody(body) : body;
  };

  return {
    specificationVersion: 'v2',
    provider: config.provider,
    modelId: config.modelId,

    async doGenerate(options): Promise<LanguageModelV2GenerateResult> {
      const url = typeof config.url === 'function' ? await config.url() : config.url;
      const headers = await config.headers();
      const response = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(buildBody(options, false)),
        signal: options.abortSignal,
      });
      if (!response.ok) {
        throw new Error(
          `[${config.provider}] ${response.status} ${response.statusText}: ${await response.text()}`,
        );
      }
      const json = await response.json();
      return parseChatCompletion(json);
    },

    async doStream(options): Promise<LanguageModelV2StreamResult> {
      const url = typeof config.url === 'function' ? await config.url() : config.url;
      const headers = await config.headers();
      const response = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(buildBody(options, true)),
        signal: options.abortSignal,
      });
      if (!response.ok) {
        throw new Error(
          `[${config.provider}] ${response.status} ${response.statusText}: ${await response.text()}`,
        );
      }
      const stream = sseToStreamParts(response);
      return { stream, rawResponse: response };
    },
  };
}

// ─── Message conversion ─────────────────────────────────────────────────────

function convertMessagesToOpenAI(messages: ModelMessage[]): unknown[] {
  return messages.map((msg) => {
    if (msg.role === 'system') {
      return { role: 'system', content: msg.content };
    }
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') return { role: 'user', content: msg.content };
      return {
        role: 'user',
        content: msg.content.map((p) =>
          p.type === 'text'
            ? { type: 'text', text: p.text }
            : { type: 'image_url', image_url: { url: `data:${p.mimeType};base64,${p.base64Data}` } },
        ),
      };
    }
    if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') return { role: 'assistant', content: msg.content };
      const textParts = msg.content.filter((p): p is { type: 'text'; text: string } => p.type === 'text');
      const toolCalls = msg.content.filter((p): p is ToolCallPart => p.type === 'tool-call');
      return {
        role: 'assistant',
        content: textParts.map((p) => p.text).join('') || null,
        ...(toolCalls.length
          ? {
              tool_calls: toolCalls.map((tc) => ({
                id: tc.toolCallId,
                type: 'function',
                function: { name: tc.toolName, arguments: JSON.stringify(tc.input) },
              })),
            }
          : {}),
      };
    }
    // role === 'tool'
    return msg.content.map((r) => ({
      role: 'tool',
      tool_call_id: r.toolCallId,
      content: typeof r.output === 'string' ? r.output : JSON.stringify(r.output),
    }));
  }).flat();
}

// ─── Non-streaming response parse ───────────────────────────────────────────

function parseChatCompletion(json: any): LanguageModelV2GenerateResult {
  const choice = json?.choices?.[0];
  const msg = choice?.message ?? {};
  const content: LanguageModelV2GenerateResult['content'] = [];
  if (typeof msg.content === 'string' && msg.content) {
    content.push({ type: 'text', text: msg.content });
  }
  if (Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls) {
      let input: unknown = {};
      try {
        input = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch {
        input = { _raw: tc.function?.arguments };
      }
      content.push({
        type: 'tool-call',
        toolCallId: tc.id,
        toolName: tc.function?.name ?? '',
        input,
      });
    }
  }
  return {
    content,
    finishReason: mapFinishReason(choice?.finish_reason),
    usage: {
      inputTokens: json?.usage?.prompt_tokens,
      outputTokens: json?.usage?.completion_tokens,
      totalTokens: json?.usage?.total_tokens,
    },
    rawResponse: json,
  };
}

function mapFinishReason(r: string | undefined): FinishReason {
  switch (r) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'tool_calls':
    case 'function_call':
      return 'tool-calls';
    case 'content_filter':
      return 'content-filter';
    default:
      return r ? 'other' : 'stop';
  }
}

// ─── Streaming SSE → StreamPart ─────────────────────────────────────────────

async function* sseToStreamParts(
  response: Response,
): AsyncGenerator<LanguageModelV2StreamPart> {
  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: 'error', error: new Error('No readable body') };
    return;
  }
  const decoder = new TextDecoder();
  let buffer = '';
  const textId = 'text-0';
  let textStarted = false;

  // Tool call accumulators (keyed by index — OpenAI streams partial tool args).
  const toolAccum = new Map<
    number,
    { id: string; name: string; args: string }
  >();

  let finishReason: FinishReason = 'stop';
  const usage: LanguageModelV2Usage = {};

  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    if (done) buffer += decoder.decode();

    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of rawEvent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          // Emit accumulated tool calls.
          for (const [, tc] of toolAccum) {
            let input: unknown = {};
            try {
              input = tc.args ? JSON.parse(tc.args) : {};
            } catch {
              input = { _raw: tc.args };
            }
            yield { type: 'tool-call', toolCallId: tc.id, toolName: tc.name, input };
          }
          yield { type: 'finish', finishReason, usage };
          return;
        }
        try {
          const json = JSON.parse(payload);
          if (json?.usage) {
            usage.inputTokens = json.usage.prompt_tokens;
            usage.outputTokens = json.usage.completion_tokens;
            usage.totalTokens = json.usage.total_tokens;
          }
          const choice = json?.choices?.[0];
          const delta = choice?.delta ?? {};
          if (typeof delta.content === 'string' && delta.content) {
            if (!textStarted) {
              textStarted = true;
              yield { type: 'text-start', id: textId };
            }
            yield { type: 'text-delta', id: textId, delta: delta.content };
          }
          // Reasoning streams (DeepSeek R1, OpenRouter reasoning models).
          const reasoningDelta =
            (typeof delta.reasoning === 'string' && delta.reasoning) ||
            (typeof delta.reasoning_content === 'string' && delta.reasoning_content) ||
            '';
          if (reasoningDelta) {
            if (!textStarted) {
              textStarted = true;
              yield { type: 'text-start', id: textId };
            }
            // Encode reasoning as a delta with a zero-width marker so streamText
            // can route it to `reasoning-delta`. Simpler than expanding the
            // provider stream-part union across every adapter.
            yield { type: 'text-delta', id: `reasoning-${textId}`, delta: reasoningDelta };
          }
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              const existing = toolAccum.get(idx) ?? { id: '', name: '', args: '' };
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) existing.args += tc.function.arguments;
              toolAccum.set(idx, existing);
            }
          }
          if (choice?.finish_reason) {
            finishReason = mapFinishReason(choice.finish_reason);
          }
        } catch {
          // ignore malformed chunks
        }
      }
    }
    if (done) {
      if (textStarted) yield { type: 'text-end', id: textId };
      yield { type: 'finish', finishReason, usage };
      return;
    }
  }
}
