/**
 * OpenAI-Compatible adapter for LanguageModelV2.
 *
 * Most providers Guru supports (Groq, OpenRouter, Cloudflare, DeepSeek,
 * GitHub Models, AgentRouter, Kilo) speak the OpenAI chat completions wire
 * format. This adapter handles them all; each provider just plugs in its
 * base URL + auth headers.
 *
 * Streaming uses `sseToStreamParts` from `openaiChatCompletionsSse.ts` (shared with legacy providers).
 */

import { mapFinishReason, sseToStreamParts } from '../../openaiChatCompletionsSse';
import { RateLimitError } from '../../schemas';
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2GenerateResult,
  LanguageModelV2StreamResult,
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

export function createOpenAICompatibleModel(config: OpenAICompatibleConfig): LanguageModelV2 {
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
        ? {
            type: 'json_schema',
            json_schema: { name: 'response', schema: options.responseFormat.schema, strict: true },
          }
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
      if (response.status === 429) {
        throw new RateLimitError(`${config.provider} rate limit on ${config.modelId}`);
      }
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
      if (response.status === 429) {
        throw new RateLimitError(`${config.provider} rate limit on ${config.modelId}`);
      }
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
  return messages
    .map((msg) => {
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
              : {
                  type: 'image_url',
                  image_url: { url: `data:${p.mimeType};base64,${p.base64Data}` },
                },
          ),
        };
      }
      if (msg.role === 'assistant') {
        if (typeof msg.content === 'string') return { role: 'assistant', content: msg.content };
        const textParts = msg.content.filter(
          (p): p is { type: 'text'; text: string } => p.type === 'text',
        );
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
    })
    .flat();
}

// ─── Non-streaming response parse ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
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
