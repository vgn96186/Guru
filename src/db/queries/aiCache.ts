import { getDb, nowTs } from '../database';
import type { AIContent, ContentType } from '../../types';

export function getCachedContent(
  topicId: number,
  contentType: ContentType,
): AIContent | null {
  const db = getDb();
  const r = db.getFirstSync<{ content_json: string }>(
    'SELECT content_json FROM ai_cache WHERE topic_id = ? AND content_type = ?',
    [topicId, contentType],
  );
  if (!r) return null;
  try {
    return JSON.parse(r.content_json) as AIContent;
  } catch {
    return null;
  }
}

export function setCachedContent(
  topicId: number,
  contentType: ContentType,
  content: AIContent,
  modelUsed: string,
): void {
  const db = getDb();
  db.runSync(
    `INSERT INTO ai_cache (topic_id, content_type, content_json, model_used, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(topic_id, content_type) DO UPDATE SET
       content_json = excluded.content_json,
       model_used = excluded.model_used,
       created_at = excluded.created_at`,
    [topicId, contentType, JSON.stringify(content), modelUsed, nowTs()],
  );
}

export interface MockQuestion {
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  topicName: string;
  subjectName: string;
}

export function getAllCachedQuestions(): MockQuestion[] {
  const db = getDb();
  const rows = db.getAllSync<{ content_json: string; topic_name: string; subject_name: string }>(
    `SELECT c.content_json, t.name as topic_name, s.name as subject_name
     FROM ai_cache c
     JOIN topics t ON c.topic_id = t.id
     JOIN subjects s ON t.subject_id = s.id
     WHERE c.content_type = 'quiz'`,
  );

  const all: MockQuestion[] = [];
  for (const row of rows) {
    try {
      const quiz = JSON.parse(row.content_json) as { questions: Array<{ question: string; options: [string,string,string,string]; correctIndex: number; explanation: string }> };
      for (const q of quiz.questions ?? []) {
        all.push({ ...q, topicName: row.topic_name, subjectName: row.subject_name });
      }
    } catch { /* skip malformed */ }
  }
  // Shuffle
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

export function setContentFlagged(topicId: number, contentType: ContentType, flagged: boolean): void {
  const db = getDb();
  db.runSync(
    'UPDATE ai_cache SET is_flagged = ? WHERE topic_id = ? AND content_type = ?',
    [flagged ? 1 : 0, topicId, contentType],
  );
}

export interface FlaggedItem {
  topicId: number;
  topicName: string;
  subjectName: string;
  contentType: ContentType;
  content: AIContent;
  modelUsed: string;
  createdAt: number;
}

export function getFlaggedContent(): FlaggedItem[] {
  const db = getDb();
  const rows = db.getAllSync<{
    topic_id: number; topic_name: string; subject_name: string;
    content_type: string; content_json: string; model_used: string; created_at: number;
  }>(
    `SELECT c.topic_id, t.name AS topic_name, s.name AS subject_name,
            c.content_type, c.content_json, c.model_used, c.created_at
     FROM ai_cache c
     JOIN topics t ON c.topic_id = t.id
     JOIN subjects s ON t.subject_id = s.id
     WHERE c.is_flagged = 1
     ORDER BY c.created_at DESC`,
  );
  return rows.map(r => ({
    topicId: r.topic_id,
    topicName: r.topic_name,
    subjectName: r.subject_name,
    contentType: r.content_type as ContentType,
    content: JSON.parse(r.content_json) as AIContent,
    modelUsed: r.model_used,
    createdAt: r.created_at,
  }));
}

export function clearTopicCache(topicId: number): void {
  const db = getDb();
  db.runSync('DELETE FROM ai_cache WHERE topic_id = ?', [topicId]);
}

export function getCacheStats(): { totalCached: number; byType: Record<string, number> } {
  const db = getDb();
  const total = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM ai_cache');
  const byTypeRows = db.getAllSync<{ content_type: string; count: number }>(
    'SELECT content_type, COUNT(*) as count FROM ai_cache GROUP BY content_type',
  );
  const byType: Record<string, number> = {};
  for (const row of byTypeRows) byType[row.content_type] = row.count;
  return { totalCached: total?.count ?? 0, byType };
}

export function saveLectureNote(subjectId: number | null, note: string): void {
  const db = getDb();
  db.runSync(
    'INSERT INTO lecture_notes (subject_id, note, created_at) VALUES (?, ?, ?)',
    [subjectId, note, nowTs()],
  );
}
