/**
 * Google Gemini adapter — native GenAI REST (not OpenAI-compatible).
 *
 * Uses the `generateContent` and `streamGenerateContent?alt=sse` endpoints.
 * Supports text, tool calling (functionDeclarations), JSON schema response,
 * and multimodal inline images.
 */

import type {
  FinishReason,
  ImagePart,
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2GenerateResult,
  LanguageModelV2StreamPart,
  LanguageModelV2StreamResult,
  LanguageModelV2Usage,
  ModelMessage,
  TextPart,
  ToolCallPart,
} from '../spec';

export interface GeminiConfig {
  modelId: string; // e.g. 'gemini-2.0-flash'
  apiKey: string;
  /** Override for the base URL (e.g. regional endpoint). */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Set to true if routing to Vertex AI */
  isVertex?: boolean;
  /** Vertex AI Project ID */
  vertexProject?: string;
  /** Vertex AI Location */
  vertexLocation?: string;
}

export function createGeminiModel(config: GeminiConfig): LanguageModelV2 {
  const buildBody = (options: LanguageModelV2CallOptions): Record<string, unknown> => {
    const { systemInstruction, contents } = convertMessagesToGemini(options.prompt);
    const body: Record<string, unknown> = { contents };
    if (systemInstruction) body.systemInstruction = systemInstruction;

    const generationConfig: Record<string, unknown> = {};
    if (options.maxOutputTokens != null) generationConfig.maxOutputTokens = options.maxOutputTokens;
    if (options.temperature != null) generationConfig.temperature = options.temperature;
    if (options.topP != null) generationConfig.topP = options.topP;
    if (options.stopSequences?.length) generationConfig.stopSequences = options.stopSequences;
    if (options.responseFormat?.type === 'json') {
      generationConfig.responseMimeType = 'application/json';
      if (options.responseFormat.schema) {
        generationConfig.responseSchema = sanitizeForGeminiSchema(options.responseFormat.schema);
      }
    }
    if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;

    if (options.tools?.length || options.webSearch) {
      const toolsArray: Record<string, unknown>[] = [];
      if (options.webSearch) {
        toolsArray.push({ googleSearch: {} });
      }
      if (options.tools?.length) {
        toolsArray.push({
          functionDeclarations: options.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: sanitizeForGeminiSchema(t.inputSchema),
          })),
        });
      }
      body.tools = toolsArray;

      if (options.toolChoice) {
        body.toolConfig = {
          functionCallingConfig:
            options.toolChoice === 'auto'
              ? { mode: 'AUTO' }
              : options.toolChoice === 'required'
                ? { mode: 'ANY' }
                : options.toolChoice === 'none'
                  ? { mode: 'NONE' }
                  : {
                      mode: 'ANY',
                      allowedFunctionNames: [options.toolChoice.toolName],
                    },
        };
      }
    }

    return body;
  };

  const doPost = async (path: string, body: unknown, signal?: AbortSignal): Promise<Response> => {
    let url: string;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    // Fetch override (e.g. for testing)
    const doFetch = config.fetch ?? globalThis.fetch;

    if (config.isVertex) {
      const isApiKey = config.apiKey.startsWith('AIza') || config.apiKey.startsWith('AQ');
      if (config.vertexProject && config.vertexLocation) {
        // Vertex AI API (Service Account or AQ key)
        const location = config.vertexLocation;
        url = `https://${location}-aiplatform.googleapis.com/v1/projects/${config.vertexProject}/locations/${location}/publishers/google/models/${config.modelId}:${path}`;
      } else {
        if (!isApiKey) {
          throw new Error('[gemini] Vertex token requires vertexProject and vertexLocation');
        }
        const version =
          config.modelId.includes('preview') || config.modelId.includes('exp')
            ? 'v1alpha'
            : 'v1beta';
        const separator = path.includes('?') ? '&' : '?';
        const base = config.baseUrl ?? `https://generativelanguage.googleapis.com/${version}`;
        url = `${base}/models/${config.modelId}:${path}${separator}key=${config.apiKey}`;
      }
      if (isApiKey) {
        headers['x-goog-api-key'] = config.apiKey;
      } else {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }
    } else {
      const version =
        config.modelId.includes('preview') || config.modelId.includes('exp') ? 'v1alpha' : 'v1beta';
      const base = config.baseUrl ?? `https://generativelanguage.googleapis.com/${version}`;
      const separator = path.includes('?') ? '&' : '?';
      url = `${base}/models/${config.modelId}:${path}${separator}key=${config.apiKey}`;
    }

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const safeUrl = url.replace(/([?&]key=)[^&]+/g, '$1REDACTED');
      console.log(`[gemini] Requesting: ${safeUrl}`);
    }

    // Pass the standard react-native RequestInit, ensuring we don't accidentally pass
    // an abort controller that crashes the native fetch implementation if it's polyfilled weirdly
    return doFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      // Only pass signal if it's explicitly provided, some older polyfills choke on undefined
      ...(signal ? { signal } : {}),
      // @ts-ignore - react-native specific flag to enable streaming fetch in some environments
      reactNative: { textStreaming: true },
    });
  };

  return {
    specificationVersion: 'v2',
    provider: 'gemini',
    modelId: config.modelId,

    async doGenerate(options): Promise<LanguageModelV2GenerateResult> {
      const response = await doPost('generateContent', buildBody(options), options.abortSignal);
      if (!response.ok) {
        throw new Error(`[gemini] ${response.status}: ${await response.text()}`);
      }
      const json = await response.json();
      return parseGeminiResponse(json);
    },

    async doStream(options): Promise<LanguageModelV2StreamResult> {
      const response = await doPost(
        'streamGenerateContent?alt=sse',
        buildBody(options),
        options.abortSignal,
      );
      return { stream: geminiSseToStreamParts(response), rawResponse: response };
    },
  };
}

