import { AppState } from 'react-native';
import { initLlama, LlamaContext } from 'llama.rn';
import type { Message } from './types';
import { profileRepository } from '../../db/repositories';
import {
  OPENROUTER_FREE_MODELS,
  GROQ_MODELS,
  GEMINI_MODELS,
  CLOUDFLARE_MODELS,
  DEEPSEEK_MODELS,
  KILO_MODELS,
  AGENTROUTER_MODELS,
  CHATGPT_MODELS,
  GITHUB_MODELS_CHAT_MODELS,
  GITHUB_MODELS_API_VERSION,
  getGitHubModelsChatCompletionsUrl,
} from './config';
import { RateLimitError } from './schemas';
import { readOpenAiCompatibleSse } from './openaiSseStream';
import { geminiGenerateContentSdk, geminiGenerateContentStreamSdk } from './google/geminiChat';
import { callChatGpt, streamChatGpt } from './chatgpt/chatgptApi';
import type { ChatGptAccountSlot, ProviderId } from '../../types';
import { DEFAULT_PROVIDER_ORDER } from '../../types';
import { logStreamEvent } from './runtimeDebug';

let llamaContext: LlamaContext | null = null;
let currentLlamaPath: string | null = null;
let llamaContextPromise: Promise<LlamaContext> | null = null;
type AppStateSubscription = { remove?: () => void };
const APPSTATE_SUB_KEY = '__guru_llmRouting_appState_sub_v1';
const KILO_MODELS_CACHE_TTL_MS = 10 * 60 * 1000;
let kiloModelsCache: { expiresAt: number; models: string[] } | null = null;

/** Metro / RN debugger only — physical devices cannot reach host `127.0.0.1` debug ingest. */
function devLogOpenRouter(message: string, data: Record<string, unknown>) {
  if (__DEV__) console.log(`[Guru:OpenRouter] ${message}`, data);
}

function splitForPseudoStream(text: string, targetChunkChars = 34): string[] {
  const parts = text.split(/(\s+)/).filter((part) => part.length > 0);
  const chunks: string[] = [];
  let current = '';
  for (const part of parts) {
    if (current.length > 0 && current.length + part.length > targetChunkChars) {
      chunks.push(current);
      current = part;
      continue;
    }
    current += part;
  }
  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
}

