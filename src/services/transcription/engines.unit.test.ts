const mockGetInfoAsync = jest.fn();
const mockConvertToWav = jest.fn();
const mockLoadModelFromFilePath = jest.fn();
const mockGetContext = jest.fn();
const mockBatchTranscribe = jest.fn();
const mockWhisperSingleShotTranscribe = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  deleteAsync: jest.fn(),
}));

jest.mock('../../../modules/app-launcher', () => ({
  convertToWav: (...args: unknown[]) => mockConvertToWav(...args),
}));

jest.mock('../offlineTranscription/whisperModelManager', () => ({
  getWhisperModelManager: () => ({
    loadModelFromFilePath: (...args: unknown[]) => mockLoadModelFromFilePath(...args),
    getContext: (...args: unknown[]) => mockGetContext(...args),
  }),
}));

jest.mock('../offlineTranscription/batchTranscriber', () => ({
  BatchTranscriber: jest.fn().mockImplementation(() => ({
    transcribe: (...args: unknown[]) => mockBatchTranscribe(...args),
  })),
}));

import {
  transcribeRawWithGroq,
  transcribeRawWithHuggingFace,
  transcribeRawWithLocalWhisper,
} from './engines';

describe('transcription engines (Groq / HF)', () => {
  const origFetch = global.fetch;

  beforeEach(() => {
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1024 });
    mockConvertToWav.mockResolvedValue(null);
    mockLoadModelFromFilePath.mockResolvedValue({});
    mockWhisperSingleShotTranscribe.mockReturnValue({
      promise: Promise.resolve({ result: 'local whisper text' }),
    });
    mockGetContext.mockReturnValue({
      transcribe: mockWhisperSingleShotTranscribe,
    });
    mockBatchTranscribe.mockResolvedValue({
      segments: [],
      vadSkippedSeconds: 0,
      processingTimeSeconds: 1,
    });
  });

  afterEach(() => {
    global.fetch = origFetch;
    jest.clearAllMocks();
  });

  it('transcribeRawWithGroq rejects when API key is missing', async () => {
    await expect(transcribeRawWithGroq('/tmp/x.m4a', '  ')).rejects.toThrow(/Groq API key/);
  });

  it('transcribeRawWithHuggingFace rejects when token is missing', async () => {
    await expect(transcribeRawWithHuggingFace('/tmp/x.m4a', '')).rejects.toThrow(/Hugging Face/);
  });

  it('transcribeRawWithGroq returns trimmed transcript on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: '  diabetes mellitus  ' }),
    });
    const text = await transcribeRawWithGroq('file:///tmp/lecture.m4a', 'gk_test');
    expect(text).toBe('diabetes mellitus');
    expect(global.fetch).toHaveBeenCalled();
  });

  it('transcribeRawWithGroq throws when API returns non-OK', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limit',
    });
    await expect(transcribeRawWithGroq('file:///tmp/a.m4a', 'k')).rejects.toThrow(/429/);
  });

  it('transcribeRawWithGroq returns empty string for classic hallucination patterns', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'thank you.\nthank you.' }),
    });
    const text = await transcribeRawWithGroq('file:///tmp/a.m4a', 'k');
    expect(text).toBe('');
  });

  it('transcribeRawWithHuggingFace returns transcript on success', async () => {
    const audioBlob = { size: 4 };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => audioBlob,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: '  clinical pearl  ' }),
      });
    const text = await transcribeRawWithHuggingFace('file:///tmp/a.wav', 'hf-token');
    expect(text).toBe('clinical pearl');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('transcribeRawWithHuggingFace throws when local file read fails', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(transcribeRawWithHuggingFace('/tmp/missing.wav', 'hf-token')).rejects.toThrow(
      /Failed to read local audio file/,
    );
  });

  it('transcribeRawWithHuggingFace rejects oversized files before loading them into JS memory', async () => {
    global.fetch = jest.fn();
    mockGetInfoAsync.mockResolvedValueOnce({
      exists: true,
      size: 21 * 1024 * 1024,
    });

    await expect(transcribeRawWithHuggingFace('/tmp/large.wav', 'hf-token')).rejects.toThrow(
      /limited to 20 MB files/i,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('transcribeRawWithLocalWhisper batch-transcribes large WAV files instead of single-shot inference', async () => {
    mockGetInfoAsync
      .mockResolvedValueOnce({ exists: true, size: 10 * 1024 })
      .mockResolvedValueOnce({ exists: true, size: 30 * 1024 * 1024 });
    mockBatchTranscribe.mockResolvedValueOnce({
      segments: [
        { text: 'segment one' },
        { text: 'segment two' },
      ],
      vadSkippedSeconds: 0,
      processingTimeSeconds: 2,
    });

    const text = await transcribeRawWithLocalWhisper('/tmp/large.wav', '/models/local.bin');

    expect(text).toBe('segment one segment two');
    expect(mockLoadModelFromFilePath).toHaveBeenCalledWith('/models/local.bin');
    expect(mockBatchTranscribe).toHaveBeenCalledWith('file:///tmp/large.wav');
    expect(mockWhisperSingleShotTranscribe).not.toHaveBeenCalled();
  });
});
