import { getDb, runInTransaction, todayStr } from '../database';
import type { Subject, Topic, TopicProgress, TopicWithProgress } from '../../types';
import { getInitialCard, reviewCardFromConfidence } from '../../services/fsrsService';
import type { Card } from 'ts-fsrs';

// Removed SM-2 srsNextDate in favor of FSRS

// Shared extended row type used across queries
type TopicRow = {
  id: number;
  subject_id: number;
  parent_topic_id: number | null;
  name: string;
  estimated_minutes: number;
  inicet_priority: number;
  status: string;
  confidence: number;
  last_studied_at: number | null;
  times_studied: number;
  xp_earned: number;
  next_review_date: string | null;
  user_notes: string;
  fsrs_due: string | null;
  fsrs_stability: number;
  fsrs_difficulty: number;
  fsrs_elapsed_days: number;
  fsrs_scheduled_days: number;
  fsrs_reps: number;
  fsrs_lapses: number;
  fsrs_state: number;
  fsrs_last_review: string | null;
  wrong_count: number;
  is_nemesis: number;
  subject_name: string;
  short_code: string;
  color_hex: string;
};

export async function getAllSubjects(): Promise<Subject[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    id: number;
    name: string;
    short_code: string;
    color_hex: string;
    inicet_weight: number;
    neet_weight: number;
    display_order: number;
  }>('SELECT * FROM subjects ORDER BY display_order');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    shortCode: r.short_code,
    colorHex: r.color_hex,
    inicetWeight: r.inicet_weight,
    neetWeight: r.neet_weight,
    displayOrder: r.display_order,
  }));
}

export async function getSubjectByName(name: string): Promise<Subject | null> {
  const db = getDb();
  const r = await db.getFirstAsync<{
    id: number;
    name: string;
    short_code: string;
    color_hex: string;
    inicet_weight: number;
    neet_weight: number;
    display_order: number;
  }>('SELECT * FROM subjects WHERE LOWER(name) = LOWER(?)', [name]);
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    shortCode: r.short_code,
    colorHex: r.color_hex,
    inicetWeight: r.inicet_weight,
    neetWeight: r.neet_weight,
    displayOrder: r.display_order,
  };
}

export async function getSubjectById(id: number): Promise<Subject | null> {
  const db = getDb();
  const r = await db.getFirstAsync<{
    id: number;
    name: string;
    short_code: string;
    color_hex: string;
    inicet_weight: number;
    neet_weight: number;
    display_order: number;
  }>('SELECT * FROM subjects WHERE id = ?', [id]);
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    shortCode: r.short_code,
    colorHex: r.color_hex,
    inicetWeight: r.inicet_weight,
    neetWeight: r.neet_weight,
    displayOrder: r.display_order,
  };
}

const TOPIC_SELECT = `SELECT 
  t.id, t.subject_id, t.parent_topic_id, t.name, t.estimated_minutes, t.inicet_priority,
  p.status, p.confidence, p.last_studied_at, p.times_studied, p.xp_earned,
  p.next_review_date,
  p.user_notes,
  p.fsrs_due, p.fsrs_stability, p.fsrs_difficulty, p.fsrs_elapsed_days, p.fsrs_scheduled_days, p.fsrs_reps, p.fsrs_lapses, p.fsrs_state, p.fsrs_last_review,
  p.wrong_count, p.is_nemesis,
  s.name as subject_name, s.short_code, s.color_hex`;

export async function getTopicsBySubject(subjectId: number | string): Promise<TopicWithProgress[]> {
  const db = getDb();
  const id = Number(subjectId);
  if (isNaN(id)) return [];

  const rows = await db.getAllAsync<TopicRow>(
    `${TOPIC_SELECT}
     FROM topics t
     JOIN subjects s ON t.subject_id = s.id
     LEFT JOIN topic_progress p ON t.id = p.topic_id
     WHERE t.subject_id = ?
     ORDER BY COALESCE(t.parent_topic_id, t.id), CASE WHEN t.parent_topic_id IS NULL THEN 0 ELSE 1 END, t.inicet_priority DESC, t.name`,
    [id],
  );

  return rows.map(mapTopicRow);
}

