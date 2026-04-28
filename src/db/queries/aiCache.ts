import type { AIContent, ContentType } from '../../types';
import {
  aiCacheRepositoryDrizzle,
  type MockQuestion,
  type FlaggedItem,
} from '../repositories/aiCacheRepository.drizzle';
import { lectureNotesRepositoryDrizzle } from '../repositories/lectureNotesRepository.drizzle';
import {
  guruChatRepositoryDrizzle,
  type GuruChatThread,
  type ChatHistoryMessage,
} from '../repositories/guruChatRepository.drizzle';
import { getDrizzleDb } from '../drizzle';
import { runInTransaction } from '../database';
import { eq, sql, desc, or, like, and, inArray } from 'drizzle-orm';
import {
  lectureNotes,
  subjects,
  chatHistory,
  guruChatSessionMemory,
  guruChatThreads,
  externalAppLogs,
} from '../drizzleSchema';
import { embeddingToBlob } from '../../services/ai/embeddingService';
import { saveTranscriptToFile } from '../../services/transcriptStorage';
import { safeJsonParse } from '../../utils/safeJsonParse';

export type { MockQuestion, FlaggedItem };
export type { GuruChatThread, ChatHistoryMessage };

export async function getCachedContent(
  topicId: number,
  contentType: ContentType,
): Promise<AIContent | null> {
  return aiCacheRepositoryDrizzle.getCachedContent(topicId, contentType);
}

export async function setCachedContent(
  topicId: number,
  contentType: ContentType,
  content: AIContent,
  modelUsed: string,
): Promise<void> {
  return aiCacheRepositoryDrizzle.setCachedContent(topicId, contentType, content, modelUsed);
}

export async function getCachedQuestionCount(): Promise<number> {
  return aiCacheRepositoryDrizzle.getCachedQuestionCount();
}

export async function getMockQuestions(limit: number): Promise<MockQuestion[]> {
  return aiCacheRepositoryDrizzle.getMockQuestions(limit);
}

export async function getAllCachedQuestions(): Promise<MockQuestion[]> {
  return aiCacheRepositoryDrizzle.getAllCachedQuestions();
}

export async function setContentFlagged(
  topicId: number,
  contentType: ContentType,
  flagged: boolean,
): Promise<void> {
  return aiCacheRepositoryDrizzle.setContentFlagged(topicId, contentType, flagged);
}

