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
  const doFetch = config.fetch ?? fetch;

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
        generationConfig.responseSchema = options.responseFormat.schema;
      }
    }
    if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;

    if (options.tools?.length) {
      body.tools = [
        {
          functionDeclarations: options.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          })),
        },
      ];
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

    if (config.isVertex && config.vertexProject && config.vertexLocation) {
      url = `https://${config.vertexLocation}-aiplatform.googleapis.com/v1/projects/${config.vertexProject}/locations/${config.vertexLocation}/publishers/google/models/${config.modelId}:${path}`;
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    } else {
      const base = config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
      url = `${base}/models/${config.modelId}:${path}?key=${config.apiKey}`;
    }

    return doFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
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
      if (!response.ok) {
        throw new Error(`[gemini] ${response.status}: ${await response.text()}`);
      }
      return { stream: geminiSseToStreamParts(response), rawResponse: response };
    },
  };
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
  let toolCallCounter = 0;
  for (const p of candidate?.content?.parts ?? []) {
    if (typeof p['text'] === 'string' && p['text'])
      parts.push({ type: 'text', text: p['text'] as string });
    const fc = p['functionCall'] as { name: string; args?: unknown } | undefined;
    if (fc) {
      parts.push({
        type: 'tool-call',
        toolCallId: `gemini_tc_${++toolCallCounter}`,
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

async function* geminiSseToStreamParts(
  response: Response,
): AsyncGenerator<LanguageModelV2StreamPart> {
  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: 'error', error: new Error('No readable body') };
    return;
  }
  const decoder = new TextDecoder();
  let buffer = '';
  let textStarted = false;
  const textId = 'text-0';
  let finishReason: FinishReason = 'stop';
  const usage: LanguageModelV2Usage = {};
  let toolCallCounter = 0;

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

    if (done) {
      if (textStarted) yield { type: 'text-end', id: textId };
      yield { type: 'finish', finishReason, usage };
      return;
    }
  }
}
