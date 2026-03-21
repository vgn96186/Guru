import { describe, it, expect, jest, afterEach, beforeEach } from '@jest/globals';

jest.mock('../../components/Toast', () => ({
  showToast: jest.fn(),
}));

jest.mock('expo-device', () => ({
  modelName: 'MockDevice',
}));

jest.mock('expo-modules-core', () => ({
  requireNativeModule: jest.fn(() => ({})),
  requireOptionalNativeModule: jest.fn(() => ({})),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
}));

jest.mock(
  'llama.rn',
  () => ({
    initLlama: jest.fn(),
  }),
  { virtual: true },
);

jest.mock(
  'whisper.rn',
  () => ({
    initWhisper: jest.fn(),
  }),
  { virtual: true },
);

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock/dir/',
  getInfoAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
}));

jest.mock('../../db/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('../../db/repositories', () => ({
  profileRepository: {
    getProfile: jest.fn(() => Promise.resolve({ useLocalWhisper: false })),
  },
  dailyLogRepository: {
    getLogsByDate: jest.fn(() => Promise.resolve([])),
  },
}));

// We'll mock the transcribeAudio to avoid full pipeline
jest.mock('../transcriptionService', () => ({
  analyzeTranscript: jest.fn(),
  generateADHDNote: jest.fn(),
  buildQuickLectureNote: jest.fn(),
  shouldReplaceLectureNote: jest.fn(
    (current: string, candidate: string) => candidate.length > current.length,
  ),
  transcribeAudio: jest.fn(),
}));

// Mock db queries
jest.mock('../../db/queries/externalLogs', () => ({
  getFailedOrPendingTranscriptions: jest.fn(),
  updateSessionTranscriptionStatus: jest.fn(),
  updateSessionNoteEnhancementStatus: jest.fn(),
  getSessionsNeedingNoteEnhancement: jest.fn(),
  updateSessionPipelineTelemetry: jest.fn(),
}));

jest.mock('../notificationService', () => ({
  notifyTranscriptionFailure: jest.fn(),
  notifyTranscriptionRecovered: jest.fn(),
}));

jest.mock('./persistence', () => ({
  saveLecturePersistence: jest.fn(),
}));

jest.mock('../../db/queries/aiCache', () => ({
  updateLectureTranscriptNote: jest.fn(),
  getLectureNoteById: jest.fn(),
  getLegacyLectureNotes: jest.fn(),
}));

jest.mock('../transcriptStorage', () => ({
  getTranscriptText: jest.fn(),
  backupNoteToPublic: jest.fn(),
}));

// We'll mock generateEmbedding to avoid API calls
jest.mock('../ai/embeddingService', () => ({
  generateEmbedding: jest.fn(),
}));

describe('retryFailedTranscriptions', () => {
  let lectureSessionMonitor: typeof import('./lectureSessionMonitor');
  let externalLogsMock: any;
  let transcriptionServiceMock: any;

  beforeEach(async () => {
    jest.resetModules();

    externalLogsMock = require('../../db/queries/externalLogs');
    transcriptionServiceMock = require('../transcriptionService');
    const persistenceMock = require('./persistence');
    const aiCacheMock = require('../../db/queries/aiCache');

    persistenceMock.saveLecturePersistence.mockResolvedValue(999);
    transcriptionServiceMock.generateADHDNote.mockResolvedValue('');
    aiCacheMock.getLectureNoteById.mockResolvedValue({ id: 999, note: 'Saved quick note' });
    lectureSessionMonitor = require('./lectureSessionMonitor');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return 0 when there are no pending transcriptions', async () => {
    externalLogsMock.getFailedOrPendingTranscriptions.mockResolvedValue([]);
    const result = await lectureSessionMonitor.retryFailedTranscriptions('mock-key');
    expect(result).toBe(0);
    expect(transcriptionServiceMock.transcribeAudio).not.toHaveBeenCalled();
  });

  it('should process pending transcriptions and return the number of recovered sessions', async () => {
    const mockPending = [
      { id: 1, recordingPath: '/mock/path/1.m4a', appName: 'MockApp', durationMinutes: 10 },
      { id: 2, recordingPath: '/mock/path/2.m4a', appName: 'MockApp2', durationMinutes: 20 },
      { id: 3, recordingPath: undefined, appName: 'MockApp3', durationMinutes: 5 }, // should be skipped
    ];

    externalLogsMock.getFailedOrPendingTranscriptions.mockResolvedValue(mockPending);

    transcriptionServiceMock.transcribeAudio.mockImplementation(async (opts: any) => {
      if (opts.audioFilePath === '/mock/path/1.m4a') {
        return {
          transcript: 'Mock transcript 1',
          subject: 'Mock Subject',
          topics: [],
          keyConcepts: [],
          highYieldPoints: [],
          lectureSummary: 'Mock summary',
          estimatedConfidence: 2,
        };
      }
      if (opts.audioFilePath === '/mock/path/2.m4a') {
        // Return without transcript to simulate failure
        return {
          transcript: '',
          subject: 'Mock Subject',
          topics: [],
          keyConcepts: [],
          highYieldPoints: [],
          lectureSummary: '',
          estimatedConfidence: 2,
        };
      }
      throw new Error('Unexpected');
    });

    const result = await lectureSessionMonitor.retryFailedTranscriptions('mock-key');

    expect(result).toBe(1); // Only 1 succeeded
    expect(transcriptionServiceMock.transcribeAudio).toHaveBeenCalledTimes(2);

    // Check first call
    expect(transcriptionServiceMock.transcribeAudio).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        audioFilePath: '/mock/path/1.m4a',
        groqKey: 'mock-key',
      }),
    );

    // Check second call
    expect(transcriptionServiceMock.transcribeAudio).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        audioFilePath: '/mock/path/2.m4a',
        groqKey: 'mock-key',
      }),
    );
  });

  it('should continue processing even if one transcription throws an error', async () => {
    const mockPending = [
      { id: 1, recordingPath: '/mock/path/1.m4a', appName: 'MockApp', durationMinutes: 10 },
      { id: 2, recordingPath: '/mock/path/2.m4a', appName: 'MockApp2', durationMinutes: 20 },
    ];

    externalLogsMock.getFailedOrPendingTranscriptions.mockResolvedValue(mockPending);

    transcriptionServiceMock.transcribeAudio.mockImplementation(async (opts: any) => {
      if (opts.audioFilePath === '/mock/path/1.m4a') {
        throw new Error('Simulated failure');
      }
      return {
        transcript: 'Mock transcript 2',
        subject: 'Mock Subject',
        topics: [],
        keyConcepts: [],
        highYieldPoints: [],
        lectureSummary: 'Mock summary',
        estimatedConfidence: 2,
      };
    });

    const result = await lectureSessionMonitor.retryFailedTranscriptions('mock-key');

    expect(result).toBe(1); // Only 2nd succeeded
    expect(transcriptionServiceMock.transcribeAudio).toHaveBeenCalledTimes(2);
  });
});

