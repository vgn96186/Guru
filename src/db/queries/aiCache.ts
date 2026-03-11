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

export function flagTopicForReview(topicId: number, topicName: string): ContentType {
  const db = getDb();
  const existing = db.getFirstSync<{ content_type: ContentType }>(
    `SELECT content_type
     FROM ai_cache
     WHERE topic_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [topicId],
  );

  const contentType = existing?.content_type ?? 'keypoints';

  if (!existing) {
    setCachedContent(
      topicId,
      contentType,
      {
        type: 'keypoints',
        topicName,
        points: [
          'Manual review requested during a study session.',
          'Revisit this topic with textbook notes or a fresh AI card.',
        ],
        memoryHook: 'Flagged for later review.',
      },
      'manual-review',
    );
  }

  setContentFlagged(topicId, contentType, true);
  return contentType;
}

export function isContentFlagged(topicId: number, contentType: ContentType): boolean {
  const db = getDb();
  const row = db.getFirstSync<{ is_flagged: number }>(
    'SELECT is_flagged FROM ai_cache WHERE topic_id = ? AND content_type = ?',
    [topicId, contentType],
  );
  return (row?.is_flagged ?? 0) === 1;
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

/** Extended lecture note with full transcript data */
export interface LectureNoteData {
  subjectId: number | null;
  note: string;
  transcript?: string;
  summary?: string;
  topics?: string[];
  appName?: string;
  durationMinutes?: number;
  confidence?: number;
}

export function saveLectureTranscript(data: LectureNoteData): number {
  // If transcript is long and not a URI, we should ideally save it to file first.
  // We assume callers now pass the file URI if they want it on disk.
  const db = getDb();
  const result = db.runSync(
    `INSERT INTO lecture_notes (subject_id, note, created_at, transcript, summary, topics_json, app_name, duration_minutes, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.subjectId,
      data.note,
      nowTs(),
      data.transcript ?? null,
      data.summary ?? null,
      data.topics ? JSON.stringify(data.topics) : null,
      data.appName ?? null,
      data.durationMinutes ?? null,
      data.confidence ?? 2,
    ],
  );
  return result.lastInsertRowId;
}

export function updateLectureTranscriptNote(noteId: number, note: string): void {
  const db = getDb();
  db.runSync(
    'UPDATE lecture_notes SET note = ? WHERE id = ?',
    [note, noteId],
  );
}

export function updateLectureTranscriptSummary(noteId: number, summary: string | null): void {
  const db = getDb();
  db.runSync(
    'UPDATE lecture_notes SET summary = ? WHERE id = ?',
    [summary, noteId],
  );
}

export interface LectureHistoryItem {
  id: number;
  subjectId: number | null;
  subjectName: string | null;
  note: string;
  transcript: string | null;
  summary: string | null;
  topics: string[];
  appName: string | null;
  durationMinutes: number | null;
  confidence: number;
  createdAt: number;
}

export function getLectureNoteById(noteId: number): LectureHistoryItem | null {
  const db = getDb();
  const row = db.getFirstSync<{
    id: number;
    subject_id: number | null;
    subject_name: string | null;
    note: string;
    transcript: string | null;
    summary: string | null;
    topics_json: string | null;
    app_name: string | null;
    duration_minutes: number | null;
    confidence: number | null;
    created_at: number;
  }>(
    `SELECT ln.id, ln.subject_id, s.name as subject_name, ln.note, ln.transcript, ln.summary, ln.topics_json, ln.app_name, ln.duration_minutes, ln.confidence, ln.created_at
     FROM lecture_notes ln
     LEFT JOIN subjects s ON ln.subject_id = s.id
     WHERE ln.id = ?
     LIMIT 1`,
    [noteId],
  );

  if (!row) return null;

  return {
    id: row.id,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    note: row.note,
    transcript: row.transcript,
    summary: row.summary,
    topics: row.topics_json ? JSON.parse(row.topics_json) : [],
    appName: row.app_name,
    durationMinutes: row.duration_minutes,
    confidence: row.confidence ?? 2,
    createdAt: row.created_at,
  };
}

