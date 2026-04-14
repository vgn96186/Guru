import type { MedicalGroundingSource, Message } from './types';
import { generateTextWithRouting } from './generate';
import { logGroundingEvent, previewText } from './runtimeDebug';
import { profileRepository } from '../../db/repositories';
import { getApiKeys } from './config';
import { DEFAULT_PROVIDER_ORDER } from '../../types';
import { getMedicalImageForTopic } from '../medicalImageMap';

// In-memory cache for image search results (query → first image URL).
// TTL: 10 minutes. Avoids re-searching the same query within a session.
const IMAGE_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const imageSearchCache = new Map<string, { url: string | null; expiresAt: number }>();

function getCachedImageSearch(query: string): string | null | undefined {
  const entry = imageSearchCache.get(query);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    imageSearchCache.delete(query);
    return undefined;
  }
  return entry.url;
}

function setCachedImageSearch(query: string, url: string | null): void {
  imageSearchCache.set(query, { url, expiresAt: Date.now() + IMAGE_SEARCH_CACHE_TTL_MS });
}

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
  return clipText(
    `${cleaned} (India OR Indian OR ICMR OR AIIMS OR WHO OR guidelines OR protocol OR diagnosis OR treatment OR "clinical presentation")`,
    180,
  );
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 30000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'GuruStudyApp/1.0 (https://guru.study; help@guru.study)',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => String(res.status));
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : '';
    if (name === 'AbortError' || /aborted/i.test(message)) {
      const timeoutError = new Error(`Timeout after ${timeoutMs}ms`);
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function describeMedicalSearchError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError') return error.message;
    return error.message;
  }
  return String(error);
}

const IMAGE_QUERY_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'clinical',
  'context',
  'diagram',
  'exam',
  'examination',
  'find',
  'for',
  'image',
  'in',
  'is',
  'medical',
  'movement',
  'of',
  'or',
  'question',
  'relevant',
  'showing',
  'student',
  'the',
  'this',
  'to',
  'what',
  'with',
]);

function compactImageSearchQuery(raw: string, maxTerms = 8): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/["']/g, ' ')
    .replace(/[^a-z0-9\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const prioritized = cleaned
    .split(' ')
    .filter((term) => term.length > 2 && !IMAGE_QUERY_STOPWORDS.has(term));

  return Array.from(new Set(prioritized)).slice(0, maxTerms).join(' ').trim();
}

function normalizeImageQuery(raw: string): string {
  return compactWhitespace(raw).toLowerCase();
}

function dedupeImageQueries(queries: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const query of queries) {
    const trimmed = compactWhitespace(query ?? '');
    if (!trimmed) continue;
    const normalized = normalizeImageQuery(trimmed);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(trimmed);
  }
  return unique;
}

function upscaleWikipediaThumbnail(url?: string): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
  return normalized.replace(/\/\d+px-([^/?#]+)([?#].*)?$/i, '/640px-$1$2');
}

function buildConceptFamilyImageQueries(query: string): string[] {
  const normalized = normalizeImageQuery(query);
  const familyQueries: string[] = [];

  const extraocularPattern =
    /\b(superior|inferior|medial|lateral)\s+(oblique|rectus)\b|\b(extraocular|extra-ocular|ocular muscles?)\b/;
  if (extraocularPattern.test(normalized)) {
    familyQueries.push('extraocular muscles', 'orbit anatomy');
  }

  const eyeAnatomyPattern =
    /\b(iris|cornea|lens|retina|choroid|ciliary body|sclera|optic disc|optic nerve head)\b/;
  if (eyeAnatomyPattern.test(normalized)) {
    familyQueries.push('eye anatomy');
  }

  return dedupeImageQueries(familyQueries);
}

function buildImageSearchQueryLadder(query: string): string[] {
  const compacted = compactImageSearchQuery(query);
  const familyQueries = buildConceptFamilyImageQueries(compacted || query);
  return dedupeImageQueries([...familyQueries, compacted, query]);
}

/** Deduplicates sources by title+url (case-insensitive). Exported for unit testing. */
export function dedupeGroundingSources(
  sources: MedicalGroundingSource[],
): MedicalGroundingSource[] {
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

const QUERY_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
  'what',
  'which',
  'when',
  'why',
  'india',
  'indian',
  'icmr',
  'aiims',
  'who',
  'guidelines',
  'guideline',
  'protocol',
  'protocols',
  'diagnosis',
  'diagnostic',
  'treatment',
  'clinical',
  'presentation',
  'management',
  'approach',
  'overview',
  'medicine',
  'medical',
  'disease',
  'disorder',
]);

function extractQueryTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3 && !QUERY_STOPWORDS.has(term)),
    ),
  );
}

