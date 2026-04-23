import { getDrizzleDb } from '../../db/drizzle';
import { topics, subjects } from '../../db/drizzleSchema';
import { sql, like, eq, inArray, isNotNull, and } from 'drizzle-orm';
import { queueTopicSuggestionInTx, updateTopicProgressInTx } from '../../db/queries/topics';
import { generateEmbedding, cosineSimilarity, blobToEmbedding } from '../ai/embeddingService';

/**
 * markTopicsFromLecture matching strategy:
 * 1. Exact match within detected subject
 * 2. LIKE contains within subject
 * 3. Reverse contains within subject (DB name inside AI topic string)
 * 4. Semantic matching fallback (Cosine similarity vs cached topic embeddings)
 * 5. Queue unmatched names for manual syllabus review
 */
export async function markTopicsFromLecture(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  _tx: any, // legacy param
  topicsList: string[],
  confidence: number,
  subjectName?: string,
  lectureSummary?: string,
  summaryEmbedding?: number[] | null,
) {
  if ((!topicsList || topicsList.length === 0) && !lectureSummary) return;

  const matchedTopicIds = new Set<number>();
  const unmatchedTopicNames: string[] = [];
  const seenNames = new Set<string>();
  const db = getDrizzleDb();

  // 1-3: Keyword matching (deduplicated)
  for (const topicName of topicsList) {
    const sanitized = topicName.trim().toLowerCase();
    if (!sanitized || seenNames.has(sanitized)) continue;
    seenNames.add(sanitized);

    const match = await findTopicIdByKeywords(db, sanitized, subjectName);
    if (match) {
      matchedTopicIds.add(match);
      await applyLectureProgressToTopic(_tx, match, confidence, true, lectureSummary);
    } else {
      // Store with title-like casing for display in syllabus
      const display = topicName.trim().replace(/\b\w/g, (c) => c.toUpperCase());
      unmatchedTopicNames.push(display);
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
            await applyLectureProgressToTopic(_tx, matchId, confidence, true, lectureSummary);
          }
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('[Matching] Semantic matching failed:', err);
    }
  }

  // 5: Queue unmatched lecture topics for manual review (if subject is known)
  if (unmatchedTopicNames.length > 0 && subjectName) {
    const subjectRows = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(sql`LOWER(${subjects.name}) = ${subjectName.toLowerCase()}`)
      .limit(1);

    if (subjectRows.length > 0) {
      for (const name of unmatchedTopicNames) {
        try {
          await queueTopicSuggestionInTx(_tx, subjectRows[0].id, name, lectureSummary);
          if (__DEV__) console.log(`[Matching] Queued topic suggestion from lecture: "${name}"`);
        } catch (err) {
          if (__DEV__) console.warn(`[Matching] Failed to queue topic suggestion "${name}":`, err);
        }
      }
    }
  }

  // Also mark parents as seen
  if (matchedTopicIds.size > 0) {
    const ids = Array.from(matchedTopicIds);
    const parentRows = await db
      .selectDistinct({ parentTopicId: topics.parentTopicId })
      .from(topics)
      .where(and(inArray(topics.id, ids), isNotNull(topics.parentTopicId)));

    for (const p of parentRows) {
      if (p.parentTopicId && !matchedTopicIds.has(p.parentTopicId)) {
        await applyLectureProgressToTopic(_tx, p.parentTopicId, confidence, false);
      }
    }
  }
}

/** Escape SQL LIKE wildcards so literal % and _ in topic names don't over-match. */
function escapeLikePattern(s: string): string {
  return s.replace(/[%_]/g, (c) => (c === '%' ? '\\%' : '\\_'));
}

async function findTopicIdByKeywords(
  db: ReturnType<typeof getDrizzleDb>,
  name: string,
  subjectName?: string,
): Promise<number | null> {
  // Exact match within subject
  if (subjectName) {
    const r1 = await db
      .select({ id: topics.id })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .where(
        and(
          sql`LOWER(${topics.name}) = ${name}`,
          sql`LOWER(${subjects.name}) = ${subjectName.toLowerCase()}`,
        ),
      )
      .limit(1);
    if (r1.length > 0) return r1[0].id;

    const likeName = escapeLikePattern(name);
    // LIKE contains: AI topic name inside DB topic name
    const r2 = await db
      .select({ id: topics.id })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .where(
        and(
          like(sql`LOWER(${topics.name})`, `%${likeName}%`),
          sql`LOWER(${subjects.name}) = ${subjectName.toLowerCase()}`,
        ),
      )
      .limit(1);
    if (r2.length > 0) return r2[0].id;

    // Reverse contains: DB topic name inside AI topic name (e.g. DB has "Mitral Valve", AI detected "Mitral Valve Prolapse")
    const r3 = await db
      .select({ id: topics.id })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .where(
        and(
          sql`${name} LIKE '%' || LOWER(${topics.name}) || '%'`,
          sql`LOWER(${subjects.name}) = ${subjectName.toLowerCase()}`,
          sql`LENGTH(${topics.name}) >= 4`,
        ),
      )
      .limit(1);
    if (r3.length > 0) return r3[0].id;
  }

  const r4 = await db
    .select({ id: topics.id })
    .from(topics)
    .where(sql`LOWER(${topics.name}) = ${name}`)
    .limit(1);
  if (r4.length > 0) return r4[0].id;

  return null;
}

const MAX_SEMANTIC_MATCHES = 10;
const MAX_SEMANTIC_CANDIDATES = 250;
const SEMANTIC_YIELD_EVERY = 32;

async function yieldToEventLoop(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function findSemanticMatches(
  db: ReturnType<typeof getDrizzleDb>,
  targetEmbedding: number[],
  subjectName?: string,
  threshold = 0.82,
): Promise<number[]> {
  let query = db.select({ id: topics.id, embedding: topics.embedding }).from(topics);
  if (subjectName) {
    query = query.innerJoin(subjects, eq(topics.subjectId, subjects.id)).where(
      and(sql`LOWER(${subjects.name}) = ${subjectName.toLowerCase()}`, isNotNull(topics.embedding)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    ) as any;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    query = query.where(isNotNull(topics.embedding)) as any;
  }

  const rows = await query.limit(MAX_SEMANTIC_CANDIDATES);
  const scored: Array<{ id: number; sim: number }> = [];

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!row.embedding) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    const topicVec = blobToEmbedding(row.embedding as any);
    const sim = cosineSimilarity(targetEmbedding, topicVec);
    if (sim >= threshold) {
      scored.push({ id: row.id, sim });
    }

    if ((index + 1) % SEMANTIC_YIELD_EVERY === 0) {
      await yieldToEventLoop();
    }
  }

  // Return top matches sorted by similarity (highest first), capped to avoid memory spikes
  return scored
    .sort((a, b) => b.sim - a.sim)
    .slice(0, MAX_SEMANTIC_MATCHES)
    .map((s) => s.id);
}

async function applyLectureProgressToTopic(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  _tx: any,
  topicId: number,
  confidence: number,
  isDirectMatch = true,
  summary?: string,
) {
  const status = 'seen';
  await updateTopicProgressInTx(
    _tx,
    topicId,
    status,
    confidence,
    0,
    isDirectMatch ? summary : undefined,
  );
}
