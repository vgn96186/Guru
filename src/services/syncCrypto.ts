/**
 * Sync Payload Encryption
 *
 * Derives a per-session AES-GCM-256 key from the user's sync code using
 * PBKDF2 (100,000 iterations, SHA-256). All MQTT messages are encrypted
 * so that observers on the public broker cannot read study habits or
 * doomscroll events — even if they subscribe to the same topic.
 *
 * Key derivation is cached in module scope so it is only computed once
 * per `connectToRoom()` call.
 *
 * Wire format (JSON):
 *   { v: 1, iv: "<base64>", ct: "<base64>" }
 *
 * Graceful degradation: decryption errors are caught and the message is
 * silently dropped (could be a stale plain-text message from an old client).
 */

const SALT = new TextEncoder().encode('guru-sync-v2'); // non-secret, version-locked
const ITERATIONS = 100_000;

let _cachedKey: CryptoKey | null = null;
let _cachedCode: string | null = null;

async function getDerivedKey(syncCode: string): Promise<CryptoKey> {
  if (_cachedKey && _cachedCode === syncCode) return _cachedKey;

  const raw = new TextEncoder().encode(syncCode);
  const base = await globalThis.crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  const key = await globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: SALT,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  _cachedKey = key;
  _cachedCode = syncCode;
  return key;
}

function toBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function fromBase64(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

/**
 * Encrypt `payload` using AES-GCM with a key derived from `syncCode`.
 * Returns a JSON string suitable for publishing to MQTT.
 */
export async function encryptPayload(syncCode: string, payload: object): Promise<string> {
  const key = await getDerivedKey(syncCode);
  const ivBytes = globalThis.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const iv = ivBytes.buffer as ArrayBuffer;
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const plaintext = encoded.buffer as ArrayBuffer;

  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  );

  return JSON.stringify({
    v: 1,
    iv: toBase64(iv),
    ct: toBase64(ciphertext),
  });
}

/**
 * Decrypt an envelope produced by `encryptPayload`.
 * Returns the parsed payload object, or `null` if decryption fails
 * (stale message, wrong key, or malformed envelope).
 */
export async function decryptPayload(syncCode: string, envelope: string): Promise<object | null> {
  try {
    const { v, iv: ivB64, ct: ctB64 } = JSON.parse(envelope);
    if (v !== 1 || !ivB64 || !ctB64) return null;

    const key = await getDerivedKey(syncCode);
    const iv = fromBase64(ivB64);
    const ciphertext = fromBase64(ctB64);

    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );

    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    // Stale plain-text message from old client, wrong room, or genuine tampering
    return null;
  }
}

/** Evict the cached key (call when the user changes their sync code). */
export function clearKeyCache(): void {
  _cachedKey = null;
  _cachedCode = null;
}