function scoreGroundingSource(source: MedicalGroundingSource, query: string): number {
  const title = source.title.toLowerCase();
  const snippet = source.snippet.toLowerCase();
  const url = source.url.toLowerCase();
  const queryTerms = extractQueryTerms(query);
  let score =
    source.source === 'PubMed'
      ? 36
      : source.source === 'EuropePMC'
        ? 34
        : source.source === 'Wikipedia'
          ? 22
          : source.source === 'DuckDuckGo'
            ? 6
            : 18;

  let titleHits = 0;
  let snippetHits = 0;

  for (const term of queryTerms) {
    if (title.includes(term)) {
      score += 8;
      titleHits += 1;
      continue;
    }
    if (snippet.includes(term)) {
      score += 3;
      snippetHits += 1;
      continue;
    }
    if (url.includes(term)) {
      score += 2;
    }
  }

  if (queryTerms.length > 0 && titleHits === 0 && snippetHits === 0) {
    score -= 18;
  }

  if (source.source === 'DuckDuckGo') {
    score -= 6;
    if (titleHits === 0) score -= 10;
  }

  if (source.source === 'Wikipedia' && titleHits === 0) {
    score -= 6;
  }

  if (source.publishedAt && /^\d{4}/.test(source.publishedAt)) {
    const publishedYear = Number(source.publishedAt.slice(0, 4));
    const ageYears = Number.isFinite(publishedYear)
      ? Math.max(0, new Date().getFullYear() - publishedYear)
      : 0;
    score += Math.max(0, 6 - Math.min(ageYears, 6));
  }

  return score;
}

