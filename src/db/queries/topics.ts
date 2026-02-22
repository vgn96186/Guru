import { getDb, todayStr } from '../database';
import type { Subject, Topic, TopicProgress, TopicWithProgress } from '../../types';
import { getInitialCard, reviewCard, mapConfidenceToRating } from '../../services/fsrsService';
import type { Card } from 'ts-fsrs';

// SM-2-inspired: confidence → days until next review
function srsNextDate(confidence: number): string {
  const intervals = [1, 1, 3, 7, 14, 21]; // days per confidence level 0-5
  const days = intervals[Math.min(Math.max(0, confidence), 5)];
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10);
}

// Shared extended row type used across queries
type TopicRow = {
  id: number; subject_id: number; name: string; estimated_minutes: number; inicet_priority: number;
  status: string; confidence: number; last_studied_at: number | null; times_studied: number; xp_earned: number;
  next_review_date: string | null; user_notes: string;
  fsrs_due: string | null; fsrs_stability: number; fsrs_difficulty: number; fsrs_elapsed_days: number; fsrs_scheduled_days: number; fsrs_reps: number; fsrs_lapses: number; fsrs_state: number; fsrs_last_review: string | null;
  subject_name: string; short_code: string; color_hex: string;
};

export function getAllSubjects(): Subject[] {
  const db = getDb();
  const rows = db.getAllSync<{
    id: number; name: string; short_code: string; color_hex: string;
    inicet_weight: number; neet_weight: number; display_order: number;
  }>('SELECT * FROM subjects ORDER BY display_order');
  console.log(`[DB] Found ${rows.length} subjects`);
  return rows.map(r => ({
    id: r.id, name: r.name, shortCode: r.short_code, colorHex: r.color_hex,
    inicetWeight: r.inicet_weight, neetWeight: r.neet_weight, displayOrder: r.display_order,
  }));
}

export function getSubjectById(id: number): Subject | null {
  const db = getDb();
  const r = db.getFirstSync<{
    id: number; name: string; short_code: string; color_hex: string;
    inicet_weight: number; neet_weight: number; display_order: number;
  }>('SELECT * FROM subjects WHERE id = ?', [id]);
  if (!r) return null;
  return {
    id: r.id, name: r.name, shortCode: r.short_code, colorHex: r.color_hex,
    inicetWeight: r.inicet_weight, neetWeight: r.neet_weight, displayOrder: r.display_order,
  };
}

const TOPIC_SELECT = `SELECT 
  t.id, t.subject_id, t.parent_topic_id, t.name, t.estimated_minutes, t.inicet_priority,
  p.status, p.confidence, p.last_studied_at, p.times_studied, p.xp_earned,
  p.next_review_date,
  p.user_notes,
  p.fsrs_due, p.fsrs_stability, p.fsrs_difficulty, p.fsrs_elapsed_days, p.fsrs_scheduled_days, p.fsrs_reps, p.fsrs_lapses, p.fsrs_state, p.fsrs_last_review,
  s.name as subject_name, s.short_code, s.color_hex`;

export function getTopicsBySubject(subjectId: number | string): TopicWithProgress[] {
  const db = getDb();
  const id = Number(subjectId);
  if (isNaN(id)) return [];

  console.log(`[DB] Fetching topics for subject_id: ${id}`);
  
  const rows = db.getAllSync<any>(`
    SELECT 
      t.id, 
      t.subject_id, 
      t.parent_topic_id,
      t.name, 
      t.estimated_minutes, 
      t.inicet_priority,
      p.status, 
      p.confidence, 
      p.last_studied_at, 
      p.times_studied, 
      p.xp_earned,
      p.next_review_date,
      p.user_notes,
      s.name as subject_name,
      s.short_code,
      s.color_hex
    FROM topics t
    JOIN subjects s ON t.subject_id = s.id
    LEFT JOIN topic_progress p ON t.id = p.topic_id
    WHERE t.subject_id = ?
    ORDER BY t.inicet_priority DESC, t.name
  `, [id]);

  console.log(`[DB] Subject ${id} has ${rows.length} topics`);

  return rows.map(mapTopicRow);
}

export function getAllTopicsWithProgress(): TopicWithProgress[] {
  const db = getDb();
  const rows = db.getAllSync<TopicRow>(
    `${TOPIC_SELECT}
     FROM topics t
     JOIN subjects s ON t.subject_id = s.id
     LEFT JOIN topic_progress p ON t.id = p.topic_id
     ORDER BY t.inicet_priority DESC`,
  );
  return rows.map(mapTopicRow);
}

