/**
 * Qwen API client — OpenAI-compatible chat completions via OAuth token.
 * Uses https://portal.qwen.ai/v1 as the base URL.
 */

import { CLOUD_MAX_COMPLETION_TOKENS } from '../completionLimits';
import { resolveQwenBaseUrl, getQwenAccessToken } from './qwenAuth';
import type { Message } from '../types';

/**
 * Qwen Code system prompt preamble — required by the Qwen OAuth free-tier
 * backend to unlock quota. Extracted from the official Qwen Code CLI binary.
 * Must appear as the first system message in every request.
 * @see https://github.com/QwenLM/qwen-code
 */
const QWEN_OAUTH_SYSTEM_PREAMBLE =
  'You are Qwen Code, an interactive CLI agent developed by Alibaba Group, ' +
  'specializing in software engineering tasks. Your primary goal is to help ' +
  'users safely and efficiently, adhering strictly to the following instructions ' +
  'and utilizing your available tools.';

/**
 * Sanitize message text to remove control characters that might break JSON encoding
 * or cause API parsing errors on the Qwen side.
 */
function sanitizeText(text: string): string {
  // Remove control characters except \n, \r, \t
  // eslint-disable-next-line no-control-regex -- strip C0 controls before API JSON
  let cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Normalize Unicode to NFC form (composed form, better for API compatibility)
  cleaned = cleaned.normalize('NFC');
  // Trim excess whitespace
  cleaned = cleaned.trim();
  return cleaned;
}

// Map Guru model IDs to Qwen OAuth model IDs.
// 'coder-model' is the internal CLI name — only works for the official Qwen Code binary.
// Third-party OAuth clients must use 'qwen3-coder-plus' (per reverse engineering docs).
function resolveQwenModel(base: string): string {
  return 'qwen3-coder-plus';
}

