import {
  DEFAULT_HF_TRANSCRIPTION_MODEL,
  OPENROUTER_FREE_MODELS,
  GEMINI_MODELS,
  CLOUDFLARE_MODELS,
  GITHUB_MODELS_CHAT_MODELS,
  KILO_MODELS,
  GITHUB_MODELS_API_VERSION,
  getGitHubModelsChatCompletionsUrl,
} from '../../config/appConfig';
import { testGeminiConnectionSdk } from './google/geminiHealth';

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
  const trimmed = key.trim();
  if (!trimmed) {
    return { ok: false, status: 0, message: 'empty key' };
  }
  try {
    const res = await fetch('https://api.kilo.ai/api/gateway/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${trimmed}`,
      },
      body: JSON.stringify({
        model: KILO_MODELS[0],
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
