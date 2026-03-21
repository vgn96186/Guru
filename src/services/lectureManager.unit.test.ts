import {
  copyLectureTranscript,
  filterLectureHistoryItems,
  lectureNeedsAiNote,
  lectureNeedsReview,
  regenerateLectureNoteFromTranscript,
  removeLectureRecording,
  transcribeLectureRecordingToNote,
} from './lectureManager';

const mockGetLectureNoteById = jest.fn();
const mockUpdateLectureTranscriptNote = jest.fn();
const mockUpdateLectureAnalysisMetadata = jest.fn();
const mockUpdateLectureTranscriptArtifacts = jest.fn();
const mockUpdateLectureRecordingPath = jest.fn();
const mockGetSubjectByName = jest.fn();
const mockAnalyzeTranscript = jest.fn();
const mockGenerateADHDNote = jest.fn();
const mockTranscribeAudio = jest.fn();
const mockGetTranscriptText = jest.fn();
const mockSaveTranscriptToFile = jest.fn();
const mockDeleteAsync = jest.fn();
const mockClipboardSetString = jest.fn();

jest.mock('../db/queries/aiCache', () => ({
  getLectureNoteById: (...args: unknown[]) => mockGetLectureNoteById(...args),
  updateLectureTranscriptNote: (...args: unknown[]) => mockUpdateLectureTranscriptNote(...args),
  updateLectureAnalysisMetadata: (...args: unknown[]) => mockUpdateLectureAnalysisMetadata(...args),
  updateLectureTranscriptArtifacts: (...args: unknown[]) =>
    mockUpdateLectureTranscriptArtifacts(...args),
  updateLectureRecordingPath: (...args: unknown[]) => mockUpdateLectureRecordingPath(...args),
}));

jest.mock('../db/queries/topics', () => ({
  getSubjectByName: (...args: unknown[]) => mockGetSubjectByName(...args),
}));

jest.mock('./transcriptionService', () => ({
  analyzeTranscript: (...args: unknown[]) => mockAnalyzeTranscript(...args),
  generateADHDNote: (...args: unknown[]) => mockGenerateADHDNote(...args),
  transcribeAudio: (...args: unknown[]) => mockTranscribeAudio(...args),
}));

jest.mock('./transcriptStorage', () => ({
  getTranscriptText: (...args: unknown[]) => mockGetTranscriptText(...args),
  saveTranscriptToFile: (...args: unknown[]) => mockSaveTranscriptToFile(...args),
}));

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

jest.mock('@react-native-clipboard/clipboard', () => ({
  __esModule: true,
  default: {
    setString: (...args: unknown[]) => mockClipboardSetString(...args),
  },
}));

