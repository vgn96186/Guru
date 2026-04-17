import type { Message } from '../types';
import { RateLimitError } from '../schemas';
import { readOpenAiCompatibleSse } from '../openaiChatCompletionsSse';
import { logStreamEvent } from '../runtimeDebug';
import { emitPseudoStreamFallback, ensureJsonModeHint } from './utils';

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

export async function callAgentRouter(
  messages: Message[],
  apiKey: string,
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

export async function streamAgentRouterChat(
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
