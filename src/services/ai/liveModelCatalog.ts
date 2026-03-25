/**
 * Fetches chat-capable model IDs from each provider’s public APIs.
 * Falls back to curated lists in `appConfig` when a request fails or returns nothing.
 */
import {
  CLOUDFLARE_MODELS,
  DEEPSEEK_MODELS,
  GEMINI_MODELS,
  GROQ_MODELS,
  KILO_MODELS,
  AGENTROUTER_MODELS,
  OPENROUTER_FREE_MODELS,
} from '../../config/appConfig';
import { fetchGeminiChatModelIdsViaSdk, mergeGeminiListWithDefaults } from './google/geminiListModels';

export interface LiveModelFetchMeta {
  source: 'live' | 'fallback';
  error?: string;
}

function mergeUnique(preferred: string[], fallback: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...preferred, ...fallback]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Groq OpenAI-compatible /v1/models — exclude speech/embeddings. */
export async function fetchGroqChatModelIds(apiKey: string): Promise<{ ids: string[] } & LiveModelFetchMeta> {
  const key = apiKey.trim();
  if (!key) {
    return { ids: [...GROQ_MODELS], source: 'fallback' };
  }
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      return {
        ids: [...GROQ_MODELS],
        source: 'fallback',
        error: await res.text().catch(() => String(res.status)),
      };
    }
    const data = (await res.json()) as { data?: { id?: string }[] };
    const raw = (data.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const chatLike = raw.filter(
      (id) => !/whisper|embed|embeddings|tts|moderation|audio|speech|transcrib/i.test(id),
    );
    const ids = mergeUnique(chatLike.length ? chatLike : raw, GROQ_MODELS);
    return { ids, source: chatLike.length ? 'live' : 'fallback' };
  } catch (e) {
    return {
      ids: [...GROQ_MODELS],
      source: 'fallback',
      error: e instanceof Error ? e.message : 'network error',
    };
  }
}

/** OpenRouter — prefer `:free` models when listing. */
export async function fetchOpenRouterFreeModelIds(
  apiKey: string,
): Promise<{ ids: string[] } & LiveModelFetchMeta> {
  const key = apiKey.trim();
  if (!key) {
    return { ids: [...OPENROUTER_FREE_MODELS], source: 'fallback' };
  }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      return {
        ids: [...OPENROUTER_FREE_MODELS],
        source: 'fallback',
        error: await res.text().catch(() => String(res.status)),
      };
    }
    const data = (await res.json()) as {
      data?: { id?: string; pricing?: { prompt?: string | number; completion?: string | number } }[];
    };
    const rows = data.data ?? [];
    const free = rows
      .filter((m) => {
        const id = m.id ?? '';
        if (id.includes(':free')) return true;
        const pp = Number(m.pricing?.prompt ?? NaN);
        const pc = Number(m.pricing?.completion ?? NaN);
        return Number.isFinite(pp) && Number.isFinite(pc) && pp === 0 && pc === 0;
      })
      .map((m) => m.id!)
      .filter(Boolean);
    const ids = mergeUnique(free, OPENROUTER_FREE_MODELS);
    return { ids, source: free.length ? 'live' : 'fallback' };
  } catch (e) {
    return {
      ids: [...OPENROUTER_FREE_MODELS],
      source: 'fallback',
      error: e instanceof Error ? e.message : 'network error',
    };
  }
}

/** Google AI Studio — REST list (fallback when @google/genai list fails). */
async function fetchGeminiChatModelIdsRest(apiKey: string): Promise<{ ids: string[] } & LiveModelFetchMeta> {
  const key = apiKey.trim();
  try {
    const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
    url.searchParams.set('key', key);
    url.searchParams.set('pageSize', '100');
    const res = await fetch(url.toString());
    if (!res.ok) {
      return {
        ids: [...GEMINI_MODELS],
        source: 'fallback',
        error: await res.text().catch(() => String(res.status)),
      };
    }
    const data = (await res.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    const raw = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => {
        const name = m.name ?? '';
        return name.startsWith('models/') ? name.slice('models/'.length) : name;
      })
      .filter((id) => id.length > 0 && !id.includes('embedding') && !id.includes('embed'));
    const ids = mergeUnique(raw, GEMINI_MODELS);
    return { ids, source: raw.length ? 'live' : 'fallback' };
  } catch (e) {
    return {
      ids: [...GEMINI_MODELS],
      source: 'fallback',
      error: e instanceof Error ? e.message : 'network error',
    };
  }
}

/** Google AI Studio — list models that support generateContent (@google/genai first, then REST). */
export async function fetchGeminiChatModelIds(apiKey: string): Promise<{ ids: string[] } & LiveModelFetchMeta> {
  const key = apiKey.trim();
  if (!key) {
    return { ids: [...GEMINI_MODELS], source: 'fallback' };
  }
  try {
    const raw = await fetchGeminiChatModelIdsViaSdk(key);
    if (raw.length > 0) {
      const ids = mergeGeminiListWithDefaults(raw);
      return { ids, source: 'live' };
    }
  } catch {
    /* fall through to REST */
  }
  return fetchGeminiChatModelIdsRest(key);
}