describe('saveLectureAnalysisQuick', () => {
  let lectureSessionMonitor: typeof import('./lectureSessionMonitor');
  let transcriptionServiceMock: any;
  let persistenceMock: any;

  beforeEach(async () => {
    jest.resetModules();
    transcriptionServiceMock = require('../transcriptionService');
    persistenceMock = require('./persistence');
    transcriptionServiceMock.generateADHDNote.mockResolvedValue('');
    lectureSessionMonitor = require('./lectureSessionMonitor');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call buildQuickLectureNote and saveLecturePersistence with combined parameters', async () => {
    const mockAnalysis = {
      subject: 'Mock Subject',
      topics: [],
      keyConcepts: [],
      highYieldPoints: [],
      lectureSummary: 'Mock summary',
      estimatedConfidence: 2,
    };

    const mockOpts = {
      analysis: mockAnalysis as any,
      appName: 'MockApp',
      durationMinutes: 10,
      logId: 1,
    };

    const mockQuickNote = 'Mock Quick Note Content';
    transcriptionServiceMock.buildQuickLectureNote.mockReturnValue(mockQuickNote);
    persistenceMock.saveLecturePersistence.mockResolvedValue(123);

    const result = await lectureSessionMonitor.saveLectureAnalysisQuick(mockOpts);

    expect(transcriptionServiceMock.buildQuickLectureNote).toHaveBeenCalledWith(mockAnalysis);
    expect(persistenceMock.saveLecturePersistence).toHaveBeenCalledWith({
      ...mockOpts,
      quickNote: mockQuickNote,
    });
    expect(result).toBe(123);
  });
});

describe('runFullTranscriptionPipeline note enhancement safety', () => {
  let lectureSessionMonitor: typeof import('./lectureSessionMonitor');
  let transcriptionServiceMock: any;
  let persistenceMock: any;
  let aiCacheMock: any;
  let transcriptStorageMock: any;
  let externalLogsMock: any;

  beforeEach(async () => {
    jest.resetModules();
    transcriptionServiceMock = require('../transcriptionService');
    persistenceMock = require('./persistence');
    aiCacheMock = require('../../db/queries/aiCache');
    transcriptStorageMock = require('../transcriptStorage');
    externalLogsMock = require('../../db/queries/externalLogs');
    lectureSessionMonitor = require('./lectureSessionMonitor');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the saved quick note when the enhanced note is weaker', async () => {
    const analysis = {
      transcript: 'Full lecture transcript with details',
      subject: 'Medicine',
      topics: ['Anemia'],
      keyConcepts: ['Definition', 'Investigations'],
      highYieldPoints: ['Microcytic anemia workup'],
      lectureSummary: 'Detailed lecture summary',
      estimatedConfidence: 2,
    };

    transcriptionServiceMock.transcribeAudio.mockResolvedValue(analysis);
    const savedQuickNote = `🎯 **Subject**: Medicine
📌 **Topics**: Anemia

💡 **Key Concepts**
• Definition
• Investigations

🚀 **High-Yield Facts**
🚀 **Microcytic anemia workup**

📝 **Integrated Summary**
Detailed lecture summary

---
❓ **Check Yourself**
 - Q: What is the most high-yield takeaway from this Medicine lecture?`;
    transcriptionServiceMock.buildQuickLectureNote.mockReturnValue(savedQuickNote);
    transcriptionServiceMock.generateADHDNote.mockResolvedValue('Short note');
    transcriptionServiceMock.shouldReplaceLectureNote.mockReturnValue(false);
    persistenceMock.saveLecturePersistence.mockResolvedValue(321);
    aiCacheMock.getLectureNoteById.mockResolvedValue({
      id: 321,
      note: savedQuickNote,
    });

    const result = await lectureSessionMonitor.runFullTranscriptionPipeline({
      recordingPath: '/mock/path/1.m4a',
      appName: 'MockApp',
      durationMinutes: 10,
      logId: 55,
      groqKey: 'mock-key',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.success).toBe(true);
    expect(aiCacheMock.updateLectureTranscriptNote).not.toHaveBeenCalled();
    expect(externalLogsMock.updateSessionNoteEnhancementStatus).toHaveBeenCalledWith(
      55,
      'completed',
    );
    expect(transcriptStorageMock.backupNoteToPublic).toHaveBeenCalledWith(
      321,
      { subjectName: 'Medicine', topics: ['Anemia'] },
      expect.stringContaining('Detailed lecture summary'),
    );
  });
});
