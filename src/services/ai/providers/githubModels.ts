import type { Message } from '../types';
import { RateLimitError } from '../schemas';
import { readOpenAiCompatibleSse } from '../openaiChatCompletionsSse';
import { logStreamEvent } from '../runtimeDebug';
import { emitPseudoStreamFallback, ensureJsonModeHint } from './utils';
import { GITHUB_MODELS_API_VERSION, getGitHubModelsChatCompletionsUrl } from '../config';

function githubModelsHeaders(pat: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_MODELS_API_VERSION,
    Authorization: `Bearer ${pat}`,
  };
}

export async function callGitHubModels(
  messages: Message[],
  pat: string,
  model: string,
  jsonMode = true,
): Promise<string> {
  if (__DEV__) console.log(`[AI] callGitHubModels attempt: model=${model} json=${jsonMode}`);
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

export async function streamGitHubModelsChat(
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
