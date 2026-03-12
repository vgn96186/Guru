import { SQLiteDatabase } from 'expo-sqlite';
import { getDb } from '../../db/database';
import { updateTopicProgress } from '../../db/queries/topics';

/**
 * markTopicsFromLecture matching strategy (5 levels):
 * 1. Exact match within detected subject
 * 2. LIKE contains within subject
 * 3. Reverse contains within subject (DB name inside AI topic string)
 * 4. Cross-subject exact match fallback
 * 5. Cross-subject LIKE fallback
 */
export async function markTopicsFromLecture(
  db: SQLiteDatabase,
  topics: string[],
  confidence: number,
  subjectName?: string,
) {
  if (!topics || topics.length === 0) return;

  const matchedTopicIds = new Set<number>();

  for (const topicName of topics) {
    const sanitized = topicName.trim().toLowerCase();
    if (!sanitized) continue;

    let match = await findTopicId(db, sanitized, subjectName);
    if (match) {
      matchedTopicIds.add(match);
      await applyLectureProgressToTopic(db, match, confidence);
    }
  }

  // Also mark parents as seen
  if (matchedTopicIds.size > 0) {
    const ids = Array.from(matchedTopicIds).join(',');
    const parents = await db.getAllAsync<{ parent_topic_id: number }>(
      `SELECT DISTINCT parent_topic_id FROM topics WHERE id IN (${ids}) AND parent_topic_id IS NOT NULL`
    );
    for (const p of parents) {
      if (!matchedTopicIds.has(p.parent_topic_id)) {
        await applyLectureProgressToTopic(db, p.parent_topic_id, confidence, false);
      }
    }
  }
}

async function findTopicId(db: SQLiteDatabase, name: string, subjectName?: string): Promise<number | null> {
  // 1. Exact match within subject
  if (subjectName) {
    const r1 = await db.getFirstAsync<{ id: number }>(
      `SELECT t.id FROM topics t 
       JOIN subjects s ON t.subject_id = s.id 
       WHERE LOWER(t.name) = ? AND LOWER(s.name) = ? LIMIT 1`,
      [name, subjectName.toLowerCase()]
    );
    if (r1) return r1.id;

    // 2. LIKE match within subject
    const r2 = await db.getFirstAsync<{ id: number }>(
      `SELECT t.id FROM topics t 
       JOIN subjects s ON t.subject_id = s.id 
       WHERE LOWER(t.name) LIKE ? AND LOWER(s.name) = ? LIMIT 1`,
      [`%${name}%`, subjectName.toLowerCase()]
    );
    if (r2) return r2.id;

    // 3. Reverse LIKE match
    const r3 = await db.getFirstAsync<{ id: number }>(
      `SELECT t.id FROM topics t 
       JOIN subjects s ON t.subject_id = s.id 
       WHERE ? LIKE '%' || LOWER(t.name) || '%' AND LOWER(s.name) = ? LIMIT 1`,
      [name, subjectName.toLowerCase()]
    );
    if (r3) return r3.id;
  }

  // 4. Cross-subject exact
  const r4 = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM topics WHERE LOWER(name) = ? LIMIT 1',
    [name]
  );
  if (r4) return r4.id;

  // 5. Cross-subject LIKE
  const r5 = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM topics WHERE LOWER(name) LIKE ? LIMIT 1',
    [`%${name}%`]
  );
  if (r5) return r5.id;

  return null;
}

async function applyLectureProgressToTopic(
  db: SQLiteDatabase,
  topicId: number,
  confidence: number,
  isDirectMatch = true,
) {
  const status = isDirectMatch ? (confidence >= 2 ? 'seen' : 'seen') : 'seen'; 
  // Simplified: just update progress using existing query logic but adapted for direct DB call if needed.
  // We use the exported updateTopicProgress but it expects an XP amount.
  // For lecture matches, we award XP in the persistence layer, so we pass 0 here.
  await updateTopicProgress(topicId, status, confidence, 0);
}
