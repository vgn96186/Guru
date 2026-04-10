/**
 * GitLab Duo via the same path as OpenCode / `gitlab-ai-provider` (MIT):
 * 1. POST {instance}/api/v4/ai/third_party_agents/direct_access
 * 2. POST {GITLAB_AI_GATEWAY_URL}/ai/v1/proxy/anthropic/v1/messages or .../proxy/openai/v1/chat/completions
 *
 * OAuth scopes should include `api` (see OpenCode GitLab auth docs). User may need to reconnect after scope changes.
 */
import type { Message } from '../types';
import { RateLimitError } from '../schemas';
import { getGitLabAiGatewayUrl, getGitLabInstanceUrl } from './gitlabInstance';
import { resolveGitLabDuoGatewayModel } from './gitlabDuoGatewayModels';
import { withRetry } from '../../../utils/withRetry';

const DIRECT_ACCESS_PATH = '/api/v4/ai/third_party_agents/direct_access';
const CACHE_TTL_MS = 25 * 60 * 1000;
const ANTHROPIC_VERSION = '2023-06-01';

type DirectAccessCreds = { token: string; headers: Record<string, string> };

let credsCache: { key: string; creds: DirectAccessCreds; expiresAt: number } | null = null;

function cacheKey(userAccessToken: string): string {
  return `${getGitLabInstanceUrl()}\0${userAccessToken}`;
}

function parseDirectAccessPayload(data: unknown): DirectAccessCreds {
  if (!data || typeof data !== 'object') throw new Error('Invalid direct_access JSON');
  const o = data as Record<string, unknown>;
  if (typeof o.token !== 'string' || !o.token) throw new Error('Invalid direct_access token');
  const headers = o.headers;
  if (!headers || typeof headers !== 'object') throw new Error('Invalid direct_access headers');
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    if (typeof v === 'string') h[k] = v;
  }
  return { token: o.token, headers: h };
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

async function postDirectAccess(url: string, userAccessToken: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${userAccessToken}`,
    },
    body: JSON.stringify({
      feature_flags: { DuoAgentPlatformNext: true },
    }),
  });
}

export async function fetchGitLabDirectAccessCredentials(
  userAccessToken: string,
  forceRefresh = false,
): Promise<DirectAccessCreds> {
  const key = cacheKey(userAccessToken);
  const now = Date.now();
  if (!forceRefresh && credsCache && credsCache.key === key && credsCache.expiresAt > now) {
    return credsCache.creds;
  }

  const instanceUrl = getGitLabInstanceUrl().replace(/\/+$/, '');
  const url = `${instanceUrl}${DIRECT_ACCESS_PATH}`;

  return withRetry(
    async () => {
      const res = await postDirectAccess(url, userAccessToken);

      if (res.status === 429) {
        throw new RateLimitError('GitLab Duo direct_access rate limited');
      }

      if (res.status === 502 || res.status === 503) {
        const err = await res.text().catch(() => res.statusText);
        throw new Error(
          `GitLab AI Gateway unavailable (${res.status}). This usually means Duo Pro/Enterprise is not enabled on your GitLab account, or GitLab's AI infrastructure is temporarily down. Check status.gitlab.com. ${stripHtml(err)}`.trim(),
        );
      }

      if (!res.ok) {
        const err = await res.text().catch(() => res.statusText);
        throw new Error(`GitLab direct_access ${res.status}: ${stripHtml(err)}`);
      }

      const json: unknown = await res.json();
      const creds = parseDirectAccessPayload(json);
      credsCache = { key, creds, expiresAt: Date.now() + CACHE_TTL_MS };
      return creds;
    },
    {
      maxRetries: 2,
      baseDelayMs: 1000,
      shouldRetry: (err) => {
        // Only retry transient gateway errors, not rate limits or auth errors
        if (err instanceof RateLimitError) return true;
        if (err instanceof Error && /\b(502|503)\b/.test(err.message)) return true;
        return false;
      },
      onRetry: (_, attempt, delay) => {
        if (__DEV__) console.log(`[AI] GitLab direct_access retry ${attempt}/2 after ${delay}ms…`);
      },
    },
  );
}

export function invalidateGitLabDirectAccessCache(): void {
  credsCache = null;
}

function mergeGatewayHeaders(creds: DirectAccessCreds): Record<string, string> {
  // `direct_access.headers` can include sensitive routing/auth headers intended for the gateway.
  // We must NOT allow it to clobber our explicit auth headers.
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds.headers)) {
    const lower = k.toLowerCase();
    if (lower === 'x-api-key') continue;
    if (lower === 'authorization') continue;
    out[k] = v;
  }
  return out;
}

