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
  const { orKey } = getApiKeys(profile);

  if (!orKey) {
    return null;
  }

  // target: text-embedding-3-small
  try {
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orKey}`,
      },
      body: JSON.stringify({
        model: 'openai/text-embedding-3-small',
        input: normalized.slice(0, 8000), // OpenAI limit roughly
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 401 || response.status === 403) {
        _embeddingFailCount++;
        if (_embeddingFailCount >= EMBEDDING_FAIL_THRESHOLD && __DEV__) {
          console.warn('[Embedding] Auth failed repeatedly — disabling for this session.');
        }
      }
      throw new Error(`Embedding failed: ${err}`);
    }

    _embeddingFailCount = 0; // Reset on success
    const data = await response.json();
    const embedding = data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Embedding response did not include a vector');
    }
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
