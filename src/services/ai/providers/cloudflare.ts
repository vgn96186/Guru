import type { Message } from '../types';
import { RateLimitError } from '../schemas';
import { readOpenAiCompatibleSse } from '../openaiChatCompletionsSse';
import { logStreamEvent } from '../runtimeDebug';
import { emitPseudoStreamFallback } from './utils';

export async function callCloudflare(
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

export async function streamCloudflareChat(
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
