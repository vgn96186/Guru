import type { MedicalGroundingSource } from '../../types';
import { clipText, fetchJsonWithTimeout } from '../utils';

/**
 * DuckDuckGo Instant Answer API — free, no API key.
 * Returns abstract text and related topics for medical terms.
 */
export async function searchDuckDuckGo(
  query: string,
  maxResults = 4,
): Promise<MedicalGroundingSource[]> {
  const medicalQuery = query.replace(/\(India.*?\)/g, '').trim();
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(
    medicalQuery,
  )}&format=json&no_html=1&skip_disambig=1`;
  const data = await fetchJsonWithTimeout<{
    AbstractText?: string;
    AbstractSource?: string;
    AbstractURL?: string;
    Heading?: string;
    RelatedTopics?: Array<{
      Text?: string;
      FirstURL?: string;
      Result?: string;
    }>;
  }>(url);

  const results: MedicalGroundingSource[] = [];

  if (data.AbstractText?.trim()) {
    results.push({
      id: `ddg-abstract-${Date.now()}`,
      title: data.Heading || medicalQuery,
      url: data.AbstractURL || '',
      snippet: clipText(data.AbstractText, 500),
      source: 'DuckDuckGo',
    });
  }

  if (data.RelatedTopics) {
    for (const topic of data.RelatedTopics.slice(0, maxResults - results.length)) {
      if (topic.Text && topic.FirstURL) {
        results.push({
          id: `ddg-${results.length}-${Date.now()}`,
          title: clipText(topic.Text.split(' - ')[0] || topic.Text, 120),
          url: topic.FirstURL,
          snippet: clipText(topic.Text, 300),
          source: 'DuckDuckGo',
        });
      }
    }
  }

  return results.slice(0, maxResults);
}

/**
 * Search DuckDuckGo for images (using the DDG Image API endpoint).
 * This is a free, no-auth image search that returns direct image URLs.
 */
export async function searchDuckDuckGoImages(
  query: string,
  maxResults: number,
): Promise<MedicalGroundingSource[]> {
  const medicalQuery = query
    .replace(/\(India.*?\)/g, '')
    .replace(/medical|clinical|diagnosis|treatment/gi, '')
    .trim();

  if (!medicalQuery) return [];

  // DuckDuckGo image search via the HTML endpoint (parses JSON from VQD)
  try {
    // Step 1: Get VQD token from search page
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(
      medicalQuery + ' image',
    )}`;
    const searchController = new AbortController();
    const searchTimer = setTimeout(() => searchController.abort(), 8000);
    try {
      const searchRes = await fetch(searchUrl, {
        signal: searchController.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      clearTimeout(searchTimer);
      const html = await searchRes.text();

      // Extract VQD token
      const vqdMatch = html.match(/vqd=["']?([^"&']+)["']/);
      const vqd = vqdMatch?.[1];

      if (!vqd) return [];

      // Step 2: Use VQD to query image API
      const imageUrl = `https://duckduckgo.com/i.js?q=${encodeURIComponent(
        medicalQuery,
      )}&vqd=${vqd}`;
      const imgController = new AbortController();
      const imgTimer = setTimeout(() => imgController.abort(), 8000);
      try {
        const imgData = await fetchJsonWithTimeout<{
          results?: Array<{
            image?: string;
            title?: string;
            url?: string;
            width?: number;
            height?: number;
          }>;
        }>(imageUrl, 8000);
        clearTimeout(imgTimer);

        const results: MedicalGroundingSource[] = [];
        const images = imgData?.results || [];

        for (const img of images.slice(0, maxResults)) {
          const imgUrl = img.image || img.url;
          if (!imgUrl || typeof imgUrl !== 'string') continue;
          // Skip SVG, GIF, and tiny images
          if (imgUrl.includes('.svg') || imgUrl.includes('.gif')) continue;
          if ((img.width && img.width < 100) || (img.height && img.height < 100)) continue;

          results.push({
            id: `ddg-img-${results.length}-${Date.now()}`,
            title: clipText(img.title || medicalQuery, 220),
            url: imgUrl,
            imageUrl: imgUrl.startsWith('//') ? `https:${imgUrl}` : imgUrl,
            snippet: clipText(img.title || medicalQuery, 200),
            source: 'DuckDuckGo',
            author: 'DuckDuckGo',
            license: 'Unknown (verify source)',
          });
        }

        return results.slice(0, maxResults);
      } catch {
        clearTimeout(imgTimer);
        return [];
      }
    } catch {
      clearTimeout(searchTimer);
      return [];
    }
  } catch {
    return [];
  }
}