async function emitPseudoStreamFallback(
  text: string,
  onDelta: (delta: string) => void,
  meta: { provider: string; model: string; reason: 'no_body' | 'empty_sse' },
) {
  const chunks = splitForPseudoStream(text);
  const targetDurationMs = Math.min(1400, Math.max(280, Math.round(text.length * 2.2)));
  const delayMs =
    chunks.length > 1
      ? Math.max(12, Math.min(56, Math.round(targetDurationMs / (chunks.length - 1))))
      : 0;

  logStreamEvent('fallback_chunk_stream_start', {
    provider: meta.provider,
    model: meta.model,
    reason: meta.reason,
    outputChars: text.length,
    chunks: chunks.length,
    delayMs,
  });

  for (let i = 0; i < chunks.length; i += 1) {
    onDelta(chunks[i]);
    if (delayMs > 0 && i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  logStreamEvent('fallback_chunk_stream_complete', {
    provider: meta.provider,
    model: meta.model,
    reason: meta.reason,
    outputChars: text.length,
    chunks: chunks.length,
    delayMs,
  });
}

/** Multimodal `message.content` arrays from OpenRouter / OpenAI chat. */
function stringifyChatMessageContentParts(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const p = part as Record<string, unknown>;
      if (p.type === 'text' && typeof p.text === 'string') return p.text;
      if (typeof p.text === 'string') return p.text;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function isLikelyFreeKiloModel(row: Record<string, unknown>): boolean {
  const flags = [
    row.free,
    row.is_free,
    row.isFree,
    row.has_free_tier,
    row.hasFreeTier,
    row.free_tier,
    row.freeTier,
  ];
  if (flags.some((v) => v === true)) return true;

  const pricing = row.pricing;
  if (pricing && typeof pricing === 'object') {
    const p = pricing as Record<string, unknown>;
    const prompt = Number(p.prompt ?? p.input ?? p.prompt_tokens ?? NaN);
    const completion = Number(p.completion ?? p.output ?? p.completion_tokens ?? NaN);
    if (
      Number.isFinite(prompt) &&
      Number.isFinite(completion) &&
      prompt === 0 &&
      completion === 0
    ) {
      return true;
    }
  }

  const rawTagFields = [row.tier, row.plan, row.label, row.category, row.type, row.tags];
  const tagText = rawTagFields
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter((v): v is string => typeof v === 'string')
    .join(' ')
    .toLowerCase();
  return /\bfree\b/.test(tagText);
}

async function getKiloPreferredModels(kiloApiKey: string): Promise<string[]> {
  const now = Date.now();
  if (kiloModelsCache && kiloModelsCache.expiresAt > now && kiloModelsCache.models.length > 0) {
    return kiloModelsCache.models;
  }

  try {
    const res = await fetch('https://api.kilo.ai/api/gateway/models', {
      headers: { Authorization: `Bearer ${kiloApiKey}` },
    });
    if (!res.ok) {
      return [...KILO_MODELS];
    }
    const data = (await res.json()) as { data?: Record<string, unknown>[] };
    const rows = Array.isArray(data.data) ? data.data : [];
    const all = rows
      .map((r) => r.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const free = rows
      .filter((r) => isLikelyFreeKiloModel(r))
      .map((r) => r.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const preferred = [...new Set([...(free.length > 0 ? free : all), ...KILO_MODELS])];
    if (preferred.length > 0) {
      kiloModelsCache = { expiresAt: now + KILO_MODELS_CACHE_TTL_MS, models: preferred };
      return preferred;
    }
  } catch {
    // Ignore — fallback list below
  }

  return [...KILO_MODELS];
}

/**
 * OpenRouter chat completion JSON: normal `message.content`, multimodal arrays,
 * reasoning-only models (e.g. some Nemotron streams), top-level `error`, or `refusal`.
 */
function extractOpenRouterAssistantText(data: unknown, model: string): string {
  if (!data || typeof data !== 'object') {
    throw new Error(`OpenRouter invalid response body for ${model}`);
  }
  const d = data as Record<string, unknown>;
  const topErr = d.error;
  if (topErr && typeof topErr === 'object') {
    const em = (topErr as Record<string, unknown>).message;
    throw new Error(
      `OpenRouter error (${model}): ${typeof em === 'string' ? em : JSON.stringify(topErr)}`,
    );
  }

  const choices = d.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error(`OpenRouter returned no choices for ${model}`);
  }

  const ch0 = choices[0] as Record<string, unknown>;
  const msg = ch0.message as Record<string, unknown> | undefined;

  if (msg && typeof msg.refusal === 'string' && msg.refusal.trim()) {
    throw new Error(`OpenRouter model ${model} refused: ${msg.refusal.trim()}`);
  }

  const fromContent = msg ? stringifyChatMessageContentParts(msg.content) : '';
  if (fromContent.trim()) return fromContent.trim();

  const reasoningFromMsg = typeof msg?.reasoning === 'string' ? msg.reasoning : '';
  const reasoningFromMsgDetails =
    typeof msg?.reasoning_details === 'string' ? msg.reasoning_details : '';
  const reasoningFromChoice =
    typeof ch0.reasoning === 'string'
      ? ch0.reasoning
      : typeof ch0.reasoning_content === 'string'
        ? ch0.reasoning_content
        : '';
  const reasoning =
    [reasoningFromMsg, reasoningFromMsgDetails, reasoningFromChoice].find((s) => s.trim()) ?? '';

  if (reasoning.trim()) {
    devLogOpenRouter('reasoning_text_used', { model, contentLen: reasoning.trim().length });
    // #region agent log
    fetch('http://127.0.0.1:7507/ingest/f6a0734c-b45d-4770-9e51-aa07e5c2da6e', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ca9385' },
      body: JSON.stringify({
        sessionId: 'ca9385',
        hypothesisId: 'H4',
        location: 'llmRouting.extractOpenRouterAssistantText',
        message: 'openrouter_reasoning_fallback',
        data: { model, contentLen: reasoning.trim().length },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return reasoning.trim();
  }

  const legacyText = typeof ch0.text === 'string' ? ch0.text : '';
  if (legacyText.trim()) return legacyText.trim();

  const fr = ch0.finish_reason;
  throw new Error(
    `Empty response from OpenRouter model ${model} (finish_reason: ${String(fr ?? 'n/a')})`,
  );
}

// Promise-based mutex: prevents concurrent LLM generation which corrupts native context.
// Unlike a boolean flag, this properly queues callers and can't deadlock on thrown errors.
let _contextLockPromise: Promise<void> = Promise.resolve();
let _contextLockCount = 0;

function acquireContextLock(): Promise<() => void> {
  let release!: () => void;
  const prev = _contextLockPromise;
  _contextLockPromise = new Promise<void>((resolve) => {
    release = () => {
      _contextLockCount--;
      resolve();
    };
  });
  _contextLockCount++;
  return prev.then(() => release);
}

function isContextInUse(): boolean {
  return _contextLockCount > 0;
}

async function getLlamaContext(modelPath: string): Promise<LlamaContext> {
  if (llamaContext && currentLlamaPath === modelPath) {
    return llamaContext;
  }
  // Mutex: if another caller is already initializing, await the same promise
  if (llamaContextPromise) {
    await llamaContextPromise;
    if (llamaContext && currentLlamaPath === modelPath) return llamaContext;
  }
  llamaContextPromise = (async () => {
    if (llamaContext) {
      await llamaContext.release();
      llamaContext = null;
    }
    // Performance defaults tuned for quantized GGUF on mid-range Android.
    const ctx = await initLlama({
      model: modelPath,
      n_context: 2048,
      n_batch: 384,
      k_type: 2,
      v_type: 2,
      use_mlock: false,
    } as any);
    llamaContext = ctx;
    currentLlamaPath = modelPath;
    return ctx;
  })();
  try {
    return await llamaContextPromise;
  } finally {
    llamaContextPromise = null;
  }
}

/** Release the native LLM context to free memory. Safe to call at any time. */
export async function releaseLlamaContext(): Promise<void> {
  if (isContextInUse() || llamaContextPromise) return; // don't interrupt in-flight generation or init
  if (llamaContext) {
    try {
      await llamaContext.release();
    } catch (err) {
      console.warn('[LLM] Failed to release native context:', err);
    }
    llamaContext = null;
    currentLlamaPath = null;
  }
}

// Release the 200 MB+ LLM context when app goes to background to prevent OOM kills.
// Store the subscription on `globalThis` so hot reload can't stack listeners.
const prevSub = (globalThis as any)[APPSTATE_SUB_KEY] as AppStateSubscription | undefined;
if (prevSub?.remove) prevSub.remove();
(globalThis as any)[APPSTATE_SUB_KEY] = AppState.addEventListener('change', async (state) => {
  if (state === 'background' || state === 'inactive') {
    await releaseLlamaContext();
  }
}) as AppStateSubscription;

async function callLocalLLM(
  messages: Message[],
  modelPath: string,
  textMode = false,
): Promise<string> {
  const ctx = await getLlamaContext(modelPath);
  const release = await acquireContextLock();
  try {
    let prompt = '';
    const isQwen = modelPath.toLowerCase().includes('qwen');

    if (isQwen) {
      // ChatML format for Qwen
      for (const m of messages) {
        prompt += `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`;
      }
      prompt += `<|im_start|>assistant\n`;
    } else {
      // Format as Llama-3 instruction format
      for (const m of messages) {
        prompt += `<|start_header_id|>${m.role}<|end_header_id|>\n\n${m.content}<|eot_id|>\n`;
      }
      prompt += `<|start_header_id|>assistant<|end_header_id|>\n\n`;
    }

    if (!textMode) {
      // Force start of JSON object
      prompt += `{`;
    }

    const n_predict = textMode ? 3072 : 2048;
    const result = await ctx.completion({
      prompt,
      n_predict,
      temperature: 0.7,
      top_p: 0.9,
    });

    let text = result.text;
    if (!textMode) {
      text = `{${text}`;
    }
    return text;
  } finally {
    release();
  }
}

async function callOpenRouter(messages: Message[], orKey: string, model: string): Promise<string> {
  const t0 = Date.now();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${orKey}`,
      'HTTP-Referer': 'neet-study-app',
      'X-Title': 'Guru Study App',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  devLogOpenRouter('nonstream_http_status', {
    model,
    ms: Date.now() - t0,
    status: res.status,
    ok: res.ok,
  });

  if (res.status === 429) {
    throw new RateLimitError(`OpenRouter rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`OpenRouter error ${res.status} (${model}): ${err}`);
  }

  const data = await res.json();
  const text = extractOpenRouterAssistantText(data, model);
  devLogOpenRouter('nonstream_done', { model, ms: Date.now() - t0, outLen: text.length });
  return text;
}

/** Cloudflare Workers AI — OpenAI-compatible endpoint. */
async function callCloudflare(
  messages: Message[],
  accountId: string,
  apiToken: string,
  model: string,
): Promise<string> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    },
  );

  if (res.status === 429) {
    throw new RateLimitError(`Cloudflare rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Cloudflare error ${res.status} (${model}): ${err}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new Error(`Empty response from Cloudflare model ${model}`);
  return text;
}

/** Cloudflare Workers AI chat with SSE streaming. */
async function streamCloudflareChat(
  messages: Message[],
  accountId: string,
  apiToken: string,
  model: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: true,
      }),
    },
  );

  if (res.status === 429) {
    throw new RateLimitError(`Cloudflare rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Cloudflare error ${res.status} (${model}): ${err}`);
  }

  if (!res.body) {
    logStreamEvent('no_body_fallback', { provider: 'cloudflare', model });
    const text = await callCloudflare(messages, accountId, apiToken, model);
    await emitPseudoStreamFallback(text, onDelta, {
      provider: 'cloudflare',
      model,
      reason: 'no_body',
    });
    logStreamEvent('fallback_complete', {
      provider: 'cloudflare',
      model,
      mode: 'nonstream_chunked',
      outputChars: text.length,
    });
    return text;
  }

  const text = await readOpenAiCompatibleSse(res, onDelta);
  logStreamEvent('sse_complete', {
    provider: 'cloudflare',
    model,
    outputChars: text.length,
  });
  if (!text.trim()) throw new Error(`Empty response from Cloudflare model ${model}`);
  return text;
}

async function callGroq(
  messages: Message[],
  groqKey: string,
  model: string,
  jsonMode = true,
): Promise<string> {
  const clonedMessages = [...messages];
  if (jsonMode) {
    // Groq requires the word "json" to be present in the prompt when using json_object format.
    const hasJsonWord = clonedMessages.some((m) => m.content.toLowerCase().includes('json'));
    if (!hasJsonWord) {
      const systemIdx = clonedMessages.findIndex((m) => m.role === 'system');
      if (systemIdx !== -1) {
        clonedMessages[systemIdx] = {
          ...clonedMessages[systemIdx],
          content: clonedMessages[systemIdx].content + '\nRespond in JSON format.',
        };
      } else {
        clonedMessages[0] = {
          ...clonedMessages[0],
          content: clonedMessages[0].content + '\nRespond in JSON format.',
        };
      }
    }
  }

  const body: Record<string, unknown> = {
    model,
    messages: jsonMode ? clonedMessages : messages,
    temperature: 0.7,
    max_tokens: 4096,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${groqKey}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    throw new RateLimitError(`Groq rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Groq error ${res.status} (${model}): ${err}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new Error(`Empty response from Groq model ${model}`);
  return text;
}

/** Groq chat with SSE; falls back to non-streaming JSON if the runtime has no response body stream. */
async function streamGroqChat(
  messages: Message[],
  groqKey: string,
  model: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    }),
  });

  if (res.status === 429) {
    throw new RateLimitError(`Groq rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Groq error ${res.status} (${model}): ${err}`);
  }

  if (!res.body) {
    logStreamEvent('no_body_fallback', { provider: 'groq', model });
    const text = await callGroq(messages, groqKey, model, false);
    await emitPseudoStreamFallback(text, onDelta, {
      provider: 'groq',
      model,
      reason: 'no_body',
    });
    logStreamEvent('fallback_complete', {
      provider: 'groq',
      model,
      mode: 'nonstream_chunked',
      outputChars: text.length,
    });
    return text;
  }

  const text = await readOpenAiCompatibleSse(res, onDelta);
  logStreamEvent('sse_complete', {
    provider: 'groq',
    model,
    outputChars: text.length,
  });
  if (!text.trim()) throw new Error(`Empty response from Groq model ${model}`);
  return text;
}

