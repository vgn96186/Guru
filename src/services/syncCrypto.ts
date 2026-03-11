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
 * Wire format (v2, JSON):
 *   { v: 2, iv: "<base64>", ct: "<base64>", ts: <epoch_ms>, msgId: "<hex>" }
 * where AAD is JSON.stringify({ v: 2, ts, msgId }).
 *
 * Backward compatibility:
 * - decrypt still accepts v1 envelopes without AAD.
 *
 * Graceful degradation: decryption errors are caught and the message is
 * silently dropped (could be a stale plain-text message from an old client).
 */

const SALT = new TextEncoder().encode('guru-sync-v2'); // non-secret, version-locked
const ITERATIONS = 100_000;

let _cachedKey: CryptoKey | null = null;
let _cachedCode: string | null = null;

export interface DecryptedSyncPayload {
  payload: object;
  ts: number | null;
  msgId: string | null;
  version: 1 | 2;
}

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
  const g = globalThis as any;
  if (typeof g.btoa === 'function') {
    return g.btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }
  return g.Buffer.from(new Uint8Array(buffer)).toString('base64');
}

function fromBase64(b64: string): ArrayBuffer {
  const g = globalThis as any;
  const binary = typeof g.atob === 'function'
    ? g.atob(b64)
    : g.Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

function randomMessageId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Encrypt `payload` using AES-GCM with a key derived from `syncCode`.
 * Returns a JSON string suitable for publishing to MQTT.
 */
export async function encryptPayload(syncCode: string, payload: object): Promise<string> {
  const key = await getDerivedKey(syncCode);
  const ts = Date.now();
  const msgId = randomMessageId();
  const aadObj = { v: 2 as const, ts, msgId };
  const ivBytes = globalThis.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const iv = ivBytes.buffer as ArrayBuffer;
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const plaintext = encoded.buffer as ArrayBuffer;
  const aad = new TextEncoder().encode(JSON.stringify(aadObj));

  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    plaintext,
  );

  return JSON.stringify({
    v: 2,
    iv: toBase64(iv),
    ct: toBase64(ciphertext),
    ts,
    msgId,
  });
}

/**
 * Decrypt an envelope produced by `encryptPayload`.
 * Returns the parsed payload object, or `null` if decryption fails
 * (stale message, wrong key, or malformed envelope).
 */
export async function decryptPayload(syncCode: string, envelope: string): Promise<DecryptedSyncPayload | null> {
  try {
    const parsedEnvelope = JSON.parse(envelope) as {
      v?: number;
      iv?: string;
      ct?: string;
      ts?: number;
      msgId?: string;
    };
    const { v, iv: ivB64, ct: ctB64 } = parsedEnvelope;
    if ((v !== 1 && v !== 2) || !ivB64 || !ctB64) return null;

    const key = await getDerivedKey(syncCode);
    const iv = fromBase64(ivB64);
    const ciphertext = fromBase64(ctB64);
    const aad = v === 2
      ? new TextEncoder().encode(JSON.stringify({
          v: 2 as const,
          ts: parsedEnvelope.ts,
          msgId: parsedEnvelope.msgId,
        }))
      : undefined;

    const plaintext = await globalThis.crypto.subtle.decrypt(
      aad
        ? { name: 'AES-GCM', iv, additionalData: aad }
        : { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );

    const payload = JSON.parse(new TextDecoder().decode(plaintext)) as object;
    return {
      payload,
      ts: v === 2 ? (typeof parsedEnvelope.ts === 'number' ? parsedEnvelope.ts : null) : null,
      msgId: v === 2 ? (typeof parsedEnvelope.msgId === 'string' ? parsedEnvelope.msgId : null) : null,
      version: v as 1 | 2,
    };
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