/** Cloudflare Workers AI — model search (text-generation / LLM-style IDs). */
export async function fetchCloudflareChatModelIds(
  accountId: string,
  apiToken: string,
): Promise<{ ids: string[] } & LiveModelFetchMeta> {
  const aid = accountId.trim();
  const tok = apiToken.trim();
  if (!aid || !tok) {
    return { ids: [...CLOUDFLARE_MODELS], source: 'fallback' };
  }
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(aid)}/ai/models/search`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (!res.ok) {
      return {
        ids: [...CLOUDFLARE_MODELS],
        source: 'fallback',
        error: await res.text().catch(() => String(res.status)),
      };
    }
    const json = (await res.json()) as { result?: unknown };
    const rawResult = json.result;
    let rows: unknown[] = [];
    if (Array.isArray(rawResult)) rows = rawResult;
    else if (rawResult && typeof rawResult === 'object' && Array.isArray((rawResult as { models?: unknown[] }).models)) {
      rows = (rawResult as { models: unknown[] }).models;
    }
    const ids = rows
      .map((r) => {
        if (r && typeof r === 'object') {
          const o = r as Record<string, unknown>;
          return (o.id ?? o.model_id ?? o.name ?? o.model) as string | undefined;
        }
        return undefined;
      })
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .filter(
        (id) =>
          id.startsWith('@cf/') ||
          id.startsWith('@hf/') ||
          id.includes('llama') ||
          id.includes('mistral') ||
          id.includes('instruct'),
      );
    const merged = mergeUnique(ids, CLOUDFLARE_MODELS);
    return { ids: merged, source: ids.length ? 'live' : 'fallback' };
  } catch (e) {
    return {
      ids: [...CLOUDFLARE_MODELS],
      source: 'fallback',
      error: e instanceof Error ? e.message : 'network error',
    };
  }
}

/** Kilo gateway — OpenAI-compatible models endpoint. */
export async function fetchKiloModelIds(
  apiKey: string,
): Promise<{ ids: string[] } & LiveModelFetchMeta> {
  const key = apiKey.trim();
  if (!key) {
    return { ids: [...KILO_MODELS], source: 'fallback' };
  }
  try {
    const res = await fetch('https://api.kilo.ai/api/gateway/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      return {
        ids: [...KILO_MODELS],
        source: 'fallback',
        error: await res.text().catch(() => String(res.status)),
      };
    }
    const data = (await res.json()) as { data?: { id?: string }[] };
    const ids = (data.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const merged = mergeUnique(ids, KILO_MODELS);
    return { ids: merged, source: ids.length ? 'live' : 'fallback' };
  } catch (e) {
    return {
      ids: [...KILO_MODELS],
      source: 'fallback',
      error: e instanceof Error ? e.message : 'network error',
    };
  }
}

/** DeepSeek — static model list (direct API at api.deepseek.com). */
export function fetchDeepSeekModelIds(): { ids: string[] } & LiveModelFetchMeta {
  return { ids: [...DEEPSEEK_MODELS], source: 'fallback' };
}

/** AgentRouter — OpenAI-compatible, static model list (no /models endpoint documented). */
export function fetchAgentRouterModelIds(): { ids: string[] } & LiveModelFetchMeta {
  return { ids: [...AGENTROUTER_MODELS], source: 'fallback' };
}

export interface LiveGuruChatModelIds {
  groq: string[];
  openrouter: string[];
  gemini: string[];
  cloudflare: string[];
  kilo: string[];
  deepseek: string[];
  agentrouter: string[];
  /** True if any provider returned live data this refresh */
  anyLive: boolean;
  /** Last error strings per provider (debug) */
  errors: Partial<Record<'groq' | 'openrouter' | 'gemini' | 'cloudflare' | 'kilo' | 'deepseek' | 'agentrouter', string>>;
}

export async function fetchAllLiveGuruChatModelIds(keys: {
  groqKey?: string;
  orKey?: string;
  geminiKey?: string;
  cfAccountId?: string;
  cfApiToken?: string;
  kiloApiKey?: string;
  deepseekKey?: string;
  agentRouterKey?: string;
}): Promise<LiveGuruChatModelIds> {
  const [groqR, orR, gemR, cfR, kiloR] = await Promise.all([
    fetchGroqChatModelIds(keys.groqKey ?? ''),
    fetchOpenRouterFreeModelIds(keys.orKey ?? ''),
    fetchGeminiChatModelIds(keys.geminiKey ?? ''),
    fetchCloudflareChatModelIds(keys.cfAccountId ?? '', keys.cfApiToken ?? ''),
    fetchKiloModelIds(keys.kiloApiKey ?? ''),
  ]);
  const dsR = fetchDeepSeekModelIds();
  const arR = fetchAgentRouterModelIds();

  const errors: LiveGuruChatModelIds['errors'] = {};
  if (groqR.error) errors.groq = groqR.error;
  if (orR.error) errors.openrouter = orR.error;
  if (gemR.error) errors.gemini = gemR.error;
  if (cfR.error) errors.cloudflare = cfR.error;
  if (kiloR.error) errors.kilo = kiloR.error;

  const anyLive =
    groqR.source === 'live' ||
    orR.source === 'live' ||
    gemR.source === 'live' ||
    cfR.source === 'live' ||
    kiloR.source === 'live';

  return {
    groq: groqR.ids,
    openrouter: orR.ids,
    gemini: gemR.ids,
    cloudflare: cfR.ids,
    kilo: kiloR.ids,
    deepseek: dsR.ids,
    agentrouter: arR.ids,
    anyLive,
    errors,
  };
}
