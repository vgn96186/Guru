import { SQLiteDatabase } from 'expo-sqlite';
import { updateTopicsProgressBatch, TopicProgressUpdate } from '../../db/queries/topics';
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
  const updates: TopicProgressUpdate[] = [];

  const addUpdate = (id: number, confidenceVal: number, isDirectMatch: boolean) => {
    updates.push({
      topicId: id,
      status: 'seen',
      confidence: confidenceVal,
      xpToAdd: 0,
      noteToAppend: isDirectMatch ? lectureSummary : undefined,
    });
  };

  // 1-3: Keyword matching
  for (const topicName of topics) {
    const sanitized = topicName.trim().toLowerCase();
    if (!sanitized) continue;

    const match = await findTopicIdByKeywords(db, sanitized, subjectName);
    if (match) {
      matchedTopicIds.add(match);
      addUpdate(match, confidence, true);
    }
  }

  // 4: Semantic Matching (if summary available)
  if (lectureSummary) {
    try {
      const effectiveEmbedding = summaryEmbedding || (await generateEmbedding(lectureSummary));
      if (effectiveEmbedding) {
        const semanticMatches = await findSemanticMatches(db, effectiveEmbedding, subjectName);
        for (const matchId of semanticMatches) {
          if (!matchedTopicIds.has(matchId)) {
            matchedTopicIds.add(matchId);
            addUpdate(matchId, confidence, true);
          }
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('[Matching] Semantic matching failed:', err);
    }
  }

  // 5: Parent cascade
  if (matchedTopicIds.size > 0) {
    const ids = Array.from(matchedTopicIds).join(',');
    const parents = await db.getAllAsync<{ parent_topic_id: number }>(
      `SELECT DISTINCT parent_topic_id FROM topics WHERE id IN (${ids}) AND parent_topic_id IS NOT NULL`,
    );
    for (const p of parents) {
      if (!matchedTopicIds.has(p.parent_topic_id)) {
        addUpdate(p.parent_topic_id, confidence, false);
      }
    }
  }

  await updateTopicsProgressBatch(updates);
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

    const r2 = await db.getFirstAsync<{ id: number }>(
      `SELECT t.id FROM topics t 
       JOIN subjects s ON t.subject_id = s.id 
       WHERE LOWER(t.name) LIKE ? AND LOWER(s.name) = ? LIMIT 1`,
      [`%${name}%`, subjectName.toLowerCase()],
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
  const matchedIds: number[] = [];

  for (const row of rows) {
    const topicVec = blobToEmbedding(row.embedding);
    const sim = cosineSimilarity(targetEmbedding, topicVec);
    if (sim >= threshold) {
      matchedIds.push(row.id);
    }
  }
  return matchedIds;
}
