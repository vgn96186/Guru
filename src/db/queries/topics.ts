import { getDb, todayStr } from '../database';
import type { Subject, Topic, TopicProgress, TopicWithProgress } from '../../types';

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
  db.runSync(
    `INSERT INTO topic_progress (topic_id, status, confidence, last_studied_at, times_studied, xp_earned, next_review_date)
     VALUES (?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(topic_id) DO UPDATE SET
       status = excluded.status,
       confidence = excluded.confidence,
       last_studied_at = excluded.last_studied_at,
       times_studied = times_studied + 1,
       xp_earned = xp_earned + excluded.xp_earned,
       next_review_date = excluded.next_review_date`,
    [topicId, status, confidence, now, xpToAdd, nextReview],
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
    },
  };
}
