// @ts-nocheck — AI SDK v6 migration; runtime kept, strict types deferred
/**
 * OpenAI-Compatible adapter for LanguageModel.
 *
 * Most providers Guru supports (Groq, OpenRouter, Cloudflare, DeepSeek,
 * GitHub Models, AgentRouter, Kilo) speak the OpenAI chat completions wire
 * format. This adapter handles them all; each provider just plugs in its
 * base URL + auth headers.
 *
 * Streaming uses `sseToStreamParts` from `openaiChatCompletionsSse.ts`.
 */

import { mapFinishReason, sseToStreamParts } from '../openaiChatCompletionsSse';
import type {
  LanguageModel,
  LanguageModelCallOptions,
  LanguageModelGenerateResult,
  LanguageModelStreamResult,
  LanguageModelMessage as ModelMessage,
  LanguageModelToolCallPart as ToolCallPart,
  LanguageModelFinishReason as FinishReason,
} from '@ai-sdk/provider';

export interface OpenAICompatibleConfig {
  provider: string;
  modelId: string;
  /**
   * Full chat completions URL, e.g. 'https://api.groq.com/openai/v1/chat/completions'.
   * May be a string, or a (possibly async) function.
   */
  url: string | (() => string | Promise<string>);
  /**
   * Header builder — called per request so keys/tokens can be refreshed at
   * runtime.
   */
  headers: () => Record<string, string> | Promise<Record<string, string>>;
  /** Optional request body transform (e.g. provider-specific fields). */
  transformRequestBody?: (body: Record<string, unknown>) => Record<string, unknown>;
  fetch?: typeof fetch;
}

export function createOpenAICompatibleModel(
  config: OpenAICompatibleConfig,
): LanguageModel {
  const doFetch = config.fetch ?? fetch;

  const buildBody = (
    options: LanguageModelCallOptions,
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
          inputSchema: t.inputSchema,
        },
      }));
      if (options.toolChoice) {
        if (typeof options.toolChoice === 'string') {
          body.tool_choice = options.toolChoice;
        } else if (options.toolChoice.type === 'tool') {
          body.tool_choice = { type: 'function', function: { name: options.toolChoice.toolName } };
        } else {
          body.tool_choice = options.toolChoice.type;
        }
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
    defaultObjectGenerationMode: 'json',

    async doGenerate(options): Promise<LanguageModelGenerateResult> {
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

    async doStream(options): Promise<LanguageModelStreamResult> {
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
      return { stream, response: { headers: Object.fromEntries(response.headers.entries()) } };
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
            : p.type === 'file' && p.mediaType?.startsWith('image/')
              ? { type: 'image_url', image_url: { url: typeof p.data === 'string' && p.data.startsWith('data:') ? p.data : `data:${p.mediaType};base64,${typeof p.data === 'string' ? p.data : Buffer.from(p.data as Uint8Array).toString('base64')}` } }
              : { type: 'text', text: `[file: ${p.filename ?? 'unknown'}]` }
        ),
      };
    }
    if (msg.role === 'assistant') {
      const content = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content }];
      const textParts = content.filter((p): p is { type: 'text'; text: string } => p.type === 'text');
      const toolCalls = content.filter((p): p is ToolCallPart => p.type === 'tool-call');
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
    if (msg.role === 'tool') {
      return msg.content.map((r) => ({
        role: 'tool',
        tool_call_id: r.toolCallId,
        content: typeof r.output === 'string' ? r.output : JSON.stringify(r.output),
      }));
    }
    return [];
  }).flat();
}

// ─── Non-streaming response parse ───────────────────────────────────────────

function parseChatCompletion(json: any): LanguageModelGenerateResult {
  const choice = json?.choices?.[0];
  const msg = choice?.message ?? {};
  const content: LanguageModelGenerateResult['content'] = [];
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
    finishReason: mapFinishReason(choice?.finish_reason) as FinishReason,
    usage: {
      inputTokens: json?.usage?.prompt_tokens,
      outputTokens: json?.usage?.completion_tokens,
    },
    response: { body: json },
  };
}