export async function getAllTopicsWithProgress(): Promise<TopicWithProgress[]> {
  const db = getDb();
  const rows = await db.getAllAsync<TopicRow>(
    `${TOPIC_SELECT}
     FROM topics t
     JOIN subjects s ON t.subject_id = s.id
     LEFT JOIN topic_progress p ON t.id = p.topic_id
     ORDER BY t.inicet_priority DESC`,
  );
  return rows.map(mapTopicRow);
}

export async function getTopicById(id: number): Promise<TopicWithProgress | null> {
  const db = getDb();
  const r = await db.getFirstAsync<TopicRow>(
    `${TOPIC_SELECT}
     FROM topics t
     JOIN subjects s ON t.subject_id = s.id
     LEFT JOIN topic_progress p ON t.id = p.topic_id
     WHERE t.id = ?`,
    [id],
  );
  if (!r) return null;
  return mapTopicRow(r);
}

export async function updateTopicProgress(
  topicId: number,
  status: TopicProgress['status'],
  confidence: number,
  xpToAdd: number,
  noteToAppend?: string,
): Promise<void> {
  const now = Date.now();
  await runInTransaction(async (tx) => {
    const existing = await tx.getFirstAsync<any>(
      'SELECT fsrs_due, fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days, fsrs_reps, fsrs_lapses, fsrs_state, fsrs_last_review FROM topic_progress WHERE topic_id = ?',
      [topicId],
    );

    let card: Card;
    if (existing && existing.fsrs_last_review) {
      card = {
        due: new Date(existing.fsrs_due),
        stability: existing.fsrs_stability,
        difficulty: existing.fsrs_difficulty,
        elapsed_days: existing.fsrs_elapsed_days,
        scheduled_days: existing.fsrs_scheduled_days,
        reps: existing.fsrs_reps,
        lapses: existing.fsrs_lapses,
        state: existing.fsrs_state,
        last_review: new Date(existing.fsrs_last_review),
      };
    } else {
      card = getInitialCard();
    }

    const log = reviewCardFromConfidence(card, confidence, new Date());
    const updatedCard = log.card;
    const nextReview = updatedCard.due.toISOString().slice(0, 10);

    await tx.runAsync(
      `INSERT INTO topic_progress (
         topic_id, status, confidence, last_studied_at, times_studied, xp_earned, next_review_date,
         fsrs_due, fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days, fsrs_reps, fsrs_lapses, fsrs_state, fsrs_last_review,
         user_notes
       )
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(topic_id) DO UPDATE SET
         status = excluded.status,
         confidence = excluded.confidence,
         last_studied_at = excluded.last_studied_at,
         times_studied = times_studied + 1,
         xp_earned = xp_earned + excluded.xp_earned,
         next_review_date = excluded.next_review_date,
         fsrs_due = excluded.fsrs_due,
         fsrs_stability = excluded.fsrs_stability,
         fsrs_difficulty = excluded.fsrs_difficulty,
         fsrs_elapsed_days = excluded.fsrs_elapsed_days,
         fsrs_scheduled_days = excluded.fsrs_scheduled_days,
         fsrs_reps = excluded.fsrs_reps,
         fsrs_lapses = excluded.fsrs_lapses,
         fsrs_state = excluded.fsrs_state,
         fsrs_last_review = excluded.fsrs_last_review,
         user_notes = CASE 
           WHEN excluded.user_notes IS NOT NULL AND excluded.user_notes != '' THEN 
             CASE WHEN user_notes IS NULL OR user_notes = '' 
                  THEN excluded.user_notes 
                  ELSE user_notes || '\n\n---\n' || excluded.user_notes 
             END
           ELSE user_notes 
         END`,
      [
        topicId,
        status,
        confidence,
        now,
        xpToAdd,
        nextReview,
        updatedCard.due.toISOString(),
        updatedCard.stability,
        updatedCard.difficulty,
        updatedCard.elapsed_days,
        updatedCard.scheduled_days,
        updatedCard.reps,
        updatedCard.lapses,
        updatedCard.state,
        updatedCard.last_review?.toISOString() ?? null,
        noteToAppend ?? null,
      ],
    );
  });
}

