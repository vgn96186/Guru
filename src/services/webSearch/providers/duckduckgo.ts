import {
  searchDuckDuckGo,
  searchDuckDuckGoImages,
} from '../../ai/medicalSearch/providers/duckduckgo';
import type {
  WebSearchProvider,
  WebSearchResult,
  WebSearchParams,
  ImageSearchResult,
  ImageSearchParams,
} from '../types';

export const duckduckgoProvider: WebSearchProvider = {
  id: 'duckduckgo',

  async searchText(params: WebSearchParams): Promise<WebSearchResult[]> {
    const results = await searchDuckDuckGo(params.query, params.maxResults ?? 8);
    return results.map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.snippet ?? '',
      source: r.source,
      provider: 'duckduckgo' as const,
    }));
  },

  async searchImages(params: ImageSearchParams): Promise<ImageSearchResult[]> {
    const results = await searchDuckDuckGoImages(params.query, params.maxResults ?? 8);
    return results.map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      thumbnailUrl: r.thumbnailUrl,
      source: r.source,
      provider: 'duckduckgo' as const,
    }));
  },
};
