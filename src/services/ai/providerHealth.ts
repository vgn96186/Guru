import {
  DEFAULT_HF_TRANSCRIPTION_MODEL,
  OPENROUTER_FREE_MODELS,
  GEMINI_MODELS,
  CLOUDFLARE_MODELS,
  GITHUB_MODELS_CHAT_MODELS,
  GITHUB_COPILOT_MODELS,
  KILO_MODELS,
  DEEPSEEK_MODELS,
  AGENTROUTER_MODELS,
  GITHUB_MODELS_API_VERSION,
  getGitHubModelsChatCompletionsUrl,
} from '../../config/appConfig';
import { getGitLabInstanceUrl } from './gitlab/gitlabAuth';
import {
  postGitHubCopilotChatCompletions,
  getCopilotSessionToken,
} from './github/githubCopilotClient';
import { testGeminiConnectionSdk } from './google/geminiHealth';
import { resolveQwenBaseUrl } from './qwen/qwenAuth';

export interface ProviderHealthResult {
  ok: boolean;
  status: number;
  message?: string;
}

async function toHealthResult(res: Response): Promise<ProviderHealthResult> {
  return {
    ok: res.ok,
    status: res.status,
    message: res.ok ? undefined : await res.text(),
  };
}

export async function testGroqConnection(key: string): Promise<ProviderHealthResult> {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'Reply with one word: ok' }],
        max_tokens: 5,
      }),
    });
    return toHealthResult(res);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}

export async function testOpenRouterConnection(key: string): Promise<ProviderHealthResult> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_FREE_MODELS[0],
        messages: [{ role: 'user', content: 'Reply with one word: ok' }],
        max_tokens: 5,
      }),
    });
    return toHealthResult(res);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}

export async function testHuggingFaceConnection(
  token: string,
  _model: string = DEFAULT_HF_TRANSCRIPTION_MODEL,
): Promise<ProviderHealthResult> {
  try {
    const res = await fetch('https://huggingface.co/api/whoami-v2', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return toHealthResult(res);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}

/** Minimal chat probe — @google/genai first, then OpenAI-compatible REST (same as `llmRouting` fallback). */
export async function testGeminiConnection(key: string): Promise<ProviderHealthResult> {
  const trimmed = key.trim();
  if (!trimmed) {
    return { ok: false, status: 0, message: 'empty key' };
  }
  const sdk = await testGeminiConnectionSdk(trimmed);
  if (sdk.ok) {
    return sdk;
  }
  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${trimmed}`,
        },
        body: JSON.stringify({
          model: GEMINI_MODELS[0],
          messages: [{ role: 'user', content: 'Reply with one word: ok' }],
          max_tokens: 8,
        }),
      },
    );
    return toHealthResult(res);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}

/** Workers AI chat probe — requires account ID + API token with AI read permission. */
/** Minimal chat probe — GitHub Models REST (OpenAI-style body). PAT needs `models: read`. */
export async function testGitHubModelsConnection(pat: string): Promise<ProviderHealthResult> {
  const trimmed = pat.trim();
  if (!trimmed) {
    return { ok: false, status: 0, message: 'empty token' };
  }
  try {
    const res = await fetch(getGitHubModelsChatCompletionsUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_MODELS_API_VERSION,
        Authorization: `Bearer ${trimmed}`,
      },
      body: JSON.stringify({
        model: GITHUB_MODELS_CHAT_MODELS[0],
        messages: [{ role: 'user', content: 'Reply with one word: ok' }],
        max_tokens: 8,
      }),
    });
    return toHealthResult(res);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}

export async function testCloudflareConnection(
  accountId: string,
  apiToken: string,
): Promise<ProviderHealthResult> {
  const aid = accountId.trim();
  const tok = apiToken.trim();
  if (!aid || !tok) {
    return { ok: false, status: 0, message: 'Account ID and API token required' };
  }
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${aid}/ai/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tok}`,
        },
        body: JSON.stringify({
          model: CLOUDFLARE_MODELS[0],
          messages: [{ role: 'user', content: 'Reply with one word: ok' }],
          max_tokens: 8,
        }),
      },
    );
    return toHealthResult(res);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}

/** Lightweight Deepgram auth probe — hits the projects endpoint (no audio needed). */
export async function testDeepgramConnection(key: string): Promise<ProviderHealthResult> {
  const trimmed = key.trim();
  if (!trimmed) {
    return { ok: false, status: 0, message: 'empty key' };
  }
  try {
    const res = await fetch('https://api.deepgram.com/v1/projects', {
      method: 'GET',
      headers: {
        Authorization: `Token ${trimmed}`,
      },
    });
    return toHealthResult(res);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}

export async function testKiloConnection(key: string): Promise<ProviderHealthResult> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const trimmed = key.trim();
    if (trimmed) headers['Authorization'] = `Bearer ${trimmed}`;
    const res = await fetch('https://api.kilo.ai/api/gateway/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'kilo-auto/free',
        messages: [{ role: 'user', content: 'Reply with one word: ok' }],
        max_tokens: 32,
      }),
    });
    return toHealthResult(res);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}

export async function testFalConnection(key: string): Promise<ProviderHealthResult> {
  const trimmed = key.trim();
  if (!trimmed) {
    return { ok: false, status: 0, message: 'empty key' };
  }
  try {
    const res = await fetch('https://api.fal.ai/v1/models?limit=1', {
      method: 'GET',
      headers: {
        Authorization: `Key ${trimmed}`,
      },
    });
    return toHealthResult(res);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}

export async function testBraveSearchConnection(key: string): Promise<ProviderHealthResult> {
  const trimmed = key.trim();
  if (!trimmed) {
    return { ok: false, status: 0, message: 'empty key' };
  }
  try {
    const res = await fetch(
      'https://api.search.brave.com/res/v1/images/search?q=medical+diagram&count=1',
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': trimmed,
        },
      },
    );
    return toHealthResult(res);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}