export interface TopicProgressUpdate {
  topicId: number;
  status: TopicProgress['status'];
  confidence: number;
  xpToAdd: number;
  noteToAppend?: string;
}

export async function updateTopicsProgressBatch(updates: TopicProgressUpdate[]): Promise<void> {
  if (!updates || updates.length === 0) return;

  const db = getDb();
  const now = Date.now();

  await db.execAsync('BEGIN TRANSACTION');
  try {
    for (const update of updates) {
      const existing = await db.getFirstAsync<any>(
        'SELECT fsrs_due, fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days, fsrs_reps, fsrs_lapses, fsrs_state, fsrs_last_review FROM topic_progress WHERE topic_id = ?',
        [update.topicId],
      );

      let card: Card;
      if (existing && existing.fsrs_last_review) {
        card = {
          due: new Date(existing.fsrs_due),
          stability: existing.fsrs_stability,
          difficulty: existing.fsrs_difficulty,
          elapsed_days: existing.fsrs_elapsed_days,
          scheduled_days: existing.fsrs_scheduled_days,
          reps: existing.fsrs_reps,
          lapses: existing.fsrs_lapses,
          state: existing.fsrs_state,
          last_review: new Date(existing.fsrs_last_review),
        };
      } else {
        card = getInitialCard();
      }

      const log = reviewCardFromConfidence(card, update.confidence, new Date());
      const updatedCard = log.card;
      const nextReview = updatedCard.due.toISOString().slice(0, 10);

      await db.runAsync(
        `INSERT INTO topic_progress (
           topic_id, status, confidence, last_studied_at, times_studied, xp_earned, next_review_date,
           fsrs_due, fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days, fsrs_reps, fsrs_lapses, fsrs_state, fsrs_last_review,
           user_notes
         )
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(topic_id) DO UPDATE SET
           status = excluded.status,
           confidence = excluded.confidence,
           last_studied_at = excluded.last_studied_at,
           times_studied = times_studied + 1,
           xp_earned = xp_earned + excluded.xp_earned,
           next_review_date = excluded.next_review_date,
           fsrs_due = excluded.fsrs_due,
           fsrs_stability = excluded.fsrs_stability,
           fsrs_difficulty = excluded.fsrs_difficulty,
           fsrs_elapsed_days = excluded.fsrs_elapsed_days,
           fsrs_scheduled_days = excluded.fsrs_scheduled_days,
           fsrs_reps = excluded.fsrs_reps,
           fsrs_lapses = excluded.fsrs_lapses,
           fsrs_state = excluded.fsrs_state,
           fsrs_last_review = excluded.fsrs_last_review,
           user_notes = CASE
             WHEN excluded.user_notes IS NOT NULL AND excluded.user_notes != "" THEN
               CASE WHEN user_notes IS NULL OR user_notes = ""
                    THEN excluded.user_notes
                    ELSE user_notes || "\n\n---\n" || excluded.user_notes
               END
             ELSE user_notes
           END`,
        [
          update.topicId,
          update.status,
          update.confidence,
          now,
          update.xpToAdd,
          nextReview,
          updatedCard.due.toISOString(),
          updatedCard.stability,
          updatedCard.difficulty,
          updatedCard.elapsed_days,
          updatedCard.scheduled_days,
          updatedCard.reps,
          updatedCard.lapses,
          updatedCard.state,
          updatedCard.last_review?.toISOString() ?? null,
          update.noteToAppend ?? null,
        ],
      );
    }
    await db.execAsync('COMMIT TRANSACTION');
  } catch (err) {
    await db.execAsync('ROLLBACK TRANSACTION');
    throw err;
  }
}

