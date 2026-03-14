import type { MedicalGroundingSource } from './types';

function compactWhitespace(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function clipText(raw: string, maxChars: number): string {
  const text = compactWhitespace(raw);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function buildMedicalSearchQuery(question: string, topicName?: string): string {
  const base = compactWhitespace(`${topicName ?? ''} ${question}`.trim());
  const cleaned = base.replace(/[^\w\s\-(),./]/g, ' ');
  return clipText(`${cleaned} (India OR Indian OR ICMR OR AIIMS OR WHO OR guidelines OR protocol OR diagnosis OR treatment OR "clinical presentation")`, 180);
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'GuruStudyApp/1.0 (https://guru.study; help@guru.study)'
      }
    });
    if (!res.ok) {
      const text = await res.text().catch(() => String(res.status));
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return await res.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Deduplicates sources by title+url (case-insensitive). Exported for unit testing. */
export function dedupeGroundingSources(sources: MedicalGroundingSource[]): MedicalGroundingSources[] {
  const seen = new Set<string>();
  const deduped: MedicalGroundingSource[] = [];
  for (const src of sources) {
    const key = `${src.title.toLowerCase()}|${src.url.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(src);
  }
  return deduped;
}

// ─── MEDICAL IMAGE SEARCH ─────────────────────────────────────────────────────

/**
 * Search Wikimedia Commons for medical images.
 * Uses category filtering to ensure medical relevance.
 */
async function searchWikimediaCommons(query: string, maxResults: number): Promise<MedicalGroundingSource[]> {
  // Wikimedia Commons API - search for images in medical categories
  const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=file:${encodeURIComponent(query)}&srnamespace=6&srlimit=${maxResults}&format=json`;
  
  try {
    const searchData = await fetchJsonWithTimeout<any>(searchUrl, 8000);
    const pages = searchData?.query?.search || [];
    
    if (pages.length === 0) return [];

    // Get image info for each result
    const titles = pages.map(p => p.title).join('|');
    const imageInfoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=imageinfo&iiprop=url|extmetadata|size&format=json`;
    
    const infoData = await fetchJsonWithTimeout<any>(imageInfoUrl, 8000);
    const imagePages = infoData?.query?.pages || {};

    const results: MedicalGroundingSource[] = [];

    for (const page of pages) {
      const imagePage = imagePages[page.pageid];
      if (!imagePage?.imageinfo?.[0]) continue;

      const info = imagePage.imageinfo[0];
      const url = info.url;
      const title = clipText(page.title.replace(/^File:/, ''), 220);
      
      // Extract description from metadata
      const metadata = info.extmetadata || {};
      const description = metadata.ImageDescription?.value || metadata.ObjectName?.value || '';
      const cleanDesc = description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      
      // Filter out non-medical images by checking categories and description
      const isMedical = 
        page.title.toLowerCase().includes('medical') ||
        page.title.toLowerCase().includes('anatomy') ||
        page.title.toLowerCase().includes('disease') ||
        page.title.toLowerCase().includes('symptom') ||
        page.title.toLowerCase().includes('diagnosis') ||
        page.title.toLowerCase().includes('treatment') ||
        page.title.toLowerCase().includes('health') ||
        page.title.toLowerCase().includes('medicine') ||
        page.title.toLowerCase().includes('doctor') ||
        page.title.toLowerCase().includes('hospital') ||
        page.title.toLowerCase().includes('patient') ||
        page.title.toLowerCase().includes('virus') ||
        page.title.toLowerCase().includes('bacteria') ||
        page.title.toLowerCase().includes('organ') ||
        page.title.toLowerCase().includes('cell') ||
        page.title.toLowerCase().includes('tissue') ||
        (cleanDesc && (
          cleanDesc.toLowerCase().includes('medical') ||
          cleanDesc.toLowerCase().includes('anatomy') ||
          cleanDesc.toLowerCase().includes('disease') ||
          cleanDesc.toLowerCase().includes('symptom') ||
          cleanDesc.toLowerCase().includes('diagnosis') ||
          cleanDesc.toLowerCase().includes('treatment')
        ));

      if (!isMedical) continue;

      // Get author/attribution
      const author = metadata.Artist?.value || metadata.Credit?.value || 'Wikimedia Commons';
      
      results.push({
        id: `commons-${page.pageid}`,
        title,
        url: page.url, // Link to the file page
        imageUrl: url,
        snippet: clipText(cleanDesc || `Medical image from Wikimedia Commons: ${title}`, 420),
        source: 'Wikimedia Commons',
        author: clipText(author, 100),
        license: metadata.LicenseShortName?.value || 'CC BY-SA',
      });

      if (results.length >= maxResults) break;
    }

    return results;
  } catch (err) {
    if (__DEV__) console.warn('[MedicalSearch] Wikimedia Commons failed:', (err as Error).message);
    return [];
  }
}

/**
 * Search Open i (NIH's medical image database)
 * Provides high-quality, medically-reviewed images
 */
async function searchOpenI(query: string, maxResults: number): Promise<MedicalGroundingSource[]> {
  // Open i API - medical images from NIH
  const searchUrl = `https://openi.nlm.nih.gov/api/search?query=${encodeURIComponent(query)}&m=1&n=${maxResults}&it=xg`;
  
  try {
    const data = await fetchJsonWithTimeout<any>(searchUrl, 10000);
    const results = data?.results || [];
    
    return results
      .filter((r: any) => r?.image?.url && r?.title)
      .slice(0, maxResults)
      .map((r: any): MedicalGroundingSource => {
        const title = clipText(r.title, 220);
        const imageUrl = r.image.url.replace(/^\/\//, 'https://');
        const description = r.description || r.title || '';
        const cleanDesc = description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        
        return {
          id: `openi-${r.uuid || r.image.url}`,
          title,
          url: `https://openi.nlm.nih.gov/detail.jsp?img=${r.uuid}`,
          imageUrl,
          snippet: clipText(cleanDesc, 420),
          source: 'Open i (NIH)',
          author: r.owner || 'NIH',
          license: 'Public Domain (U.S. Government)',
        };
      });
  } catch (err) {
    if (__DEV__) console.warn('[MedicalSearch] Open i failed:', (err as Error).message);
    return [];
  }
}

/**
 * Search for medical images using specialized medical image databases.
 * Falls back to article sources only if no images found.
 */
export async function searchMedicalImages(query: string, maxResults = 6): Promise<MedicalGroundingSource[]> {
  const collected: MedicalGroundingSource[] = [];
  
  // Try Wikimedia Commons first (good for anatomy, diagrams)
  try {
    const commons = await searchWikimediaCommons(query, Math.min(4, maxResults));
    collected.push(...commons);
  } catch (err) {
    // Continue to fallbacks
  }

  // If we don't have enough, try Open i (good for clinical images, radiology)
  if (collected.length < Math.min(3, maxResults)) {
    try {
      const openi = await searchOpenI(query, maxResults - collected.length);
      collected.push(...openi);
    } catch (err) {
      // Continue
    }
  }

  // If still no images, fall back to article sources (they might have relevant thumbnails)
  if (collected.length === 0) {
    if (__DEV__) console.warn('[MedicalSearch] No images from specialized sources, falling back to article search');
    return searchLatestMedicalSources(query, maxResults);
  }

  return dedupeGroundingSources(collected).slice(0, maxResults);
}

// ─── ARTICLE SEARCH (for text-based grounding) ───────────────────────────────────

/** Wikipedia: curriculum-aligned summaries, good for NEET-PG/INICET concepts */
async function searchWikipedia(query: string, maxResults: number): Promise<MedicalGroundingSource[]> {
  const url = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=${maxResults}`;
  const data = await fetchJsonWithTimeout<{ pages?: Array<{ id?: number; key?: string; title?: string; excerpt?: string; description?: string; thumbnail?: { url?: string } }> }>(url, 8000);
  const pages = Array.isArray(data?.pages) ? data.pages : [];
  return pages
    .filter((p) => p?.title && p?.key)
    .slice(0, maxResults)
    .map((p) => {
      const title = clipText(String(p.title), 220);
      const key = String(p.key ?? p.title ?? '');
      const excerpt = (p.excerpt ?? p.description ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
        
      let imageUrl: string | undefined = undefined;
      const tUrl = p.thumbnail?.url;
      if (tUrl) {
        imageUrl = tUrl.startsWith('//') ? `https:${tUrl}` : tUrl;
      }
      
      return {
        id: `wiki-${p.id ?? key}`,
        title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(key)}`,
        imageUrl,
        snippet: clipText(excerpt || title, 420),
        source: 'Wikipedia' as const,
      };
    });
}

async function searchEuropePMC(query: string, maxResults: number): Promise<MedicalGroundingSource[]> {
  const europeQuery = `(${query}) AND (HAS_ABSTRACT:y OR OPEN_ACCESS:y) NOT (veterinary OR animal OR murine OR mice OR rat OR dog OR cat)`;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(europeQuery)}&format=json&pageSize=${maxResults}&sort=relevance`;
  const data = await fetchJsonWithTimeout<any>(url, 14000);
  const rows = Array.isArray(data?.resultList?.result) ? data.resultList.result : [];

  return rows
    .filter((row: any) => row?.title)
    .slice(0, maxResults)
    .map((row: any, idx: number): MedicalGroundingSource => {
      const title = clipText(String(row.title), 220);
      const doi = String(row.doi ?? '').trim();
      const pmid = String(row.pmid ?? '').trim();
      const sourceId = String(row.id ?? pmid ?? idx + 1);
      const urlFromId = pmid
        ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
        : `https://europepmc.org/article/${row.source ?? 'MED'}/${sourceId}`;
      const snippetRaw = String(row.abstractText ?? row.authorString ?? 'No abstract snippet available.');

      return {
        id: `epmc-${sourceId}`,
        title,
        url: doi ? `https://doi.org/${doi}` : urlFromId,
        snippet: clipText(snippetRaw, 420),
        journal: String(row.journalTitle ?? '').trim() || undefined,
        publishedAt: String(row.firstPublicationDate ?? row.pubYear ?? '').trim() || undefined,
        source: 'EuropePMC',
      };
    });
}

