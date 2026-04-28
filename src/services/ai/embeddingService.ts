import * as SQLite from 'expo-sqlite';
import { profileRepository } from '../../db/repositories';
import { getDb } from '../../db/database';
import { getApiKeys } from './config';

/**
 * EmbeddingService — Generates semantic vectors for text.
 * Default: OpenAI text-embedding-3-small via OpenRouter.
 *
 * Gemini `embedContent` is intentionally not mixed in here: stored vectors are not
 * dimension-compatible without a one-time re-embed migration (see product plan / Phase 5).
 */
let _geminiEmbeddingQuotaExceeded = false;
let _openRouterEmbeddingFailCount = 0;
const OPENROUTER_EMBEDDING_FAIL_THRESHOLD = 2;
let _geminiEmbeddingFailCount = 0;
const GEMINI_EMBEDDING_FAIL_THRESHOLD = 2;
let _jinaEmbeddingFailCount = 0;
const JINA_EMBEDDING_FAIL_THRESHOLD = 2;

/** Serialize embedding work so session circuit state and logging stay coherent under concurrency. */
let _embeddingMutexChain: Promise<void> = Promise.resolve();

async function withEmbeddingMutex<T>(task: () => Promise<T>): Promise<T> {
  const previous = _embeddingMutexChain;
  let release!: () => void;
  _embeddingMutexChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    release();
  }
}

/** After Jina returns 401/403, skip further Jina calls this session (optional provider). */
let _jinaDisabledForSession = false;

let _embeddingOptionalNoticeLogged = false;
let _jinaNonAuthErrorLogged = false;

function logEmbeddingDegradedOnce(message: string): void {
  if (!__DEV__ || _embeddingOptionalNoticeLogged) return;
  _embeddingOptionalNoticeLogged = true;
  console.log(message);
}

/** Test helper — Jest runs many cases in one worker; module state must not leak across tests. */
export function __resetEmbeddingSessionStateForTests(): void {
  _geminiEmbeddingFailCount = 0;
  _geminiEmbeddingQuotaExceeded = false;
  _openRouterEmbeddingFailCount = 0;
  _jinaEmbeddingFailCount = 0;
  _jinaDisabledForSession = false;
  _embeddingOptionalNoticeLogged = false;
  _jinaNonAuthErrorLogged = false;
  _embeddingMutexChain = Promise.resolve();
}

export function generateEmbedding(text: string): Promise<number[] | null> {
  return withEmbeddingMutex(() => generateEmbeddingCore(text));
}