/** OpenRouter chat with SSE; falls back to non-streaming if no body stream. */
async function streamOpenRouterChat(
  messages: Message[],
  orKey: string,
  model: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const t0 = Date.now();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${orKey}`,
      'HTTP-Referer': 'neet-study-app',
      'X-Title': 'Guru Study App',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    }),
  });

  devLogOpenRouter('stream_first_http', {
    model,
    msToHeaders: Date.now() - t0,
    status: res.status,
    hasBody: !!res.body,
  });

  if (res.status === 429) {
    throw new RateLimitError(`OpenRouter rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`OpenRouter error ${res.status} (${model}): ${err}`);
  }

  if (!res.body) {
    devLogOpenRouter('stream_no_body_using_nonstream', { model });
    logStreamEvent('no_body_fallback', { provider: 'openrouter', model });
    const text = await callOpenRouter(messages, orKey, model);
    await emitPseudoStreamFallback(text, onDelta, {
      provider: 'openrouter',
      model,
      reason: 'no_body',
    });
    logStreamEvent('fallback_complete', {
      provider: 'openrouter',
      model,
      mode: 'nonstream_chunked',
      outputChars: text.length,
    });
    devLogOpenRouter('stream_path_done', {
      model,
      msTotal: Date.now() - t0,
      path: 'nonstream_only',
    });
    return text;
  }

  const tSse = Date.now();
  let text = await readOpenAiCompatibleSse(res, onDelta);
  const sseMs = Date.now() - tSse;
  let usedNonstreamRetry = false;
  if (!text.trim()) {
    devLogOpenRouter('stream_empty_retry_nonstream', { model, sseMs, accumulatedLen: text.length });
    logStreamEvent('empty_sse_retry_nonstream', {
      provider: 'openrouter',
      model,
      sseMs,
      accumulatedChars: text.length,
    });
    const tRetry = Date.now();
    text = await callOpenRouter(messages, orKey, model);
    usedNonstreamRetry = true;
    devLogOpenRouter('stream_retry_nonstream_ms', { model, retryMs: Date.now() - tRetry });
    await emitPseudoStreamFallback(text, onDelta, {
      provider: 'openrouter',
      model,
      reason: 'empty_sse',
    });
  }
  logStreamEvent('sse_complete', {
    provider: 'openrouter',
    model,
    outputChars: text.length,
    sseMs,
    usedNonstreamRetry,
  });
  devLogOpenRouter('stream_path_done', {
    model,
    msTotal: Date.now() - t0,
    sseMs,
    usedNonstreamRetry,
    outLen: text.length,
  });
  return text;
}

