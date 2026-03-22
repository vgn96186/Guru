import { profileRepository } from '../../db/repositories';
import { getApiKeys } from './config';

/**
 * EmbeddingService — Generates semantic vectors for text.
 * Default: OpenAI text-embedding-3-small via OpenRouter.
 *
 * Gemini `embedContent` is intentionally not mixed in here: stored vectors are not
 * dimension-compatible without a one-time re-embed migration (see product plan / Phase 5).
 */
let _embeddingFailCount = 0;
const EMBEDDING_FAIL_THRESHOLD = 2;

export async function generateEmbedding(text: string): Promise<number[] | null> {
  // Circuit breaker: stop trying after repeated auth failures this session
  if (_embeddingFailCount >= EMBEDDING_FAIL_THRESHOLD) return null;

  const normalized = text.trim();
  if (!normalized) return null;

  const profile = await profileRepository.getProfile();
  const { orKey, geminiKey } = getApiKeys(profile);

  // 1. Primary: Use Gemini (text-embedding-004) if key is present (High quality, high free quota)
  if (geminiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/gemini-embedding-001',
            content: { parts: [{ text: normalized.slice(0, 10000) }] },
            // Matryoshka learning supports scaling dimensions. 
            // 768 is a good balance, or leave default (3072). 
            // We'll use 768 as it's the most common stable dimension for this model series.
            outputDimensionality: 768,
          }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        const vector = data?.embedding?.values;
        if (Array.isArray(vector) && vector.length > 0) {
          if (__DEV__) console.log(`[Embedding] Gemini success: 004 (${vector.length} dims)`);
          return vector;
        }
      } else {
        const err = await response.text();
        if (__DEV__) console.warn('[Embedding] Gemini endpoint failed, trying OpenRouter:', err);
      }
    } catch (err) {
      if (__DEV__) console.warn('[Embedding] Gemini exception:', err);
    }
  }

  // 2. Fallback: OpenRouter OpenAI text-embedding-3-small (Requires credits)
  if (!orKey) return null;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orKey}`,
      },
      body: JSON.stringify({
        model: 'openai/text-embedding-3-small',
        input: normalized.slice(0, 8000),
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 402) {
        if (__DEV__) console.warn('[Embedding] OpenRouter insufficient credits (402).');
      }
      if (response.status === 401 || response.status === 403) {
        _embeddingFailCount++;
      }
      throw new Error(`Embedding failed: ${err}`);
    }

    _embeddingFailCount = 0;
    const data = await response.json();
    const embedding = data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Embedding response did not include a vector');
    }
    if (__DEV__) console.log(`[Embedding] OpenRouter success: text-3-small (${embedding.length} dims)`);
    return embedding;
  } catch (err) {
    if (__DEV__ && _embeddingFailCount < EMBEDDING_FAIL_THRESHOLD + 1)
      console.warn('[Embedding] Error:', err);
    return null;
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