// ─── Schema sanitization ────────────────────────────────────────────────────

/**
 * Gemini's `function_declarations.parameters` is an OpenAPI 3.0 subset and
 * rejects standard JSON Schema keywords like `additionalProperties`, `$schema`,
 * `$ref`, `$defs`, etc. Strip them recursively before sending.
 */
const GEMINI_DROP_KEYS = new Set([
  'propertyNames',
  'additionalProperties',
  'patternProperties',
  '$schema',
  '$id',
  'oneOf',
  'anyOf',
  'allOf',
  'not',
  'if',
  'then',
  'else',
  'dependentSchemas',
  'unevaluatedProperties',
  '$ref',
  '$defs',
  'definitions',
]);

function sanitizeForGeminiSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(sanitizeForGeminiSchema);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (GEMINI_DROP_KEYS.has(k)) continue;
    out[k] = sanitizeForGeminiSchema(v);
  }
  return out;
}

// ─── Message conversion ─────────────────────────────────────────────────────

function convertMessagesToGemini(messages: ModelMessage[]): {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: unknown[];
} {
  let systemText = '';
  const contents: unknown[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemText += (systemText ? '\n\n' : '') + msg.content;
      continue;
    }
    if (msg.role === 'user') {
      const parts =
        typeof msg.content === 'string'
          ? [{ text: msg.content }]
          : msg.content.map((p) =>
              p.type === 'text'
                ? { text: (p as TextPart).text }
                : {
                    inlineData: {
                      mimeType: (p as ImagePart).mimeType,
                      data: (p as ImagePart).base64Data,
                    },
                  },
            );
      contents.push({ role: 'user', parts });
      continue;
    }
    if (msg.role === 'assistant') {
      const parts: unknown[] = [];
      if (typeof msg.content === 'string') {
        if (msg.content) parts.push({ text: msg.content });
      } else {
        for (const p of msg.content) {
          if (p.type === 'text') parts.push({ text: p.text });
          else if (p.type === 'tool-call') {
            parts.push({
              functionCall: {
                name: (p as ToolCallPart).toolName,
                args: (p as ToolCallPart).input,
              },
            });
          }
        }
      }
      contents.push({ role: 'model', parts });
      continue;
    }
    // tool results
    const parts = msg.content.map((r) => ({
      functionResponse: {
        name: r.toolName,
        response:
          r.output && typeof r.output === 'object' && !Array.isArray(r.output)
            ? r.output
            : { result: r.output },
      },
    }));
    contents.push({ role: 'user', parts });
  }

  return {
    systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
    contents,
  };
}

// ─── Response parsing ───────────────────────────────────────────────────────