async function callDeepSeek(
  messages: Message[],
  deepseekKey: string,
  model: string,
  jsonMode = true,
): Promise<string> {
  if (__DEV__) console.log(`[AI] callDeepSeek attempt: model=${model} json=${jsonMode}`);
  const clonedMessages = [...messages];
  if (jsonMode) {
    const hasJsonWord = clonedMessages.some((m) => m.content.toLowerCase().includes('json'));
    if (!hasJsonWord) {
      const systemIdx = clonedMessages.findIndex((m) => m.role === 'system');
      if (systemIdx !== -1) {
        clonedMessages[systemIdx] = {
          ...clonedMessages[systemIdx],
          content: clonedMessages[systemIdx].content + '\nRespond in JSON format.',
        };
      } else {
        clonedMessages[0] = {
          ...clonedMessages[0],
          content: clonedMessages[0].content + '\nRespond in JSON format.',
        };
      }
    }
  }

  const body: Record<string, unknown> = {
    model,
    messages: clonedMessages,
    temperature: 0.7,
    max_tokens: 4096,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deepseekKey}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    if (__DEV__) console.warn(`[AI] DeepSeek 429: ${model}`);
    throw new RateLimitError(`DeepSeek rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    if (__DEV__) console.error(`[AI] DeepSeek ${res.status} (${model}):`, err);
    throw new Error(`DeepSeek error ${res.status} (${model}): ${err}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new Error(`Empty response from DeepSeek model ${model}`);
  if (__DEV__) console.log(`[AI] DeepSeek success: ${model} (${text.length} chars)`);
  return text;
}

async function streamDeepSeekChat(
  messages: Message[],
  deepseekKey: string,
  model: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deepseekKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    }),
  });

  if (res.status === 429) {
    throw new RateLimitError(`DeepSeek rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`DeepSeek error ${res.status} (${model}): ${err}`);
  }

  if (!res.body) {
    logStreamEvent('no_body_fallback', { provider: 'deepseek', model });
    const text = await callDeepSeek(messages, deepseekKey, model, false);
    await emitPseudoStreamFallback(text, onDelta, {
      provider: 'deepseek',
      model,
      reason: 'no_body',
    });
    logStreamEvent('fallback_complete', {
      provider: 'deepseek',
      model,
      mode: 'nonstream_chunked',
      outputChars: text.length,
    });
    return text;
  }

  const text = await readOpenAiCompatibleSse(res, onDelta);
  logStreamEvent('sse_complete', {
    provider: 'deepseek',
    model,
    outputChars: text.length,
  });
  if (!text.trim()) throw new Error(`Empty response from DeepSeek model ${model}`);
  return text;
}

function githubModelsHeaders(pat: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_MODELS_API_VERSION,
    Authorization: `Bearer ${pat}`,
  };
}

/** GitHub Models — OpenAI-style chat at models.github.ai (REST inference API). */
async function callGitHubModels(
  messages: Message[],
  pat: string,
  model: string,
  jsonMode = true,
): Promise<string> {
  if (__DEV__) console.log(`[AI] callGitHubModels attempt: model=${model} json=${jsonMode}`);
  const clonedMessages = [...messages];
  if (jsonMode) {
    const hasJsonWord = clonedMessages.some((m) => m.content.toLowerCase().includes('json'));
    if (!hasJsonWord) {
      const systemIdx = clonedMessages.findIndex((m) => m.role === 'system');
      if (systemIdx !== -1) {
        clonedMessages[systemIdx] = {
          ...clonedMessages[systemIdx],
          content: clonedMessages[systemIdx].content + '\nRespond in JSON format.',
        };
      } else {
        clonedMessages[0] = {
          ...clonedMessages[0],
          content: clonedMessages[0].content + '\nRespond in JSON format.',
        };
      }
    }
  }

  const body: Record<string, unknown> = {
    model,
    messages: clonedMessages,
    temperature: 0.7,
    max_tokens: 4096,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(getGitHubModelsChatCompletionsUrl(), {
    method: 'POST',
    headers: githubModelsHeaders(pat),
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    if (__DEV__) console.warn(`[AI] GitHub Models 429: ${model}`);
    throw new RateLimitError(`GitHub Models rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    if (__DEV__) console.error(`[AI] GitHub Models ${res.status} (${model}):`, err);
    throw new Error(`GitHub Models error ${res.status} (${model}): ${err}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new Error(`Empty response from GitHub model ${model}`);
  if (__DEV__) console.log(`[AI] GitHub Models success: ${model} (${text.length} chars)`);
  return text;
}

async function streamGitHubModelsChat(
  messages: Message[],
  pat: string,
  model: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const res = await fetch(getGitHubModelsChatCompletionsUrl(), {
    method: 'POST',
    headers: githubModelsHeaders(pat),
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    }),
  });

  if (res.status === 429) {
    throw new RateLimitError(`GitHub Models rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`GitHub Models error ${res.status} (${model}): ${err}`);
  }

  if (!res.body) {
    logStreamEvent('no_body_fallback', { provider: 'github', model });
    const text = await callGitHubModels(messages, pat, model, false);
    await emitPseudoStreamFallback(text, onDelta, {
      provider: 'github',
      model,
      reason: 'no_body',
    });
    logStreamEvent('fallback_complete', {
      provider: 'github',
      model,
      mode: 'nonstream_chunked',
      outputChars: text.length,
    });
    return text;
  }

  const text = await readOpenAiCompatibleSse(res, onDelta);
  logStreamEvent('sse_complete', {
    provider: 'github',
    model,
    outputChars: text.length,
  });
  if (!text.trim()) throw new Error(`Empty response from GitHub model ${model}`);
  return text;
}

async function callKilo(
  messages: Message[],
  kiloApiKey: string,
  model: string,
  jsonMode = true,
): Promise<string> {
  const clonedMessages = [...messages];
  if (jsonMode) {
    const hasJsonWord = clonedMessages.some((m) => m.content.toLowerCase().includes('json'));
    if (!hasJsonWord) {
      const systemIdx = clonedMessages.findIndex((m) => m.role === 'system');
      if (systemIdx !== -1) {
        clonedMessages[systemIdx] = {
          ...clonedMessages[systemIdx],
          content: clonedMessages[systemIdx].content + '\nRespond in JSON format.',
        };
      } else {
        clonedMessages[0] = {
          ...clonedMessages[0],
          content: clonedMessages[0].content + '\nRespond in JSON format.',
        };
      }
    }
  }
  const body: Record<string, unknown> = {
    model,
    messages: clonedMessages,
    temperature: 0.7,
    max_tokens: 4096,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const res = await fetch('https://api.kilo.ai/api/gateway/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${kiloApiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 429) {
    throw new RateLimitError(`Kilo rate limit on ${model}`);
  }
  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Kilo error ${res.status} (${model}): ${err}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new Error(`Empty response from Kilo model ${model}`);
  return text;
}

async function streamKiloChat(
  messages: Message[],
  kiloApiKey: string,
  model: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const res = await fetch('https://api.kilo.ai/api/gateway/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${kiloApiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    }),
  });
  if (res.status === 429) {
    throw new RateLimitError(`Kilo rate limit on ${model}`);
  }
  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Kilo error ${res.status} (${model}): ${err}`);
  }
  if (!res.body) {
    logStreamEvent('no_body_fallback', { provider: 'kilo', model });
    const text = await callKilo(messages, kiloApiKey, model, false);
    await emitPseudoStreamFallback(text, onDelta, {
      provider: 'kilo',
      model,
      reason: 'no_body',
    });
    logStreamEvent('fallback_complete', {
      provider: 'kilo',
      model,
      mode: 'nonstream_chunked',
      outputChars: text.length,
    });
    return text;
  }
  const text = await readOpenAiCompatibleSse(res, onDelta);
  logStreamEvent('sse_complete', {
    provider: 'kilo',
    model,
    outputChars: text.length,
  });
  if (!text.trim()) throw new Error(`Empty response from Kilo model ${model}`);
  return text;
}

/** Headers that satisfy AgentRouter's OpenAI-SDK client fingerprint check. */
const AGENTROUTER_HEADERS = {
  'User-Agent': 'Kilo-Code/5.11.0',
  'HTTP-Referer': 'https://kilocode.ai',
  'X-Title': 'Kilo Code',
  'X-KiloCode-Version': '5.11.0',
  'x-stainless-arch': 'x64',
  'x-stainless-lang': 'js',
  'x-stainless-os': 'Android',
  'x-stainless-package-version': '6.32.0',
  'x-stainless-retry-count': '0',
  'x-stainless-runtime': 'node',
  'x-stainless-runtime-version': 'v20.20.0',
} as const;

async function callAgentRouter(
  messages: Message[],
  apiKey: string,
  model: string,
  jsonMode = true,
): Promise<string> {
  const clonedMessages = [...messages];
  if (jsonMode) {
    const hasJsonWord = clonedMessages.some((m) => m.content.toLowerCase().includes('json'));
    if (!hasJsonWord) {
      const systemIdx = clonedMessages.findIndex((m) => m.role === 'system');
      if (systemIdx !== -1) {
        clonedMessages[systemIdx] = {
          ...clonedMessages[systemIdx],
          content: clonedMessages[systemIdx].content + '\nRespond in JSON format.',
        };
      } else {
        clonedMessages[0] = {
          ...clonedMessages[0],
          content: clonedMessages[0].content + '\nRespond in JSON format.',
        };
      }
    }
  }
  const body: Record<string, unknown> = {
    model,
    messages: clonedMessages,
    temperature: 0.7,
    max_tokens: 4096,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  if (__DEV__) console.log(`[AI] callAgentRouter: model=${model} json=${jsonMode}`);
  const res = await fetch('https://agentrouter.org/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...AGENTROUTER_HEADERS,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new RateLimitError(`AgentRouter rate limit on ${model}`);
  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`AgentRouter error ${res.status} (${model}): ${err}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new Error(`Empty response from AgentRouter model ${model}`);
  return text;
}

