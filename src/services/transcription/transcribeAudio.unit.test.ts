const mockGetProfile = jest.fn();
const mockGetApiKeys = jest.fn();
const mockGetInfoAsync = jest.fn();
const mockTranscribeRawWithGroq = jest.fn();
const mockTranscribeRawWithHuggingFace = jest.fn();
const mockTranscribeRawWithCloudflare = jest.fn();
const mockTranscribeRawWithLocalWhisper = jest.fn();
const mockAnalyzeTranscript = jest.fn();
const mockGenerateEmbedding = jest.fn();

jest.mock('../../db/repositories', () => ({
  profileRepository: { getProfile: (...args: unknown[]) => mockGetProfile(...args) },
}));

jest.mock('../aiService', () => ({
  getApiKeys: (...args: unknown[]) => mockGetApiKeys(...args),
}));

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
}));

jest.mock('./engines', () => ({
  transcribeRawWithGroq: (...args: unknown[]) => mockTranscribeRawWithGroq(...args),
  transcribeRawWithHuggingFace: (...args: unknown[]) => mockTranscribeRawWithHuggingFace(...args),
  transcribeRawWithCloudflare: (...args: unknown[]) => mockTranscribeRawWithCloudflare(...args),
  transcribeRawWithLocalWhisper: (...args: unknown[]) => mockTranscribeRawWithLocalWhisper(...args),
}));

jest.mock('./analysis', () => ({
  analyzeTranscript: (...args: unknown[]) => mockAnalyzeTranscript(...args),
}));

jest.mock('../ai/embeddingService', () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
}));

jest.mock('../fileUri', () => ({
  toFileUri: (p: string) => p,
}));

jest.mock('../../config/appConfig', () => ({
  BUNDLED_HF_TOKEN: 'test-hf-token',
  DEFAULT_HF_TRANSCRIPTION_MODEL: 'test-model',
}));

import { transcribeAudio } from './transcribeAudio';

const baseProfile = {
  groqApiKey: 'test-groq-key',
  huggingFaceToken: '',
  huggingFaceTranscriptionModel: '',
  useLocalWhisper: false,
  localWhisperPath: '',
  transcriptionProvider: 'auto' as const,
};

const baseAnalysis = {
  subject: 'Anatomy',
  topics: ['Upper Limb', 'Brachial Plexus'],
  keyConcepts: ['nerve roots', 'trunks'],
  lectureSummary: 'Lecture on brachial plexus anatomy',
  estimatedConfidence: 2,
  highYieldPoints: ['C5-T1 roots'],
};

describe('transcribeAudio', () => {
  beforeEach(() => {
    mockGetProfile.mockResolvedValue(baseProfile);
    mockGetApiKeys.mockReturnValue({
      groqKey: 'test-groq-key',
      cfAccountId: '',
      cfApiToken: '',
    });
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1024 });
    mockTranscribeRawWithGroq.mockResolvedValue('This is the transcript text');
    mockAnalyzeTranscript.mockResolvedValue(baseAnalysis);
    mockGenerateEmbedding.mockResolvedValue(null);
  });

  it('should transcribe audio and return analysis', async () => {
    const result = await transcribeAudio({ audioFilePath: '/test/audio.m4a' });

    expect(mockTranscribeRawWithGroq).toHaveBeenCalledWith('/test/audio.m4a', 'test-groq-key');
    expect(mockAnalyzeTranscript).toHaveBeenCalledWith('This is the transcript text');
    expect(result.subject).toBe('Anatomy');
    expect(result.topics).toEqual(['Upper Limb', 'Brachial Plexus']);
    expect(result.transcript).toBe('This is the transcript text');
  });

  it('should throw when audio file does not exist', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: false, size: 0 });

    await expect(transcribeAudio({ audioFilePath: '/missing.m4a' })).rejects.toThrow(
      'Audio file is missing or empty',
    );
  });

  it('should throw when audio file is empty', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 0 });

    await expect(transcribeAudio({ audioFilePath: '/empty.m4a' })).rejects.toThrow(
      'Audio file is missing or empty',
    );
  });

  it('should return silent-audio result when transcript is empty', async () => {
    mockTranscribeRawWithGroq.mockResolvedValue('');

    const result = await transcribeAudio({ audioFilePath: '/silence.m4a' });

    expect(result.subject).toBe('Unknown');
    expect(result.lectureSummary).toContain('No speech detected');
    expect(result.transcript).toBe('');
    expect(mockAnalyzeTranscript).not.toHaveBeenCalled();
  });

  it('should throw when no transcription engine is available', async () => {
    mockGetApiKeys.mockReturnValue({ groqKey: '', cfAccountId: '', cfApiToken: '' });
    mockGetProfile.mockResolvedValue({
      ...baseProfile,
      groqApiKey: '',
      huggingFaceToken: '',
      useLocalWhisper: false,
    });

    await expect(
      transcribeAudio({
        audioFilePath: '/test.m4a',
        groqKey: '',
        huggingFaceToken: '',
      }),
    ).rejects.toThrow('No transcription engine available');
  });

  it('should fall back to huggingface when groq fails', async () => {
    mockTranscribeRawWithGroq.mockRejectedValue(new Error('Groq down'));
    mockTranscribeRawWithHuggingFace.mockResolvedValue('HF transcript');
    mockGetProfile.mockResolvedValue({
      ...baseProfile,
      huggingFaceToken: 'hf-token',
    });

    const result = await transcribeAudio({
      audioFilePath: '/test.m4a',
      huggingFaceToken: 'hf-token',
    });

    expect(result.transcript).toBe('HF transcript');
    expect(mockAnalyzeTranscript).toHaveBeenCalledWith('HF transcript');
  });

  it('should include embedding when generation succeeds', async () => {
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);

    const result = await transcribeAudio({ audioFilePath: '/test.m4a' });

    expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it('should succeed even when embedding generation fails', async () => {
    mockGenerateEmbedding.mockRejectedValue(new Error('embed fail'));

    const result = await transcribeAudio({ audioFilePath: '/test.m4a' });

    expect(result.subject).toBe('Anatomy');
    expect(result.embedding).toBeUndefined();
  });

  it('should call onProgress callbacks', async () => {
    const onProgress = jest.fn();

    await transcribeAudio({ audioFilePath: '/test.m4a', onProgress });

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'transcribing' }),
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'analyzing' }),
    );
  });

  it('should retry groq transcription on failure', async () => {
    mockTranscribeRawWithGroq
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('retry success');

    const result = await transcribeAudio({
      audioFilePath: '/test.m4a',
      maxRetries: 2,
    });

    expect(mockTranscribeRawWithGroq).toHaveBeenCalledTimes(2);
    expect(result.transcript).toBe('retry success');
  });

  it('should use provided groqKey over profile key', async () => {
    await transcribeAudio({
      audioFilePath: '/test.m4a',
      groqKey: 'custom-key',
    });

    expect(mockTranscribeRawWithGroq).toHaveBeenCalledWith('/test.m4a', 'custom-key');
  });
});
