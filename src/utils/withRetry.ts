import { RateLimitError } from '../services/ai/schemas';

export interface RetryOptions {
  /** Max number of retries (not counting the initial attempt). Default: 2 */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. Default: 1000 */
  baseDelayMs?: number;
  /** Max delay cap in ms. Default: 10000 */
  maxDelayMs?: number;
  /** Predicate: should this error trigger a retry? */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Callback on each retry (for logging). */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const DEFAULT_SHOULD_RETRY = (error: unknown): boolean => {
  if (error instanceof RateLimitError) return true;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (/\b(502|503|504)\b/.test(msg)) return true;
    if (/timeout|econnreset|socket hang up|network/i.test(msg)) return true;
  }
  return false;
};

export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const maxRetries = options?.maxRetries ?? 2;
  const baseDelay = options?.baseDelayMs ?? 1000;
  const maxDelay = options?.maxDelayMs ?? 10000;
  const shouldRetry = options?.shouldRetry ?? DEFAULT_SHOULD_RETRY;
  const onRetry = options?.onRetry;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && shouldRetry(err, attempt)) {
        const jitter = Math.random() * 0.3 + 0.85;
        const delay = Math.min(baseDelay * Math.pow(2, attempt) * jitter, maxDelay);
        onRetry?.(err, attempt + 1, delay);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