export async function flagTopicForReview(topicId: number, topicName: string): Promise<ContentType> {
  const existing = await aiCacheRepositoryDrizzle.getCachedContent(topicId, 'keypoints');
  const contentType = existing?.type ?? 'keypoints';

  if (!existing) {
    await aiCacheRepositoryDrizzle.setCachedContent(
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

  await aiCacheRepositoryDrizzle.setContentFlagged(topicId, contentType, true);
  return contentType;
}

export async function isContentFlagged(
  topicId: number,
  contentType: ContentType,
): Promise<boolean> {
  return aiCacheRepositoryDrizzle.isContentFlagged(topicId, contentType);
}

export async function getFlaggedContent(): Promise<FlaggedItem[]> {
  return aiCacheRepositoryDrizzle.getFlaggedContent();
}

export async function clearTopicCache(topicId: number): Promise<void> {
  return aiCacheRepositoryDrizzle.clearTopicCache(topicId);
}

export async function clearSpecificContentCache(
  topicId: number,
  contentType: ContentType,
): Promise<void> {
  return aiCacheRepositoryDrizzle.clearSpecificContentCache(topicId, contentType);
}

// ── Lecture Notes ────────────────────────────────────────────────

export async function saveLectureNote(
  subjectId: number | null,
  note: string,
  embedding?: number[] | null,
): Promise<void> {
  const db = getDrizzleDb();
  await db.insert(lectureNotes).values({
    subjectId,
    note,
    createdAt: Date.now(),
    embedding: embedding ? embeddingToBlob(embedding) : null,
  });
}

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
  const transcriptValue = data.transcript
    ? await saveTranscriptToFile(data.transcript, {
        subjectName: data.subjectName,
        topics: data.topics,
      })
    : null;

  const db = getDrizzleDb();
  const rows = await db
    .insert(lectureNotes)
    .values({
      subjectId: data.subjectId ?? null,
      note: data.note,
      createdAt: Date.now(),
      transcript: transcriptValue,
      summary: data.summary ?? null,
      topicsJson: data.topics ? JSON.stringify(data.topics) : null,
      appName: data.appName ?? null,
      durationMinutes: data.durationMinutes ?? null,
      confidence: data.confidence ?? 2,
      embedding: data.embedding ? embeddingToBlob(data.embedding) : null,
      recordingPath: data.recordingPath ?? null,
    })
    .returning({ id: lectureNotes.id });
  return rows[0].id;
}

export async function updateLectureTranscriptNote(noteId: number, note: string): Promise<void> {
  const db = getDrizzleDb();
  await db.update(lectureNotes).set({ note }).where(eq(lectureNotes.id, noteId));
}

export async function updateLectureTranscriptSummary(
  noteId: number,
  summary: string | null,
): Promise<void> {
  return lectureNotesRepositoryDrizzle.updateLectureNoteSummary(noteId, summary);
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
  const db = getDrizzleDb();
  await db
    .update(lectureNotes)
    .set({
      subjectId: data.subjectId ?? sql`subject_id`,
      summary: data.summary ?? null,
      topicsJson: data.topics ? JSON.stringify(data.topics) : null,
      confidence: data.confidence ?? sql`confidence`,
    })
    .where(eq(lectureNotes.id, noteId));
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
  const db = getDrizzleDb();
  await db
    .update(lectureNotes)
    .set({
      note: data.note,
      transcript: data.transcript,
      subjectId: data.subjectId ?? sql`subject_id`,
      summary: data.summary ?? null,
      topicsJson: data.topics ? JSON.stringify(data.topics) : null,
      confidence: data.confidence ?? sql`confidence`,
    })
    .where(eq(lectureNotes.id, noteId));
}

export async function updateLectureRecordingPath(
  noteId: number,
  recordingPath: string | null,
): Promise<void> {
  return lectureNotesRepositoryDrizzle.updateLectureNoteRecordingPath(noteId, recordingPath);
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
  const db = getDrizzleDb();
  const rows = await db
    .select({
      id: lectureNotes.id,
      subjectId: lectureNotes.subjectId,
      subjectName: subjects.name,
      note: lectureNotes.note,
      transcript: lectureNotes.transcript,
      summary: lectureNotes.summary,
      topicsJson: lectureNotes.topicsJson,
      appName: lectureNotes.appName,
      durationMinutes: lectureNotes.durationMinutes,
      confidence: lectureNotes.confidence,
      createdAt: lectureNotes.createdAt,
      recordingPath: lectureNotes.recordingPath,
    })
    .from(lectureNotes)
    .leftJoin(subjects, eq(lectureNotes.subjectId, subjects.id))
    .where(eq(lectureNotes.id, noteId))
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    note: row.note,
    transcript: row.transcript,
    summary: row.summary,
    topics: safeJsonParse(row.topicsJson, []),
    appName: row.appName,
    durationMinutes: row.durationMinutes,
    confidence: row.confidence ?? 2,
    createdAt: row.createdAt,
    recordingPath: row.recordingPath,
  };
}

