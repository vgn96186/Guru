import type { MedicalGroundingSource } from '../../types';
import { clipText, describeMedicalSearchError } from '../utils';
import { profileRepository } from '../../../../db/repositories';
import { getApiKeys } from '../../config';

export async function searchBraveImages(
  query: string,
  maxResults: number,
): Promise<MedicalGroundingSource[]> {
  const profile = await profileRepository.getProfile().catch(() => null);
  const { braveSearchKey } = getApiKeys(profile);
  const trimmed = braveSearchKey?.trim();
  if (!trimmed) return [];

  const url = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(
    query,
  )}&count=${Math.min(
    Math.max(maxResults, 1),
    10,
  )}&search_lang=en&country=us&safesearch=strict&spellcheck=1`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': trimmed,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => String(res.status));
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    const data = (await res.json()) as {
      results?: Array<{
        title?: string;
        url?: string;
        page_fetched?: string;
        source?: string;
        description?: string;
        thumbnail?: { src?: string };
        properties?: { url?: string };
      }>;
    };

    const rows = Array.isArray(data?.results) ? data.results : [];
    return rows
      .filter((row) => row?.title && (row?.thumbnail?.src || row?.properties?.url || row?.url))
      .slice(0, maxResults)
      .map(
        (row, index): MedicalGroundingSource => ({
          id: `brave-${index}-${row.url ?? row.properties?.url ?? row.thumbnail?.src ?? ''}`,
          title: clipText(String(row.title), 220),
          url: String(row.url ?? row.page_fetched ?? row.properties?.url ?? '').trim(),
          imageUrl: String(row.thumbnail?.src ?? row.properties?.url ?? '').trim() || undefined,
          snippet: clipText(
            String(row.description ?? row.source ?? row.page_fetched ?? row.title ?? ''),
            420,
          ),
          source: 'Brave Search',
        }),
      );
  } catch (err) {
    if (__DEV__) {
      console.warn('[MedicalSearch] Brave Search failed:', describeMedicalSearchError(err));
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Brave Search for text-based web results (factual grounding for chat and sessions).
 * Returns high-quality web pages with medical/scientific content.
 */
export async function searchBraveText(
  query: string,
  maxResults: number,
): Promise<MedicalGroundingSource[]> {
  const profile = await profileRepository.getProfile().catch(() => null);
  const { braveSearchKey } = getApiKeys(profile);
  const trimmed = braveSearchKey?.trim();
  if (!trimmed) return [];

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
    query,
  )}&count=${Math.min(
    Math.max(maxResults, 1),
    10,
  )}&search_lang=en&country=us&freshness=py&spellcheck=1`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': trimmed,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => String(res.status));
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    const data = (await res.json()) as {
      web?: {
        results?: Array<{
          title?: string;
          url?: string;
          description?: string;
          page_age?: string;
          profile?: { name?: string };
        }>;
      };
    };

    const results: MedicalGroundingSource[] = [];
    const items = data?.web?.results || [];

    for (const item of items) {
      const title = clipText(item.title || '', 220);
      const description = (item.description || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      results.push({
        id: `brave-text-${results.length}-${Date.now()}`,
        title,
        url: item.url || '',
        snippet: clipText(description || title, 420),
        source: 'Brave Search',
        author: item.profile?.name || '',
        publishedAt: item.page_age || undefined,
      });
    }

    return results.slice(0, maxResults);
  } catch (err) {
    if (__DEV__) {
      console.warn('[MedicalSearch] Brave text search failed:', describeMedicalSearchError(err));
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}
