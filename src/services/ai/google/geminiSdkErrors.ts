import { RateLimitError } from '../schemas';

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Returns true if the SDK error should be treated as rate limiting (same as REST 429). */
export function isGeminiSdkRateLimitError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const code = (err as { code?: number; error?: { code?: number } })?.code;
  const nestedCode = (err as { error?: { code?: number } })?.error?.code;
  const msg = errorMessage(err);
  return (
    status === 429 ||
    code === 429 ||
    nestedCode === 429 ||
    /429|RESOURCE_EXHAUSTED|rate limit|quota/i.test(msg)
  );
}

/** Re-throws {@link RateLimitError} for rate limits; otherwise rethrows the original error. */
export function rethrowGeminiSdkError(err: unknown, model: string): never {
  if (isGeminiSdkRateLimitError(err)) {
    throw new RateLimitError(`Gemini rate limit on ${model}`);
  }
  throw err;
}