export async function getLectureHistory(limit = 50): Promise<LectureHistoryItem[]> {
  const db = getDrizzleDb();
  const rows = await db
    .select({
      id: lectureNotes.id,
      subjectId: lectureNotes.subjectId,
      subjectName: subjects.name,
      note: lectureNotes.note,
      transcript: lectureNotes.transcript,
      summary: lectureNotes.summary,
      topicsJson: lectureNotes.topicsJson,
      appName: lectureNotes.appName,
      durationMinutes: lectureNotes.durationMinutes,
      confidence: lectureNotes.confidence,
      createdAt: lectureNotes.createdAt,
      recordingPath: lectureNotes.recordingPath,
    })
    .from(lectureNotes)
    .leftJoin(subjects, eq(lectureNotes.subjectId, subjects.id))
    .orderBy(desc(lectureNotes.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    note: row.note,
    transcript: row.transcript,
    summary: row.summary,
    topics: safeJsonParse(row.topicsJson, []),
    appName: row.appName,
    durationMinutes: row.durationMinutes,
    confidence: row.confidence ?? 2,
    createdAt: row.createdAt,
    recordingPath: row.recordingPath,
  }));
}

import { generateEmbedding } from '../../services/ai/embeddingService';
import { getDb } from '../database';

export async function searchLectureNotes(query: string, limit = 20): Promise<LectureHistoryItem[]> {
  const db = getDrizzleDb();
  const likeQuery = `%${query}%`;
  
  // 1. LIKE search
  const likeRows = await db
    .select({
      id: lectureNotes.id,
      subjectId: lectureNotes.subjectId,
      subjectName: subjects.name,
      note: lectureNotes.note,
      transcript: lectureNotes.transcript,
      summary: lectureNotes.summary,
      topicsJson: lectureNotes.topicsJson,
      appName: lectureNotes.appName,
      durationMinutes: lectureNotes.durationMinutes,
      confidence: lectureNotes.confidence,
      createdAt: lectureNotes.createdAt,
      recordingPath: lectureNotes.recordingPath,
    })
    .from(lectureNotes)
    .leftJoin(subjects, eq(lectureNotes.subjectId, subjects.id))
    .where(
      or(
        like(lectureNotes.note, likeQuery),
        like(lectureNotes.transcript, likeQuery),
        like(lectureNotes.summary, likeQuery),
        like(lectureNotes.topicsJson, likeQuery),
      ),
    )
    .orderBy(desc(lectureNotes.createdAt))
    .limit(limit);

  // 2. Semantic search
  const vector = await generateEmbedding(query);
  let vssRows: typeof likeRows = [];
  
  if (vector) {
    try {
      const rawDb = getDb();
      const vssResults = await rawDb.getAllAsync<{ id: number; distance: number }>(
        `SELECT id, vec_distance_cosine(embedding, ?) as distance
         FROM vss_lecture_notes
         WHERE embedding MATCH ? AND k = ?
         ORDER BY distance ASC`,
        [embeddingToBlob(vector), embeddingToBlob(vector), limit]
      );
      
      const vssIds = vssResults.map((r) => r.id);
      
      if (vssIds.length > 0) {
        // Fetch full rows for semantic hits
        const semanticRows = await db
          .select({
            id: lectureNotes.id,
            subjectId: lectureNotes.subjectId,
            subjectName: subjects.name,
            note: lectureNotes.note,
            transcript: lectureNotes.transcript,
            summary: lectureNotes.summary,
            topicsJson: lectureNotes.topicsJson,
            appName: lectureNotes.appName,
            durationMinutes: lectureNotes.durationMinutes,
            confidence: lectureNotes.confidence,
            createdAt: lectureNotes.createdAt,
            recordingPath: lectureNotes.recordingPath,
          })
          .from(lectureNotes)
          .leftJoin(subjects, eq(lectureNotes.subjectId, subjects.id))
          .where(inArray(lectureNotes.id, vssIds));
          
        // Sort by the VSS distance order
        vssRows = vssIds
          .map((id) => semanticRows.find((r) => r.id === id))
          .filter((r): r is NonNullable<typeof r> => !!r);
      }
    } catch (err) {
      if (__DEV__) console.warn('[DB] Semantic search failed:', err);
    }
  }

  // 3. Merge results (LIKE hits first, then VSS hits, deduplicated)
  const mergedMap = new Map<number, typeof likeRows[0]>();
  for (const row of likeRows) {
    if (!mergedMap.has(row.id)) mergedMap.set(row.id, row);
  }
  for (const row of vssRows) {
    if (!mergedMap.has(row.id)) mergedMap.set(row.id, row);
  }

  const combinedRows = Array.from(mergedMap.values()).slice(0, limit);

  return combinedRows.map((row) => ({
    id: row.id,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    note: row.note,
    transcript: row.transcript,
    summary: row.summary,
    topics: safeJsonParse(row.topicsJson, []),
    appName: row.appName,
    durationMinutes: row.durationMinutes,
    confidence: row.confidence ?? 2,
    createdAt: row.createdAt,
    recordingPath: row.recordingPath,
  }));
}

