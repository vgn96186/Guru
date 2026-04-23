import type { MedicalGroundingSource } from '../../types';
import { clipText, describeMedicalSearchError, fetchJsonWithTimeout } from '../utils';

/**
 * Search Open i (NIH's medical image database).
 * @param collection - optional collection filter: 'mpx' for MedPix, undefined for all
 */
export async function searchOpenI(
  query: string,
  maxResults: number,
  collection?: string,
): Promise<MedicalGroundingSource[]> {
  let searchUrl = `https://openi.nlm.nih.gov/api/search?query=${encodeURIComponent(
    query,
  )}&m=1&n=${maxResults}`;
  if (collection) searchUrl += `&coll=${collection}`;

  const sourceLabel = collection === 'mpx' ? 'MedPix (NIH)' : 'Open i (NIH)';

  try {
    const data = await fetchJsonWithTimeout<any>(searchUrl, 10000);
    // API returns results in 'list' array
    const results = data?.list || data?.results || [];

    return results
      .filter((r: any) => {
        // Accept entries with imgLarge/imgThumb or nested image.url
        return r?.title && (r?.imgLarge || r?.imgThumb || r?.image?.url);
      })
      .slice(0, maxResults)
      .map((r: any): MedicalGroundingSource => {
        const title = clipText(r.title, 220);
        // Prefer imgLarge for quality, fall back to imgThumb or image.url
        const rawImg = r.imgLarge || r.imgThumb || r.image?.url || '';
        const imageUrl = rawImg.startsWith('//')
          ? `https:${rawImg}`
          : rawImg.startsWith('/')
            ? `https://openi.nlm.nih.gov${rawImg}`
            : rawImg;
        const description = r.abstract || r.description || r.title || '';
        const cleanDesc = description
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        const uid = r.uid || r.uuid || '';
        const imgId = r.image?.id || r.medpixFigureId || '';

        return {
          id: `openi-${uid}-${imgId || imageUrl}`,
          title,
          url: uid.startsWith('MPX')
            ? `https://openi.nlm.nih.gov/detailedresult?img=${imgId}&query=${encodeURIComponent(
                query,
              )}`
            : `https://openi.nlm.nih.gov/detailedresult?img=${
                imgId || uid
              }&query=${encodeURIComponent(query)}`,
          imageUrl,
          snippet: clipText(cleanDesc, 420),
          source: sourceLabel,
          author: r.owner || r.authors || 'NIH',
          license:
            collection === 'mpx' ? 'Public Domain (MedPix/NIH)' : 'Public Domain (U.S. Government)',
        };
      });
  } catch (err) {
    if (__DEV__) {
      console.warn(`[MedicalSearch] ${sourceLabel} failed:`, describeMedicalSearchError(err));
    }
    return [];
  }
}

/**
 * Search Open-i (NIH's Open Access biomedical image search).
 * Free, no-auth, returns images from PubMed Central open-access articles.
 * Confirmed working as of April 2026.
 */
export async function searchOpeni(
  query: string,
  maxResults: number,
): Promise<MedicalGroundingSource[]> {
  const medicalQuery = query
    .replace(/\(India.*?\)/g, '')
    .replace(/medical|clinical|diagnosis|treatment/gi, '')
    .trim();

  if (!medicalQuery) return [];

  const url = `https://openi.nlm.nih.gov/api/search?query=${encodeURIComponent(
    medicalQuery,
  )}&m=1&n=${maxResults}`;

  try {
    const data = await fetchJsonWithTimeout<{
      list?: Array<{
        uid?: string;
        pmcid?: string;
        pmid?: string;
        title?: string;
        image?: { id?: string; caption?: string };
        imgThumb?: string;
        imgLarge?: string;
        imgThumbLarge?: string;
        imgGrid150?: string;
      }>;
    }>(url, 10000);

    const results: MedicalGroundingSource[] = [];
    const items = data?.list || [];

    for (const item of items) {
      // Use imgLarge for quality, fall back to imgThumbLarge
      const relativePath = item.imgLarge || item.imgThumbLarge || item.imgThumb || '';
      if (!relativePath) continue;

      const imageUrl = `https://openi.nlm.nih.gov${relativePath}`;
      const pmcid = item.pmcid || item.uid || '';
      const title = clipText(item.title || medicalQuery, 220);
      const caption = (item.image?.caption || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      results.push({
        id: `openi-${pmcid}-${item.image?.id || 'img'}`,
        title: caption ? clipText(caption, 180) : title,
        url: pmcid
          ? `https://openi.nlm.nih.gov/detailedresult?img=${
              item.image?.id || ''
            }&query=${encodeURIComponent(medicalQuery)}`
          : imageUrl,
        imageUrl,
        snippet: clipText(caption || title, 420),
        source: 'Open i (NIH)',
        author: 'PubMed Central',
        license: 'Open Access (PMC)',
      });
    }

    return results.slice(0, maxResults);
  } catch {
    return [];
  }
}