type GeminiResponseJson = {
  candidates?: Array<{
    content?: { parts?: Array<Record<string, unknown>> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

function parseGeminiResponse(json: unknown): LanguageModelV2GenerateResult {
  const r = json as GeminiResponseJson;
  const candidate = r?.candidates?.[0];
  const parts: Array<TextPart | ToolCallPart> = [];
  for (const p of candidate?.content?.parts ?? []) {
    if (typeof p['text'] === 'string' && p['text'])
      parts.push({ type: 'text', text: p['text'] as string });
    const fc = p['functionCall'] as { name: string; args?: unknown } | undefined;
    if (fc) {
      parts.push({
        type: 'tool-call',
        toolCallId: `gemini_tc_${Math.random().toString(36).slice(2)}`,
        toolName: fc.name,
        input: fc.args ?? {},
      });
    }
  }
  return {
    content: parts,
    finishReason: mapGeminiFinish(candidate?.finishReason),
    usage: {
      inputTokens: r?.usageMetadata?.promptTokenCount,
      outputTokens: r?.usageMetadata?.candidatesTokenCount,
      totalTokens: r?.usageMetadata?.totalTokenCount,
    },
    rawResponse: json,
  };
}

function mapGeminiFinish(r: string | undefined): FinishReason {
  switch (r) {
    case 'STOP':
      return 'stop';
    case 'MAX_TOKENS':
      return 'length';
    case 'SAFETY':
    case 'PROHIBITED_CONTENT':
      return 'content-filter';
    default:
      return r ? 'other' : 'stop';
  }
}

// ─── Streaming ──────────────────────────────────────────────────────────────

/** Helper to parse a chunk of SSE data from Gemini */
function* parseSseChunks(buffer: string): IterableIterator<LanguageModelV2StreamPart> {
  const boundaryRegex = /\r?\n\r?\n/g;
  let match: RegExpExecArray | null;
  let remainingBuffer = buffer;
  let textStarted = false;
  const textId = 'text-0';
  let finishReason: FinishReason = 'stop';
  const usage: LanguageModelV2Usage = {};
  let toolCallCounter = 0;

  // Process all complete chunks
  while ((match = boundaryRegex.exec(remainingBuffer)) !== null) {
    const boundary = match.index;
    const boundaryLength = match[0].length;
    const rawEvent = remainingBuffer.slice(0, boundary);
    remainingBuffer = remainingBuffer.slice(boundary + boundaryLength);
    boundaryRegex.lastIndex = 0;

    for (const line of rawEvent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload) continue;
      try {
        const json = JSON.parse(payload);
        const candidate = json?.candidates?.[0];
        for (const p of candidate?.content?.parts ?? []) {
          if (typeof p.text === 'string' && p.text) {
            if (!textStarted) {
              textStarted = true;
              yield { type: 'text-start', id: textId };
            }
            yield { type: 'text-delta', id: textId, delta: p.text };
          }
          if (p.thought) {
            yield { type: 'text-delta', id: 'reasoning-0', delta: String(p.thought) };
          }
          if (p.functionCall) {
            yield {
              type: 'tool-call',
              toolCallId: `gemini_tc_${++toolCallCounter}`,
              toolName: p.functionCall.name,
              input: p.functionCall.args ?? {},
            };
          }
        }
        if (candidate?.finishReason) finishReason = mapGeminiFinish(candidate.finishReason);
        if (json?.usageMetadata) {
          usage.inputTokens = json.usageMetadata.promptTokenCount;
          usage.outputTokens = json.usageMetadata.candidatesTokenCount;
          usage.totalTokens = json.usageMetadata.totalTokenCount;
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }

  return remainingBuffer;
}

/**
 * Same logic as parseSseChunks, but designed to process the entire remaining buffer
 * when the stream is finished (or if the whole response came as one string).
 */
function* parseRemainingSseBuffer(buffer: string): IterableIterator<LanguageModelV2StreamPart> {
  if (!buffer.trim()) return;

  let textStarted = false;
  const textId = 'text-0';
  let finishReason: FinishReason = 'stop';
  const usage: LanguageModelV2Usage = {};
  let toolCallCounter = 0;

  for (const line of buffer.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload) continue;
    try {
      const json = JSON.parse(payload);
      const candidate = json?.candidates?.[0];
      for (const p of candidate?.content?.parts ?? []) {
        if (typeof p.text === 'string' && p.text) {
          if (!textStarted) {
            textStarted = true;
            yield { type: 'text-start', id: textId };
          }
          yield { type: 'text-delta', id: textId, delta: p.text };
        }
        if (p.thought) {
          yield { type: 'text-delta', id: 'reasoning-0', delta: String(p.thought) };
        }
        if (p.functionCall) {
          yield {
            type: 'tool-call',
            toolCallId: `gemini_tc_${++toolCallCounter}`,
            toolName: p.functionCall.name,
            input: p.functionCall.args ?? {},
          };
        }
      }
      if (candidate?.finishReason) finishReason = mapGeminiFinish(candidate.finishReason);
      if (json?.usageMetadata) {
        usage.inputTokens = json.usageMetadata.promptTokenCount;
        usage.outputTokens = json.usageMetadata.candidatesTokenCount;
        usage.totalTokens = json.usageMetadata.totalTokenCount;
      }
    } catch {
      // ignore
    }
  }

  if (textStarted) yield { type: 'text-end', id: textId };
  yield { type: 'finish', finishReason, usage };
}

async function* geminiSseToStreamParts(
  response: Response,
): AsyncGenerator<LanguageModelV2StreamPart> {
  if (!response.body) {
    // If we don't have a body at all, try to read the text if possible
    try {
      const text = await response.text();

      if (!response.ok) {
        yield { type: 'error', error: new Error(`[gemini] ${response.status}: ${text}`) };
        return;
      }
      // Try to parse it as JSON first, in case it's a full JSON response and not SSE
      try {
        if (text.trim().startsWith('data:')) {
          yield* parseRemainingSseBuffer(text);
          return;
        }

        const json = JSON.parse(text);
        const parsed = parseGeminiResponse(json);
        for (const part of parsed.content) {
          if (part.type === 'text') {
            yield { type: 'text-start', id: 'text-0' };
            yield { type: 'text-delta', id: 'text-0', delta: part.text };
            yield { type: 'text-end', id: 'text-0' };
          } else if (part.type === 'tool-call') {
            yield part;
          }
        }
        if (parsed.finishReason) {
          yield { type: 'finish', finishReason: parsed.finishReason, usage: parsed.usage || {} };
        }
        return;
      } catch {
        // It's not raw JSON, it's probably SSE data that arrived all at once
        yield {
          type: 'error',
          error: new Error(
            `Streaming not supported in this environment, and response was not valid JSON. Response text: ${text.slice(0, 100)}...`,
          ),
        };
        return;
      }
    } catch (e: any) {
      yield {
        type: 'error',
        error: new Error(
          `No readable body (Status: ${response.status}). Also failed to read text: ${e?.message ?? e}`,
        ),
      };
      return;
    }
  }

  // React Native's fetch doesn't natively support getReader on response.body
  // in older versions without a polyfill. We handle both cases.
  if (!response.body || typeof (response.body as any).getReader !== 'function') {
    // If we can't stream, we fall back to reading the entire response text
    // and yielding it as a single chunk.
    try {
      const text = await response.text();

      // If response is not ok, format it nicely
      if (!response.ok) {
        yield { type: 'error', error: new Error(`[gemini] ${response.status}: ${text}`) };
        return;
      }
      // Try to parse it as JSON first, in case it's a full JSON response and not SSE
      try {
        const json = JSON.parse(text);
        const parsed = parseGeminiResponse(json);
        for (const part of parsed.content) {
          if (part.type === 'text') {
            yield { type: 'text-start', id: 'text-0' };
            yield { type: 'text-delta', id: 'text-0', delta: part.text };
            yield { type: 'text-end', id: 'text-0' };
          } else if (part.type === 'tool-call') {
            yield part;
          }
        }
        if (parsed.finishReason) {
          yield { type: 'finish', finishReason: parsed.finishReason, usage: parsed.usage || {} };
        }
        return;
      } catch {
        // It's not raw JSON, it's probably SSE data that arrived all at once
        yield {
          type: 'error',
          error: new Error(
            `Streaming not supported in this environment, and response was not valid JSON. Response text: ${text.slice(0, 100)}...`,
          ),
        };
        return;
      }
    } catch (e: any) {
      yield { type: 'error', error: new Error(`Failed to read response body: ${e?.message ?? e}`) };
      return;
    }
  }

  // In environments where streaming works, check if the response was ok
  if (!response.ok) {
    try {
      const text = await response.text();
      yield { type: 'error', error: new Error(`[gemini] ${response.status}: ${text}`) };
    } catch {
      yield { type: 'error', error: new Error(`[gemini] Status ${response.status}`) };
    }
    return;
  }

  // Double check reader is a function to prevent crashes in weird edge cases
  if (typeof (response.body as any).getReader !== 'function') {
    yield {
      type: 'error',
      error: new Error(
        `Streaming not supported in this environment, getReader is not a function. Status: ${response.status}`,
      ),
    };
    return;
  }

  const reader = (response.body as any).getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = yield* parseSseChunks(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  // flush remaining
  buffer += decoder.decode();
  yield* parseRemainingSseBuffer(buffer);
}

export interface GroundingChunk {
  title: string;
  url: string;
}

/** Extract Google Search grounding metadata from a raw Gemini API response. */
export function extractGroundingMetadata(rawResponse: unknown): GroundingChunk[] {
  if (!rawResponse || typeof rawResponse !== 'object') return [];
  const candidate = Array.isArray((rawResponse as any).candidates)
    ? (rawResponse as any).candidates[0]
    : null;
  if (!candidate?.groundingMetadata?.groundingChunks) return [];
  return candidate.groundingMetadata.groundingChunks
    .filter((chunk: any) => chunk.web)
    .map((chunk: any) => ({
      title: chunk.web.title ?? '',
      url: chunk.web.uri ?? '',
    }));
}
