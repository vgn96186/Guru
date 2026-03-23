import { getDb, nowTs, SQL_AI_CACHE } from '../database';
import { getAiCacheDb } from '../aiCacheDatabase';
import type { AIContent, ContentType } from '../../types';
import { embeddingToBlob } from '../../services/ai/embeddingService';
import { saveTranscriptToFile } from '../../services/transcriptStorage';

export async function getCachedContent(
  topicId: number,
  contentType: ContentType,
): Promise<AIContent | null> {
  const db = getAiCacheDb();
  const r = await db.getFirstAsync<{ content_json: string; model_used: string | null }>(
    `SELECT content_json, model_used FROM ${SQL_AI_CACHE} WHERE topic_id = ? AND content_type = ?`,
    [topicId, contentType],
  );
  if (!r) return null;
  try {
    const parsed = JSON.parse(r.content_json) as AIContent;
    const fromColumn = (r.model_used ?? '').trim();
    // model_used lives in a dedicated column; legacy cache JSON may omit modelUsed.
    const modelUsed =
      (typeof parsed.modelUsed === 'string' && parsed.modelUsed.trim()) || fromColumn || undefined;
    return { ...parsed, ...(modelUsed ? { modelUsed } : {}) };
  } catch (err) {
    if (__DEV__) console.warn('[aiCache] Failed to parse cached content:', err);
    return null;
  }
}

export async function setCachedContent(
  topicId: number,
  contentType: ContentType,
  content: AIContent,
  modelUsed: string,
): Promise<void> {
  const db = getAiCacheDb();
  await db.runAsync(
    `INSERT INTO ${SQL_AI_CACHE} (topic_id, content_type, content_json, model_used, created_at)
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

function parseMockQuestionsFromRows(
  rows: Array<{
    content_json: string;
    topic_name: string;
    subject_name: string;
  }>,
  limit?: number,
): MockQuestion[] {
  const all: MockQuestion[] = [];
  for (const row of rows) {
    try {
      const quiz = JSON.parse(row.content_json) as {
        questions: Array<{
          question: string;
          options: [string, string, string, string];
          correctIndex: number;
          explanation: string;
        }>;
      };
      for (const q of quiz.questions ?? []) {
        all.push({ ...q, topicName: row.topic_name, subjectName: row.subject_name });
        if (limit && all.length >= limit) {
          return all;
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('[aiCache] Skipping malformed quiz row:', err);
    }
  }
  return all;
}

function shuffleQuestions(questions: MockQuestion[]): MockQuestion[] {
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }
  return questions;
}

export async function getCachedQuestionCount(): Promise<number> {
  const db = getAiCacheDb();
  try {
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COALESCE(SUM(json_array_length(content_json, '$.questions')), 0) AS count
       FROM ${SQL_AI_CACHE}
       WHERE content_type = 'quiz'`,
    );
    return row?.count ?? 0;
  } catch (err) {
    if (__DEV__) console.warn('[aiCache] Falling back to JS question counting:', err);
    const all = await getAllCachedQuestions();
    return all.length;
  }
}

export async function getMockQuestions(limit: number): Promise<MockQuestion[]> {
  if (limit <= 0) return [];

  const cacheDb = getAiCacheDb();
  const mainDb = getDb();
  const rowIds = await cacheDb.getAllAsync<{ id: number }>(
    `SELECT id
     FROM ${SQL_AI_CACHE}
     WHERE content_type = 'quiz'
     ORDER BY RANDOM()`,
  );
  if (rowIds.length === 0) return [];

  const selectedIds: number[] = [];
  const batchSize = Math.min(Math.max(Math.ceil(limit / 3), 8), 24);
  let offset = 0;
  let parsedQuestions: MockQuestion[] = [];

  while (offset < rowIds.length && parsedQuestions.length < limit) {
    const ids = rowIds.slice(offset, offset + batchSize).map((row: { id: number }) => row.id);
    offset += batchSize;
    if (ids.length === 0) break;

    const placeholders = ids.map(() => '?').join(',');
    const rows = await mainDb.getAllAsync<{
      content_json: string;
      topic_name: string;
      subject_name: string;
    }>(
      `SELECT c.content_json, t.name AS topic_name, s.name AS subject_name
       FROM ${SQL_AI_CACHE} c
       JOIN topics t ON c.topic_id = t.id
       JOIN subjects s ON t.subject_id = s.id
       WHERE c.id IN (${placeholders})`,
      ids,
    );
    parsedQuestions = parsedQuestions.concat(
      parseMockQuestionsFromRows(rows, limit - parsedQuestions.length),
    );
  }

  return shuffleQuestions(parsedQuestions).slice(0, limit);
}

