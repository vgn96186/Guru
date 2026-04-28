import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getDrizzleDb } from '../../db/drizzle';

const mockUpdateSessionRecordingPath = jest.fn();
const mockUpdateTelemetry = jest.fn();
const mockAppendPipelineEvent = jest.fn();
const mockRunInTransaction = jest.fn() as jest.Mock;
const mockShowToast = jest.fn();

jest.mock('../../db/database', () => ({
  nowTs: jest.fn(() => 1700000000),
  runInTransaction: (...args: unknown[]) => mockRunInTransaction(...args),
}));

jest.mock('../../db/drizzle', () => ({
  getDrizzleDb: jest.fn(),
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
  appendSessionPipelineEvent: (...args: unknown[]) => mockAppendPipelineEvent(...args),
  updateSessionPipelineTelemetry: (...args: unknown[]) => mockUpdateTelemetry(...args),
  updateSessionRecordingPath: (...args: unknown[]) => mockUpdateSessionRecordingPath(...args),
}));

jest.mock('../../db/queries/progress', () => ({
  addXpInTx: jest.fn(),
}));

jest.mock('../../components/Toast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

function createSelectChain(rowsQueue: unknown[][]) {
  return {
    from: jest.fn(() => ({
      where: jest.fn(() => ({
        limit: jest.fn().mockResolvedValue((rowsQueue.shift() ?? []) as unknown[] as never),
      })),
    })),
  };
}

function createMockDrizzleDb(selectRows: unknown[][] = []) {
  const updateSetCalls: Array<Record<string, unknown>> = [];
  const updateWhere = jest.fn().mockResolvedValue(undefined as never);
  const updateSet = jest.fn((payload: Record<string, unknown>) => {
    updateSetCalls.push(payload);
    return { where: updateWhere };
  });
  const drizzleDb = {
    select: jest.fn(() => createSelectChain(selectRows)),
    update: jest.fn(() => ({ set: updateSet })),
  };

  return { drizzleDb, updateSetCalls, updateWhere };
}

function createMockInsert(noteId = 42) {
  const returning = jest
    .fn<(payload: Record<string, unknown>) => Promise<Array<{ id: number }>>>()
    .mockResolvedValue([{ id: noteId }]);
  const values = jest.fn((payload: Record<string, unknown>) => {
    void payload;
    return { returning };
  });
  const insert = jest.fn(() => ({ values }));
  return { insert, values, returning };
}

function createMockTx(noteId = 42) {
  const returning = jest
    .fn<(payload: Record<string, unknown>) => Promise<Array<{ id: number }>>>()
    .mockResolvedValue([{ id: noteId }]);
  const values = jest.fn((payload: Record<string, unknown>) => {
    void payload;
    return { returning };
  });
  return {
    tx: {
      insert: jest.fn(() => ({ values })),
    },
    values,
  };
}

describe('persistence service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const dbModule = require('../../db/database');
    const embeddingModule = require('../ai/embeddingService');
    const backupModule = require('../backgroundBackupService');
    dbModule.nowTs.mockReturnValue(1700000000);
    embeddingModule.embeddingToBlob.mockReturnValue('mock-blob');
    backupModule.runAutoPublicBackup.mockResolvedValue(undefined);
  });

  it('does not treat the expo-sqlite transaction db as a drizzle builder', async () => {
    const { saveTranscriptToFile } = require('../transcriptStorage');
    const { saveLecturePersistence } = require('./persistence');

    const { drizzleDb, updateSetCalls } = createMockDrizzleDb([[{ id: 7 }]]);
    const { insert, values } = createMockInsert(42);
    drizzleDb.insert = insert;

    (getDrizzleDb as jest.Mock).mockReturnValue(drizzleDb);
    mockRunInTransaction.mockImplementation((async (fn: (txn: unknown) => Promise<number>) =>
      fn({ execAsync: jest.fn() })) as never);

    saveTranscriptToFile.mockResolvedValue('file:///mock/transcript.txt');

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

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 7,
        recordingPath: '/recordings/raw.m4a',
        transcript: 'file:///mock/transcript.txt',
      }),
    );
    expect(updateSetCalls).toEqual(
      expect.arrayContaining([expect.objectContaining({ transcriptionStatus: 'completed' })]),
    );
  });

  it('stores the original recording path first, then updates both records after rename', async () => {
    const {
      saveTranscriptToFile,
      renameRecordingToLectureIdentity,
    } = require('../transcriptStorage');
    const { saveLecturePersistence } = require('./persistence');

    const { drizzleDb, updateSetCalls } = createMockDrizzleDb([[{ id: 7 }]]);
    const { insert, values } = createMockInsert(42);
    drizzleDb.insert = insert;
    (getDrizzleDb as jest.Mock).mockReturnValue(drizzleDb);
    mockRunInTransaction.mockImplementation((async (fn: (txn: unknown) => Promise<number>) =>
      fn({ execAsync: jest.fn() })) as never);

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

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 7,
        recordingPath: '/recordings/raw.m4a',
        transcript: 'file:///mock/transcript.txt',
        embedding: 'mock-blob',
      }),
    );
    expect(renameRecordingToLectureIdentity).toHaveBeenCalledWith('/recordings/raw.m4a', {
      subjectName: 'Biochemistry',
      topics: ['Glycolysis'],
    });
    expect(updateSetCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ transcriptionStatus: 'completed', lectureNoteId: 42 }),
        expect.objectContaining({ recordingPath: '/recordings/Biochem-Glycolysis.m4a' }),
      ]),
    );
    expect(mockUpdateSessionRecordingPath).toHaveBeenCalledWith(
      11,
      '/recordings/Biochem-Glycolysis.m4a',
    );
  });

  it('generates embedding if not provided', async () => {
    const { generateEmbedding } = require('../ai/embeddingService');
    const { saveLecturePersistence } = require('./persistence');

    const { drizzleDb } = createMockDrizzleDb([[{ id: 7 }]]);
    const { insert, values } = createMockInsert(42);
    drizzleDb.insert = insert;
    (getDrizzleDb as jest.Mock).mockReturnValue(drizzleDb);
    mockRunInTransaction.mockImplementation((async (fn: (txn: unknown) => Promise<number>) =>
      fn({ execAsync: jest.fn() })) as never);
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
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        embedding: 'mock-blob',
      }),
    );
  });

  it('falls back to fuzzy mapping for subject ID', async () => {
    const { saveLecturePersistence } = require('./persistence');

    const { drizzleDb } = createMockDrizzleDb([[], [{ id: 10 }]]);
    const { insert, values } = createMockInsert(42);
    drizzleDb.insert = insert;
    (getDrizzleDb as jest.Mock).mockReturnValue(drizzleDb);
    mockRunInTransaction.mockImplementation((async (fn: (txn: unknown) => Promise<number>) =>
      fn({ execAsync: jest.fn() })) as never);

    await saveLecturePersistence({
      analysis: { transcript: '', subject: 'anat', topics: [], estimatedConfidence: 1 },
      appName: 'App',
      durationMinutes: 10,
      logId: 1,
      quickNote: '',
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 10,
      }),
    );
  });

  it('handles errors and propagates them (runInTransaction handles rollback)', async () => {
    const { saveLecturePersistence } = require('./persistence');

    const { drizzleDb } = createMockDrizzleDb([[{ id: 7 }]]);
    (getDrizzleDb as jest.Mock).mockReturnValue(drizzleDb);
    mockRunInTransaction.mockRejectedValue(new Error('DB Error') as never);

    await expect(
      saveLecturePersistence({
        analysis: { transcript: '', subject: 'Anatomy', topics: [], estimatedConfidence: 1 },
        appName: 'App',
        durationMinutes: 10,
        logId: 1,
        quickNote: '',
      }),
    ).rejects.toThrow('DB Error');

    expect(mockShowToast).toHaveBeenCalled();
  });
});
