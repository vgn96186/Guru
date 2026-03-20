import { generateSecureRandomString } from './cryptoUtils';

describe('cryptoUtils', () => {
  describe('generateSecureRandomString', () => {
    const originalCrypto = globalThis.crypto;

    beforeEach(() => {
      // Mock globalThis.crypto if not available in the environment
      if (!globalThis.crypto) {
        (globalThis as any).crypto = {
          getRandomValues: (arr: Uint8Array) => {
            for (let i = 0; i < arr.length; i++) {
              arr[i] = Math.floor(Math.random() * 256);
            }
            return arr;
          },
        };
      }
    });

    afterAll(() => {
      globalThis.crypto = originalCrypto;
    });

    it('returns a string of the requested length', () => {
      expect(generateSecureRandomString(10)).toHaveLength(10);
      expect(generateSecureRandomString(16)).toHaveLength(16);
      expect(generateSecureRandomString(32)).toHaveLength(32);
    });

    it('returns a valid hex string', () => {
      const result = generateSecureRandomString(64);
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns an empty string for length 0', () => {
      expect(generateSecureRandomString(0)).toBe('');
    });

    it('handles odd lengths', () => {
      const result = generateSecureRandomString(7);
      expect(result).toHaveLength(7);
      expect(result).toMatch(/^[0-9a-f]{7}$/);
    });

    it('produces different results on successive calls (basic randomness check)', () => {
      const s1 = generateSecureRandomString(16);
      const s2 = generateSecureRandomString(16);
      expect(s1).not.toBe(s2);
    });
  });
});