export async function getAllCachedQuestions(): Promise<MockQuestion[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    content_json: string;
    topic_name: string;
    subject_name: string;
  }>(
    `SELECT c.content_json, t.name as topic_name, s.name as subject_name
     FROM ${SQL_AI_CACHE} c
     JOIN topics t ON c.topic_id = t.id
     JOIN subjects s ON t.subject_id = s.id
     WHERE c.content_type = 'quiz'`,
  );
  return shuffleQuestions(parseMockQuestionsFromRows(rows));
}

export async function setContentFlagged(
  topicId: number,
  contentType: ContentType,
  flagged: boolean,
): Promise<void> {
  const db = getAiCacheDb();
  await db.runAsync(
    `UPDATE ${SQL_AI_CACHE} SET is_flagged = ? WHERE topic_id = ? AND content_type = ?`,
    [flagged ? 1 : 0, topicId, contentType],
  );
}

export async function flagTopicForReview(topicId: number, topicName: string): Promise<ContentType> {
  const db = getAiCacheDb();
  const existing = await db.getFirstAsync<{ content_type: ContentType }>(
    `SELECT content_type
     FROM ${SQL_AI_CACHE}
     WHERE topic_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [topicId],
  );

  const contentType = existing?.content_type ?? 'keypoints';

  if (!existing) {
    await setCachedContent(
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

  await setContentFlagged(topicId, contentType, true);
  return contentType;
}

export async function isContentFlagged(
  topicId: number,
  contentType: ContentType,
): Promise<boolean> {
  const db = getAiCacheDb();
  const row = await db.getFirstAsync<{ is_flagged: number }>(
    `SELECT is_flagged FROM ${SQL_AI_CACHE} WHERE topic_id = ? AND content_type = ?`,
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

export async function getFlaggedContent(): Promise<FlaggedItem[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    topic_id: number;
    topic_name: string;
    subject_name: string;
    content_type: string;
    content_json: string;
    model_used: string;
    created_at: number;
  }>(
    `SELECT c.topic_id, t.name AS topic_name, s.name AS subject_name,
            c.content_type, c.content_json, c.model_used, c.created_at
     FROM ${SQL_AI_CACHE} c
     JOIN topics t ON c.topic_id = t.id
     JOIN subjects s ON t.subject_id = s.id
     WHERE c.is_flagged = 1
     ORDER BY c.created_at DESC`,
  );
  return rows.map((r) => ({
    topicId: r.topic_id,
    topicName: r.topic_name,
    subjectName: r.subject_name,
    contentType: r.content_type as ContentType,
    content: JSON.parse(r.content_json) as AIContent,
    modelUsed: r.model_used,
    createdAt: r.created_at,
  }));
}

export async function clearTopicCache(topicId: number): Promise<void> {
  const db = getAiCacheDb();
  await db.runAsync(`DELETE FROM ${SQL_AI_CACHE} WHERE topic_id = ?`, [topicId]);
}

export async function clearSpecificContentCache(
  topicId: number,
  contentType: ContentType,
): Promise<void> {
  const db = getAiCacheDb();
  await db.runAsync(`DELETE FROM ${SQL_AI_CACHE} WHERE topic_id = ? AND content_type = ?`, [
    topicId,
    contentType,
  ]);
}

export async function saveLectureNote(
  subjectId: number | null,
  note: string,
  embedding?: number[] | null,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'INSERT INTO lecture_notes (subject_id, note, created_at, embedding) VALUES (?, ?, ?, ?)',
    [subjectId, note, nowTs(), embedding ? embeddingToBlob(embedding) : null],
  );
}

/** Extended lecture note with full transcript data */
export interface LectureNoteData {
  subjectId: number | null;
  subjectName?: string | null;
  note: string;
  transcript?: string;
  summary?: string;
  topics?: string[];
  appName?: string;
  durationMinutes?: number;
  confidence?: number;
  recordingPath?: string | null;
}

export async function saveLectureTranscript(
  data: LectureNoteData & { embedding?: number[] | null },
): Promise<number> {
  const db = getDb();
  const transcriptValue = data.transcript
    ? await saveTranscriptToFile(data.transcript, {
        subjectName: data.subjectName,
        topics: data.topics,
      })
    : null;
  const result = await db.runAsync(
    `INSERT INTO lecture_notes (
       subject_id, note, created_at, transcript, summary, topics_json, app_name,
       duration_minutes, confidence, embedding, recording_path
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.subjectId,
      data.note,
      nowTs(),
      transcriptValue,
      data.summary ?? null,
      data.topics ? JSON.stringify(data.topics) : null,
      data.appName ?? null,
      data.durationMinutes ?? null,
      data.confidence ?? 2,
      data.embedding ? embeddingToBlob(data.embedding) : null,
      data.recordingPath ?? null,
    ],
  );
  return result.lastInsertRowId as number;
}

