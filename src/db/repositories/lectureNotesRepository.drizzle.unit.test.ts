import { getDrizzleDb } from '../drizzle';
import { lectureNotesRepositoryDrizzle } from './lectureNotesRepository.drizzle';

jest.mock('../drizzle', () => ({
  getDrizzleDb: jest.fn(),
}));

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
};

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

const makeDb = (): MockDb => ({
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
});

const makeLectureNoteRow = (overrides: Partial<LectureNoteRow> = {}): LectureNoteRow => ({
  id: 12,
  subjectId: 4,
  subjectName: 'Medicine',
  note: 'Cardiology rapid review',
  transcript: 'Transcript text',
  summary: 'Short summary',
  topicsJson: '["Murmurs","Heart failure"]',
  appName: 'DBMCI',
  durationMinutes: 55,
  confidence: 3,
  createdAt: 1710000000000,
  recordingPath: '/tmp/lecture.m4a',
  ...overrides,
});

describe('lectureNotesRepositoryDrizzle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createLectureNote inserts note row and linked learned topics when provided', async () => {
    const db = makeDb();
    const noteReturning = jest.fn().mockResolvedValue([{ id: 91 }]);
    const noteValues = jest.fn(() => ({ returning: noteReturning }));
    const learnedTopicsValues = jest.fn().mockResolvedValue(undefined);
    db.insert.mockReturnValueOnce({ values: noteValues }).mockReturnValueOnce({
      values: learnedTopicsValues,
    });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await lectureNotesRepositoryDrizzle.createLectureNote({
      subjectId: 4,
      note: '  Renal lecture summary  ',
      transcript: 'Full transcript',
      summary: 'Condensed summary',
      topics: ['AKI', 'CKD'],
      appName: 'Marrow',
      durationMinutes: 80,
      confidence: 2,
      recordingPath: '/recordings/renal.m4a',
      learnedTopicIds: [7, 9],
    });

    expect(result).toBe(91);
    expect(noteValues).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 4,
        note: 'Renal lecture summary',
        transcript: 'Full transcript',
        summary: 'Condensed summary',
        topicsJson: '["AKI","CKD"]',
        appName: 'Marrow',
        durationMinutes: 80,
        confidence: 2,
        recordingPath: '/recordings/renal.m4a',
      }),
    );
    const firstInsertCall = Array.from(noteValues.mock.calls).at(0) as unknown[] | undefined;
    const insertedNote = firstInsertCall?.at(0) as Record<string, unknown> | undefined;
    expect(typeof insertedNote?.createdAt).toBe('number');
    expect(learnedTopicsValues).toHaveBeenCalledWith([
      expect.objectContaining({ lectureNoteId: 91, topicId: 7, confidenceAtTime: 2 }),
      expect.objectContaining({ lectureNoteId: 91, topicId: 9, confidenceAtTime: 2 }),
    ]);
  });

  it('createLectureNote skips learned topic inserts when none are provided', async () => {
    const db = makeDb();
    const noteReturning = jest.fn().mockResolvedValue([{ id: 44 }]);
    const noteValues = jest.fn(() => ({ returning: noteReturning }));
    db.insert.mockReturnValueOnce({ values: noteValues });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await lectureNotesRepositoryDrizzle.createLectureNote({
      subjectId: null,
      note: 'Legacy note',
    });

    expect(result).toBe(44);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it('updateLectureNoteSummary only writes the summary column', async () => {
    const db = makeDb();
    const where = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn(() => ({ where }));
    db.update.mockReturnValue({ set });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    await lectureNotesRepositoryDrizzle.updateLectureNoteSummary(12, 'Updated summary');

    expect(set).toHaveBeenCalledWith({ summary: 'Updated summary' });
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('updateLectureNoteRecordingPath only writes the recording path column', async () => {
    const db = makeDb();
    const where = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn(() => ({ where }));
    db.update.mockReturnValue({ set });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    await lectureNotesRepositoryDrizzle.updateLectureNoteRecordingPath(12, null);

    expect(set).toHaveBeenCalledWith({ recordingPath: null });
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('getLectureNoteById returns a mapped note with learned topic ids and safe JSON fallback', async () => {
    const db = makeDb();

    const noteLimit = jest.fn().mockResolvedValue([
      makeLectureNoteRow({
        topicsJson: 'not-json',
        confidence: null,
      }),
    ]);
    const noteWhere = jest.fn(() => ({ limit: noteLimit }));
    const leftJoin = jest.fn(() => ({ where: noteWhere }));
    const fromNotes = jest.fn(() => ({ leftJoin }));

    const learnedWhere = jest.fn().mockResolvedValue([{ topicId: 8 }, { topicId: 10 }]);
    const fromLearned = jest.fn(() => ({ where: learnedWhere }));

    db.select.mockReturnValueOnce({ from: fromNotes }).mockReturnValueOnce({ from: fromLearned });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await lectureNotesRepositoryDrizzle.getLectureNoteById(12);

    expect(noteLimit).toHaveBeenCalledWith(1);
    expect(result).toEqual({
      id: 12,
      subjectId: 4,
      subjectName: 'Medicine',
      note: 'Cardiology rapid review',
      transcript: 'Transcript text',
      summary: 'Short summary',
      topics: [],
      appName: 'DBMCI',
      durationMinutes: 55,
      confidence: 2,
      createdAt: 1710000000000,
      recordingPath: '/tmp/lecture.m4a',
      learnedTopicIds: [8, 10],
    });
  });

  it('getLectureNoteById returns null when the note does not exist', async () => {
    const db = makeDb();
    const noteLimit = jest.fn().mockResolvedValue([]);
    const noteWhere = jest.fn(() => ({ limit: noteLimit }));
    const leftJoin = jest.fn(() => ({ where: noteWhere }));
    const fromNotes = jest.fn(() => ({ leftJoin }));
    db.select.mockReturnValueOnce({ from: fromNotes });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await lectureNotesRepositoryDrizzle.getLectureNoteById(404);

    expect(result).toBeNull();
    expect(db.select).toHaveBeenCalledTimes(1);
  });
});