function flattenMessagesForAnthropic(messages: Message[]): {
  system?: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
} {
  let system = '';
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      system = system ? `${system}\n\n${m.content}` : m.content;
      continue;
    }
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const last = out[out.length - 1];
    if (last && last.role === role) {
      last.content += `\n\n${m.content}`;
    } else {
      out.push({ role, content: m.content });
    }
  }
  if (out.length === 0) {
    out.push({ role: 'user', content: system || 'Hello' });
    return { system: undefined, messages: out };
  }
  return { system: system || undefined, messages: out };
}

function messagesToOpenAI(messages: Message[]): { role: string; content: string }[] {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
    content: m.content,
  }));
}

function extractAnthropicText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { type?: string }).type === 'text') {
      const t = (block as { text?: string }).text;
      if (typeof t === 'string') parts.push(t);
    }
  }
  return parts.join('');
}

async function postAnthropicGateway(
  creds: DirectAccessCreds,
  anthropicModel: string,
  messages: Message[],
  jsonMode: boolean,
): Promise<string> {
  const gateway = getGitLabAiGatewayUrl().replace(/\/+$/, '');
  const url = `${gateway}/ai/v1/proxy/anthropic/v1/messages`;
  const { system, messages: am } = flattenMessagesForAnthropic(messages);
  let systemOut = system;
  if (jsonMode) {
    systemOut = systemOut
      ? `${systemOut}\n\nRespond with valid JSON only.`
      : 'Respond with valid JSON only.';
  }
  const body: Record<string, unknown> = {
    model: anthropicModel,
    max_tokens: 4096,
    messages: am,
  };
  if (systemOut) body.system = systemOut;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': ANTHROPIC_VERSION,
    ...mergeGatewayHeaders(creds),
    'x-api-key': creds.token,
    Authorization: `Bearer ${creds.token}`,
  };

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (res.status === 429) throw new RateLimitError('GitLab AI Gateway (Anthropic) rate limited');
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`GitLab Anthropic proxy ${res.status}: ${err}`);
  }
  const data: unknown = await res.json();
  return extractAnthropicText(data);
}

async function postOpenAIChatGateway(
  creds: DirectAccessCreds,
  openaiModel: string,
  messages: Message[],
  jsonMode: boolean,
): Promise<string> {
  const gateway = getGitLabAiGatewayUrl().replace(/\/+$/, '');
  const url = `${gateway}/ai/v1/proxy/openai/v1/chat/completions`;
  const body: Record<string, unknown> = {
    model: openaiModel,
    messages: messagesToOpenAI(messages),
    max_tokens: 4096,
    temperature: 0.7,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...mergeGatewayHeaders(creds),
    // Keep Authorization last so it cannot be overridden by merged headers.
    Authorization: `Bearer ${creds.token}`,
  };

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (res.status === 429) throw new RateLimitError('GitLab AI Gateway (OpenAI) rate limited');
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`GitLab OpenAI proxy ${res.status}: ${err}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const text = data.choices?.[0]?.message?.content;
  return typeof text === 'string' ? text : '';
}

/**
 * Completes chat using OpenCode-style GitLab AI Gateway. Throws on failure.
 */
export async function completeGitLabDuoOpenCodeGateway(
  messages: Message[],
  userAccessToken: string,
  guruModelId: string,
  jsonMode: boolean,
): Promise<string> {
  const resolved = resolveGitLabDuoGatewayModel(guruModelId);
  if (!resolved) {
    throw new Error(`Model ${guruModelId} is not configured for GitLab AI Gateway`);
  }

  const run = async (forceRefresh: boolean) => {
    const creds = await fetchGitLabDirectAccessCredentials(userAccessToken, forceRefresh);
    if (resolved.kind === 'anthropic') {
      return postAnthropicGateway(creds, resolved.anthropicModel, messages, jsonMode);
    }
    return postOpenAIChatGateway(creds, resolved.openaiModel, messages, jsonMode);
  };

  try {
    const text = await run(false);
    if (!text.trim()) throw new Error('Empty response from GitLab AI Gateway');
    return text;
  } catch (e) {
    const msg = (e as Error).message?.toLowerCase() ?? '';
    if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid')) {
      invalidateGitLabDirectAccessCache();
      const text = await run(true);
      if (!text.trim()) throw new Error('Empty response from GitLab AI Gateway');
      return text;
    }
    throw e;
  }
}
