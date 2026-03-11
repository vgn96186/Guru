export function isTransientNetworkError(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();

  const nonRetryableMarkers = [
    'zod',
    'schema',
    'parse',
    'json',
    'invalid',
    'malformed',
  ];
  if (nonRetryableMarkers.some(marker => message.includes(marker))) {
    return false;
  }

  const transientMarkers = [
    '429',
    'timeout',
    'timed out',
    'network',
    'fetch',
    'econn',
    'rate limit',
    '503',
    '502',
    '500',
  ];
  return transientMarkers.some(marker => message.includes(marker));
}