describe('lectureManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('identifies lecture notes that still need an AI note', () => {
    expect(lectureNeedsAiNote({ transcript: 'file:///t.txt', note: '' })).toBe(true);
    expect(
      lectureNeedsAiNote({
        transcript: 'file:///t.txt',
        note: '🎯 **Subject**: Medicine\n\n📝 **Integrated Summary**\nTest',
      }),
    ).toBe(false);
  });

  it('identifies lectures that still need review attention', () => {
    expect(
      lectureNeedsReview({ summary: null, confidence: 2, subjectName: 'Medicine', topics: ['A'] }),
    ).toBe(true);
    expect(
      lectureNeedsReview({
        summary: 'Solid',
        confidence: 2,
        subjectName: 'Medicine',
        topics: ['A'],
      }),
    ).toBe(false);
  });

  it('filters lecture history by manager filter', () => {
    const items: any[] = [
      {
        id: 1,
        note: '',
        transcript: 't',
        summary: null,
        confidence: 1,
        subjectName: '',
        topics: [],
        recordingPath: '/a.m4a',
      },
      {
        id: 2,
        note: '🎯 **Subject**: A\n\n📝 **Integrated Summary**\nDone',
        transcript: 't',
        summary: 'ok',
        confidence: 3,
        subjectName: 'A',
        topics: ['x'],
        recordingPath: null,
      },
    ];

    expect(filterLectureHistoryItems(items as any, 'recording').map((item) => item.id)).toEqual([
      1,
    ]);
    expect(filterLectureHistoryItems(items as any, 'needs_ai').map((item) => item.id)).toEqual([1]);
    expect(filterLectureHistoryItems(items as any, 'needs_review').map((item) => item.id)).toEqual([
      1,
    ]);
  });

  it('regenerates a lecture note from saved transcript text', async () => {
    mockGetLectureNoteById
      .mockResolvedValueOnce({
        id: 5,
        subjectId: 1,
        subjectName: 'Medicine',
        note: 'old',
        transcript: 'file:///transcript.txt',
      })
      .mockResolvedValueOnce({
        id: 5,
        subjectId: 2,
        subjectName: 'Physiology',
        note: 'new note',
        transcript: 'file:///transcript.txt',
        summary: 'updated summary',
        topics: ['Cardiac cycle'],
        confidence: 2,
      });
    mockGetTranscriptText.mockResolvedValue('full transcript');
    mockAnalyzeTranscript.mockResolvedValue({
      subject: 'Physiology',
      topics: ['Cardiac cycle'],
      lectureSummary: 'updated summary',
      estimatedConfidence: 2,
      keyConcepts: [],
      highYieldPoints: [],
    });
    mockGenerateADHDNote.mockResolvedValue('new note');
    mockGetSubjectByName.mockResolvedValue({ id: 2, name: 'Physiology' });

    const updated = await regenerateLectureNoteFromTranscript(5);

    expect(mockUpdateLectureTranscriptNote).toHaveBeenCalledWith(5, 'new note');
    expect(mockUpdateLectureAnalysisMetadata).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        subjectId: 2,
        summary: 'updated summary',
        topics: ['Cardiac cycle'],
      }),
    );
    expect(updated.note).toBe('new note');
  });

  it('removes a lecture recording and clears the DB path', async () => {
    await removeLectureRecording(9, '/tmp/lecture.m4a');

    expect(mockDeleteAsync).toHaveBeenCalled();
    expect(mockUpdateLectureRecordingPath).toHaveBeenCalledWith(9, null);
  });

  it('copies lecture transcript text when available', async () => {
    mockGetTranscriptText.mockResolvedValue('copied transcript');

    await expect(copyLectureTranscript('file:///transcript.txt')).resolves.toBe(true);
    expect(mockClipboardSetString).toHaveBeenCalledWith('copied transcript');
  });

  it('transcribes saved audio when a lecture has recording but no transcript', async () => {
    mockGetLectureNoteById
      .mockResolvedValueOnce({
        id: 8,
        subjectId: 1,
        subjectName: 'Medicine',
        note: '',
        transcript: null,
        recordingPath: '/tmp/lecture.m4a',
        summary: null,
        topics: [],
        confidence: 1,
      })
      .mockResolvedValueOnce({
        id: 8,
        subjectId: 2,
        subjectName: 'Physiology',
        note: 'generated note',
        transcript: 'file:///saved-transcript.txt',
        recordingPath: '/tmp/lecture.m4a',
        summary: 'lecture summary',
        topics: ['Cardiac cycle'],
        confidence: 2,
      });
    mockTranscribeAudio.mockResolvedValue({
      subject: 'Physiology',
      topics: ['Cardiac cycle'],
      keyConcepts: [],
      highYieldPoints: [],
      lectureSummary: 'lecture summary',
      estimatedConfidence: 2,
      transcript: 'full transcript from audio',
    });
    mockGenerateADHDNote.mockResolvedValue('generated note');
    mockSaveTranscriptToFile.mockResolvedValue('file:///saved-transcript.txt');
    mockGetSubjectByName.mockResolvedValue({ id: 2, name: 'Physiology' });

    const updated = await transcribeLectureRecordingToNote(8);

    expect(mockTranscribeAudio).toHaveBeenCalledWith({ audioFilePath: '/tmp/lecture.m4a' });
    expect(mockSaveTranscriptToFile).toHaveBeenCalledWith('full transcript from audio', {
      subjectName: 'Physiology',
      topics: ['Cardiac cycle'],
    });
    expect(mockUpdateLectureTranscriptArtifacts).toHaveBeenCalledWith(
      8,
      expect.objectContaining({
        subjectId: 2,
        transcript: 'file:///saved-transcript.txt',
        note: 'generated note',
        summary: 'lecture summary',
        topics: ['Cardiac cycle'],
        confidence: 2,
      }),
    );
    expect(updated.transcript).toBe('file:///saved-transcript.txt');
  });
});
