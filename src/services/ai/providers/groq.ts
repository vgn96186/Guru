import type { Message } from '../types';
import { RateLimitError } from '../schemas';
import { readOpenAiCompatibleSse } from '../openaiChatCompletionsSse';
import { logStreamEvent } from '../runtimeDebug';
import { emitPseudoStreamFallback, ensureJsonModeHint, clampMessagesToCharBudget } from './utils';

export const GROQ_MAX_COMPLETION_TOKENS = 2048;
const GROQ_MESSAGES_CHAR_BUDGET = 72_000;

export function clampMessagesForGroq(messages: Message[]): Message[] {
  return clampMessagesToCharBudget(messages, GROQ_MESSAGES_CHAR_BUDGET, 'Groq');
}

export async function callGroq(
  messages: Message[],
  groqKey: string,
  model: string,
  jsonMode = true,
): Promise<string> {
  const clonedMessages = jsonMode ? ensureJsonModeHint(messages) : [...messages];
  const payloadMessages = clampMessagesForGroq(jsonMode ? clonedMessages : messages);

  const body: Record<string, unknown> = {
    model,
    messages: payloadMessages,
    temperature: 0.7,
    max_tokens: GROQ_MAX_COMPLETION_TOKENS,
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

export async function streamGroqChat(
  messages: Message[],
  groqKey: string,
  model: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const payloadMessages = clampMessagesForGroq(messages);
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model,
      messages: payloadMessages,
      temperature: 0.7,
      max_tokens: GROQ_MAX_COMPLETION_TOKENS,
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
    const text = await callGroq(payloadMessages, groqKey, model, false);
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
