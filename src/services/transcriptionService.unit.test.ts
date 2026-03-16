import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mocks
const initWhisperMock = jest.fn(async () => ({
  transcribe: jest.fn(async () => ({ text: 'local whisper transcript' })),
}));

jest.mock('rn-whisper', () => ({
  initWhisper: (...args: any[]) => initWhisperMock(...args),
}));

const markTopicsFromLectureMock = jest.fn(async () => []);
const generateEmbeddingMock = jest.fn(async () => [0.1, 0.2, 0.3]);

async function loadTranscriptionService(options: {
  groqKey?: string;
  useLocalWhisper?: boolean;
  localWhisperPath?: string | null;
  localTranscript?: string;
  embeddingError?: Error | null;
} = {}) {
  jest.resetModules();
  // @ts-expect-error test env global
  globalThis.__DEV__ = false;

  jest.doMock('./transcription/analysis', () => ({
    applyLectureAnalysis: jest.fn(async () => ({
      subject: 'Physiology',
      highYieldPoints: ['Renin is an enzyme'],
      questions: [],
    })),
  }));

  jest.doMock('./ai/embeddingService', () => ({
    generateEmbedding: options.embeddingError 
      ? jest.fn(() => Promise.reject(options.embeddingError))
      : generateEmbeddingMock,
  }));

  jest.doMock('../db/queries/topics', () => ({
    markTopicsFromLecture: markTopicsFromLectureMock,
  }));

  if (options.localTranscript) {
    initWhisperMock.mockResolvedValue({
      transcribe: jest.fn(async () => ({ text: options.localTranscript })),
    } as any);
  }

  const { transcriptionService } = await import('./transcriptionService');
  return {
    transcriptionService,
    initWhisperMock,
    markTopicsFromLectureMock,
    generateEmbeddingMock,
  };
}

describe('transcriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefers Groq for transcription when available', async () => {
    const { transcriptionService, initWhisperMock } = await loadTranscriptionService({
      groqKey: 'groq-test-key',
      useLocalWhisper: true,
      localWhisperPath: '/models/whisper.bin',
    });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (...args: unknown[]) => {
        const url = String(args[0] ?? '');
        expect(url).toContain('api.groq.com/openai/v1/audio/transcriptions');
        return {
          ok: true,
          json: async () => ({ text: 'groq transcript text' }),
        } as unknown as Response;
      });

    const analysis = await transcriptionService.transcribeAudio({
      audioFilePath: '/tmp/lecture.m4a',
      groqKey: 'groq-test-key',
      useLocalWhisper: true,
      localWhisperPath: '/models/whisper.bin',
    });

    expect(analysis.subject).toBe('Physiology');
    expect(analysis.transcript).toBe('groq transcript text');
    expect(analysis.highYieldPoints).toEqual(['Renin is an enzyme']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(initWhisperMock).not.toHaveBeenCalled();
  });

  it('falls back to local Whisper when Groq transcription fails', async () => {
    const {
      transcriptionService,
      initWhisperMock,
    } = await loadTranscriptionService({
      groqKey: 'groq-test-key',
      useLocalWhisper: true,
      localWhisperPath: '/models/local-whisper.bin',
      localTranscript: 'local fallback transcript',
    });

    jest.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        ({
          ok: false,
          status: 500,
          text: async () => 'groq error',
        }) as unknown as Response,
    );

    const analysis = await transcriptionService.transcribeAudio({
      audioFilePath: '/tmp/lecture.wav',
      groqKey: 'groq-test-key',
      useLocalWhisper: true,
      localWhisperPath: '/models/local-whisper.bin',
    });

    expect(analysis.subject).toBe('Physiology');
    expect(analysis.transcript).toBe('local fallback transcript');
    expect(analysis.highYieldPoints).toEqual(['Renin is an enzyme']);
    expect(initWhisperMock).toHaveBeenCalledTimes(1);
  });

  it('throws when no transcription backend is available', async () => {
    const { transcriptionService } = await loadTranscriptionService({
      groqKey: undefined,
      useLocalWhisper: false,
      localWhisperPath: null,
    });

    await expect(transcriptionService.transcribeAudio({ audioFilePath: '/tmp/lecture.wav' })).rejects.toThrow(
      'No transcription engine available',
    );
  });

  it('still runs topic matching when embedding generation fails', async () => {
    const {
      transcriptionService,
      generateEmbeddingMock,
    } = await loadTranscriptionService({
      useLocalWhisper: true,
      localTranscript: 'full transcript text',
      embeddingError: new Error('embedding offline'),
    });

    const analysis = await transcriptionService.transcribeAudio({
      audioFilePath: '/tmp/lecture.wav',
      useLocalWhisper: true,
      localWhisperPath: '/models/whisper.bin',
    });

    expect(analysis.transcript).toBe('full transcript text');
    expect(generateEmbeddingMock).toHaveBeenCalledTimes(1);
  });
});
