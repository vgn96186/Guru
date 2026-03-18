import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const getProfileMock: any = jest.fn();
const getInfoAsyncMock: any = jest.fn();
const transcribeRawWithGroqMock: any = jest.fn();
const transcribeRawWithHuggingFaceMock: any = jest.fn();
const transcribeRawWithLocalWhisperMock: any = jest.fn();
const analyzeTranscriptMock: any = jest.fn();
const generateEmbeddingMock: any = jest.fn();

jest.mock('../db/repositories', () => ({
  profileRepository: {
    getProfile: () => getProfileMock(),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  getInfoAsync: (...args: unknown[]) => getInfoAsyncMock(...args),
}));

jest.mock('./aiService', () => ({
  getApiKeys: jest.fn((profile?: { groqApiKey?: string }) => ({
    groqKey: profile?.groqApiKey,
  })),
}));

jest.mock('./transcription/engines', () => ({
  transcribeRawWithGroq: (...args: unknown[]) => transcribeRawWithGroqMock(...args),
  transcribeRawWithHuggingFace: (...args: unknown[]) => transcribeRawWithHuggingFaceMock(...args),
  transcribeRawWithLocalWhisper: (...args: unknown[]) => transcribeRawWithLocalWhisperMock(...args),
}));

jest.mock('./transcription/analysis', () => ({
  analyzeTranscript: (...args: unknown[]) => analyzeTranscriptMock(...args),
}));

jest.mock('./ai/embeddingService', () => ({
  generateEmbedding: (...args: unknown[]) => generateEmbeddingMock(...args),
}));

describe('transcriptionService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    // @ts-expect-error test env global
    globalThis.__DEV__ = false;

    getInfoAsyncMock.mockResolvedValue({ exists: true, size: 1024 });
    getProfileMock.mockResolvedValue({
      groqApiKey: '',
      huggingFaceToken: '',
      huggingFaceTranscriptionModel: 'openai/whisper-large-v3',
      transcriptionProvider: 'auto',
      useLocalWhisper: false,
      localWhisperPath: null,
    });
    analyzeTranscriptMock.mockResolvedValue({
      subject: 'Physiology',
      topics: ['RAAS'],
      keyConcepts: ['Renin'],
      lectureSummary: 'Renin overview',
      estimatedConfidence: 2,
      highYieldPoints: ['Renin is an enzyme'],
    });
    generateEmbeddingMock.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  it('prefers Groq first when auto mode has Groq configured', async () => {
    transcribeRawWithGroqMock.mockResolvedValue('groq transcript');
    const { transcribeAudio } = await import('./transcriptionService');

    const result = await transcribeAudio({
      audioFilePath: '/tmp/lecture.m4a',
      groqKey: 'groq-test-key',
      huggingFaceToken: 'hf-test-token',
      transcriptionProvider: 'auto',
    });

    expect(result.transcript).toBe('groq transcript');
    expect(transcribeRawWithGroqMock).toHaveBeenCalledTimes(1);
    expect(transcribeRawWithHuggingFaceMock).not.toHaveBeenCalled();
    expect(transcribeRawWithLocalWhisperMock).not.toHaveBeenCalled();
  });

  it('uses Hugging Face first when selected, then falls back to local Whisper', async () => {
    transcribeRawWithHuggingFaceMock.mockRejectedValue(new Error('hf failed'));
    transcribeRawWithLocalWhisperMock.mockResolvedValue('local fallback transcript');
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
    expect(transcribeRawWithHuggingFaceMock).toHaveBeenCalledTimes(1);
    expect(transcribeRawWithLocalWhisperMock).toHaveBeenCalledTimes(1);
  });

  it('throws when no transcription backend is available', async () => {
    const { transcribeAudio } = await import('./transcriptionService');

    await expect(
      transcribeAudio({
        audioFilePath: '/tmp/lecture.wav',
        transcriptionProvider: 'auto',
        useLocalWhisper: false,
        localWhisperPath: undefined,
      }),
    ).rejects.toThrow('No transcription engine available');
  });

  it('returns analysis without embedding when embedding generation fails', async () => {
    transcribeRawWithLocalWhisperMock.mockResolvedValue('full transcript text');
    generateEmbeddingMock.mockRejectedValue(new Error('embedding offline'));
    const { transcribeAudio } = await import('./transcriptionService');

    const result = await transcribeAudio({
      audioFilePath: '/tmp/lecture.wav',
      transcriptionProvider: 'local',
      useLocalWhisper: true,
      localWhisperPath: '/models/whisper.bin',
    });

    expect(result.transcript).toBe('full transcript text');
    expect(result).not.toHaveProperty('embedding');
    expect(generateEmbeddingMock).toHaveBeenCalledTimes(1);
  });
});
