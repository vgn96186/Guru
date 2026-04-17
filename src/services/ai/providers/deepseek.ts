import type { Message } from '../types';
import { RateLimitError } from '../schemas';
import { readOpenAiCompatibleSse } from '../openaiChatCompletionsSse';
import { logStreamEvent } from '../runtimeDebug';
import { emitPseudoStreamFallback, ensureJsonModeHint } from './utils';

export async function callDeepSeek(
  messages: Message[],
  deepseekKey: string,
  model: string,
  jsonMode = true,
): Promise<string> {
  if (__DEV__) console.log(`[AI] callDeepSeek attempt: model=${model} json=${jsonMode}`);
  const clonedMessages = jsonMode ? ensureJsonModeHint(messages) : [...messages];

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

export async function streamDeepSeekChat(
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
