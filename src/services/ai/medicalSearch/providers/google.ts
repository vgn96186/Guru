import type { MedicalGroundingSource } from '../../types';
import { clipText, fetchJsonWithTimeout } from '../utils';
import { profileRepository } from '../../../../db/repositories';
import { getApiKeys } from '../../config';

export async function searchGoogleCustomSearch(
  query: string,
  maxResults: number,
): Promise<MedicalGroundingSource[]> {
  const profile = await profileRepository.getProfile().catch(() => null);
  const { googleCustomSearchKey } = getApiKeys(profile);
  const trimmed = googleCustomSearchKey?.trim();
  if (!trimmed) return [];

  // Search Engine ID — hardcoded from user's CSE setup
  const cx = '5085c21a1fd974c13';
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(
    trimmed,
  )}&cx=${cx}&q=${encodeURIComponent(query)}&searchType=image&num=${Math.min(
    maxResults,
    10,
  )}&safe=medium`;

  try {
    const data = await fetchJsonWithTimeout<{
      items?: Array<{
        title?: string;
        link?: string;
        image?: { thumbnailLink?: string; contextLink?: string };
        pagemap?: { metatags?: Array<{ 'og:image'?: string }> };
      }>;
    }>(url, 10000);

    const results: MedicalGroundingSource[] = [];
    const items = data?.items || [];

    for (const item of items) {
      // Prefer direct image link, fall back to thumbnail
      const imageUrl =
        item.link || item.image?.thumbnailLink || item.pagemap?.metatags?.[0]?.['og:image'];
      if (!imageUrl) continue;
      // Skip SVG, GIF, and tiny images
      if (imageUrl.includes('.svg') || imageUrl.includes('.gif')) continue;

      results.push({
        id: `gcs-${results.length}-${Date.now()}`,
        title: clipText(item.title || query, 220),
        url: item.image?.contextLink || imageUrl,
        imageUrl: imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl,
        snippet: clipText(item.title || query, 200),
        source: 'Google Custom Search',
        author: 'Google',
        license: 'Unknown (verify source)',
      });
    }

    return results.slice(0, maxResults);
  } catch {
    return [];
  }
}
