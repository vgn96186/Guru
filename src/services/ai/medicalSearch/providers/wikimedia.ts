import type { MedicalGroundingSource } from '../../types';
import { clipText, describeMedicalSearchError, fetchJsonWithTimeout } from '../utils';
import { scoreWikimediaRelevance } from '../ranking';

/**
 * Search Wikimedia Commons for medical images with relevance scoring.
 * Filters out SVG/PDF/TIFF/DJVU at the API level to avoid wasting bandwidth.
 */
export async function searchWikimediaCommons(
  query: string,
  maxResults: number,
): Promise<MedicalGroundingSource[]> {
  // React Native can't render SVG, PDF, TIFF, or DJVU. Filter them at API level.
  const blockedMimes = ['image/svg+xml', 'application/pdf', 'image/tiff', 'image/vnd.djvu'];
  const fetchLimit = maxResults * 5; // over-fetch since many will be SVGs
  // Include srprop to get MIME type, then filter before expensive imageinfo call
  const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=filetype:bitmap+${encodeURIComponent(
    query,
  )}&srnamespace=6&srlimit=${fetchLimit}&srprop=size|wordcount|timestamp|snippet&format=json`;

  try {
    const searchData = await fetchJsonWithTimeout<any>(searchUrl, 12000);
    const pages = searchData?.query?.search || [];
    if (pages.length === 0) return [];

    // Filter out non-renderable file types by title extension
    const renderableExtensions = /\.(png|jpg|jpeg|gif|webp|bmp)$/i;
    const renderablePages = pages.filter(
      (p: any) => renderableExtensions.test(p.title) || !/\.(svg|pdf|tiff?|djvu)$/i.test(p.title),
    );

    if (renderablePages.length === 0) return [];

    const titles = renderablePages.map((p: any) => p.title).join('|');
    // Request thumburl for smaller, more reliable images
    const imageInfoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      titles,
    )}&prop=imageinfo&iiprop=url|thumburl|extmetadata|size|mime&format=json&iiurlwidth=400`;

    const infoData = await fetchJsonWithTimeout<any>(imageInfoUrl, 12000);
    const imagePages = infoData?.query?.pages || {};

    const scored: Array<{ source: MedicalGroundingSource; score: number }> = [];

    for (const page of renderablePages) {
      const imagePage = imagePages[page.pageid];
      if (!imagePage?.imageinfo?.[0]) continue;

      const info = imagePage.imageinfo[0];

      // Double-check MIME type — skip SVG/PDF even if title didn't match
      const mime = info.mime || '';
      if (blockedMimes.includes(mime)) continue;
      if (
        mime.startsWith('image/svg') ||
        mime === 'application/pdf' ||
        mime.startsWith('image/tiff')
      )
        continue;

      const url = info.thumburl || info.url;
      const title = clipText(page.title.replace(/^File:/, ''), 220);

      const metadata = info.extmetadata || {};
      const description = metadata.ImageDescription?.value || metadata.ObjectName?.value || '';
      const cleanDesc = description
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const score = scoreWikimediaRelevance(title, cleanDesc, query);
      if (score < 1) continue;

      const author = metadata.Artist?.value || metadata.Credit?.value || 'Wikimedia Commons';

      scored.push({
        score,
        source: {
          id: `commons-${page.pageid}`,
          title,
          url: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
          imageUrl: url,
          snippet: clipText(cleanDesc || `Medical image: ${title}`, 420),
          source: 'Wikimedia Commons',
          author: clipText(author.replace(/<[^>]+>/g, ''), 100),
          license: metadata.LicenseShortName?.value || 'CC BY-SA',
        },
      });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((s) => s.source);
  } catch (err) {
    if (__DEV__) {
      console.warn('[MedicalSearch] Wikimedia Commons failed:', describeMedicalSearchError(err));
    }
    return [];
  }
}
