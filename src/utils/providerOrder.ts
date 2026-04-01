import { DEFAULT_PROVIDER_ORDER, type ProviderId } from '../types';

/**
 * Validated provider list: unknown entries removed, every known provider present once
 * (missing ids appended in {@link DEFAULT_PROVIDER_ORDER} order).
 */
export function sanitizeProviderOrder(value: unknown): ProviderId[] {
  if (!Array.isArray(value)) return [...DEFAULT_PROVIDER_ORDER];
  const allowed = new Set<ProviderId>(DEFAULT_PROVIDER_ORDER);
  const next = value.filter(
    (item): item is ProviderId => typeof item === 'string' && allowed.has(item as ProviderId),
  );
  for (const provider of DEFAULT_PROVIDER_ORDER) {
    if (!next.includes(provider)) next.push(provider);
  }
  return next;
}