export async function updateTopicNotes(topicId: number, notes: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT INTO topic_progress (topic_id, user_notes)
     VALUES (?, ?)
     ON CONFLICT(topic_id) DO UPDATE SET user_notes = excluded.user_notes`,
    [topicId, notes],
  );
}

export async function getTopicsDueForReview(limit = 10): Promise<TopicWithProgress[]> {
  const db = getDb();
  const today = todayStr();
  const rows = await db.getAllAsync<TopicRow>(
    `${TOPIC_SELECT}
     FROM topics t
     JOIN subjects s ON t.subject_id = s.id
     JOIN topic_progress p ON t.id = p.topic_id
     WHERE p.status != 'unseen'
       AND (p.fsrs_due IS NULL OR DATE(p.fsrs_due) <= DATE(?))
     ORDER BY p.fsrs_due ASC, p.confidence ASC
     LIMIT ?`,
    [today, limit],
  );
  return rows.map(mapTopicRow);
}

/** Row shape from the single-pass subject-stats aggregation (SyllabusScreen). */
export type SubjectStatsRow = {
  subjectId: number;
  total: number;
  seen: number;
  due: number;
  highYield: number;
  unseen: number;
  withNotes: number;
  weak: number;
};

/**
 * Single optimized query: all subject-level stats (total, seen, due, highYield, unseen, withNotes, weak)
 * for root-level topics only. One pass, no N+1.
 */
export async function getSubjectStatsAggregated(): Promise<SubjectStatsRow[]> {
  const db = getDb();
  return db.getAllAsync<SubjectStatsRow>(
    `SELECT
       t.subject_id AS subjectId,
       COUNT(t.id) AS total,
       SUM(CASE WHEN p.status IN ('seen','reviewed','mastered') THEN 1 ELSE 0 END) AS seen,
       SUM(CASE WHEN COALESCE(p.status, 'unseen') != 'unseen' AND (p.fsrs_due IS NULL OR DATE(p.fsrs_due) <= DATE('now')) THEN 1 ELSE 0 END) AS due,
       SUM(CASE WHEN t.inicet_priority >= 8 THEN 1 ELSE 0 END) AS highYield,
       SUM(CASE WHEN COALESCE(p.status, 'unseen') = 'unseen' THEN 1 ELSE 0 END) AS unseen,
       SUM(CASE WHEN TRIM(COALESCE(p.user_notes, '')) <> '' THEN 1 ELSE 0 END) AS withNotes,
       SUM(CASE WHEN COALESCE(p.times_studied, 0) > 0 AND COALESCE(p.confidence, 0) < 3 THEN 1 ELSE 0 END) AS weak
     FROM topics t
     LEFT JOIN topic_progress p ON p.topic_id = t.id
     WHERE NOT EXISTS (SELECT 1 FROM topics c WHERE c.parent_topic_id = t.id)
     GROUP BY t.subject_id`,
  );
}

export async function getSubjectCoverage(): Promise<
  Array<{ subjectId: number; total: number; seen: number; mastered: number }>
> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    subjectId: number;
    total: number;
    seen: number;
    mastered: number;
  }>(
    `SELECT t.subject_id as subjectId,
            COUNT(t.id) as total,
            SUM(CASE WHEN p.status IN ('seen','reviewed','mastered') THEN 1 ELSE 0 END) as seen,
            SUM(CASE WHEN p.status = 'mastered' THEN 1 ELSE 0 END) as mastered
     FROM topics t
     LEFT JOIN topic_progress p ON t.id = p.topic_id
     WHERE NOT EXISTS (
       SELECT 1 FROM topics c
       WHERE c.parent_topic_id = t.id
     )
     GROUP BY t.subject_id`,
  );
  return rows;
}

export async function getWeakestTopics(limit = 5): Promise<TopicWithProgress[]> {
  const db = getDb();
  const rows = await db.getAllAsync<TopicRow>(
    `${TOPIC_SELECT}
     FROM topics t
     JOIN subjects s ON t.subject_id = s.id
     LEFT JOIN topic_progress p ON t.id = p.topic_id
     WHERE p.times_studied > 0 AND p.confidence < 3
     ORDER BY p.confidence ASC, p.times_studied DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map(mapTopicRow);
}

