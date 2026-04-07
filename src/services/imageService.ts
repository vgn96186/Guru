/** Required by https://meta.wikimedia.org/wiki/User-agent_policy — missing this yields plain-text errors starting with "Please…" and breaks JSON.parse. */
const WIKI_API_HEADERS = {
  'User-Agent': 'GuruStudyApp/1.0 (https://guru.study; help@guru.study)',
  Accept: 'application/json',
} as const;

// In-memory image cache with TTL (5 minutes). Prevents redundant network calls
// when the same topic is shown across multiple content cards in a session.
const IMAGE_CACHE_TTL_MS = 5 * 60 * 1000;
const imageCache = new Map<string, { url: string | null; expiresAt: number }>();

/** Get cached image URL or null (cache miss / expired). */
function getCachedImage(key: string): string | null | undefined {
  const entry = imageCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    imageCache.delete(key);
    return undefined;
  }
  return entry.url;
}

/** Store image URL in cache (including null for "not found" to avoid repeated misses). */
function setCachedImage(key: string, url: string | null): void {
  imageCache.set(key, { url, expiresAt: Date.now() + IMAGE_CACHE_TTL_MS });
}

// #region agent log
function dbgImageService(
  hypothesisId: string,
  message: string,
  data: Record<string, unknown>,
): void {
  fetch('http://127.0.0.1:7507/ingest/f6a0734c-b45d-4770-9e51-aa07e5c2da6e', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ca9385' },
    body: JSON.stringify({
      sessionId: 'ca9385',
      hypothesisId,
      location: 'imageService.ts:wikiJson',
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion

async function wikiApiJson(res: Response, step: string): Promise<unknown | null> {
  let text: string;
  try {
    text = await res.text();
  } catch {
    return null;
  }
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    // #region agent log
    dbgImageService('A', 'wiki non-json body', {
      step,
      status: res.status,
      contentType: res.headers.get('content-type') ?? '',
      prefix: trimmed.slice(0, 120),
    });
    // #endregion
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    // #region agent log
    dbgImageService('B', 'wiki json parse error', {
      step,
      status: res.status,
      prefix: trimmed.slice(0, 120),
      err: String(e),
    });
    // #endregion
    return null;
  }
}

export async function fetchWikipediaImage(topicName: string): Promise<string | null> {
  const cacheKey = `wiki:${topicName}`;
  const cached = getCachedImage(cacheKey);
  if (cached !== undefined) return cached;

  const cleaned = topicName
    .replace(
      /^(Anatomy of|Physiology of|Pathology of|Mechanism of|Management of|Treatment of|Introduction to|Overview of)\s+/i,
      '',
    )
    .trim();

  async function searchWiki(query: string): Promise<string | null> {
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(query)}&prop=pageimages&format=json&pithumbsize=500&origin=*`;
      const response = await fetch(url, { headers: WIKI_API_HEADERS });
      const data = (await wikiApiJson(response, `searchWiki:${query.slice(0, 40)}`)) as {
        query?: { pages?: Record<string, { thumbnail?: { source?: string } }> };
      } | null;
      if (!data) return null;
      const pages = data?.query?.pages;
      if (!pages) return null;
      const pageId = Object.keys(pages)[0];
      if (pageId === '-1') return null;
      return pages[pageId]?.thumbnail?.source || null;
    } catch (e) {
      return null;
    }
  }

  // 1. Try exact match & cleaned match
  let url = await searchWiki(topicName);
  if (url) {
    setCachedImage(cacheKey, url);
    return url;
  }

  if (cleaned !== topicName) {
    url = await searchWiki(cleaned);
    if (url) {
      setCachedImage(cacheKey, url);
      return url;
    }
  }

  // 2. Wikipedia Search Match
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topicName)}&format=json&srlimit=1&origin=*`;
    const searchRes = await fetch(searchUrl, { headers: WIKI_API_HEADERS });
    const searchData = (await wikiApiJson(searchRes, 'wikiListSearch')) as {
      query?: { search?: Array<{ title?: string }> };
    } | null;
    if (!searchData) {
      throw new Error('wiki search empty or non-json');
    }
    const firstResult = searchData?.query?.search?.[0]?.title;
    if (firstResult) {
      url = await searchWiki(firstResult);
      if (url) {
        setCachedImage(cacheKey, url);
        return url;
      }
    }
  } catch (e) {
    if (__DEV__) console.debug('[imageService] Wikipedia list search failed:', e);
  }

  // 3. Wikimedia Commons Media (Files directly)
  try {
    const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleaned)}&srnamespace=6&format=json&origin=*&srlimit=1`;
    const commonsRes = await fetch(commonsUrl, { headers: WIKI_API_HEADERS });
    const commonsData = (await wikiApiJson(commonsRes, 'commonsListSearch')) as {
      query?: { search?: Array<{ title?: string }> };
    } | null;
    if (!commonsData) {
      throw new Error('commons search empty or non-json');
    }
    const fileTitle = commonsData?.query?.search?.[0]?.title;

    if (fileTitle) {
      const fileInfoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=url&iiurlwidth=500&format=json&origin=*`;
      const fileInfoRes = await fetch(fileInfoUrl, { headers: WIKI_API_HEADERS });
      const fileInfoData = (await wikiApiJson(fileInfoRes, 'commonsImageInfo')) as {
        query?: { pages?: Record<string, { imageinfo?: Array<{ thumburl?: string }> }> };
      } | null;
      if (!fileInfoData) {
        throw new Error('commons imageinfo empty or non-json');
      }
      const pages = fileInfoData?.query?.pages;
      if (pages) {
        const pageId = Object.keys(pages)[0];
        if (pageId !== '-1') {
          const thumbUrl = pages[pageId]?.imageinfo?.[0]?.thumburl || null;
          if (thumbUrl) setCachedImage(cacheKey, thumbUrl);
          return thumbUrl;
        }
      }
    }
  } catch (e) {
    if (__DEV__) console.debug('[imageService] Commons fallback failed:', e);
  }

  // 4. Ultimate Fallback: Return null to avoid rendering random irrelevant images.
  setCachedImage(cacheKey, null);
  return null;
}
