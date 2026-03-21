import { DEFAULT_HF_TRANSCRIPTION_MODEL, OPENROUTER_FREE_MODELS } from '../../config/appConfig';

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