async function streamAgentRouterChat(
  messages: Message[],
  apiKey: string,
  model: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const res = await fetch('https://agentrouter.org/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...AGENTROUTER_HEADERS,
    },
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096, stream: true }),
  });
  if (res.status === 429) throw new RateLimitError(`AgentRouter rate limit on ${model}`);
  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`AgentRouter error ${res.status} (${model}): ${err}`);
  }
  if (!res.body) {
    logStreamEvent('no_body_fallback', { provider: 'agentrouter', model });
    const text = await callAgentRouter(messages, apiKey, model, false);
    await emitPseudoStreamFallback(text, onDelta, {
      provider: 'agentrouter',
      model,
      reason: 'no_body',
    });
    logStreamEvent('fallback_complete', {
      provider: 'agentrouter',
      model,
      mode: 'nonstream_chunked',
      outputChars: text.length,
    });
    return text;
  }
  const text = await readOpenAiCompatibleSse(res, onDelta);
  logStreamEvent('sse_complete', {
    provider: 'agentrouter',
    model,
    outputChars: text.length,
  });
  if (!text.trim()) throw new Error(`Empty response from AgentRouter model ${model}`);
  return text;
}

/** Keys bag shared by the provider loop helpers. */
interface ProviderKeys {
  groqKey?: string;
  githubModelsPat?: string;
  kiloApiKey?: string;
  deepseekKey?: string;
  agentRouterKey?: string;
  geminiKey?: string;
  geminiFallbackKey?: string;
  orKey?: string;
  cfAccountId?: string;
  cfApiToken?: string;
  chatgptConnected?: boolean;
  chatgptSlots?: ChatGptAccountSlot[];
}

/** Ensure chatgpt is in the provider order (old saved orders won't have it). */
function ensureChatGptInOrder(order: ProviderId[]): ProviderId[] {
  if (order.includes('chatgpt')) return order;
  return ['chatgpt', ...order];
}

/** Check if a provider has a usable key configured. */
function providerHasKey(provider: ProviderId, keys: ProviderKeys): boolean {
  switch (provider) {
    case 'chatgpt':
      return !!keys.chatgptConnected;
    case 'groq':
      return !!keys.groqKey;
    case 'github':
      return !!keys.githubModelsPat;
    case 'kilo':
      return !!keys.kiloApiKey;
    case 'deepseek':
      return !!keys.deepseekKey;
    case 'agentrouter':
      return !!keys.agentRouterKey;
    case 'gemini':
      return !!keys.geminiKey;
    case 'gemini_fallback':
      return !!keys.geminiFallbackKey;
    case 'openrouter':
      return !!keys.orKey;
    case 'cloudflare':
      return !!(keys.cfAccountId && keys.cfApiToken);
    default:
      return false;
  }
}

function getChatGptFallbackSlots(keys: ProviderKeys): ChatGptAccountSlot[] {
  if (keys.chatgptSlots?.length) return keys.chatgptSlots;
  return keys.chatgptConnected ? ['primary'] : [];
}

function shouldRetryChatGptOnBackup(error: Error): boolean {
  if (error instanceof RateLimitError) return true;
  const message = error.message.toLowerCase();
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('failed to fetch') ||
    message.includes('no refresh token') ||
    message.includes('token refresh failed') ||
    message.includes('chatgpt request error (401)') ||
    message.includes('chatgpt stream error (401)') ||
    message.includes('chatgpt request error (429)') ||
    message.includes('chatgpt stream error (429)') ||
    message.includes('chatgpt request error (500)') ||
    message.includes('chatgpt request error (502)') ||
    message.includes('chatgpt request error (503)') ||
    message.includes('chatgpt request error (504)') ||
    message.includes('chatgpt stream error (500)') ||
    message.includes('chatgpt stream error (502)') ||
    message.includes('chatgpt stream error (503)') ||
    message.includes('chatgpt stream error (504)')
  ) {
    return true;
  }
  return false;
}

async function callChatGptWithFallback(
  messages: Message[],
  model: string,
  jsonMode: boolean,
  slots: ChatGptAccountSlot[],
): Promise<string> {
  let lastError: Error | null = null;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    try {
      return await callChatGpt(messages, model, jsonMode, slot);
    } catch (err) {
      lastError = err as Error;
      if (i === slots.length - 1 || !shouldRetryChatGptOnBackup(lastError)) {
        throw lastError;
      }
    }
  }
  throw lastError ?? new Error('ChatGPT failed for all configured accounts');
}

async function streamChatGptWithFallback(
  messages: Message[],
  model: string,
  onDelta: (delta: string) => void,
  slots: ChatGptAccountSlot[],
): Promise<string> {
  let lastError: Error | null = null;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    let emitted = false;
    try {
      return await streamChatGpt(
        messages,
        model,
        (delta) => {
          emitted = true;
          onDelta(delta);
        },
        slot,
      );
    } catch (err) {
      lastError = err as Error;
      if (emitted || i === slots.length - 1 || !shouldRetryChatGptOnBackup(lastError)) {
        throw lastError;
      }
    }
  }
  throw lastError ?? new Error('ChatGPT failed for all configured accounts');
}

