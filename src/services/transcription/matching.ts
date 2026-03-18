import { SQLiteDatabase } from 'expo-sqlite';
import { updateTopicProgressInTx } from '../../db/queries/topics';
import { generateEmbedding, cosineSimilarity, blobToEmbedding } from '../ai/embeddingService';

/**
 * markTopicsFromLecture matching strategy:
 * 1. Exact match within detected subject
 * 2. LIKE contains within subject
 * 3. Reverse contains within subject (DB name inside AI topic string)
 * 4. Semantic matching fallback (Cosine similarity vs cached topic embeddings)
 * 5. Cross-subject fallback
 */
export async function markTopicsFromLecture(
  db: SQLiteDatabase,
  topics: string[],
  confidence: number,
  subjectName?: string,
  lectureSummary?: string,
  summaryEmbedding?: number[] | null,
) {
  if ((!topics || topics.length === 0) && !lectureSummary) return;

  const matchedTopicIds = new Set<number>();

  // 1-3: Keyword matching
  for (const topicName of topics) {
    const sanitized = topicName.trim().toLowerCase();
    if (!sanitized) continue;

    const match = await findTopicIdByKeywords(db, sanitized, subjectName);
    if (match) {
      matchedTopicIds.add(match);
      await applyLectureProgressToTopic(db, match, confidence, true, lectureSummary);
    }
  }

  // 4: Semantic Matching (if summary available)
  if (lectureSummary) {
    try {
      const effectiveEmbedding =
        summaryEmbedding === undefined ? await generateEmbedding(lectureSummary) : summaryEmbedding;
      if (effectiveEmbedding) {
        const semanticMatches = await findSemanticMatches(db, effectiveEmbedding, subjectName);
        for (const matchId of semanticMatches) {
          if (!matchedTopicIds.has(matchId)) {
            matchedTopicIds.add(matchId);
            await applyLectureProgressToTopic(db, matchId, confidence, true, lectureSummary);
          }
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('[Matching] Semantic matching failed:', err);
    }
  }

  // Also mark parents as seen (parameterized to avoid SQL injection)
  if (matchedTopicIds.size > 0) {
    const ids = Array.from(matchedTopicIds);
    const placeholders = ids.map(() => '?').join(',');
    const parents = await db.getAllAsync<{ parent_topic_id: number }>(
      `SELECT DISTINCT parent_topic_id FROM topics WHERE id IN (${placeholders}) AND parent_topic_id IS NOT NULL`,
      ids,
    );
    for (const p of parents) {
      if (!matchedTopicIds.has(p.parent_topic_id)) {
        await applyLectureProgressToTopic(db, p.parent_topic_id, confidence, false);
      }
    }
  }
}

/** Escape SQL LIKE wildcards so literal % and _ in topic names don't over-match. */
function escapeLikePattern(s: string): string {
  return s.replace(/[%_]/g, (c) => (c === '%' ? '\\%' : '\\_'));
}

async function findTopicIdByKeywords(
  db: SQLiteDatabase,
  name: string,
  subjectName?: string,
): Promise<number | null> {
  // Exact match within subject
  if (subjectName) {
    const r1 = await db.getFirstAsync<{ id: number }>(
      `SELECT t.id FROM topics t 
       JOIN subjects s ON t.subject_id = s.id 
       WHERE LOWER(t.name) = ? AND LOWER(s.name) = ? LIMIT 1`,
      [name, subjectName.toLowerCase()],
    );
    if (r1) return r1.id;

    const likeName = escapeLikePattern(name);
    const r2 = await db.getFirstAsync<{ id: number }>(
      `SELECT t.id FROM topics t 
       JOIN subjects s ON t.subject_id = s.id 
       WHERE LOWER(t.name) LIKE ? ESCAPE '\\' AND LOWER(s.name) = ? LIMIT 1`,
      [`%${likeName}%`, subjectName.toLowerCase()],
    );
    if (r2) return r2.id;
  }

  const r4 = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM topics WHERE LOWER(name) = ? LIMIT 1',
    [name],
  );
  if (r4) return r4.id;

  return null;
}

const MAX_SEMANTIC_MATCHES = 10;

async function findSemanticMatches(
  db: SQLiteDatabase,
  targetEmbedding: number[],
  subjectName?: string,
  threshold = 0.82,
): Promise<number[]> {
  const query = subjectName
    ? `SELECT t.id, t.embedding FROM topics t JOIN subjects s ON t.subject_id = s.id WHERE LOWER(s.name) = ? AND t.embedding IS NOT NULL`
    : `SELECT id, embedding FROM topics WHERE embedding IS NOT NULL`;
  const params = subjectName ? [subjectName.toLowerCase()] : [];

  const rows = await db.getAllAsync<{ id: number; embedding: Uint8Array }>(query, params);
  const scored: Array<{ id: number; sim: number }> = [];

  for (const row of rows) {
    const topicVec = blobToEmbedding(row.embedding);
    const sim = cosineSimilarity(targetEmbedding, topicVec);
    if (sim >= threshold) {
      scored.push({ id: row.id, sim });
    }
  }

  // Return top matches sorted by similarity (highest first), capped to avoid memory spikes
  return scored
    .sort((a, b) => b.sim - a.sim)
    .slice(0, MAX_SEMANTIC_MATCHES)
    .map((s) => s.id);
}

async function applyLectureProgressToTopic(
  db: SQLiteDatabase,
  topicId: number,
  confidence: number,
  isDirectMatch = true,
  summary?: string,
) {
  const status = 'seen';
  await updateTopicProgressInTx(
    db,
    topicId,
    status,
    confidence,
    0,
    isDirectMatch ? summary : undefined,
  );
}