function mapTopicRow(r: any): TopicWithProgress {
  const tid = r.id;
  const tname = r.name || 'Unnamed Topic';
  const sname = r.subject_name || 'Unknown';
  const scode = r.short_code || '???';
  const scolor = r.color_hex || '#555';

  return {
    id: tid,
    subjectId: r.subject_id,
    parentTopicId: r.parent_topic_id,
    name: tname,
    subtopics: [],
    estimatedMinutes: r.estimated_minutes ?? 35,
    inicetPriority: r.inicet_priority ?? 5,
    subjectName: sname,
    subjectCode: scode,
    subjectColor: scolor,
    progress: {
      topicId: tid,
      status: (r.status ?? 'unseen') as TopicProgress['status'],
      confidence: r.confidence ?? 0,
      lastStudiedAt: r.last_studied_at,
      timesStudied: r.times_studied ?? 0,
      xpEarned: r.xp_earned ?? 0,
      nextReviewDate: r.next_review_date ?? null,
      userNotes: r.user_notes ?? '',
      fsrsDue: r.fsrs_due ?? null,
      fsrsStability: r.fsrs_stability ?? 0,
      fsrsDifficulty: r.fsrs_difficulty ?? 0,
      fsrsElapsedDays: r.fsrs_elapsed_days ?? 0,
      fsrsScheduledDays: r.fsrs_scheduled_days ?? 0,
      fsrsReps: r.fsrs_reps ?? 0,
      fsrsLapses: r.fsrs_lapses ?? 0,
      fsrsState: r.fsrs_state ?? 0,
      fsrsLastReview: r.fsrs_last_review ?? null,
      wrongCount: r.wrong_count ?? 0,
      isNemesis: (r.is_nemesis ?? 0) === 1,
    },
  };
}

export const getNemesisTopics = async (): Promise<TopicWithProgress[]> => {
  const db = getDb();
  const rows = await db.getAllAsync<TopicRow>(
    `${TOPIC_SELECT}
     FROM topics t
     JOIN subjects s ON t.subject_id = s.id
     JOIN topic_progress p ON t.id = p.topic_id
     WHERE p.is_nemesis = 1
     ORDER BY p.wrong_count DESC, p.confidence ASC
     LIMIT 10`,
  );
  return rows.map(mapTopicRow);
};

export async function markNemesisTopics(): Promise<void> {
  const db = getDb();
  await db.execAsync('BEGIN TRANSACTION');
  try {
    // Reset all nemesis flags
    await db.runAsync('UPDATE topic_progress SET is_nemesis = 0');
    // Mark topics with 3+ wrong answers and low confidence as nemesis
    await db.runAsync(
      `UPDATE topic_progress SET is_nemesis = 1
       WHERE wrong_count >= 3 AND confidence < 3 AND times_studied > 0`,
    );
    await db.execAsync('COMMIT TRANSACTION');
  } catch (err) {
    await db.execAsync('ROLLBACK TRANSACTION');
    throw err;
  }
}

export async function incrementWrongCount(topicId: number): Promise<void> {
  const db = getDb();
  await db.execAsync('BEGIN TRANSACTION');
  try {
    await db.runAsync(
      'UPDATE topic_progress SET wrong_count = wrong_count + 1 WHERE topic_id = ?',
      [topicId],
    );
    // Auto-mark as nemesis if threshold reached
    await db.runAsync(
      `UPDATE topic_progress SET is_nemesis = 1
       WHERE topic_id = ? AND wrong_count >= 3 AND confidence < 3`,
      [topicId],
    );
    await db.execAsync('COMMIT TRANSACTION');
  } catch (err) {
    await db.execAsync('ROLLBACK TRANSACTION');
    throw err;
  }
}

