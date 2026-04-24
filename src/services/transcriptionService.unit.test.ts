import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetProfile: any = jest.fn();
const mockGetInfoAsync: any = jest.fn();
const mockTranscribeRawWithGroq: any = jest.fn();
const mockTranscribeRawWithHuggingFace: any = jest.fn();
const mockTranscribeRawWithLocalWhisper: any = jest.fn();
const mockAnalyzeTranscript: any = jest.fn();
const mockGenerateEmbedding: any = jest.fn();

jest.mock('../db/repositories', () => ({
  profileRepository: {
    getProfile: () => mockGetProfile(),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
}));

jest.mock('./aiService', () => ({
  getApiKeys: jest.fn((profile?: { groqApiKey?: string }) => ({
    groqKey: profile?.groqApiKey,
  })),
}));

jest.mock('./transcription/engines', () => ({
  transcribeRawWithGroq: (...args: unknown[]) => mockTranscribeRawWithGroq(...args),
  transcribeRawWithHuggingFace: (...args: unknown[]) => mockTranscribeRawWithHuggingFace(...args),
  transcribeRawWithLocalWhisper: (...args: unknown[]) => mockTranscribeRawWithLocalWhisper(...args),
}));

jest.mock('./transcription/analysis', () => ({
  analyzeTranscript: (...args: unknown[]) => mockAnalyzeTranscript(...args),
}));

jest.mock('./ai/embeddingService', () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
}));

describe('transcriptionService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    // @ts-expect-error test env global
    globalThis.__DEV__ = false;

    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1024 });
    mockGetProfile.mockResolvedValue({
      groqApiKey: '',
      huggingFaceToken: '',
      huggingFaceTranscriptionModel: 'openai/whisper-large-v3',
      transcriptionProvider: 'auto',
      useLocalWhisper: false,
      localWhisperPath: null,
    });
    mockAnalyzeTranscript.mockResolvedValue({
      subject: 'Physiology',
      topics: ['RAAS'],
      keyConcepts: ['Renin'],
      lectureSummary: 'Renin overview',
      estimatedConfidence: 2,
      highYieldPoints: ['Renin is an enzyme'],
    });
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  it('prefers Groq first when auto mode has Groq configured', async () => {
    mockTranscribeRawWithGroq.mockResolvedValue('groq transcript');
    const { transcribeAudio } = await import('./transcriptionService');

    const result = await transcribeAudio({
      audioFilePath: '/tmp/lecture.m4a',
      groqKey: 'groq-test-key',
      huggingFaceToken: 'hf-test-token',
      transcriptionProvider: 'auto',
    });

    expect(result.transcript).toBe('groq transcript');
    expect(mockTranscribeRawWithGroq).toHaveBeenCalledTimes(1);
    expect(mockTranscribeRawWithHuggingFace).not.toHaveBeenCalled();
    expect(mockTranscribeRawWithLocalWhisper).not.toHaveBeenCalled();
  });

  it('uses Hugging Face first when selected, then falls back to local Whisper', async () => {
    mockTranscribeRawWithHuggingFace.mockRejectedValue(new Error('hf failed'));
    mockTranscribeRawWithLocalWhisper.mockResolvedValue('local fallback transcript');
    const { transcribeAudio } = await import('./transcriptionService');

    const result = await transcribeAudio({
      audioFilePath: '/tmp/lecture.wav',
      huggingFaceToken: 'hf-test-token',
      huggingFaceModel: 'openai/whisper-large-v3',
      transcriptionProvider: 'huggingface',
      useLocalWhisper: true,
      localWhisperPath: '/models/local-whisper.bin',
    });

    expect(result.transcript).toBe('local fallback transcript');
    expect(mockTranscribeRawWithHuggingFace).toHaveBeenCalledTimes(1);
    expect(mockTranscribeRawWithLocalWhisper).toHaveBeenCalledTimes(1);
  });

  it('throws when no transcription backend is available', async () => {
    const { transcribeAudio } = await import('./transcriptionService');

    await expect(
      transcribeAudio({
        audioFilePath: '/tmp/lecture.wav',
        transcriptionProvider: 'auto',
        useLocalWhisper: false,
        localWhisperPath: undefined,
        huggingFaceToken: '',
        groqKey: '',
      }),
    ).rejects.toThrow('No transcription engine available');
  });

  it('returns analysis without embedding when embedding generation fails', async () => {
    mockTranscribeRawWithLocalWhisper.mockResolvedValue('full transcript text');
    mockGenerateEmbedding.mockRejectedValue(new Error('embedding offline'));
    const { transcribeAudio } = await import('./transcriptionService');

    const result = await transcribeAudio({
      audioFilePath: '/tmp/lecture.wav',
      transcriptionProvider: 'local',
      useLocalWhisper: true,
      localWhisperPath: '/models/whisper.bin',
    });

    expect(result.transcript).toBe('full transcript text');
    expect(result).not.toHaveProperty('embedding');
    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
  });

  it('returns no-speech analysis when local Whisper yields an empty transcript', async () => {
    mockTranscribeRawWithLocalWhisper.mockResolvedValue('');
    const { transcribeAudio } = await import('./transcriptionService');

    const result = await transcribeAudio({
      audioFilePath: '/tmp/lecture.wav',
      transcriptionProvider: 'local',
      useLocalWhisper: true,
      localWhisperPath: '/models/whisper.bin',
    });

    expect(result).toEqual(
      expect.objectContaining({
        subject: 'Unknown',
        transcript: '',
        lectureSummary: 'No speech detected in recording (silent or very short audio)',
      }),
    );
    expect(mockAnalyzeTranscript).not.toHaveBeenCalled();
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });
});
