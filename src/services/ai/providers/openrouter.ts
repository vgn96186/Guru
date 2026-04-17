import type { Message } from '../types';
import { RateLimitError } from '../schemas';
import { readOpenAiCompatibleSse } from '../openaiChatCompletionsSse';
import { logStreamEvent } from '../runtimeDebug';
import { emitPseudoStreamFallback } from './utils';

function devLogOpenRouter(message: string, data: Record<string, unknown>) {
  if (__DEV__) console.log(`[Guru:OpenRouter] ${message}`, data);
}

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

export function extractOpenRouterAssistantText(data: unknown, model: string): string {
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
    return reasoning.trim();
  }

  const legacyText = typeof ch0.text === 'string' ? ch0.text : '';
  if (legacyText.trim()) return legacyText.trim();

  const fr = ch0.finish_reason;
  throw new Error(
    `Empty response from OpenRouter model ${model} (finish_reason: ${String(fr ?? 'n/a')})`,
  );
}

export async function callOpenRouter(
  messages: Message[],
  orKey: string,
  model: string,
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

export async function streamOpenRouterChat(
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
