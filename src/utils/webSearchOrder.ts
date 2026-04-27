import { DEFAULT_WEB_SEARCH_ORDER, type WebSearchProviderId } from '../types';

/**
 * Validated web search provider list: unknown entries removed, every known provider
 * present once (missing ids appended in {@link DEFAULT_WEB_SEARCH_ORDER} order).
 */
export function sanitizeWebSearchOrder(value: unknown): WebSearchProviderId[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const allowed = new Set<WebSearchProviderId>(DEFAULT_WEB_SEARCH_ORDER);
  const next = value.filter(
    (item): item is WebSearchProviderId =>
      typeof item === 'string' && allowed.has(item as WebSearchProviderId),
  );
  for (const provider of DEFAULT_WEB_SEARCH_ORDER) {
    if (!next.includes(provider)) next.push(provider);
  }
  return next;
}