async function generateEmbeddingCore(text: string): Promise<number[] | null> {
  const normalized = text.trim();
  if (!normalized) return null;

  const profile = await profileRepository.getProfile();
  const { orKey, geminiKey, jinaKey } = getApiKeys(profile);

  const preferredProvider = profile.embeddingProvider || 'gemini';
  const preferredModel = profile.embeddingModel || 'models/text-embedding-004';

  const tryGemini = async (modelToUse: string): Promise<number[] | null> => {
    if (!geminiKey || _geminiEmbeddingQuotaExceeded) return null;
    try {
      // For Gemini, we might receive the model as 'models/text-embedding-004' or similar
      const apiModel = modelToUse.startsWith('models/') ? modelToUse : `models/${modelToUse}`;
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${apiModel}:embedContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: apiModel,
            content: { parts: [{ text: normalized.slice(0, 10000) }] },
            outputDimensionality: 768,
          }),
        },
      );

      if (response.ok) {
        _geminiEmbeddingFailCount = 0;
        const data = await response.json();
        const vector = data?.embedding?.values;
        if (Array.isArray(vector) && vector.length > 0) {
          if (__DEV__)
            console.log(`[Embedding] Gemini success: ${apiModel} (${vector.length} dims)`);
          return vector;
        }
      } else {
        if (response.status === 429) {
          _geminiEmbeddingFailCount++;
          if (_geminiEmbeddingFailCount >= GEMINI_EMBEDDING_FAIL_THRESHOLD) {
            _geminiEmbeddingQuotaExceeded = true;
            if (__DEV__)
              console.log(
                '[Embedding] Gemini quota exhausted. Falling back permanently for this session.',
              );
          }
        }
        const err = await response.text();
        if (__DEV__) console.log(`[Embedding] Gemini endpoint failed (${response.status}):`, err);
      }
    } catch (err) {
      if (__DEV__) console.log('[Embedding] Gemini exception:', err);
    }
    return null;
  };

  const tryOpenRouter = async (modelToUse: string): Promise<number[] | null> => {
    if (!orKey || _openRouterEmbeddingFailCount >= OPENROUTER_EMBEDDING_FAIL_THRESHOLD) return null;
    try {
      const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${orKey}`,
        },
        body: JSON.stringify({
          model: modelToUse,
          input: normalized.slice(0, 8000),
        }),
      });

      if (response.ok) {
        _openRouterEmbeddingFailCount = 0;
        const data = await response.json();
        const embedding = data?.data?.[0]?.embedding;
        if (Array.isArray(embedding) && embedding.length > 0) {
          if (__DEV__)
            console.log(`[Embedding] OpenRouter success: ${modelToUse} (${embedding.length} dims)`);
          return embedding;
        }
      } else {
        if (response.status === 401 || response.status === 403 || response.status === 429) {
          _openRouterEmbeddingFailCount++;
        }
        if (__DEV__) console.log(`[Embedding] OpenRouter ${response.status}, skipping`);
      }
    } catch {
      // Network error
    }
    return null;
  };

  const tryJina = async (modelToUse: string): Promise<number[] | null> => {
    if (_jinaDisabledForSession) return null;
    try {
      const jinaBody = JSON.stringify({
        model: modelToUse,
        task: 'text-matching',
        input: [normalized.slice(0, 8192)],
        dimensions: 768,
      });

      const jinaFetch = (withAuth: boolean) =>
        fetch('https://api.jina.ai/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(withAuth && jinaKey ? { Authorization: `Bearer ${jinaKey}` } : {}),
          },
          body: jinaBody,
        });

      let response = await jinaFetch(!!jinaKey);
      if (response.status === 401 && jinaKey) {
        if (__DEV__)
          console.log('[Embedding] Jina 401 with stored key; retrying without Authorization');
        response = await jinaFetch(false);
      }

      if (response.ok) {
        _jinaEmbeddingFailCount = 0;
        const data = await response.json();
        const embedding = data?.data?.[0]?.embedding;
        if (Array.isArray(embedding) && embedding.length > 0) {
          if (__DEV__)
            console.log(`[Embedding] Jina success: ${modelToUse} (${embedding.length} dims)`);
          return embedding;
        }
        if (__DEV__) console.log('[Embedding] Jina OK but missing embedding array');
        return null;
      }

      const st = response.status;
      if (st === 401 || st === 403) {
        _jinaEmbeddingFailCount++;
        _jinaDisabledForSession = true;
        logEmbeddingDegradedOnce(
          '[Embedding] Jina embeddings unavailable (auth/quota). Semantic search falls back to text matching until a valid key or another provider is configured.',
        );
      } else if (__DEV__ && !_jinaNonAuthErrorLogged) {
        _jinaNonAuthErrorLogged = true;
        console.log('[Embedding] Jina failed:', st);
      }
    } catch (err) {
      if (__DEV__) console.log('[Embedding] Jina exception:', err);
    }
    return null;
  };

  let result: number[] | null = null;

  // 1. Try Preferred Provider
  if (preferredProvider === 'gemini' && geminiKey) {
    result = await tryGemini(preferredModel);
  } else if (preferredProvider === 'openrouter' && orKey) {
    result = await tryOpenRouter(preferredModel);
  } else if (preferredProvider === 'jina') {
    result = await tryJina(preferredModel);
  }

  if (result) return result;

  // 2. Fallbacks (if primary failed or key missing)
  if (preferredProvider !== 'gemini' && geminiKey && !_geminiEmbeddingQuotaExceeded) {
    result = await tryGemini('models/text-embedding-004');
    if (result) return result;
  }

  if (
    preferredProvider !== 'openrouter' &&
    orKey &&
    _openRouterEmbeddingFailCount < OPENROUTER_EMBEDDING_FAIL_THRESHOLD
  ) {
    result = await tryOpenRouter('openai/text-embedding-3-small');
    if (result) return result;
  }

  if (preferredProvider !== 'jina' && !_jinaDisabledForSession) {
    result = await tryJina('jina-embeddings-v3');
    if (result) return result;
  }

  logEmbeddingDegradedOnce(
    '[Embedding] No embedding vector this session; topic search uses text matching where needed.',
  );
  return null;
}

let _embeddingSeedTask: Promise<void> | null = null;

export function startMissingTopicEmbeddingSeed(): void {
  if (_embeddingSeedTask) return;
  const db = getDb();
  _embeddingSeedTask = seedMissingTopicEmbeddings(db)
    .catch((e) => {
      if (__DEV__) console.log('[DB] Embedding pre-seed failed:', e);
    })
    .finally(() => {
      _embeddingSeedTask = null;
    });
}

async function seedMissingTopicEmbeddings(db: SQLite.SQLiteDatabase) {
  const rows = await db.getAllAsync<{ id: number; name: string }>(
    'SELECT id, name FROM topics WHERE embedding IS NULL LIMIT 20',
  );
  if (rows.length === 0) return;

  if (__DEV__) console.log(`[DB] Pre-seeding ${rows.length} topic embeddings...`);

  for (const row of rows) {
    try {
      const vec = await generateEmbedding(row.name);
      if (!vec) continue;
      await db.runAsync('UPDATE topics SET embedding = ? WHERE id = ?', [
        embeddingToBlob(vec),
        row.id,
      ]);
    } catch (e) {
      if (__DEV__) console.log(`[DB] Failed to embed topic ${row.name}:`, e);
    }
  }
}

/**
 * Calculates cosine similarity between two vectors.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const length = Math.min(vecA.length, vecB.length);
  if (length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Helpers for storage/retrieval (SQLite BLOB)
 */
export function embeddingToBlob(embedding: number[]): Uint8Array {
  return new Uint8Array(new Float32Array(embedding).buffer);
}

export function blobToEmbedding(blob: Uint8Array): number[] {
  return Array.from(new Float32Array(blob.buffer));
}
