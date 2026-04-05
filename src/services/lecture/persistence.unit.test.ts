import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDb: any = {
  execAsync: jest.fn(),
  runAsync: jest.fn(),
  getFirstAsync: jest.fn(),
  getAllAsync: jest.fn(),
};

jest.mock('../../db/database', () => ({
  getDb: jest.fn(() => mockDb),
  nowTs: jest.fn(() => 1700000000),
  runInTransaction: jest.fn(async (fn: any) => fn(mockDb)),
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
  appendSessionPipelineEvent: jest.fn(),
  updateSessionPipelineTelemetry: jest.fn(),
  updateSessionRecordingPath: jest.fn(),
}));

jest.mock('../../db/queries/progress', () => ({
  addXpInTx: jest.fn(),
}));

jest.mock('../../components/Toast', () => ({
  showToast: jest.fn(),
}));

describe('persistence service', () => {
  describe('saveLecturePersistence', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // Re-set mocks cleared by clearAllMocks
      const dbMod = require('../../db/database');
      dbMod.getDb.mockReturnValue(mockDb);
      dbMod.nowTs.mockReturnValue(1700000000);
      dbMod.runInTransaction.mockImplementation(async (fn: any) => fn(mockDb));
      const backupMod = require('../backgroundBackupService');
      backupMod.runAutoPublicBackup.mockReturnValue(Promise.resolve());
      const eventsMod = require('../databaseEvents');
      eventsMod.notifyDbUpdate.mockReturnValue(undefined);
      mockDb.getFirstAsync.mockResolvedValue({ id: 7 }); // Default subject ID
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

    it('generates embedding if not provided', async () => {
      const { generateEmbedding } = require('../ai/embeddingService');
      const { saveLecturePersistence } = require('./persistence');

      generateEmbedding.mockResolvedValue([0.3, 0.4]);

      await saveLecturePersistence({
        analysis: {
          transcript: 'lecture transcript',
          subject: 'Anatomy',
          topics: ['Heart'],
          lectureSummary: 'Heart anatomy',
          estimatedConfidence: 3,
        },
        appName: 'TestApp',
        durationMinutes: 30,
        logId: 1,
        quickNote: '',
      });

      expect(generateEmbedding).toHaveBeenCalledWith('Heart anatomy');
    });

    it('falls back to fuzzy mapping for subject ID', async () => {
      const { saveLecturePersistence } = require('./persistence');

      // 1. Direct match fails
      mockDb.getFirstAsync.mockResolvedValueOnce(null);
      // 2. Fuzzy match succeeds (e.g. 'anat' -> 'Anatomy')
      mockDb.getFirstAsync.mockResolvedValueOnce({ id: 10 });

      await saveLecturePersistence({
        analysis: { subject: 'anat', topics: [], estimatedConfidence: 1 },
        appName: 'App',
        durationMinutes: 10,
        logId: 1,
        quickNote: '',
      });

      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(name) = LOWER(?)'),
        ['Anatomy'],
      );
    });

    it('handles errors and propagates them (runInTransaction handles rollback)', async () => {
      const { saveLecturePersistence } = require('./persistence');
      const dbMod = require('../../db/database');

      // Simulate runInTransaction catching + rethrowing (which it does internally)
      dbMod.runInTransaction.mockRejectedValue(new Error('DB Error'));

      await expect(
        saveLecturePersistence({
          analysis: { subject: 'Anatomy', topics: [], estimatedConfidence: 1 },
          appName: 'App',
          durationMinutes: 10,
          logId: 1,
          quickNote: '',
        }),
      ).rejects.toThrow('DB Error');
    });
  });
});
