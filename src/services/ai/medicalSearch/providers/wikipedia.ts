import type { MedicalGroundingSource } from '../../types';
import { clipText, fetchJsonWithTimeout } from '../utils';
import { upscaleWikipediaThumbnail } from '../queryBuilder';

/** Wikipedia: curriculum-aligned summaries, good for NEET-PG/INICET concepts */
export async function searchWikipedia(
  query: string,
  maxResults: number,
): Promise<MedicalGroundingSource[]> {
  // Use the working MediaWiki action API (same as imageService.ts)
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query,
  )}&format=json&srlimit=${maxResults}&origin=*&srprop=snippet|titlesnippet`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    const searchData = await fetchJsonWithTimeout<any>(url, 8000);
    const results = searchData?.query?.search || [];

    if (results.length === 0) return [];

    // Get page images for the search results
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    const titles = results.map((r: any) => r.title).join('|');
    const imageInfoUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      titles,
    )}&prop=pageimages&format=json&pithumbsize=500&origin=*`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    const imageData = await fetchJsonWithTimeout<any>(imageInfoUrl, 8000);
    const pages = imageData?.query?.pages || {};

    // Build a map of title -> thumbnail
    const thumbMap = new Map<string, string>();
    for (const pageId of Object.keys(pages)) {
      const page = pages[pageId];
      if (pageId === '-1' || !page.thumbnail?.source) continue;
      thumbMap.set(page.title?.replace(/_/g, ' '), page.thumbnail.source);
    }

    return (
      results
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
        .filter((r: any) => r?.title)
        .slice(0, maxResults)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
        .map((r: any) => {
          const title = clipText(String(r.title), 220);
          const snippet = (r.snippet ?? '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          const imageUrl = thumbMap.get(r.title) || thumbMap.get(r.title.replace(/_/g, ' '));

          return {
            id: `wiki-${r.pageid || r.title}`,
            title,
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
            imageUrl: imageUrl ? upscaleWikipediaThumbnail(imageUrl) : undefined,
            snippet: clipText(snippet || title, 420),
            source: 'Wikipedia' as const,
          };
        })
    );
  } catch {
    return [];
  }
}