export async function testGitHubCopilotConnection(
  oauthAccessToken: string,
): Promise<ProviderHealthResult> {
  try {
    // Step 1: Exchange OAuth token for Copilot session token (validates subscription)
    const sessionToken = await getCopilotSessionToken(oauthAccessToken);
    // Step 2: Probe chat/completions with the session token
    const res = await postGitHubCopilotChatCompletions(sessionToken, {
      model: GITHUB_COPILOT_MODELS[0],
      messages: [{ role: 'user', content: 'Reply with one word: ok' }],
      max_tokens: 5,
    });
    return toHealthResult(res);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}

export async function testGitLabDuoConnection(accessToken: string): Promise<ProviderHealthResult> {
  try {
    const url = `${getGitLabInstanceUrl().replace(/\/+$/, '')}/api/v4/ai/third_party_agents/direct_access`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        feature_flags: { DuoAgentPlatformNext: true },
      }),
    });

    if (res.status === 502 || res.status === 503) {
      return {
        ok: false,
        status: res.status,
        message: `GitLab AI Gateway unavailable (${res.status}). Verify Duo Pro/Enterprise is enabled on your account, or check status.gitlab.com.`,
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        status: res.status,
        message: `Access denied (${res.status}). The OAuth token may have expired or lack the 'api' scope. Disconnect and reconnect GitLab Duo.`,
      };
    }

    return toHealthResult(res);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}

export async function testPoeConnection(accessToken: string): Promise<ProviderHealthResult> {
  try {
    const res = await fetch('https://api.poe.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        messages: [{ role: 'user', content: 'Reply with one word: ok' }],
        max_tokens: 5,
      }),
    });
    return toHealthResult(res);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}

export async function testQwenConnection(
  accessToken: string | undefined,
  apiKey?: string,
  resourceUrl?: string,
): Promise<ProviderHealthResult> {
  try {
    // Qwen OAuth returns access_token which IS the API key
    const authKey = apiKey || accessToken;
    if (!authKey) {
      return { ok: false, status: 0, message: 'No auth key available' };
    }

    // Resolve the correct API base URL from the OAuth resource_url
    const apiBaseUrl = resolveQwenBaseUrl(resourceUrl);

    if (__DEV__) {
      console.log(`[Qwen Validation] === HEALTH CHECK ===`);
      console.log(`[Qwen Validation] Auth key length: ${authKey.length} chars`);
      console.log(`[Qwen Validation] Resource URL: ${resourceUrl || '(none)'}`);
      console.log(`[Qwen Validation] Resolved base URL: ${apiBaseUrl}`);
    }

    const userAgent = 'QwenCode/0.14.0 (Windows_NT; x64)';
    const payload = {
      model: 'qwen3-coder-plus',
      messages: [
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text:
                'You are Qwen Code, an interactive CLI agent developed by Alibaba Group, ' +
                'specializing in software engineering tasks. Your primary goal is to help ' +
                'users safely and efficiently, adhering strictly to the following instructions ' +
                'and utilizing your available tools.',
              cache_control: { type: 'ephemeral' },
            },
          ],
        },
        { role: 'user', content: 'hi' },
      ],
      max_tokens: 5,
    };
    const jsonBody = JSON.stringify(payload);

    if (__DEV__) {
      console.log(`[Qwen Validation] --- Sending test request ---`);
    }

    const res = await fetch(`${apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authKey}`,
        'User-Agent': userAgent,
        'X-DashScope-CacheControl': 'enable',
        'X-DashScope-UserAgent': userAgent,
        'X-DashScope-AuthType': 'qwen-oauth',
      },
      body: jsonBody,
    });

    if (__DEV__) {
      const text = await res.text().catch(() => '');
      console.log(`[Qwen Validation] status=${res.status}`);
      if (!res.ok) {
        console.log(`[Qwen Validation] error response=${text.slice(0, 300)}`);
        return { ok: false, status: res.status, message: text.slice(0, 200) };
      }
      return { ok: true, status: res.status, message: 'ok' };
    }

    if (res.ok) {
      return { ok: true, status: res.status, message: 'ok' };
    }

    return toHealthResult(res);
  } catch (error) {
    if (__DEV__) {
      console.error(
        `[Qwen Validation] Network error:`,
        error instanceof Error ? error.message : String(error),
      );
    }
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}

export async function testDeepSeekConnection(key: string): Promise<ProviderHealthResult> {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, status: 0, message: 'empty key' };
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${trimmed}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODELS[0],
        messages: [{ role: 'user', content: 'Reply with one word: ok' }],
        max_tokens: 8,
      }),
    });
    return toHealthResult(res);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}

/**
 * AgentRouter requires a specific client fingerprint; we reuse the same header set as `llmRouting`.
 */
const AGENTROUTER_HEALTH_HEADERS = {
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

export async function testAgentRouterConnection(key: string): Promise<ProviderHealthResult> {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, status: 0, message: 'empty key' };
  try {
    const res = await fetch('https://agentrouter.org/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${trimmed}`,
        ...AGENTROUTER_HEALTH_HEADERS,
      },
      body: JSON.stringify({
        model: AGENTROUTER_MODELS[0],
        messages: [{ role: 'user', content: 'Reply with one word: ok' }],
        max_tokens: 8,
      }),
    });
    return toHealthResult(res);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}