export async function updateLectureTranscriptNote(noteId: number, note: string): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE lecture_notes SET note = ? WHERE id = ?', [note, noteId]);
}

export async function updateLectureTranscriptSummary(
  noteId: number,
  summary: string | null,
): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE lecture_notes SET summary = ? WHERE id = ?', [summary, noteId]);
}

export async function updateLectureAnalysisMetadata(
  noteId: number,
  data: {
    subjectId?: number | null;
    summary?: string | null;
    topics?: string[];
    confidence?: number;
  },
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE lecture_notes
     SET subject_id = COALESCE(?, subject_id),
         summary = ?,
         topics_json = ?,
         confidence = COALESCE(?, confidence)
     WHERE id = ?`,
    [
      data.subjectId ?? null,
      data.summary ?? null,
      data.topics ? JSON.stringify(data.topics) : null,
      data.confidence ?? null,
      noteId,
    ],
  );
}

export async function updateLectureTranscriptArtifacts(
  noteId: number,
  data: {
    note: string;
    transcript: string | null;
    subjectId?: number | null;
    summary?: string | null;
    topics?: string[];
    confidence?: number;
  },
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE lecture_notes
     SET note = ?,
         transcript = ?,
         subject_id = COALESCE(?, subject_id),
         summary = ?,
         topics_json = ?,
         confidence = COALESCE(?, confidence)
     WHERE id = ?`,
    [
      data.note,
      data.transcript,
      data.subjectId ?? null,
      data.summary ?? null,
      data.topics ? JSON.stringify(data.topics) : null,
      data.confidence ?? null,
      noteId,
    ],
  );
}

export async function updateLectureRecordingPath(
  noteId: number,
  recordingPath: string | null,
): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE lecture_notes SET recording_path = ? WHERE id = ?', [
    recordingPath,
    noteId,
  ]);
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
  recordingPath?: string | null;
}

