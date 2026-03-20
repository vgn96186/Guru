import { isTransientNetworkError } from './offlineQueueErrors';

describe('offlineQueueErrors', () => {
  describe('isTransientNetworkError', () => {
    it('returns true for common network error markers', () => {
      expect(isTransientNetworkError(new Error('Network request failed'))).toBe(true);
      expect(isTransientNetworkError(new Error('The request timed out'))).toBe(true);
      expect(isTransientNetworkError('Failed to fetch')).toBe(true);
      expect(isTransientNetworkError('ECONNRESET')).toBe(true);
    });

    it('returns true for retryable HTTP status codes', () => {
      expect(isTransientNetworkError('Error: 429 Too Many Requests')).toBe(true);
      expect(isTransientNetworkError('Error: 503 Service Unavailable')).toBe(true);
      expect(isTransientNetworkError('Error: 502 Bad Gateway')).toBe(true);
      expect(isTransientNetworkError('Error: 500 Internal Server Error')).toBe(true);
    });

    it('returns true for rate limits', () => {
      expect(isTransientNetworkError('Rate limit exceeded')).toBe(true);
    });

    it('returns false for non-retryable errors (e.g. Zod validation)', () => {
      expect(isTransientNetworkError(new Error('Zod validation error'))).toBe(false);
      expect(isTransientNetworkError(new Error('Invalid JSON payload'))).toBe(false);
      expect(isTransientNetworkError('Malformed request')).toBe(false);
      expect(isTransientNetworkError('Schema mismatch')).toBe(false);
    });

    it('returns false for unknown error types that dont match markers', () => {
      expect(isTransientNetworkError(new Error('Something went very wrong'))).toBe(false);
      expect(isTransientNetworkError({})).toBe(false);
    });

    it('handles non-string inputs gracefully', () => {
      expect(isTransientNetworkError(404)).toBe(false);
      expect(isTransientNetworkError(null)).toBe(false);
    });
  });
});