export async function callQwenOauth(
  messages: Message[],
  model: string,
  jsonMode = false,
): Promise<string> {
  const tokenResult = await getQwenAccessToken();
  if (!tokenResult || !tokenResult.accessToken) {
    throw new Error('Qwen OAuth token not available. Please authenticate in Settings.');
  }

  // Use api_key if available (DashScope key), otherwise use the OAuth access_token
  const authKey = tokenResult.apiKey || tokenResult.accessToken;
  // Resolve the correct API base URL from the OAuth resource_url
  const apiBaseUrl = resolveQwenBaseUrl(tokenResult.resourceUrl);

  if (__DEV__) {
    console.log(`[Qwen API] === API CALL DEBUG ===`);
    console.log(`[Qwen API] Raw model param: ${model}`);
    console.log(
      `[Qwen API] Has api_key: ${!!tokenResult.apiKey} (${tokenResult.apiKey?.length || 0} chars)`,
    );
    console.log(
      `[Qwen API] Has access_token: ${!!tokenResult.accessToken} (${tokenResult.accessToken.length} chars)`,
    );
    console.log(
      `[Qwen API] Using auth key (${authKey === tokenResult.apiKey ? 'api_key' : 'access_token'}): ${authKey.length} chars`,
    );
    console.log(`[Qwen API] Auth key preview: ${authKey.slice(0, 30)}...`);
    console.log(`[Qwen API] Resource URL: ${tokenResult.resourceUrl || '(none)'}`);
    console.log(`[Qwen API] Resolved base URL: ${apiBaseUrl}`);
  }

  const resolvedModel = resolveQwenModel(model);
  const userAgent = 'QwenCode/0.14.0 (Windows_NT; x64)';

  const systemMessage = messages.find((m) => m.role === 'system');
  const userMessages = messages.filter((m) => m.role !== 'system');

  // Qwen Portal API requires system messages in content-part array format.
  // User/assistant messages stay as plain strings.
  // Inject the official Qwen Code system preamble FIRST — required by the OAuth
  // backend to unlock quota. Then append Guru's system message.
  const cleanMessages: Array<{
    role: string;
    content: string | Array<{ type: string; text: string; cache_control?: { type: string } }>;
  }> = [];

  // Always inject Qwen's system preamble as the first system message (array content parts).
  // cache_control: ephemeral is required by the DashScope backend for prompt caching
  // and must match the official CLI format to pass the quota gate.
  cleanMessages.push({
    role: 'system',
    content: [
      { type: 'text', text: QWEN_OAUTH_SYSTEM_PREAMBLE, cache_control: { type: 'ephemeral' } },
    ],
  });

  if (systemMessage) {
    cleanMessages.push({
      role: 'system',
      content: [
        {
          type: 'text',
          text: sanitizeText(systemMessage.content),
          cache_control: { type: 'ephemeral' },
        },
      ],
    });
  }

  for (const msg of userMessages) {
    const sanitized = sanitizeText(msg.content);
    if (sanitized.length > 0) {
      cleanMessages.push({
        role: msg.role as 'user' | 'assistant',
        content: sanitized,
      });
    }
  }

  const body: Record<string, unknown> = {
    model: resolvedModel,
    messages: cleanMessages,
    temperature: jsonMode ? 0.3 : 0.7,
    top_p: 0.95,
    max_tokens: CLOUD_MAX_COMPLETION_TOKENS,
  };

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const jsonBody = JSON.stringify(body);

  if (__DEV__) {
    console.log(`[Qwen JSON] === QWEN API CALL ===`);
    console.log(`[Qwen JSON] Model: ${resolvedModel} (raw: ${model})`);
    console.log(`[Qwen JSON] JSON bytes: ${jsonBody.length}`);
    console.log(`[Qwen JSON] =====================`);
  }

  const response = await fetch(`${apiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authKey}`,
      'User-Agent': userAgent,
      'X-DashScope-UserAgent': userAgent,
      'X-DashScope-CacheControl': 'enable',
      'X-DashScope-AuthType': 'qwen-oauth',
    },
    body: jsonBody,
  });

  if (__DEV__) {
    console.log(`[Qwen API] Response status: ${response.status} ${response.statusText}`);
    console.log(`[Qwen API] Response headers:`, Object.fromEntries(response.headers.entries()));
  }

  if (!response.ok) {
    const text = await response.text().catch(() => String(response.status));
    if (__DEV__) {
      console.error(`[Qwen API] === ERROR RESPONSE ===`);
      console.error(`[Qwen API] Status: ${response.status}`);
      console.error(`[Qwen API] Body:`, text);
      console.error(`[Qwen API] Sent model: ${resolvedModel}`);
      console.error(`[Qwen API] Sent messages:`, JSON.stringify(cleanMessages, null, 2));
      console.error(`[Qwen API] =====================`);
    }
    throw new Error(`Qwen API error: HTTP ${response.status} - ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: Record<string, unknown>;
  };

  if (__DEV__) {
    console.log(`[Qwen API] Response preview:`, JSON.stringify(data, null, 2).slice(0, 500));
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    if (__DEV__) {
      console.error(`[Qwen API] Empty response. Full response:`, JSON.stringify(data, null, 2));
    }
    throw new Error('Qwen API returned empty response.');
  }

  return content;
}

export async function streamQwenOauth(
  messages: Message[],
  model: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const tokenResult = await getQwenAccessToken();
  if (!tokenResult || !tokenResult.accessToken) {
    throw new Error('Qwen OAuth token not available. Please authenticate in Settings.');
  }

  // Use api_key if available, otherwise the OAuth access_token
  const authKey = tokenResult.apiKey || tokenResult.accessToken;
  // Resolve the correct API base URL from the OAuth resource_url
  const apiBaseUrl = resolveQwenBaseUrl(tokenResult.resourceUrl);

  const resolvedModel = resolveQwenModel(model);

  const systemMessage = messages.find((m) => m.role === 'system');
  const userMessages = messages.filter((m) => m.role !== 'system');

  // Inject the official Qwen Code system preamble FIRST.
  // cache_control: ephemeral must match the official CLI format.
  const cleanMessages: Array<{
    role: string;
    content: string | Array<{ type: string; text: string; cache_control?: { type: string } }>;
  }> = [];

  cleanMessages.push({
    role: 'system',
    content: [
      { type: 'text', text: QWEN_OAUTH_SYSTEM_PREAMBLE, cache_control: { type: 'ephemeral' } },
    ],
  });

  if (systemMessage) {
    cleanMessages.push({
      role: 'system',
      content: [
        {
          type: 'text',
          text: sanitizeText(systemMessage.content),
          cache_control: { type: 'ephemeral' },
        },
      ],
    });
  }

  for (const msg of userMessages) {
    const sanitized = sanitizeText(msg.content);
    if (sanitized.length > 0) {
      cleanMessages.push({
        role: msg.role as 'user' | 'assistant',
        content: sanitized,
      });
    }
  }

  const userAgent = 'QwenCode/0.14.0 (Windows_NT; x64)';

  const body: Record<string, unknown> = {
    model: resolvedModel,
    messages: cleanMessages,
    stream: true,
    temperature: 0.7,
    top_p: 0.95,
    max_tokens: CLOUD_MAX_COMPLETION_TOKENS,
  };

  if (__DEV__) {
    console.log(`[Qwen Stream] === STREAMING API CALL ===`);
    console.log(`[Qwen Stream] Model: ${resolvedModel} (raw: ${model})`);
    console.log(`[Qwen Stream] Has auth: ${authKey.length} chars`);
    console.log(`[Qwen Stream] Resolved base URL: ${apiBaseUrl}`);
    console.log(`[Qwen Stream] Messages: ${cleanMessages.length}`);
    console.log(`[Qwen Stream] =====================`);
  }

  const jsonBody = JSON.stringify(body);

  const response = await fetch(`${apiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authKey}`,
      'User-Agent': userAgent,
      'X-DashScope-UserAgent': userAgent,
      'X-DashScope-CacheControl': 'enable',
      'X-DashScope-AuthType': 'qwen-oauth',
    },
    body: jsonBody,
  });

  if (__DEV__) {
    console.log(`[Qwen Stream] Response status: ${response.status} ${response.statusText}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => String(response.status));
    if (__DEV__) {
      console.error(`[Qwen Stream] === ERROR RESPONSE ===`);
      console.error(`[Qwen Stream] Status: ${response.status}`);
      console.error(`[Qwen Stream] Body:`, text);
      console.error(`[Qwen Stream] Sent model: ${resolvedModel}`);
      console.error(`[Qwen Stream] Sent messages:`, JSON.stringify(cleanMessages, null, 2));
      console.error(`[Qwen Stream] =====================`);
    }
    throw new Error(`Qwen API error: HTTP ${response.status} - ${text}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    // React Native fetch may not support ReadableStream — fall back to reading
    // the already-received response as text (avoids a second network call).
    if (__DEV__) {
      console.log(`[Qwen Stream] No readable body, parsing response as non-stream`);
    }
    // The response is a streaming SSE response, parse it to extract the text.
    const rawBody = await response.text();
    let fullText = '';
    for (const line of rawBody.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') break;
      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
        };
        const piece =
          parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? '';
        if (piece) fullText += piece;
      } catch {
        // skip malformed chunks
      }
    }
    if (fullText) {
      onDelta(fullText);
      return fullText;
    }
    // If SSE parsing yielded nothing, fall back to a non-streaming call
    if (__DEV__) {
      console.log(`[Qwen Stream] SSE parse empty, falling back to non-streaming call`);
    }
    const fallbackText = await callQwenOauth(messages, model, false);
    onDelta(fallbackText);
    return fallbackText;
  }

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') break;

      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          onDelta(delta);
        }
      } catch {
        // Skip malformed SSE chunks
      }
    }
  }

  return fullText;
}