export async function getLegacyLectureNotes(limit = 5): Promise<LectureHistoryItem[]> {
  const db = getDrizzleDb();
  const rows = await db
    .select({
      id: lectureNotes.id,
      subjectId: lectureNotes.subjectId,
      subjectName: subjects.name,
      note: lectureNotes.note,
      transcript: lectureNotes.transcript,
      summary: lectureNotes.summary,
      topicsJson: lectureNotes.topicsJson,
      appName: lectureNotes.appName,
      durationMinutes: lectureNotes.durationMinutes,
      confidence: lectureNotes.confidence,
      createdAt: lectureNotes.createdAt,
    })
    .from(lectureNotes)
    .leftJoin(subjects, eq(lectureNotes.subjectId, subjects.id))
    .where(
      or(
        and(sql`${lectureNotes.note} NOT LIKE '🎯 %'`, sql`${lectureNotes.transcript} IS NOT NULL`),
        and(sql`${lectureNotes.transcript} IS NOT NULL`, sql`${lectureNotes.summary} IS NULL`),
      ),
    )
    .orderBy(desc(lectureNotes.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    note: row.note,
    transcript: row.transcript,
    summary: row.summary,
    topics: safeJsonParse(row.topicsJson, []),
    appName: row.appName,
    durationMinutes: row.durationMinutes,
    confidence: row.confidence ?? 2,
    createdAt: row.createdAt,
  }));
}

export async function deleteLectureNote(id: number): Promise<void> {
  const db = getDrizzleDb();
  await db
    .update(externalAppLogs)
    .set({ lectureNoteId: null, transcriptionStatus: 'dismissed' })
    .where(eq(externalAppLogs.lectureNoteId, id));
  await db.delete(lectureNotes).where(eq(lectureNotes.id, id));
}

export async function getLectureTranscriptsBySubject(
  subjectId: number,
): Promise<LectureHistoryItem[]> {
  const db = getDrizzleDb();
  const rows = await db
    .select({
      id: lectureNotes.id,
      subjectId: lectureNotes.subjectId,
      subjectName: subjects.name,
      note: lectureNotes.note,
      transcript: lectureNotes.transcript,
      summary: lectureNotes.summary,
      topicsJson: lectureNotes.topicsJson,
      appName: lectureNotes.appName,
      durationMinutes: lectureNotes.durationMinutes,
      confidence: lectureNotes.confidence,
      createdAt: lectureNotes.createdAt,
    })
    .from(lectureNotes)
    .leftJoin(subjects, eq(lectureNotes.subjectId, subjects.id))
    .where(eq(lectureNotes.subjectId, subjectId))
    .orderBy(desc(lectureNotes.createdAt));

  return rows.map((row) => ({
    id: row.id,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    note: row.note,
    transcript: row.transcript,
    summary: row.summary,
    topics: safeJsonParse(row.topicsJson, []),
    appName: row.appName,
    durationMinutes: row.durationMinutes,
    confidence: row.confidence ?? 2,
    createdAt: row.createdAt,
  }));
}