export interface SubjectBreakdownRow {
  id: number;
  name: string;
  shortCode: string;
  color: string;
  total: number;
  covered: number;
  mastered: number;
  highYieldTotal: number;
  highYieldCovered: number;
  percent: number;
}

/**
 * Returns per-subject coverage stats using a single SQL aggregation query,
 * avoiding loading all 5000+ topic rows into JS memory.
 */
export async function getSubjectBreakdown(): Promise<SubjectBreakdownRow[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    id: number;
    name: string;
    short_code: string;
    color_hex: string;
    total: number;
    covered: number;
    mastered: number;
    high_yield_total: number;
    high_yield_covered: number;
  }>(
    `SELECT
       s.id,
       s.name,
       s.short_code,
       s.color_hex,
       COUNT(t.id)                                                             AS total,
       SUM(CASE WHEN p.status IN ('seen','reviewed','mastered') THEN 1 ELSE 0 END) AS covered,
       SUM(CASE WHEN p.status = 'mastered'                      THEN 1 ELSE 0 END) AS mastered,
       SUM(CASE WHEN t.inicet_priority >= 4                      THEN 1 ELSE 0 END) AS high_yield_total,
       SUM(CASE WHEN t.inicet_priority >= 4
                AND p.status IN ('seen','reviewed','mastered')   THEN 1 ELSE 0 END) AS high_yield_covered
     FROM subjects s
     LEFT JOIN topics t ON t.subject_id = s.id
      AND NOT EXISTS (
        SELECT 1 FROM topics c
        WHERE c.parent_topic_id = t.id
      )
     LEFT JOIN topic_progress p ON t.id = p.topic_id
     GROUP BY s.id
     ORDER BY s.name`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    shortCode: r.short_code,
    color: r.color_hex,
    total: r.total ?? 0,
    covered: r.covered ?? 0,
    mastered: r.mastered ?? 0,
    highYieldTotal: r.high_yield_total ?? 0,
    highYieldCovered: r.high_yield_covered ?? 0,
    percent: r.total > 0 ? Math.round(((r.covered ?? 0) / r.total) * 100) : 0,
  }));
}

export interface ReviewDay {
  date: string; // YYYY-MM-DD
  count: number;
  topics: Array<{ name: string; confidence: number }>;
}

export async function getReviewCalendarData(year: number, month: number): Promise<ReviewDay[]> {
  const db = getDb();
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endDate =
    month === 11 ? `${year + 1}-01-01` : `${year}-${String(month + 2).padStart(2, '0')}-01`;

  const rows = await db.getAllAsync<{
    review_date: string;
    topic_name: string;
    confidence: number;
  }>(
    `SELECT DATE(tp.fsrs_due) as review_date,
            t.name as topic_name,
            tp.confidence
     FROM topic_progress tp
     JOIN topics t ON tp.topic_id = t.id
     WHERE tp.status != 'unseen'
       AND tp.fsrs_due IS NOT NULL
       AND DATE(tp.fsrs_due) >= ?
       AND DATE(tp.fsrs_due) < ?
     ORDER BY review_date ASC`,
    [startDate, endDate],
  );

  const byDate = new Map<string, ReviewDay>();
  for (const r of rows) {
    const existing = byDate.get(r.review_date);
    if (existing) {
      existing.count++;
      existing.topics.push({ name: r.topic_name, confidence: r.confidence });
    } else {
      byDate.set(r.review_date, {
        date: r.review_date,
        count: 1,
        topics: [{ name: r.topic_name, confidence: r.confidence }],
      });
    }
  }
  return Array.from(byDate.values());
}
