import type { MedicalGroundingSource, Message } from './types';
import { generateTextWithRouting } from './generate';
import { logGroundingEvent, previewText } from './runtimeDebug';
import { profileRepository } from '../../db/repositories';
import { getApiKeys } from './config';

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

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 12000): Promise<T> {
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
 */
async function searchWikimediaCommons(
  query: string,
  maxResults: number,
): Promise<MedicalGroundingSource[]> {
  const fetchLimit = maxResults * 3; // over-fetch for ranking
  const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=file:${encodeURIComponent(query)}&srnamespace=6&srlimit=${fetchLimit}&format=json`;

  try {
    const searchData = await fetchJsonWithTimeout<any>(searchUrl, 8000);
    const pages = searchData?.query?.search || [];
    if (pages.length === 0) return [];

    const titles = pages.map((p: any) => p.title).join('|');
    const imageInfoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=imageinfo&iiprop=url|extmetadata|size&format=json`;

    const infoData = await fetchJsonWithTimeout<any>(imageInfoUrl, 8000);
    const imagePages = infoData?.query?.pages || {};

    const scored: Array<{ source: MedicalGroundingSource; score: number }> = [];

    for (const page of pages) {
      const imagePage = imagePages[page.pageid];
      if (!imagePage?.imageinfo?.[0]) continue;

      const info = imagePage.imageinfo[0];
      const url = info.url;
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
  let searchUrl = `https://openi.nlm.nih.gov/api/search?query=${encodeURIComponent(query)}&m=1&n=${maxResults}`;
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
            ? `https://openi.nlm.nih.gov/detailedresult?img=${imgId}&query=${encodeURIComponent(query)}`
            : `https://openi.nlm.nih.gov/detailedresult?img=${imgId || uid}&query=${encodeURIComponent(query)}`,
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

async function searchBraveImages(
  query: string,
  maxResults: number,
): Promise<MedicalGroundingSource[]> {
  const profile = await profileRepository.getProfile().catch(() => null);
  const { braveSearchKey } = getApiKeys(profile);
  const trimmed = braveSearchKey?.trim();
  if (!trimmed) return [];

  const url = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(query)}&count=${Math.min(
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
 * Search for medical images using specialized medical image databases.
 * Falls back to article sources only if no images found.
 */
export async function searchMedicalImages(
  query: string,
  maxResults = 6,
): Promise<MedicalGroundingSource[]> {
  logGroundingEvent('image_search_start', {
    query: previewText(query, 140),
    maxResults,
  });
  if (__DEV__) console.log('[MedicalSearch] Image query:', query);

  async function runImageSearch(searchQuery: string) {
    const [commons, medpix, openi, brave] = await Promise.allSettled([
      searchWikimediaCommons(searchQuery, Math.min(3, maxResults)),
      searchOpenI(searchQuery, Math.min(3, maxResults), 'mpx'),
      searchOpenI(searchQuery, Math.min(2, maxResults)),
      searchBraveImages(searchQuery, Math.min(3, maxResults)),
    ]);

    const collected: MedicalGroundingSource[] = [];
    if (medpix.status === 'fulfilled') collected.push(...medpix.value);
    if (commons.status === 'fulfilled') collected.push(...commons.value);
    if (openi.status === 'fulfilled') collected.push(...openi.value);
    if (collected.length === 0 && brave.status === 'fulfilled') collected.push(...brave.value);

    return {
      collected,
      commons,
      medpix,
      openi,
      brave,
    };
  }

  const queryLadder = buildImageSearchQueryLadder(query);
  let effectiveQuery = queryLadder[0] ?? query;
  let collected: MedicalGroundingSource[] = [];
  let commons: PromiseSettledResult<MedicalGroundingSource[]> = {
    status: 'fulfilled',
    value: [],
  };
  let medpix: PromiseSettledResult<MedicalGroundingSource[]> = {
    status: 'fulfilled',
    value: [],
  };
  let openi: PromiseSettledResult<MedicalGroundingSource[]> = {
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
    commons = result.commons;
    medpix = result.medpix;
    openi = result.openi;
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
      medpix: medpix.status === 'fulfilled' ? medpix.value.length : 'failed',
      commons: commons.status === 'fulfilled' ? commons.value.length : 'failed',
      openi: openi.status === 'fulfilled' ? openi.value.length : 'failed',
      brave: brave.status === 'fulfilled' ? brave.value.length : 'failed',
    },
    sampleTitles: collected.slice(0, 3).map((row) => previewText(row.title, 80)),
    sampleUrls: collected.slice(0, 3).map((row) => previewText(row.imageUrl ?? row.url, 120)),
  });

  if (__DEV__)
    console.log(
      `[MedicalSearch] Images found: ${collected.length} (medpix: ${medpix.status === 'fulfilled' ? medpix.value.length : 'failed'}, commons: ${commons.status === 'fulfilled' ? commons.value.length : 'failed'}, openi: ${openi.status === 'fulfilled' ? openi.value.length : 'failed'}, brave: ${brave.status === 'fulfilled' ? brave.value.length : 'failed'})`,
    );

  if (collected.length === 0) {
    if (__DEV__)
      console.warn('[MedicalSearch] No images from specialized or Brave fallback sources');
    return [];
  }

  return dedupeGroundingSources(collected).slice(0, maxResults);
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
    const { text } = await generateTextWithRouting(msgs);
    const candidate = text
      .replace(/^["']|["']$/g, '')
      .trim()
      .slice(0, 120);
    return compactImageSearchQuery(candidate) || compactImageSearchQuery(topicName) || topicName;
  } catch {
    return compactImageSearchQuery(topicName) || topicName;
  }
}

// ─── ARTICLE SEARCH (for text-based grounding) ───────────────────────────────────

/** Wikipedia: curriculum-aligned summaries, good for NEET-PG/INICET concepts */
async function searchWikipedia(
  query: string,
  maxResults: number,
): Promise<MedicalGroundingSource[]> {
  const url = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=${maxResults}`;
  const data = await fetchJsonWithTimeout<{
    pages?: Array<{
      id?: number;
      key?: string;
      title?: string;
      excerpt?: string;
      description?: string;
      thumbnail?: { url?: string };
    }>;
  }>(url, 8000);
  const pages = Array.isArray(data?.pages) ? data.pages : [];
  return pages
    .filter((p: any) => p?.title && p?.key)
    .slice(0, maxResults)
    .map((p: any) => {
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

async function searchEuropePMC(
  query: string,
  maxResults: number,
): Promise<MedicalGroundingSource[]> {
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
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&sort=pub+date&retmax=${maxResults}&term=${encodeURIComponent(term)}`;
  const searchData = await fetchJsonWithTimeout<any>(searchUrl);
  const ids: string[] = Array.isArray(searchData?.esearchresult?.idlist)
    ? searchData.esearchresult.idlist
    : [];
  if (ids.length === 0) return [];

  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`;
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
 * DuckDuckGo Instant Answer API — free, no API key.
 * Returns abstract text and related topics for medical terms.
 */
async function searchDuckDuckGo(query: string, maxResults = 4): Promise<MedicalGroundingSource[]> {
  const medicalQuery = query.replace(/\(India.*?\)/g, '').trim();
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(medicalQuery)}&format=json&no_html=1&skip_disambig=1`;
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
