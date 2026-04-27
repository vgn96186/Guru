import type { WebSearchProviderId, UserProfile } from '../../types';
import { DEFAULT_WEB_SEARCH_ORDER } from '../../types';
import type {
  WebSearchParams,
  WebSearchResult,
  ImageSearchResult,
  WebSearchProvider,
} from './types';
import { braveProvider } from './providers/brave';
import { geminiGroundingProvider } from './providers/geminiGrounding';
import { deepseekWebProvider } from './providers/deepseekWeb';
import { duckduckgoProvider } from './providers/duckduckgo';

const PROVIDER_REGISTRY: Record<WebSearchProviderId, WebSearchProvider> = {
  brave: braveProvider,
  gemini_grounding: geminiGroundingProvider,
  deepseek_web: deepseekWebProvider,
  duckduckgo: duckduckgoProvider,
};

function resolveOrder(profile: UserProfile): WebSearchProviderId[] {
  const disabled = new Set(profile.disabledWebSearchProviders ?? []);
  const userOrder = profile.webSearchOrder;
  const base = userOrder?.length ? userOrder : DEFAULT_WEB_SEARCH_ORDER;
  return base.filter((id) => !disabled.has(id));
}

export async function searchWeb(params: WebSearchParams): Promise<WebSearchResult[]> {
  const order = resolveOrder(params.profile);

  for (const providerId of order) {
    const provider = PROVIDER_REGISTRY[providerId];
    if (!provider) continue;

    if (providerId === 'brave' && !params.profile.braveSearchApiKey) continue;
    if (providerId === 'gemini_grounding' && !params.profile.geminiKey) continue;
    if (providerId === 'deepseek_web' && !params.profile.deepseekKey) continue;

    try {
      const results = await provider.searchText(params);
      if (results.length > 0) return results;
    } catch (error) {
      console.warn(`[WebSearch] Provider ${providerId} failed:`, error);
      continue;
    }
  }

  return [];
}

export async function searchImages(params: {
  query: string;
  maxResults?: number;
  profile: UserProfile;
}): Promise<ImageSearchResult[]> {
  const order = resolveOrder(params.profile);
  for (const providerId of order) {
    const provider = PROVIDER_REGISTRY[providerId];
    if (!provider?.searchImages) continue;
    if (providerId === 'brave' && !params.profile.braveSearchApiKey) continue;

    try {
      const results = await provider.searchImages(params);
      if (results.length > 0) return results;
    } catch (error) {
      console.warn(`[WebSearch] Image provider ${providerId} failed:`, error);
      continue;
    }
  }
  return [];
}
