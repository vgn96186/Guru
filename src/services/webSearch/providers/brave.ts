import { searchBraveText, searchBraveImages } from '../../ai/medicalSearch/providers/brave';
import type {
  WebSearchProvider,
  WebSearchResult,
  WebSearchParams,
  ImageSearchResult,
  ImageSearchParams,
} from '../types';

export const braveProvider: WebSearchProvider = {
  id: 'brave',

  async searchText(params: WebSearchParams): Promise<WebSearchResult[]> {
    if (!params.profile.braveSearchApiKey) return [];
    const results = await searchBraveText(params.query, params.maxResults ?? 8);
    return results.map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.snippet ?? '',
      source: r.source,
      publishedAt: r.publishedAt,
      provider: 'brave' as const,
    }));
  },

  async searchImages(params: ImageSearchParams): Promise<ImageSearchResult[]> {
    if (!params.profile.braveSearchApiKey) return [];
    const results = await searchBraveImages(params.query, params.maxResults ?? 8);
    return results.map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      thumbnailUrl: r.imageUrl,
      source: r.source,
      provider: 'brave' as const,
    }));
  },
};