export function getTopicById(id: number): TopicWithProgress | null {
  const db = getDb();
  const r = db.getFirstSync<TopicRow>(
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

export function updateTopicProgress(
  topicId: number,
  status: TopicProgress['status'],
  confidence: number,
  xpToAdd: number,
): void {
  const db = getDb();
  const now = Date.now();
  const nextReview = srsNextDate(confidence);
  
  // Get existing FSRS data
  const existing = db.getFirstSync<any>('SELECT fsrs_due, fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days, fsrs_reps, fsrs_lapses, fsrs_state, fsrs_last_review FROM topic_progress WHERE topic_id = ?', [topicId]);
  
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
      last_review: new Date(existing.fsrs_last_review)
    };
  } else {
    card = getInitialCard();
  }
  
  const rating = mapConfidenceToRating(confidence);
  const log = reviewCard(card, rating, new Date());
  const updatedCard = log.card;
  
  db.runSync(
    `INSERT INTO topic_progress (
       topic_id, status, confidence, last_studied_at, times_studied, xp_earned, next_review_date,
       fsrs_due, fsrs_stability, fsrs_difficulty, fsrs_elapsed_days, fsrs_scheduled_days, fsrs_reps, fsrs_lapses, fsrs_state, fsrs_last_review
     )
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
       fsrs_last_review = excluded.fsrs_last_review`,
    [
      topicId, status, confidence, now, xpToAdd, nextReview,
      updatedCard.due.toISOString(), updatedCard.stability, updatedCard.difficulty, updatedCard.elapsed_days, 
      updatedCard.scheduled_days, updatedCard.reps, updatedCard.lapses, updatedCard.state, updatedCard.last_review?.toISOString() ?? null
    ]
  );
}

export function updateTopicNotes(topicId: number, notes: string): void {
  const db = getDb();
  db.runSync(
    `INSERT INTO topic_progress (topic_id, user_notes)
     VALUES (?, ?)
     ON CONFLICT(topic_id) DO UPDATE SET user_notes = excluded.user_notes`,
    [topicId, notes],
  );
}

export function getTopicsDueForReview(limit = 10): TopicWithProgress[] {
  const db = getDb();
  const today = todayStr();
  const rows = db.getAllSync<{
    id: number; subject_id: number; name: string; estimated_minutes: number; inicet_priority: number;
    status: string; confidence: number; last_studied_at: number | null; times_studied: number; xp_earned: number;
    next_review_date: string | null; user_notes: string;
    subject_name: string; short_code: string; color_hex: string;
  }>(
    `SELECT t.*, p.status, p.confidence, p.last_studied_at, p.times_studied, p.xp_earned,
            p.next_review_date, p.user_notes,
            s.name as subject_name, s.short_code, s.color_hex
     FROM topics t
     JOIN subjects s ON t.subject_id = s.id
     JOIN topic_progress p ON t.id = p.topic_id
     WHERE p.status != 'unseen'
       AND (p.next_review_date IS NULL OR p.next_review_date <= ?)
     ORDER BY p.confidence ASC, p.last_studied_at ASC
     LIMIT ?`,
    [today, limit],
  );
  return rows.map(mapTopicRow);
}

export function getSubjectCoverage(): Array<{ subjectId: number; total: number; seen: number; mastered: number }> {
  const db = getDb();
  const rows = db.getAllSync<{ subjectId: number; total: number; seen: number; mastered: number }>(
    `SELECT t.subject_id as subjectId,
            COUNT(t.id) as total,
            SUM(CASE WHEN p.status IN ('seen','reviewed','mastered') THEN 1 ELSE 0 END) as seen,
            SUM(CASE WHEN p.status = 'mastered' THEN 1 ELSE 0 END) as mastered
     FROM topics t
     LEFT JOIN topic_progress p ON t.id = p.topic_id
     GROUP BY t.subject_id`,
  );
  console.log(`[DB] Coverage rows: ${JSON.stringify(rows)}`);
  return rows;
}

export function getWeakestTopics(limit = 5): TopicWithProgress[] {
  const db = getDb();
  const rows = db.getAllSync<TopicRow>(
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
    },
  };
}

export const getNemesisTopics = async (): Promise<any[]> => {
  return [];
};