/** Try all models for a single provider (streaming). Returns result, or null if none succeeded. */
async function tryStreamProvider(
  provider: ProviderId,
  messages: Message[],
  onDelta: (delta: string) => void,
  skipModel: string | undefined,
  keys: ProviderKeys,
): Promise<{ text: string; modelUsed: string } | null> {
  let lastErr: Error | null = null;
  const tryModels = async (
    models: readonly string[],
    fn: (model: string) => Promise<string>,
    prefix: string,
  ): Promise<{ text: string; modelUsed: string } | null> => {
    for (const model of models) {
      if (skipModel && model === skipModel) continue;
      try {
        if (__DEV__) console.log(`[AI] trying ${prefix || 'or'}/${model}...`);
        const text = await fn(model);
        return { text, modelUsed: prefix ? `${prefix}/${model}` : model };
      } catch (err) {
        if (__DEV__)
          console.warn(`[AI] ${prefix || 'or'}/${model} failed:`, (err as Error).message);
        lastErr = err as Error;
        continue;
      }
    }
    return null;
  };

  switch (provider) {
    case 'chatgpt':
      if (!keys.chatgptConnected) return null;
      return tryModels(
        CHATGPT_MODELS,
        (m) => streamChatGptWithFallback(messages, m, onDelta, getChatGptFallbackSlots(keys)),
        'chatgpt',
      );
    case 'groq':
      if (!keys.groqKey) return null;
      return tryModels(
        GROQ_MODELS,
        (m) => streamGroqChat(messages, keys.groqKey!, m, onDelta),
        'groq',
      );
    case 'github':
      if (!keys.githubModelsPat) return null;
      return tryModels(
        GITHUB_MODELS_CHAT_MODELS,
        (m) => streamGitHubModelsChat(messages, keys.githubModelsPat!, m, onDelta),
        'github',
      );
    case 'kilo':
      if (!keys.kiloApiKey) return null;
      return tryModels(
        await getKiloPreferredModels(keys.kiloApiKey),
        (m) => streamKiloChat(messages, keys.kiloApiKey!, m, onDelta),
        'kilo',
      );
    case 'deepseek':
      if (!keys.deepseekKey) return null;
      return tryModels(
        DEEPSEEK_MODELS,
        (m) => streamDeepSeekChat(messages, keys.deepseekKey!, m, onDelta),
        'deepseek',
      );
    case 'agentrouter':
      if (!keys.agentRouterKey) return null;
      return tryModels(
        AGENTROUTER_MODELS,
        (m) => streamAgentRouterChat(messages, keys.agentRouterKey!, m, onDelta),
        'ar',
      );
    case 'gemini':
      if (!keys.geminiKey) return null;
      return tryModels(
        GEMINI_MODELS,
        (m) => geminiGenerateContentStreamSdk(messages, keys.geminiKey!, m, onDelta),
        'gemini',
      );
    case 'gemini_fallback':
      if (!keys.geminiFallbackKey) return null;
      return tryModels(
        GEMINI_MODELS,
        (m) => geminiGenerateContentStreamSdk(messages, keys.geminiFallbackKey!, m, onDelta),
        'gemini',
      );
    case 'openrouter':
      if (!keys.orKey) return null;
      return tryModels(
        OPENROUTER_FREE_MODELS,
        (m) => streamOpenRouterChat(messages, keys.orKey!, m, onDelta),
        '',
      );
    case 'cloudflare':
      if (!keys.cfAccountId || !keys.cfApiToken) return null;
      return tryModels(
        CLOUDFLARE_MODELS,
        (m) => streamCloudflareChat(messages, keys.cfAccountId!, keys.cfApiToken!, m, onDelta),
        'cf',
      );
    default:
      return null;
  }
}

/** Try all models for a single provider (non-streaming). Returns result, or null if none succeeded. */
async function tryProvider(
  provider: ProviderId,
  messages: Message[],
  textMode: boolean,
  skipModel: string | undefined,
  keys: ProviderKeys,
): Promise<{ text: string; modelUsed: string } | null> {
  const tryModels = async (
    models: readonly string[],
    fn: (model: string) => Promise<string>,
    prefix: string,
  ): Promise<{ text: string; modelUsed: string } | null> => {
    for (const model of models) {
      if (skipModel && model === skipModel) continue;
      try {
        if (__DEV__) console.log(`[AI] trying ${prefix || 'or'}/${model}...`);
        const text = await fn(model);
        return { text, modelUsed: prefix ? `${prefix}/${model}` : model };
      } catch (err) {
        if (__DEV__)
          console.warn(`[AI] ${prefix || 'or'}/${model} failed:`, (err as Error).message);
        continue;
      }
    }
    return null;
  };

  const json = !textMode;
  switch (provider) {
    case 'chatgpt':
      if (!keys.chatgptConnected) return null;
      return tryModels(
        CHATGPT_MODELS,
        (m) => callChatGptWithFallback(messages, m, json, getChatGptFallbackSlots(keys)),
        'chatgpt',
      );
    case 'groq':
      if (!keys.groqKey) return null;
      return tryModels(GROQ_MODELS, (m) => callGroq(messages, keys.groqKey!, m, json), 'groq');
    case 'github':
      if (!keys.githubModelsPat) return null;
      return tryModels(
        GITHUB_MODELS_CHAT_MODELS,
        (m) => callGitHubModels(messages, keys.githubModelsPat!, m, json),
        'github',
      );
    case 'kilo':
      if (!keys.kiloApiKey) return null;
      return tryModels(
        await getKiloPreferredModels(keys.kiloApiKey),
        (m) => callKilo(messages, keys.kiloApiKey!, m, json),
        'kilo',
      );
    case 'deepseek':
      if (!keys.deepseekKey) return null;
      return tryModels(
        DEEPSEEK_MODELS,
        (m) => callDeepSeek(messages, keys.deepseekKey!, m, json),
        'deepseek',
      );
    case 'agentrouter':
      if (!keys.agentRouterKey) return null;
      return tryModels(
        AGENTROUTER_MODELS,
        (m) => callAgentRouter(messages, keys.agentRouterKey!, m, json),
        'ar',
      );
    case 'gemini':
      if (!keys.geminiKey) return null;
      return tryModels(
        GEMINI_MODELS,
        (m) => geminiGenerateContentSdk(messages, keys.geminiKey!, m),
        'gemini',
      );
    case 'gemini_fallback':
      if (!keys.geminiFallbackKey) return null;
      return tryModels(
        GEMINI_MODELS,
        (m) => geminiGenerateContentSdk(messages, keys.geminiFallbackKey!, m),
        'gemini',
      );
    case 'openrouter':
      if (!keys.orKey) return null;
      return tryModels(OPENROUTER_FREE_MODELS, (m) => callOpenRouter(messages, keys.orKey!, m), '');
    case 'cloudflare':
      if (!keys.cfAccountId || !keys.cfApiToken) return null;
      return tryModels(
        CLOUDFLARE_MODELS,
        (m) => callCloudflare(messages, keys.cfAccountId!, keys.cfApiToken!, m),
        'cf',
      );
    default:
      return null;
  }
}

/**
 * Same routing policy as attemptCloudLLM, but streams assistant tokens via onDelta.
 * (JSON / structured output is not streamed — use {@link attemptCloudLLM} instead.)
 */
