import type { Message } from '../types';
import { RateLimitError } from '../schemas';
import { readOpenAiCompatibleSse } from '../openaiChatCompletionsSse';
import { logStreamEvent } from '../runtimeDebug';
import { emitPseudoStreamFallback, ensureJsonModeHint, clampMessagesToCharBudget } from './utils';
import {
  getGitHubCopilotEditorVersion,
  getGitHubCopilotIntegrationId,
  getGitHubCopilotChatCompletionsUrl,
} from '../github/githubCopilotEnv';

/**
 * Copilot gpt-4.1 / gpt-4o enforce ~64k prompt tokens. Dense/code-heavy text can approach ~1 token/char
 * in worst cases; keep a conservative cap and rely on retry for `model_max_prompt_tokens_exceeded`.
 */
export const GITHUB_COPILOT_MESSAGES_CHAR_BUDGET = 52_000;

export function clampMessagesForGitHubCopilot(messages: Message[]): Message[] {
  return clampMessagesToCharBudget(messages, GITHUB_COPILOT_MESSAGES_CHAR_BUDGET, 'GitHub Copilot');
}

function githubCopilotHeaders(oauthToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${oauthToken}`,
    'User-Agent': 'GuruStudy/1.0',
    'Editor-Version': getGitHubCopilotEditorVersion(),
    'Copilot-Integration-Id': getGitHubCopilotIntegrationId(),
    'Openai-Intent': 'conversation-edits',
  };
}

/** OAuth token is sent directly — no session token exchange needed. */
async function resolveCopilotSessionToken(oauthToken: string): Promise<string> {
  return oauthToken;
}

export async function callGitHubCopilot(
  messages: Message[],
  oauthToken: string,
  model: string,
  jsonMode = true,
): Promise<string> {
  if (__DEV__) console.log(`[AI] callGitHubCopilot attempt: model=${model} json=${jsonMode}`);

  const sessionToken = await resolveCopilotSessionToken(oauthToken);
  const clonedMessages = jsonMode ? ensureJsonModeHint(messages) : [...messages];
  const payloadMessages = clampMessagesForGitHubCopilot(clonedMessages);
  const apiUrl = getGitHubCopilotChatCompletionsUrl();

  const body: Record<string, unknown> = {
    model,
    messages: payloadMessages,
    temperature: 0.7,
    max_tokens: 4096,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: githubCopilotHeaders(sessionToken),
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    if (__DEV__) console.warn(`[AI] GitHub Copilot 429: ${model}`);
    throw new RateLimitError(`GitHub Copilot rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    if (__DEV__) console.error(`[AI] GitHub Copilot ${res.status} (${model}):`, err);
    const errLower = err.toLowerCase();
    if (
      errLower.includes('model_max_prompt_tokens_exceeded') &&
      payloadMessages.reduce((s, m) => s + m.content.length, 0) > 12_000
    ) {
      const tighter = clampMessagesToCharBudget(
        clonedMessages,
        Math.floor(GITHUB_COPILOT_MESSAGES_CHAR_BUDGET * 0.45),
        'GitHub Copilot (retry)',
      );
      const retryBody: Record<string, unknown> = {
        model,
        messages: tighter,
        temperature: 0.7,
        max_tokens: 4096,
      };
      if (jsonMode) retryBody.response_format = { type: 'json_object' };
      const res2 = await fetch(apiUrl, {
        method: 'POST',
        headers: githubCopilotHeaders(sessionToken),
        body: JSON.stringify(retryBody),
      });
      if (res2.status === 429) {
        throw new RateLimitError(`GitHub Copilot rate limit on ${model}`);
      }
      if (!res2.ok) {
        const err2 = await res2.text().catch(() => res2.status.toString());
        if (__DEV__) console.error(`[AI] GitHub Copilot retry ${res2.status} (${model}):`, err2);
        throw new Error(`GitHub Copilot error ${res2.status} (${model}): ${err2}`);
      }
      const data2 = await res2.json();
      const text2 = data2?.choices?.[0]?.message?.content;
      if (!text2 || !text2.trim()) {
        throw new Error(`Empty response from GitHub Copilot model ${model}`);
      }
      if (__DEV__) console.log(`[AI] GitHub Copilot success (after prompt clamp retry): ${model}`);
      return text2;
    }
    throw new Error(`GitHub Copilot error ${res.status} (${model}): ${err}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new Error(`Empty response from GitHub Copilot model ${model}`);
  if (__DEV__) console.log(`[AI] GitHub Copilot success: ${model} (${text.length} chars)`);
  return text;
}

export async function streamGitHubCopilotChat(
  messages: Message[],
  oauthToken: string,
  model: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const sessionToken = await resolveCopilotSessionToken(oauthToken);
  const apiUrl = getGitHubCopilotChatCompletionsUrl();
  const payloadMessages = clampMessagesForGitHubCopilot(messages);

  const postStream = (payload: Message[]) =>
    fetch(apiUrl, {
      method: 'POST',
      headers: githubCopilotHeaders(sessionToken),
      body: JSON.stringify({
        model,
        messages: payload,
        temperature: 0.7,
        max_tokens: 4096,
        stream: true,
      }),
    });

  let res = await postStream(payloadMessages);

  if (res.status === 429) {
    throw new RateLimitError(`GitHub Copilot rate limit on ${model}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    const errLower = err.toLowerCase();
    if (
      errLower.includes('model_max_prompt_tokens_exceeded') &&
      payloadMessages.reduce((s, m) => s + m.content.length, 0) > 12_000
    ) {
      const tighter = clampMessagesToCharBudget(
        messages,
        Math.floor(GITHUB_COPILOT_MESSAGES_CHAR_BUDGET * 0.45),
        'GitHub Copilot stream (retry)',
      );
      res = await postStream(tighter);
      if (res.status === 429) {
        throw new RateLimitError(`GitHub Copilot rate limit on ${model}`);
      }
      if (!res.ok) {
        const err2 = await res.text().catch(() => res.status.toString());
        if (__DEV__)
          console.error(`[AI] GitHub Copilot stream retry ${res.status} (${model}):`, err2);
        throw new Error(`GitHub Copilot error ${res.status} (${model}): ${err2}`);
      }
    } else {
      throw new Error(`GitHub Copilot error ${res.status} (${model}): ${err}`);
    }
  }

  if (!res.body) {
    logStreamEvent('no_body_fallback', { provider: 'github_copilot', model });
    const text = await callGitHubCopilot(messages, oauthToken, model, false);
    await emitPseudoStreamFallback(text, onDelta, {
      provider: 'github_copilot',
      model,
      reason: 'no_body',
    });
    return text;
  }

  const text = await readOpenAiCompatibleSse(res, onDelta);
  logStreamEvent('sse_complete', {
    provider: 'github_copilot',
    model,
    outputChars: text.length,
  });
  if (!text.trim()) throw new Error(`Empty response from GitHub Copilot model ${model}`);
  return text;
}