function rankGroundingSources(
  sources: MedicalGroundingSource[],
  query: string,
  maxResults: number,
): MedicalGroundingSource[] {
  return dedupeGroundingSources(sources)
    .map((source, index) => ({
      source,
      index,
      score: scoreGroundingSource(source, query),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .slice(0, maxResults)
    .map(({ source }) => source);
}

// ─── MEDICAL IMAGE SEARCH ─────────────────────────────────────────────────────

const MEDICAL_TERMS = [
  'medical',
  'anatomy',
  'disease',
  'pathology',
  'histology',
  'radiology',
  'x-ray',
  'xray',
  'ct scan',
  'mri',
  'ultrasound',
  'ecg',
  'ekg',
  'microscopy',
  'biopsy',
  'clinical',
  'surgical',
  'dermato',
  'ophthalm',
  'cardio',
  'neuro',
  'hepat',
  'renal',
  'pulmon',
  'gastro',
  'hematol',
  'oncol',
  'endocrin',
  'immunol',
  'infect',
  'pharma',
  'symptom',
  'diagnosis',
  'treatment',
  'syndrome',
  'carcinoma',
  'tumor',
  'tumour',
  'fracture',
  'lesion',
  'abscess',
  'edema',
  'oedema',
  'fibrosis',
  'necrosis',
  'inflammation',
  'hemorrhage',
  'haemorrhage',
  'virus',
  'bacteria',
  'fungal',
  'parasite',
  'organ',
  'tissue',
  'cell',
  'specimen',
  'stain',
  'gram stain',
  'h&e',
  'slide',
];

const NOISE_TERMS = [
  'logo',
  'icon',
  'flag',
  'map',
  'coat of arms',
  'screenshot',
  'photo of building',
  'portrait',
  'headshot',
  'selfie',
];

function scoreWikimediaRelevance(
  title: string,
  description: string,
  originalQuery: string,
): number {
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();
  const combined = `${titleLower} ${descLower}`;
  const queryTerms = originalQuery
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3);
  let score = 0;

  for (const term of queryTerms) {
    if (titleLower.includes(term)) score += 3;
    else if (descLower.includes(term)) score += 2;
  }

  for (const term of MEDICAL_TERMS) {
    if (combined.includes(term)) {
      score += 1;
      break;
    }
  }

  for (const term of NOISE_TERMS) {
    if (combined.includes(term)) {
      score -= 5;
      break;
    }
  }

  return score;
}

/**
 * Search Wikimedia Commons for medical images with relevance scoring.
 * Filters out SVG/PDF/TIFF/DJVU at the API level to avoid wasting bandwidth.
 */
async function searchWikimediaCommons(
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

/**
 * Search Open i (NIH's medical image database).
 * @param collection - optional collection filter: 'mpx' for MedPix, undefined for all
 */
async function searchOpenI(
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

async function searchGoogleCustomSearch(
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

/**
 * Search Open-i (NIH's Open Access biomedical image search).
 * Free, no-auth, returns images from PubMed Central open-access articles.
 * Confirmed working as of April 2026.
 */
async function searchOpeni(query: string, maxResults: number): Promise<MedicalGroundingSource[]> {
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

async function searchBraveImages(
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
async function searchBraveText(
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

/**
 * Search for medical images using specialized medical image databases.
 * Falls back to article sources only if no images found.
 */
export async function searchMedicalImages(
  query: string,
  maxResults = 6,
): Promise<MedicalGroundingSource[]> {
  // Check cache first
  const cachedUrl = getCachedImageSearch(query);
  if (cachedUrl !== undefined) {
    if (cachedUrl === null) return []; // Previously searched, no results found
    // For cached URLs, return a minimal source entry
    return [
      {
        id: `cached-${query.slice(0, 20)}`,
        title: query,
        url: cachedUrl,
        imageUrl: cachedUrl,
        snippet: query,
        source: 'Wikimedia Commons' as const,
      },
    ];
  }

  logGroundingEvent('image_search_start', {
    query: previewText(query, 140),
    maxResults,
  });
  if (__DEV__) console.log('[MedicalSearch] Image query:', query);

  async function runImageSearch(searchQuery: string) {
    const [commons, google, wikipedia, openi, duckduckgo, brave] = await Promise.allSettled([
      searchWikimediaCommons(searchQuery, Math.min(3, maxResults)),
      searchGoogleCustomSearch(searchQuery, Math.min(3, maxResults)),
      searchWikipedia(searchQuery, Math.min(3, maxResults)),
      searchOpeni(searchQuery, Math.min(3, maxResults)),
      searchDuckDuckGoImages(searchQuery, Math.min(3, maxResults)),
      searchBraveImages(searchQuery, Math.min(3, maxResults)),
    ]);

    const collected: MedicalGroundingSource[] = [];
    // Wikimedia Commons first — best source for textbook diagrams (Gray's Anatomy plates, labeled anatomy diagrams)
    if (commons.status === 'fulfilled') collected.push(...commons.value);
    // Google Custom Search second (user-configured, searches curated medical sites)
    if (google.status === 'fulfilled') collected.push(...google.value);
    // Wikipedia article thumbnails (usually the standard textbook image)
    if (collected.length === 0 && wikipedia.status === 'fulfilled') {
      collected.push(...wikipedia.value.filter((row) => Boolean(row.imageUrl)));
    }
    // Open-i last — returns research paper figures, not study diagrams
    if (collected.length === 0 && openi.status === 'fulfilled') collected.push(...openi.value);
    if (collected.length === 0 && duckduckgo.status === 'fulfilled')
      collected.push(...duckduckgo.value);
    if (collected.length === 0 && brave.status === 'fulfilled') collected.push(...brave.value);

    return {
      collected,
      commons,
      google,
      wikipedia,
      openi,
      duckduckgo,
      brave,
    };
  }

  const queryLadder = buildImageSearchQueryLadder(query);
  let effectiveQuery = queryLadder[0] ?? query;
  let collected: MedicalGroundingSource[] = [];
  const google: PromiseSettledResult<MedicalGroundingSource[]> = {
    status: 'fulfilled',
    value: [],
  };
  let openi: PromiseSettledResult<MedicalGroundingSource[]> = {
    status: 'fulfilled',
    value: [],
  };
  let commons: PromiseSettledResult<MedicalGroundingSource[]> = {
    status: 'fulfilled',
    value: [],
  };
  let wikipedia: PromiseSettledResult<MedicalGroundingSource[]> = {
    status: 'fulfilled',
    value: [],
  };
  let duckduckgo: PromiseSettledResult<MedicalGroundingSource[]> = {
    status: 'fulfilled',
    value: [],
  };
  let brave: PromiseSettledResult<MedicalGroundingSource[]> = {
    status: 'fulfilled',
    value: [],
  };

  if (queryLadder.length > 1) {
    logGroundingEvent('image_search_broadened', {
      originalQuery: previewText(query, 140),
      queryLadder: queryLadder.map((entry) => previewText(entry, 140)),
    });
  }

  for (const candidateQuery of queryLadder) {
    effectiveQuery = candidateQuery;
    const result = await runImageSearch(candidateQuery);
    openi = result.openi;
    commons = result.commons;
    wikipedia = result.wikipedia;
    duckduckgo = result.duckduckgo;
    brave = result.brave;
    collected = dedupeGroundingSources([...collected, ...result.collected]);
    if (collected.length >= maxResults) {
      break;
    }
  }

  logGroundingEvent('image_search_complete', {
    query: previewText(effectiveQuery, 140),
    originalQuery: previewText(query, 140),
    queryLadder: queryLadder.map((entry) => previewText(entry, 140)),
    totalCollected: collected.length,
    providerBreakdown: {
      google: google.status === 'fulfilled' ? google.value.length : 'failed',
      openi: openi.status === 'fulfilled' ? openi.value.length : 'failed',
      commons: commons.status === 'fulfilled' ? commons.value.length : 'failed',
      duckduckgo: duckduckgo.status === 'fulfilled' ? duckduckgo.value.length : 'failed',
      wikipedia: wikipedia.status === 'fulfilled' ? wikipedia.value.length : 'failed',
      brave: brave.status === 'fulfilled' ? brave.value.length : 'failed',
    },
    sampleTitles: collected.slice(0, 3).map((row) => previewText(row.title, 80)),
    sampleUrls: collected.slice(0, 3).map((row) => previewText(row.imageUrl ?? row.url, 120)),
  });

  if (__DEV__)
    console.log(
      `[MedicalSearch] Images found: ${collected.length} (google: ${
        google.status === 'fulfilled' ? google.value.length : 'failed'
      }, openi: ${openi.status === 'fulfilled' ? openi.value.length : 'failed'}, commons: ${
        commons.status === 'fulfilled' ? commons.value.length : 'failed'
      }, duckduckgo: ${
        duckduckgo.status === 'fulfilled' ? duckduckgo.value.length : 'failed'
      }, wikipedia: ${
        wikipedia.status === 'fulfilled' ? wikipedia.value.length : 'failed'
      }, brave: ${brave.status === 'fulfilled' ? brave.value.length : 'failed'})`,
    );

  if (collected.length === 0) {
    // Final fallback: static pre-mapped medical images for high-yield NEET-PG topics
    const mappedImage = getMedicalImageForTopic(query);
    if (mappedImage) {
      if (__DEV__) console.log(`[MedicalSearch] Using pre-mapped image for: ${query}`);
      const result: MedicalGroundingSource = {
        id: `mapped-${query.slice(0, 20)}`,
        title: mappedImage.title,
        url: mappedImage.url,
        imageUrl: mappedImage.url,
        snippet: mappedImage.title,
        source: mappedImage.source as MedicalGroundingSource['source'],
        author: mappedImage.author,
        license: mappedImage.license,
      };
      setCachedImageSearch(query, mappedImage.url);
      return [result];
    }

    if (__DEV__) console.warn('[MedicalSearch] No images from any source');
    setCachedImageSearch(query, null); // Cache the negative result
    return [];
  }

  const results = dedupeGroundingSources(collected).slice(0, maxResults);
  // Cache the first image URL for this query
  if (results.length > 0 && results[0].imageUrl) {
    setCachedImageSearch(query, results[0].imageUrl);
  }
  return results;
}

/**
 * Uses the LLM to produce a precise medical image search query.
 * Falls back to the raw topic name if the LLM call fails.
 */
export async function generateImageSearchQuery(
  topicName: string,
  context?: string,
): Promise<string> {
  const msgs: Message[] = [
    {
      role: 'system',
      content:
        'You generate concise medical image search queries for medical reference images. Output ONLY the search query string, nothing else. Keep it to 2-6 words. Prefer the broader core anatomical structure, pathology, or imaging finding over narrow exam phrasing. Drop filler words like anatomy, clinical presentation, management, mechanism, question, symptom, diagnosis, treatment, or why/how unless they are essential to the image itself. Include modality only when clearly necessary, such as histology, x-ray, MRI, CT, microscopy, gross pathology, or fundus photo.',
    },
    {
      role: 'user',
      content: context
        ? `Generate a search query to find a relevant medical image for this quiz question about "${topicName}":\n${context}`
        : `Generate a search query to find a relevant medical image for: "${topicName}"`,
    },
  ];
  try {
    const { text } = await generateTextWithRouting(msgs, {
      providerOrderOverride: DEFAULT_PROVIDER_ORDER,
    });
    const candidate = text
      .replace(/^["']|["']$/g, '')
      .trim()
      .slice(0, 120);
    return compactImageSearchQuery(candidate) || compactImageSearchQuery(topicName) || topicName;
  } catch {
    return compactImageSearchQuery(topicName) || topicName;
  }
}

/**
 * Uses the LLM to generate 2-3 VISUAL search queries for a topic.
 * Translates abstract concepts (e.g., "homeostasis and cellular transport") into
 * concrete visualizable terms (e.g., "sodium potassium pump diagram",
 * "cell membrane facilitated diffusion", "endocytosis exocytosis").
 * These are then searched in parallel for images.
 */
export async function generateVisualSearchQueries(topicName: string): Promise<string[]> {
  const msgs: Message[] = [
    {
      role: 'system',
      content:
        'You are a medical image search query generator. Given a medical topic, return 3 precise, VISUAL search queries that would find diagrams, histology images, or clinical photographs relevant to the topic.\n\nRules:\n- Output a JSON array of exactly 3 strings, nothing else.\n- Each query should be 2-5 words.\n- For abstract topics, translate concepts to concrete visual examples (e.g., "homeostasis cellular transport" → ["sodium potassium pump diagram", "cell membrane transport channels", "endocytosis exocytosis diagram"]).\n- Include the word "diagram" or "histology" or "gross pathology" or "microscopy" when appropriate.\n- Do NOT include words like "anatomy of", "mechanism of", "management of" — use the core structure/pathology name.',
    },
    {
      role: 'user',
      content: `Generate 3 visual search queries for: "${topicName}"`,
    },
  ];
  try {
    const { text } = await generateTextWithRouting(msgs, {
      providerOrderOverride: DEFAULT_PROVIDER_ORDER,
    });
    // Try to parse as JSON array
    const cleaned = text.trim().replace(/^```json\n?|\n?```$/g, '');
    const parsed = JSON.parse(cleaned) as string[];
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((s) => typeof s === 'string' && s.length > 0)
    ) {
      return parsed.map((s) => compactImageSearchQuery(s.trim())).filter(Boolean);
    }
  } catch {
    // If LLM fails or returns bad JSON, fall through
  }
  // Fallback: try the single query generator
  const single = await generateImageSearchQuery(topicName);
  return single ? [single] : [topicName];
}

// ─── ARTICLE SEARCH (for text-based grounding) ───────────────────────────────────

/** Wikipedia: curriculum-aligned summaries, good for NEET-PG/INICET concepts */
async function searchWikipedia(
  query: string,
  maxResults: number,
): Promise<MedicalGroundingSource[]> {
  // Use the working MediaWiki action API (same as imageService.ts)
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query,
  )}&format=json&srlimit=${maxResults}&origin=*&srprop=snippet|titlesnippet`;

  try {
    const searchData = await fetchJsonWithTimeout<any>(url, 8000);
    const results = searchData?.query?.search || [];

    if (results.length === 0) return [];

    // Get page images for the search results
    const titles = results.map((r: any) => r.title).join('|');
    const imageInfoUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      titles,
    )}&prop=pageimages&format=json&pithumbsize=500&origin=*`;

    const imageData = await fetchJsonWithTimeout<any>(imageInfoUrl, 8000);
    const pages = imageData?.query?.pages || {};

    // Build a map of title -> thumbnail
    const thumbMap = new Map<string, string>();
    for (const pageId of Object.keys(pages)) {
      const page = pages[pageId];
      if (pageId === '-1' || !page.thumbnail?.source) continue;
      thumbMap.set(page.title?.replace(/_/g, ' '), page.thumbnail.source);
    }

    return results
      .filter((r: any) => r?.title)
      .slice(0, maxResults)
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
      });
  } catch {
    return [];
  }
}

async function searchEuropePMC(
  query: string,
  maxResults: number,
): Promise<MedicalGroundingSource[]> {
  const europeQuery = `(${query}) AND (HAS_ABSTRACT:y OR OPEN_ACCESS:y) NOT (veterinary OR animal OR murine OR mice OR rat OR dog OR cat)`;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(
    europeQuery,
  )}&format=json&pageSize=${maxResults}&sort=relevance`;
  const data = await fetchJsonWithTimeout<any>(url, 20000);
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
      const snippetRaw = String(
        row.abstractText ?? row.authorString ?? 'No abstract snippet available.',
      );

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

async function searchPubMedFallback(
  query: string,
  maxResults: number,
): Promise<MedicalGroundingSource[]> {
  const term = `${query} AND (english[Language]) NOT (veterinary OR animal OR murine OR mice OR rat OR dog OR cat)`;
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&sort=pub+date&retmax=${maxResults}&term=${encodeURIComponent(
    term,
  )}`;
  const searchData = await fetchJsonWithTimeout<any>(searchUrl);
  const ids: string[] = Array.isArray(searchData?.esearchresult?.idlist)
    ? searchData.esearchresult.idlist
    : [];
  if (ids.length === 0) return [];

  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(
    ',',
  )}`;
  const summaryData = await fetchJsonWithTimeout<any>(summaryUrl);
  const uidList: string[] = Array.isArray(summaryData?.result?.uids)
    ? summaryData.result.uids
    : ids;

  return uidList
    .map((uid: string): MedicalGroundingSource | null => {
      const row = summaryData?.result?.[uid];
      if (!row?.title) return null;
      const publishedAt = String(row.pubdate ?? '').trim() || undefined;
      const journal = String(row.fulljournalname ?? row.source ?? '').trim() || undefined;
      return {
        id: `pmid-${uid}`,
        title: clipText(String(row.title), 220),
        url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
        snippet: clipText(
          `Indexed on PubMed${journal ? ` in ${journal}` : ''}${
            publishedAt ? ` (${publishedAt})` : ''
          }. Open source link for abstract and full metadata.`,
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
 * DuckDuckGo Instant Answer API — free, no API key.
 * Returns abstract text and related topics for medical terms.
 */
async function searchDuckDuckGo(query: string, maxResults = 4): Promise<MedicalGroundingSource[]> {
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
async function searchDuckDuckGoImages(
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

/**
 * Search for medical articles (text-based grounding).
 * Uses Wikipedia + DuckDuckGo + EuropePMC, with PubMed as fallback.
 */
export async function searchLatestMedicalSources(
  query: string,
  maxResults = 6,
): Promise<MedicalGroundingSource[]> {
  const collected: MedicalGroundingSource[] = [];
  const wikiLimit = Math.min(3, maxResults);
  const litLimit = maxResults;
  const minStrongResults = Math.min(3, maxResults);

  logGroundingEvent('search_start', {
    query: previewText(query, 140),
    maxResults,
  });

  // Brave Search first — highest quality web results when API key is configured
  try {
    const braveResults = await searchBraveText(query, Math.min(4, maxResults));
    if (braveResults.length > 0) {
      collected.push(...braveResults);
      logGroundingEvent('provider_result', {
        provider: 'Brave Search',
        count: braveResults.length,
        query: previewText(query, 100),
      });
    }
  } catch (err) {
    logGroundingEvent('provider_error', {
      provider: 'Brave Search',
      error: err instanceof Error ? err.message : String(err),
      query: previewText(query, 100),
    });
    if (__DEV__) console.warn('[GuruGrounded] Brave Search failed:', (err as Error).message);
  }

  try {
    const wiki = await searchWikipedia(query, wikiLimit);
    collected.push(...wiki);
    logGroundingEvent('provider_result', {
      provider: 'Wikipedia',
      count: wiki.length,
      query: previewText(query, 100),
    });
  } catch (err) {
    logGroundingEvent('provider_error', {
      provider: 'Wikipedia',
      error: err instanceof Error ? err.message : String(err),
      query: previewText(query, 100),
    });
    if (__DEV__) console.warn('[GuruGrounded] Wikipedia failed:', (err as Error).message);
  }

  // DuckDuckGo — free web search for broader context (no API key needed)
  try {
    const europe = await searchEuropePMC(query, litLimit);
    collected.push(...europe);
    logGroundingEvent('provider_result', {
      provider: 'EuropePMC',
      count: europe.length,
      query: previewText(query, 100),
    });
  } catch (err) {
    logGroundingEvent('provider_error', {
      provider: 'EuropePMC',
      error: err instanceof Error ? err.message : String(err),
      query: previewText(query, 100),
    });
    if (__DEV__) console.warn('[GuruGrounded] EuropePMC failed:', (err as Error).message);
  }

  if (collected.length < Math.min(4, maxResults)) {
    try {
      const pubmed = await searchPubMedFallback(query, litLimit);
      collected.push(...pubmed);
      logGroundingEvent('provider_result', {
        provider: 'PubMed',
        count: pubmed.length,
        query: previewText(query, 100),
        fallback: true,
      });
    } catch (err) {
      logGroundingEvent('provider_error', {
        provider: 'PubMed',
        error: err instanceof Error ? err.message : String(err),
        query: previewText(query, 100),
        fallback: true,
      });
      if (__DEV__) console.warn('[GuruGrounded] PubMed fallback failed:', (err as Error).message);
    }
  }

  if (collected.length < minStrongResults) {
    try {
      const ddg = await searchDuckDuckGo(query, 3);
      collected.push(...ddg);
      logGroundingEvent('provider_result', {
        provider: 'DuckDuckGo',
        count: ddg.length,
        query: previewText(query, 100),
        titles: ddg.map((src) => previewText(src.title, 60)),
        fallback: true,
      });
    } catch (err) {
      logGroundingEvent('provider_error', {
        provider: 'DuckDuckGo',
        error: err instanceof Error ? err.message : String(err),
        query: previewText(query, 100),
        fallback: true,
      });
      if (__DEV__) console.warn('[GuruGrounded] DuckDuckGo failed:', (err as Error).message);
    }
  }

  const deduped = rankGroundingSources(collected, query, maxResults);
  logGroundingEvent('search_complete', {
    query: previewText(query, 140),
    totalCollected: collected.length,
    totalReturned: deduped.length,
    providerBreakdown: deduped.reduce<Record<string, number>>((acc, src) => {
      acc[src.source] = (acc[src.source] ?? 0) + 1;
      return acc;
    }, {}),
  });

  return deduped;
}

export function renderSourcesForPrompt(sources: MedicalGroundingSource[]): string {
  return sources
    .map((src: MedicalGroundingSource, idx: number) => {
      const published = src.publishedAt
        ? `Published: ${src.publishedAt}`
        : 'Published: unknown date';
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