export async function getLectureNoteById(noteId: number): Promise<LectureHistoryItem | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{
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
    recording_path: string | null;
  }>(
    `SELECT ln.id, ln.subject_id, s.name as subject_name, ln.note, ln.transcript, ln.summary, ln.topics_json, ln.app_name, ln.duration_minutes, ln.confidence, ln.created_at, ln.recording_path
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
    recordingPath: row.recording_path,
  };
}

export async function getLectureHistory(limit = 50): Promise<LectureHistoryItem[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
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
    recording_path: string | null;
  }>(
    `SELECT ln.id, ln.subject_id, s.name as subject_name, ln.note, ln.transcript, ln.summary, ln.topics_json, ln.app_name, ln.duration_minutes, ln.confidence, ln.created_at, ln.recording_path
     FROM lecture_notes ln
     LEFT JOIN subjects s ON ln.subject_id = s.id
     ORDER BY ln.created_at DESC
     LIMIT ?`,
    [limit],
  );

  return rows.map((r) => ({
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
    recordingPath: r.recording_path,
  }));
}

export async function searchLectureNotes(query: string, limit = 20): Promise<LectureHistoryItem[]> {
  const db = getDb();
  const likeQuery = `%${query}%`;
  const rows = await db.getAllAsync<{
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
    recording_path: string | null;
  }>(
    `SELECT ln.id, ln.subject_id, s.name as subject_name, ln.note, ln.transcript, ln.summary, ln.topics_json, ln.app_name, ln.duration_minutes, ln.confidence, ln.created_at, ln.recording_path
     FROM lecture_notes ln
     LEFT JOIN subjects s ON ln.subject_id = s.id
     WHERE ln.note LIKE ? OR ln.transcript LIKE ? OR ln.summary LIKE ? OR ln.topics_json LIKE ?
     ORDER BY ln.created_at DESC
     LIMIT ?`,
    [likeQuery, likeQuery, likeQuery, likeQuery, limit],
  );

  return rows.map((r) => ({
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
    recordingPath: r.recording_path,
  }));
}

export async function getLegacyLectureNotes(limit = 5): Promise<LectureHistoryItem[]> {
  const db = getDb();
  // Legacy notes are ones that:
  // 1. Don't have the 🎯 Subject marker (meaning they use old format)
  // 2. OR have a transcript but no summary/topics (meaning they were never fully analyzed)
  const rows = await db.getAllAsync<{
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
     WHERE (ln.note NOT LIKE '🎯 %' AND ln.transcript IS NOT NULL)
        OR (ln.transcript IS NOT NULL AND ln.summary IS NULL)
     ORDER BY ln.created_at DESC
     LIMIT ?`,
    [limit],
  );

  return rows.map((r) => ({
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

export async function deleteLectureNote(id: number): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'UPDATE external_app_logs SET lecture_note_id = NULL WHERE lecture_note_id = ?',
    [id],
  );
  await db.runAsync('DELETE FROM lecture_notes WHERE id = ?', [id]);
}

export async function getLectureTranscriptsBySubject(
  subjectId: number,
): Promise<LectureHistoryItem[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
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
     WHERE ln.subject_id = ?
     ORDER BY ln.created_at DESC`,
    [subjectId],
  );

  return rows.map((r) => ({
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

// ── Chat History ──────────────────────────────────────────────────

export interface ChatHistoryMessage {
  id: number;
  topicName: string;
  role: 'user' | 'guru';
  message: string;
  timestamp: number;
  sourcesJson?: string;
  modelUsed?: string;
}

export async function saveChatMessage(
  topicName: string,
  role: 'user' | 'guru',
  message: string,
  timestamp: number,
  sourcesJson?: string,
  modelUsed?: string,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'INSERT INTO chat_history (topic_name, role, message, timestamp, sources_json, model_used) VALUES (?, ?, ?, ?, ?, ?)',
    [topicName, role, message, timestamp, sourcesJson ?? null, modelUsed ?? null],
  );
}

export async function getChatMessageCount(topicName: string): Promise<number> {
  const db = getDb();
  const r = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM chat_history WHERE topic_name = ?',
    [topicName],
  );
  return r?.c ?? 0;
}

export async function getChatHistory(topicName: string, limit = 20): Promise<ChatHistoryMessage[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    id: number;
    topic_name: string;
    role: string;
    message: string;
    timestamp: number;
    sources_json: string | null;
    model_used: string | null;
  }>('SELECT * FROM chat_history WHERE topic_name = ? ORDER BY timestamp ASC LIMIT ?', [
    topicName,
    limit,
  ]);
  return rows.map((r) => ({
    id: r.id,
    topicName: r.topic_name,
    role: r.role as 'user' | 'guru',
    message: r.message,
    timestamp: r.timestamp,
    sourcesJson: r.sources_json ?? undefined,
    modelUsed: r.model_used ?? undefined,
  }));
}

export async function clearChatHistory(topicName: string): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM chat_history WHERE topic_name = ?', [topicName]);
  await db.runAsync('DELETE FROM guru_chat_session_memory WHERE topic_name = ?', [topicName]);
}