export async function attemptCloudLLMStream(
  messages: Message[],
  orKey: string | undefined,
  groqKey: string | undefined,
  chosenModel: string | undefined,
  onDelta: (delta: string) => void,
  geminiKey?: string | undefined,
  geminiFallbackKey?: string | undefined,
  cfAccountId?: string | undefined,
  cfApiToken?: string | undefined,
  deepseekKey?: string | undefined,
  githubModelsPat?: string | undefined,
  kiloApiKey?: string | undefined,
  agentRouterKey?: string | undefined,
  providerOrder?: ProviderId[],
  chatgptConnected?: boolean,
  chatgptSlots?: ChatGptAccountSlot[],
): Promise<{ text: string; modelUsed: string }> {
  const preferredGroqModel = chosenModel?.startsWith('groq/')
    ? chosenModel.replace('groq/', '')
    : undefined;
  const preferredGeminiModel = chosenModel?.startsWith('gemini/')
    ? chosenModel.replace('gemini/', '')
    : undefined;
  const preferredCfModel = chosenModel?.startsWith('cf/')
    ? chosenModel.replace('cf/', '')
    : undefined;
  const preferredDeepseekModel = chosenModel?.startsWith('deepseek/')
    ? chosenModel.replace('deepseek/', '')
    : undefined;
  const preferredGithubModel = chosenModel?.startsWith('github/')
    ? chosenModel.replace('github/', '')
    : undefined;
  const preferredKiloModel = chosenModel?.startsWith('kilo/')
    ? chosenModel.replace('kilo/', '')
    : undefined;
  const preferredAgentRouterModel = chosenModel?.startsWith('ar/')
    ? chosenModel.replace('ar/', '')
    : undefined;
  const preferredChatGptModel = chosenModel?.startsWith('chatgpt/')
    ? chosenModel.replace('chatgpt/', '')
    : undefined;
  const preferredOpenRouterModel =
    chosenModel &&
    !preferredGroqModel &&
    !preferredGeminiModel &&
    !preferredCfModel &&
    !preferredDeepseekModel &&
    !preferredGithubModel &&
    !preferredKiloModel &&
    !preferredAgentRouterModel &&
    !preferredChatGptModel &&
    chosenModel !== 'local' &&
    chosenModel !== 'auto'
      ? chosenModel
      : undefined;

  // #region agent log
  fetch('http://127.0.0.1:7507/ingest/f6a0734c-b45d-4770-9e51-aa07e5c2da6e', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ca9385' },
    body: JSON.stringify({
      sessionId: 'ca9385',
      hypothesisId: 'H2',
      location: 'llmRouting.attemptCloudLLMStream',
      message: 'stream_routing_inputs',
      data: {
        chosenModel: chosenModel ?? 'undefined',
        preferredGroq: preferredGroqModel ?? null,
        preferredOr: preferredOpenRouterModel ?? null,
        preferredDeepseek: preferredDeepseekModel ?? null,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  let lastCloudError: Error | null = null;

  // 1. Explicit UI Selections
  if (preferredOpenRouterModel && orKey) {
    try {
      const text = await streamOpenRouterChat(messages, orKey, preferredOpenRouterModel, onDelta);
      return { text, modelUsed: preferredOpenRouterModel };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGroqModel && groqKey) {
    try {
      const text = await streamGroqChat(messages, groqKey, preferredGroqModel, onDelta);
      return { text, modelUsed: `groq/${preferredGroqModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGeminiModel && geminiKey) {
    try {
      const text = await geminiGenerateContentStreamSdk(
        messages,
        geminiKey,
        preferredGeminiModel,
        onDelta,
      );
      return { text, modelUsed: `gemini/${preferredGeminiModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredCfModel && cfAccountId && cfApiToken) {
    try {
      const text = await streamCloudflareChat(
        messages,
        cfAccountId,
        cfApiToken,
        preferredCfModel,
        onDelta,
      );
      return { text, modelUsed: `cf/${preferredCfModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGithubModel && githubModelsPat) {
    try {
      const text = await streamGitHubModelsChat(
        messages,
        githubModelsPat,
        preferredGithubModel,
        onDelta,
      );
      return { text, modelUsed: `github/${preferredGithubModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredKiloModel && kiloApiKey) {
    try {
      const text = await streamKiloChat(messages, kiloApiKey, preferredKiloModel, onDelta);
      return { text, modelUsed: `kilo/${preferredKiloModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredDeepseekModel && deepseekKey) {
    try {
      const text = await streamDeepSeekChat(messages, deepseekKey, preferredDeepseekModel, onDelta);
      return { text, modelUsed: `deepseek/${preferredDeepseekModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredAgentRouterModel && agentRouterKey) {
    try {
      const text = await streamAgentRouterChat(
        messages,
        agentRouterKey,
        preferredAgentRouterModel,
        onDelta,
      );
      return { text, modelUsed: `ar/${preferredAgentRouterModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredChatGptModel && chatgptConnected) {
    try {
      const text = await streamChatGptWithFallback(
        messages,
        preferredChatGptModel,
        onDelta,
        chatgptSlots?.length ? chatgptSlots : ['primary'],
      );
      return { text, modelUsed: `chatgpt/${preferredChatGptModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  const userPickedSpecificModel =
    !!chosenModel && chosenModel !== 'auto' && chosenModel !== 'local';
  if (userPickedSpecificModel) {
    // #region agent log
    fetch('http://127.0.0.1:7507/ingest/f6a0734c-b45d-4770-9e51-aa07e5c2da6e', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ca9385' },
      body: JSON.stringify({
        sessionId: 'ca9385',
        hypothesisId: 'H3',
        location: 'llmRouting.attemptCloudLLMStream',
        message: 'explicit_model_failed_no_fallback',
        data: {
          chosenModel,
          lastError: lastCloudError?.message ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (lastCloudError) throw lastCloudError;
    throw new Error(
      `Could not use the selected chat model (${chosenModel}). Check API keys in Settings.`,
    );
  }

  // 2. Default Routing — iterate providers in user-defined (or default) order
  const order = ensureChatGptInOrder(
    providerOrder?.length ? providerOrder : DEFAULT_PROVIDER_ORDER,
  );
  const keys: ProviderKeys = {
    groqKey,
    githubModelsPat,
    kiloApiKey,
    deepseekKey,
    agentRouterKey,
    geminiKey,
    geminiFallbackKey,
    orKey,
    cfAccountId,
    cfApiToken,
    chatgptConnected,
    chatgptSlots,
  };
  const skipModels: Record<string, string | undefined> = {
    chatgpt: preferredChatGptModel,
    groq: preferredGroqModel,
    github: preferredGithubModel,
    kilo: preferredKiloModel,
    deepseek: preferredDeepseekModel,
    agentrouter: preferredAgentRouterModel,
    gemini: preferredGeminiModel,
    gemini_fallback: preferredGeminiModel,
    openrouter: preferredOpenRouterModel,
    cloudflare: preferredCfModel,
  };

  if (__DEV__) {
    const available = order.filter((p) => providerHasKey(p, keys));
    console.log(
      `[AI] stream routing order: [${order.join(' → ')}] (available: ${available.join(', ')})`,
    );
  }

  for (const provider of order) {
    if (!providerHasKey(provider, keys)) {
      if (__DEV__) console.log(`[AI] skip ${provider} (no key)`);
      continue;
    }
    const skip = skipModels[provider];
    const result = await tryStreamProvider(provider, messages, onDelta, skip, keys);
    if (result) return result;
  }

  if (lastCloudError) {
    throw lastCloudError;
  }

  throw new Error('No AI backend available. Download a local model or add an API key in Settings.');
}

export async function attemptLocalLLM(
  messages: Message[],
  localModelPath: string,
  textMode: boolean,
): Promise<{ text: string; modelUsed: string }> {
  const isQwen = localModelPath.toLowerCase().includes('qwen');
  const isMedGemma = localModelPath.toLowerCase().includes('medgemma');
  const modelUsed = isMedGemma
    ? 'local-medgemma-4b'
    : isQwen
      ? 'local-qwen-2.5-3b'
      : 'local-llama-3.2-1b';
  try {
    const text = await callLocalLLM(messages, localModelPath, textMode);
    if (!text || !text.trim()) {
      throw new Error('Local model returned an empty response');
    }
    return { text, modelUsed };
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? String(err);
    // If the model file failed to load (corrupt/missing), clear the stored path
    // so the bootstrap will re-download it on next startup.
    if (
      msg.toLowerCase().includes('failed to load') ||
      msg.toLowerCase().includes('no such file') ||
      msg.toLowerCase().includes('invalid model')
    ) {
      // Important: free native memory on load failures to prevent leaks.
      if (!isContextInUse() && llamaContext) {
        try {
          await llamaContext.release();
        } catch (releaseErr) {
          console.warn('[LLM] Failed to release native context after load error:', releaseErr);
        }
      }
      llamaContext = null;
      currentLlamaPath = null;
      llamaContextPromise = null;
      profileRepository
        .updateProfile({ localModelPath: null, useLocalModel: false })
        .catch(() => {});
      throw new Error(
        'Local model file is missing or corrupt — it will re-download on next startup.',
      );
    }
    throw err;
  }
}

export async function attemptCloudLLM(
  messages: Message[],
  orKey: string | undefined,
  textMode: boolean,
  groqKey?: string | undefined,
  chosenModel?: string,
  geminiKey?: string | undefined,
  geminiFallbackKey?: string | undefined,
  cfAccountId?: string | undefined,
  cfApiToken?: string | undefined,
  deepseekKey?: string | undefined,
  githubModelsPat?: string | undefined,
  kiloApiKey?: string | undefined,
  agentRouterKey?: string | undefined,
  providerOrder?: ProviderId[],
  chatgptConnected?: boolean,
  chatgptSlots?: ChatGptAccountSlot[],
): Promise<{ text: string; modelUsed: string }> {
  const preferredGroqModel = chosenModel?.startsWith('groq/')
    ? chosenModel.replace('groq/', '')
    : undefined;
  const preferredGeminiModel = chosenModel?.startsWith('gemini/')
    ? chosenModel.replace('gemini/', '')
    : undefined;
  const preferredCfModel = chosenModel?.startsWith('cf/')
    ? chosenModel.replace('cf/', '')
    : undefined;
  const preferredDeepseekModel = chosenModel?.startsWith('deepseek/')
    ? chosenModel.replace('deepseek/', '')
    : undefined;
  const preferredGithubModel = chosenModel?.startsWith('github/')
    ? chosenModel.replace('github/', '')
    : undefined;
  const preferredKiloModel = chosenModel?.startsWith('kilo/')
    ? chosenModel.replace('kilo/', '')
    : undefined;
  const preferredAgentRouterModel = chosenModel?.startsWith('ar/')
    ? chosenModel.replace('ar/', '')
    : undefined;
  const preferredChatGptModel = chosenModel?.startsWith('chatgpt/')
    ? chosenModel.replace('chatgpt/', '')
    : undefined;
  const preferredOpenRouterModel =
    chosenModel &&
    !preferredGroqModel &&
    !preferredGeminiModel &&
    !preferredCfModel &&
    !preferredDeepseekModel &&
    !preferredGithubModel &&
    !preferredKiloModel &&
    !preferredAgentRouterModel &&
    !preferredChatGptModel &&
    chosenModel !== 'local' &&
    chosenModel !== 'auto'
      ? chosenModel
      : undefined;

  let lastCloudError: Error | null = null;

  // 1. Explicit UI Selections
  if (preferredChatGptModel && chatgptConnected) {
    try {
      const text = await callChatGptWithFallback(
        messages,
        preferredChatGptModel,
        !textMode,
        chatgptSlots?.length ? chatgptSlots : ['primary'],
      );
      return { text, modelUsed: `chatgpt/${preferredChatGptModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredDeepseekModel && deepseekKey) {
    try {
      const text = textMode
        ? await callDeepSeek(messages, deepseekKey, preferredDeepseekModel, false)
        : await callDeepSeek(messages, deepseekKey, preferredDeepseekModel);
      return { text, modelUsed: `deepseek/${preferredDeepseekModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGithubModel && githubModelsPat) {
    try {
      const text = textMode
        ? await callGitHubModels(messages, githubModelsPat, preferredGithubModel, false)
        : await callGitHubModels(messages, githubModelsPat, preferredGithubModel);
      return { text, modelUsed: `github/${preferredGithubModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredKiloModel && kiloApiKey) {
    try {
      const text = textMode
        ? await callKilo(messages, kiloApiKey, preferredKiloModel, false)
        : await callKilo(messages, kiloApiKey, preferredKiloModel);
      return { text, modelUsed: `kilo/${preferredKiloModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredAgentRouterModel && agentRouterKey) {
    try {
      const text = textMode
        ? await callAgentRouter(messages, agentRouterKey, preferredAgentRouterModel, false)
        : await callAgentRouter(messages, agentRouterKey, preferredAgentRouterModel);
      return { text, modelUsed: `ar/${preferredAgentRouterModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredOpenRouterModel && orKey) {
    try {
      const text = await callOpenRouter(messages, orKey, preferredOpenRouterModel);
      return { text, modelUsed: preferredOpenRouterModel };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGroqModel && groqKey) {
    try {
      const text = textMode
        ? await callGroq(messages, groqKey, preferredGroqModel, false)
        : await callGroq(messages, groqKey, preferredGroqModel);
      return { text, modelUsed: `groq/${preferredGroqModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredGeminiModel && geminiKey) {
    try {
      const text = await geminiGenerateContentSdk(messages, geminiKey, preferredGeminiModel);
      return { text, modelUsed: `gemini/${preferredGeminiModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  if (preferredCfModel && cfAccountId && cfApiToken) {
    try {
      const text = await callCloudflare(messages, cfAccountId, cfApiToken, preferredCfModel);
      return { text, modelUsed: `cf/${preferredCfModel}` };
    } catch (err) {
      lastCloudError = err as Error;
    }
  }

  // 2. Default Routing — iterate providers in user-defined (or default) order
  const order = ensureChatGptInOrder(
    providerOrder?.length ? providerOrder : DEFAULT_PROVIDER_ORDER,
  );
  const keys2: ProviderKeys = {
    groqKey,
    githubModelsPat,
    kiloApiKey,
    deepseekKey,
    agentRouterKey,
    geminiKey,
    geminiFallbackKey,
    orKey,
    cfAccountId,
    cfApiToken,
    chatgptConnected,
    chatgptSlots,
  };
  const skipModels: Record<string, string | undefined> = {
    chatgpt: preferredChatGptModel,
    groq: preferredGroqModel,
    github: preferredGithubModel,
    kilo: preferredKiloModel,
    deepseek: preferredDeepseekModel,
    agentrouter: preferredAgentRouterModel,
    gemini: preferredGeminiModel,
    gemini_fallback: preferredGeminiModel,
    openrouter: preferredOpenRouterModel,
    cloudflare: preferredCfModel,
  };

  if (__DEV__) {
    const available = order.filter((p) => providerHasKey(p, keys2));
    console.log(
      `[AI] routing order: [${order.join(' → ')}] (available: ${available.join(', ')}) textMode=${textMode}`,
    );
  }

  for (const provider of order) {
    if (!providerHasKey(provider, keys2)) continue;
    const skip = skipModels[provider];
    const result = await tryProvider(provider, messages, textMode, skip, keys2);
    if (result) return result;
  }

  if (lastCloudError) {
    throw lastCloudError;
  }

  throw new Error('No AI backend available. Download a local model or add an API key in Settings.');
}
