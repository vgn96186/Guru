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
  const status = 'seen';

  try {
    await db.execAsync('BEGIN TRANSACTION');

    // 1-3: Keyword matching
    for (const topicName of topics) {
      const sanitized = topicName.trim().toLowerCase();
      if (!sanitized) continue;

      const matches = await findTopicIdsByKeywordsBatched(db, [sanitized], subjectName);
      const match = matches.length > 0 ? matches[0].matchId : null;
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

    // Also mark parents as seen
    if (matchedTopicIds.size > 0) {
      const ids = Array.from(matchedTopicIds).join(',');
      const parents = await db.getAllAsync<{ parent_topic_id: number }>(
        `SELECT DISTINCT parent_topic_id FROM topics WHERE id IN (${ids}) AND parent_topic_id IS NOT NULL`,
      );
      for (const p of parents) {
        if (!matchedTopicIds.has(p.parent_topic_id)) {
          await applyLectureProgressToTopic(db, p.parent_topic_id, confidence, false);
        }
      }
    }

    await db.execAsync('COMMIT');
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}

async function findTopicIdsByKeywordsBatched(
  db: SQLiteDatabase,
  names: string[],
  subjectName?: string,
): Promise<{ topicName: string; matchId: number }[]> {
  const results: { topicName: string; matchId: number }[] = [];
  const unresolvedNames = new Set(names);

  if (subjectName) {
    const lowerSubject = subjectName.toLowerCase();

    // Priority 1: Exact match within subject
    if (unresolvedNames.size > 0) {
      const currentNames = Array.from(unresolvedNames);
      const placeholders = currentNames.map(() => '?').join(',');
      const exactMatches = await db.getAllAsync<{ id: number; name: string }>(
        `SELECT t.id, LOWER(t.name) as name FROM topics t
         JOIN subjects s ON t.subject_id = s.id
         WHERE LOWER(t.name) IN (${placeholders}) AND LOWER(s.name) = ?`,
        [...currentNames, lowerSubject]
      );

      for (const match of exactMatches) {
        if (unresolvedNames.has(match.name)) {
          results.push({ topicName: match.name, matchId: match.id });
          unresolvedNames.delete(match.name);
        }
      }
    }

    // Priority 2: LIKE match within subject
    if (unresolvedNames.size > 0) {
      const currentNames = Array.from(unresolvedNames);
      // Construct dynamic OR for LIKE
      const likeConditions = currentNames.map(() => 'LOWER(t.name) LIKE ?').join(' OR ');
      const likeParams = currentNames.map(name => `%${name}%`);

      const likeMatches = await db.getAllAsync<{ id: number; name: string }>(
        `SELECT t.id, LOWER(t.name) as name FROM topics t
         JOIN subjects s ON t.subject_id = s.id
         WHERE (${likeConditions}) AND LOWER(s.name) = ?`,
        [...likeParams, lowerSubject]
      );

      // Map back matches to the original search keyword
      // Loop over the search keywords first so that multiple keywords can match the same DB row
      for (const searchName of Array.from(unresolvedNames)) {
        for (const match of likeMatches) {
          if (match.name.includes(searchName)) {
            results.push({ topicName: searchName, matchId: match.id });
            unresolvedNames.delete(searchName);
            break; // We found the first matching DB row for this keyword, move to the next keyword
          }
        }
      }
    }
  }

  // Priority 3: Exact match globally
  if (unresolvedNames.size > 0) {
    const currentNames = Array.from(unresolvedNames);
    const placeholders = currentNames.map(() => '?').join(',');
    const globalExactMatches = await db.getAllAsync<{ id: number; name: string }>(
      `SELECT id, LOWER(name) as name FROM topics WHERE LOWER(name) IN (${placeholders})`,
      currentNames
    );

    for (const match of globalExactMatches) {
      if (unresolvedNames.has(match.name)) {
        results.push({ topicName: match.name, matchId: match.id });
        unresolvedNames.delete(match.name);
      }
    }
  }

  return results;
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

async function applyLectureProgressToTopic(
  _db: SQLiteDatabase,
  topicId: number,
  confidence: number,
  _isDirectMatch = true,
  summary?: string,
) {
  const status = 'seen';
  await updateTopicsProgressBatch([{ topicId, status, confidence, xpToAdd: 0, noteToAppend: summary }]);
}
