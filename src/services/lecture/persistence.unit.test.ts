import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDb: any = {
  execAsync: jest.fn(),
  runAsync: jest.fn(),
  getFirstAsync: jest.fn(),
};

jest.mock('../../db/database', () => ({
  getDb: jest.fn(() => mockDb),
  nowTs: jest.fn(() => 1700000000),
}));

jest.mock('../transcriptStorage', () => ({
  saveTranscriptToFile: jest.fn(),
  renameRecordingToLectureIdentity: jest.fn(),
}));

jest.mock('../transcription/matching', () => ({
  markTopicsFromLecture: jest.fn(),
}));

jest.mock('../ai/embeddingService', () => ({
  embeddingToBlob: jest.fn(() => 'mock-blob'),
  generateEmbedding: jest.fn(),
}));

jest.mock('../backgroundBackupService', () => ({
  runAutoPublicBackup: jest.fn(() => Promise.resolve()),
}));

jest.mock('../databaseEvents', () => ({
  notifyDbUpdate: jest.fn(),
  DB_EVENT_KEYS: {
    LECTURE_SAVED: 'lecture_saved',
  },
}));

jest.mock('../../db/queries/externalLogs', () => ({
  updateSessionRecordingPath: jest.fn(),
}));

jest.mock('../../db/queries/progress', () => ({
  addXpInTx: jest.fn(),
}));

describe('saveLecturePersistence', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockDb.getFirstAsync.mockResolvedValue({ id: 7 });
    mockDb.execAsync.mockResolvedValue(undefined);
    mockDb.runAsync.mockImplementation(async (sql: any) => {
      if (sql.includes('INSERT INTO lecture_notes')) {
        return { lastInsertRowId: 42 };
      }
      return { lastInsertRowId: 0 };
    });
  });

  it('stores the original recording path first, then updates both records after rename', async () => {
    const {
      saveTranscriptToFile,
      renameRecordingToLectureIdentity,
    } = require('../transcriptStorage');
    const { updateSessionRecordingPath } = require('../../db/queries/externalLogs');
    const { saveLecturePersistence } = require('./persistence');

    saveTranscriptToFile.mockResolvedValue('file:///mock/transcript.txt');
    renameRecordingToLectureIdentity.mockResolvedValue('/recordings/Biochem-Glycolysis.m4a');

    await saveLecturePersistence({
      analysis: {
        transcript: 'lecture transcript',
        subject: 'Biochemistry',
        topics: ['Glycolysis'],
        keyConcepts: [],
        highYieldPoints: [],
        lectureSummary: 'Glycolysis overview',
        estimatedConfidence: 2,
      },
      appName: 'Marrow',
      durationMinutes: 55,
      logId: 11,
      quickNote: 'Quick note',
      embedding: [0.1, 0.2],
      recordingPath: '/recordings/raw.m4a',
    });

    const insertCall = mockDb.runAsync.mock.calls.find(([sql]: [string]) =>
      String(sql).includes('INSERT INTO lecture_notes'),
    );
    expect((insertCall as any)?.[1][10]).toBe('/recordings/raw.m4a');
    expect(renameRecordingToLectureIdentity).toHaveBeenCalledWith('/recordings/raw.m4a', {
      subjectName: 'Biochemistry',
      topics: ['Glycolysis'],
    });
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE lecture_notes SET recording_path = ? WHERE id = ?',
      ['/recordings/Biochem-Glycolysis.m4a', 42],
    );
    expect(updateSessionRecordingPath).toHaveBeenCalledWith(
      11,
      '/recordings/Biochem-Glycolysis.m4a',
    );
  });
});