// ── Chat History ──────────────────────────────────────────────────

export async function createGuruChatThread(
  topicName: string,
  syllabusTopicId?: number | null,
  title?: string | null,
): Promise<GuruChatThread> {
  return guruChatRepositoryDrizzle.createGuruChatThread(topicName, syllabusTopicId, title);
}

export async function getGuruChatThreadById(threadId: number): Promise<GuruChatThread | null> {
  return guruChatRepositoryDrizzle.getGuruChatThreadById(threadId);
}

export async function getLatestGuruChatThread(
  topicName: string,
  syllabusTopicId?: number | null,
): Promise<GuruChatThread | null> {
  const db = getDrizzleDb();
  const rows = await db
    .select({ id: guruChatThreads.id })
    .from(guruChatThreads)
    .where(
      and(
        eq(guruChatThreads.topicName, topicName),
        syllabusTopicId
          ? eq(guruChatThreads.syllabusTopicId, syllabusTopicId)
          : sql`${guruChatThreads.syllabusTopicId} IS NULL`,
      ),
    )
    .orderBy(
      desc(guruChatThreads.lastMessageAt),
      desc(guruChatThreads.updatedAt),
      desc(guruChatThreads.id),
    )
    .limit(1);

  if (rows.length === 0) return null;
  return getGuruChatThreadById(rows[0].id);
}

export async function getOrCreateLatestGuruChatThread(
  topicName: string,
  syllabusTopicId?: number | null,
): Promise<GuruChatThread> {
  const existing = await getLatestGuruChatThread(topicName, syllabusTopicId);
  if (existing) return existing;
  return createGuruChatThread(topicName, syllabusTopicId);
}

export async function listGuruChatThreads(limit = 40): Promise<GuruChatThread[]> {
  return guruChatRepositoryDrizzle.listGuruChatThreads(limit);
}

export async function renameGuruChatThread(threadId: number, title: string): Promise<void> {
  const db = getDrizzleDb();
  const normalized = title.trim();
  if (!normalized) return;
  await db
    .update(guruChatThreads)
    .set({ title: normalized, updatedAt: Date.now() })
    .where(eq(guruChatThreads.id, threadId));
}

export async function deleteGuruChatThread(threadId: number): Promise<void> {
  await runInTransaction(async (_txDb) => {
    const db = getDrizzleDb();
    await db.delete(chatHistory).where(eq(chatHistory.threadId, threadId));
    await db.delete(guruChatSessionMemory).where(eq(guruChatSessionMemory.threadId, threadId));
    await db.delete(guruChatThreads).where(eq(guruChatThreads.id, threadId));
  });
}

export async function saveChatMessage(
  threadId: number,
  topicName: string,
  role: 'user' | 'guru',
  message: string,
  timestamp: number,
  sourcesJson?: string,
  modelUsed?: string,
): Promise<void> {
  return guruChatRepositoryDrizzle.saveChatMessage(
    threadId,
    topicName,
    role,
    message,
    timestamp,
    sourcesJson,
    modelUsed,
  );
}

export async function getChatMessageCount(threadId: number): Promise<number> {
  const db = getDrizzleDb();
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(chatHistory)
    .where(eq(chatHistory.threadId, threadId));
  return result[0]?.count ?? 0;
}

export async function getChatHistory(threadId: number, limit = 20): Promise<ChatHistoryMessage[]> {
  return guruChatRepositoryDrizzle.getChatHistory(threadId, limit);
}

export async function clearChatHistory(topicName: string): Promise<void> {
  await runInTransaction(async (_txDb) => {
    const db = getDrizzleDb();
    await db.delete(chatHistory).where(eq(chatHistory.topicName, topicName));
    await db.delete(guruChatSessionMemory).where(eq(guruChatSessionMemory.topicName, topicName));
    await db.delete(guruChatThreads).where(eq(guruChatThreads.topicName, topicName));
  });
}
