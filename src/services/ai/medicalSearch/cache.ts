const IMAGE_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const imageSearchCache = new Map<string, { url: string | null; expiresAt: number }>();

export function getCachedImageSearch(query: string): string | null | undefined {
  const entry = imageSearchCache.get(query);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    imageSearchCache.delete(query);
    return undefined;
  }
  return entry.url;
}

export function setCachedImageSearch(query: string, url: string | null): void {
  imageSearchCache.set(query, { url, expiresAt: Date.now() + IMAGE_SEARCH_CACHE_TTL_MS });
}