export function getLectureHistory(limit = 50): LectureHistoryItem[] {
  const db = getDb();
  const rows = db.getAllSync<{
    id: number;
    subject_id: number | null;
    subject_name: string | null;
    note: string;
    transcript: string | null;
    summary: string | null;
    topics_json: string | null;
    app_name: string | null;
    duration_minutes: number | null;
    confidence: number | null;
    created_at: number;
  }>(
    `SELECT ln.id, ln.subject_id, s.name as subject_name, ln.note, ln.transcript, ln.summary, ln.topics_json, ln.app_name, ln.duration_minutes, ln.confidence, ln.created_at
     FROM lecture_notes ln
     LEFT JOIN subjects s ON ln.subject_id = s.id
     ORDER BY ln.created_at DESC
     LIMIT ?`,
    [limit],
  );

  return rows.map(r => ({
    id: r.id,
    subjectId: r.subject_id,
    subjectName: r.subject_name,
    note: r.note,
    transcript: r.transcript,
    summary: r.summary,
    topics: r.topics_json ? JSON.parse(r.topics_json) : [],
    appName: r.app_name,
    durationMinutes: r.duration_minutes,
    confidence: r.confidence ?? 2,
    createdAt: r.created_at,
  }));
}

export function searchLectureNotes(query: string, limit = 20): LectureHistoryItem[] {
  const db = getDb();
  const likeQuery = `%${query}%`;
  const rows = db.getAllSync<{
    id: number;
    subject_id: number | null;
    subject_name: string | null;
    note: string;
    transcript: string | null;
    summary: string | null;
    topics_json: string | null;
    app_name: string | null;
    duration_minutes: number | null;
    confidence: number | null;
    created_at: number;
  }>(
    `SELECT ln.id, ln.subject_id, s.name as subject_name, ln.note, ln.transcript, ln.summary, ln.topics_json, ln.app_name, ln.duration_minutes, ln.confidence, ln.created_at
     FROM lecture_notes ln
     LEFT JOIN subjects s ON ln.subject_id = s.id
     WHERE ln.note LIKE ? OR ln.transcript LIKE ? OR ln.summary LIKE ? OR ln.topics_json LIKE ?
     ORDER BY ln.created_at DESC
     LIMIT ?`,
    [likeQuery, likeQuery, likeQuery, likeQuery, limit],
  );

  return rows.map(r => ({
    id: r.id,
    subjectId: r.subject_id,
    subjectName: r.subject_name,
    note: r.note,
    transcript: r.transcript,
    summary: r.summary,
    topics: r.topics_json ? JSON.parse(r.topics_json) : [],
    appName: r.app_name,
    durationMinutes: r.duration_minutes,
    confidence: r.confidence ?? 2,
    createdAt: r.created_at,
  }));
}

export function deleteLectureNote(id: number): void {
  const db = getDb();
  db.runSync('DELETE FROM lecture_notes WHERE id = ?', [id]);
}

// ── Chat History ──────────────────────────────────────────────────

export interface ChatHistoryMessage {
  id: number;
  topicName: string;
  role: 'user' | 'guru';
  message: string;
  timestamp: number;
}

export function saveChatMessage(topicName: string, role: 'user' | 'guru', message: string, timestamp: number): void {
  const db = getDb();
  db.runSync(
    'INSERT INTO chat_history (topic_name, role, message, timestamp) VALUES (?, ?, ?, ?)',
    [topicName, role, message, timestamp],
  );
}

export function getChatHistory(topicName: string, limit = 20): ChatHistoryMessage[] {
  const db = getDb();
  const rows = db.getAllSync<{ id: number; topic_name: string; role: string; message: string; timestamp: number }>(
    'SELECT * FROM chat_history WHERE topic_name = ? ORDER BY timestamp ASC LIMIT ?',
    [topicName, limit],
  );
  return rows.map(r => ({
    id: r.id,
    topicName: r.topic_name,
    role: r.role as 'user' | 'guru',
    message: r.message,
    timestamp: r.timestamp,
  }));
}

export function clearChatHistory(topicName: string): void {
  const db = getDb();
  db.runSync('DELETE FROM chat_history WHERE topic_name = ?', [topicName]);
}
