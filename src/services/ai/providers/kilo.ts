import type { Message } from '../types';
import { RateLimitError } from '../schemas';
import { readOpenAiCompatibleSse } from '../openaiChatCompletionsSse';
import { logStreamEvent } from '../runtimeDebug';
import { emitPseudoStreamFallback, ensureJsonModeHint } from './utils';
import { KILO_MODELS } from '../config';

const KILO_MODELS_CACHE_TTL_MS = 10 * 60 * 1000;
let kiloModelsCache: { expiresAt: number; models: string[] } | null = null;

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

export async function getKiloPreferredModels(kiloApiKey: string): Promise<string[]> {
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

export async function callKilo(
  messages: Message[],
  kiloApiKey: string | undefined,
  model: string,
  jsonMode = true,
): Promise<string> {
  const clonedMessages = jsonMode ? ensureJsonModeHint(messages) : [...messages];
  const body: Record<string, unknown> = {
    model,
    messages: clonedMessages,
    temperature: 0.7,
    max_tokens: 4096,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (kiloApiKey) headers['Authorization'] = `Bearer ${kiloApiKey}`;
  const res = await fetch('https://api.kilo.ai/api/gateway/chat/completions', {
    method: 'POST',
    headers,
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
  const msg = data?.choices?.[0]?.message;
  const text = msg?.content;
  if (text && text.trim()) return text.trim();
  const reasoning = typeof msg?.reasoning === 'string' ? msg.reasoning : '';
  if (reasoning.trim()) return reasoning.trim();
  throw new Error(`Empty response from Kilo model ${model}`);
}

export async function streamKiloChat(
  messages: Message[],
  kiloApiKey: string | undefined,
  model: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (kiloApiKey) headers['Authorization'] = `Bearer ${kiloApiKey}`;
  const res = await fetch('https://api.kilo.ai/api/gateway/chat/completions', {
    method: 'POST',
    headers,
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
