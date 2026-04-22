import { eq } from 'drizzle-orm';
import { safeJsonParse } from '../../utils/safeJsonParse';
import { getDrizzleDb } from '../drizzle';
import { lectureLearnedTopics, lectureNotes, subjects } from '../drizzleSchema';

export interface CreateLectureNoteInput {
  subjectId: number | null;
  note: string;
  transcript?: string | null;
  summary?: string | null;
  topics?: string[];
  appName?: string | null;
  durationMinutes?: number | null;
  confidence?: number;
  recordingPath?: string | null;
  learnedTopicIds?: number[];
}

export interface LectureNoteRecord {
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
  recordingPath: string | null;
  learnedTopicIds: number[];
}

type LectureNoteRow = {
  id: number;
  subjectId: number | null;
  subjectName: string | null;
  note: string;
  transcript: string | null;
  summary: string | null;
  topicsJson: string | null;
  appName: string | null;
  durationMinutes: number | null;
  confidence: number | null;
  createdAt: number;
  recordingPath: string | null;
};

function mapLectureNoteRow(row: LectureNoteRow, learnedTopicIds: number[]): LectureNoteRecord {
  return {
    id: row.id,
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    note: row.note,
    transcript: row.transcript,
    summary: row.summary,
    topics: safeJsonParse<string[]>(row.topicsJson, []),
    appName: row.appName,
    durationMinutes: row.durationMinutes,
    confidence: row.confidence ?? 2,
    createdAt: row.createdAt,
    recordingPath: row.recordingPath,
    learnedTopicIds,
  };
}

export const lectureNotesRepositoryDrizzle = {
  async createLectureNote(input: CreateLectureNoteInput): Promise<number> {
    const db = getDrizzleDb();
    const trimmedNote = input.note.trim();
    const confidence = input.confidence ?? 2;

    const insertedRows = await db
      .insert(lectureNotes)
      .values({
        subjectId: input.subjectId,
        note: trimmedNote,
        createdAt: Date.now(),
        transcript: input.transcript ?? null,
        summary: input.summary ?? null,
        topicsJson: input.topics ? JSON.stringify(input.topics) : null,
        appName: input.appName ?? null,
        durationMinutes: input.durationMinutes ?? null,
        confidence,
        recordingPath: input.recordingPath ?? null,
      })
      .returning({ id: lectureNotes.id });

    const lectureNoteId = insertedRows[0]?.id ?? 0;
    const learnedTopicIds = input.learnedTopicIds ?? [];

    if (lectureNoteId > 0 && learnedTopicIds.length > 0) {
      const createdAt = Date.now();
      await db.insert(lectureLearnedTopics).values(
        learnedTopicIds.map((topicId) => ({
          lectureNoteId,
          topicId,
          confidenceAtTime: confidence,
          createdAt,
        })),
      );
    }

    return lectureNoteId;
  },

  async updateLectureNoteSummary(noteId: number, summary: string | null): Promise<void> {
    const db = getDrizzleDb();
    await db.update(lectureNotes).set({ summary }).where(eq(lectureNotes.id, noteId));
  },

  async updateLectureNoteRecordingPath(noteId: number, path: string | null): Promise<void> {
    const db = getDrizzleDb();
    await db.update(lectureNotes).set({ recordingPath: path }).where(eq(lectureNotes.id, noteId));
  },

  async getLectureNoteById(noteId: number): Promise<LectureNoteRecord | null> {
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

    if (rows.length === 0) {
      return null;
    }

    const learnedTopicRows = await db
      .select({
        topicId: lectureLearnedTopics.topicId,
      })
      .from(lectureLearnedTopics)
      .where(eq(lectureLearnedTopics.lectureNoteId, noteId));

    return mapLectureNoteRow(
      rows[0] as LectureNoteRow,
      learnedTopicRows.map((row) => row.topicId),
    );
  },
};