async function searchPubMedFallback(query: string, maxResults: number): Promise<MedicalGroundingSource[]> {
  const term = `${query} AND (english[Language]) NOT (veterinary OR animal OR murine OR mice OR rat OR dog OR cat)`;
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&sort=pub+date&retmax=${maxResults}&term=${encodeURIComponent(term)}`;
  const searchData = await fetchJsonWithTimeout<any>(searchUrl);
  const ids: string[] = Array.isArray(searchData?.esearchresult?.idlist) ? searchData.esearchresult.idlist : [];
  if (ids.length === 0) return [];

  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`;
  const summaryData = await fetchJsonWithTimeout<any>(summaryUrl);
  const uidList: string[] = Array.isArray(summaryData?.result?.uids) ? summaryData.result.uids : ids;

  return uidList
    .map((uid): MedicalGroundingSource | null => {
      const row = summaryData?.result?.[uid];
      if (!row?.title) return null;
      const publishedAt = String(row.pubdate ?? '').trim() || undefined;
      const journal = String(row.fulljournalname ?? row.source ?? '').trim() || undefined;
      return {
        id: `pmid-${uid}`,
        title: clipText(String(row.title), 220),
        url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
        snippet: clipText(
          `Indexed on PubMed${journal ? ` in ${journal}` : ''}${publishedAt ? ` (${publishedAt})` : ''}. Open source link for abstract and full metadata.`,
          420,
        ),
        journal,
        publishedAt,
        source: 'PubMed',
      };
    })
    .filter((row): row is MedicalGroundingSource => !!row);
}

