/**
 * Generates a cryptographically secure random string using hex encoding.
 * @param length The length of the resulting string.
 * @returns A secure random string.
 */
export function generateSecureRandomString(length: number): string {
  const byteCount = Math.ceil(length / 2);
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(byteCount));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}
