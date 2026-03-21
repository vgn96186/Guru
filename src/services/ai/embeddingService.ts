import { profileRepository } from '../../db/repositories';
import { getApiKeys } from './config';

/**
 * EmbeddingService — Generates semantic vectors for text.
 * Default: OpenAI text-embedding-3-small via OpenRouter.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const normalized = text.trim();
  if (!normalized) return null;

  const profile = await profileRepository.getProfile();
  const { orKey } = getApiKeys(profile);

  if (!orKey) {
    if (__DEV__)
      console.warn('[Embedding] No OpenRouter key found. Skipping embedding generation.');
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
      throw new Error(`Embedding failed: ${err}`);
    }

    const data = await response.json();
    const embedding = data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Embedding response did not include a vector');
    }
    return embedding;
  } catch (err) {
    if (__DEV__) console.warn('[Embedding] Error:', err);
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