/**
 * Search for medical articles (text-based grounding).
 * Use this for text explanations, not images.
 */
export async function searchLatestMedicalSources(query: string, maxResults = 6): Promise<MedicalGroundingSource[]> {
  const collected: MedicalGroundingSource[] = [];
  const wikiLimit = Math.min(3, maxResults);
  const litLimit = maxResults;

  try {
    const wiki = await searchWikipedia(query, wikiLimit);
    collected.push(...wiki);
  } catch (err) {
    if (__DEV__) console.warn('[GuruGrounded] Wikipedia failed:', (err as Error).message);
  }

  try {
    const europe = await searchEuropePMC(query, litLimit);
    collected.push(...europe);
  } catch (err) {
    if (__DEV__) console.warn('[GuruGrounded] EuropePMC failed:', (err as Error).message);
  }

  if (collected.length < Math.min(4, maxResults)) {
    try {
      const pubmed = await searchPubMedFallback(query, litLimit);
      collected.push(...pubmed);
    } catch (err) {
      if (__DEV__) console.warn('[GuruGrounded] PubMed fallback failed:', (err as Error).message);
    }
  }

  return dedupeGroundingSources(collected).slice(0, maxResults);
}

export function renderSourcesForPrompt(sources: MedicalGroundingSource[]): string {
  return sources
    .map((src, idx) => {
      const published = src.publishedAt ? `Published: ${src.publishedAt}` : 'Published: unknown date';
      const journal = src.journal ? `Journal: ${src.journal}` : 'Journal: not listed';
      return `[S${idx + 1}]
Title: ${src.title}
Source: ${src.source}
${published}
${journal}
URL: ${src.url}
Snippet: ${src.snippet}`;
    })
    .join('\n\n');
}

export { buildMedicalSearchQuery };
