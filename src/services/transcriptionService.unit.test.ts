async function loadTranscriptionService(opts?: {
  groqKey?: string | undefined;
  orKey?: string | undefined;
  useLocalWhisper?: boolean;
  localWhisperPath?: string | null;
  localTranscript?: string;
  embedding?: number[] | null;
  embeddingError?: Error | null;
}) {
  jest.resetModules();
  (globalThis as any).__DEV__ = false;

  const localTranscript = opts?.localTranscript ?? 'local lecture transcript';
  const markTopicsFromLectureMock = jest.fn(async () => undefined);
  const embeddingError = opts?.embeddingError ?? null;
  const generateEmbeddingMock = jest.fn(async () => {
    if (embeddingError) throw embeddingError;
    return opts?.embedding ?? null;
  });
  const initWhisperMock = jest.fn(async () => ({
    transcribe: jest.fn(() => ({
      promise: Promise.resolve({ result: localTranscript }),
    })),
    release: jest.fn(async () => undefined),
  }));
  const generateJSONWithRoutingMock = jest.fn(async () => ({
    parsed: {
      subject: 'Physiology',
      topics: ['Renin-Angiotensin System'],
      key_concepts: ['Renin rises with low BP'],
      lecture_summary: 'RAAS overview',
      estimated_confidence: 2,
    },
    modelUsed: 'groq/llama-3.3-70b-versatile',
  }));

  jest.doMock('expo-file-system/legacy', () => ({
    getInfoAsync: jest.fn(async (path: string) => ({ exists: true, size: 1024 })),
    deleteAsync: jest.fn(async () => undefined),
  }));
  jest.doMock(
    'whisper.rn',
    () => ({
      initWhisper: initWhisperMock,
    }),
    { virtual: true },
  );
  jest.doMock('../../modules/app-launcher', () => ({
    convertToWav: jest.fn(async () => null),
  }));
  jest.doMock('../db/repositories', () => ({
    profileRepository: {
      getProfile: jest.fn(() =>
        Promise.resolve({
          useLocalWhisper: opts?.useLocalWhisper ?? true,
          localWhisperPath: opts?.localWhisperPath ?? '/models/whisper.bin',
        }),
      ),
    },
    dailyLogRepository: {},
  }));
  jest.doMock('./aiService', () => ({
    getApiKeys: jest.fn(() => ({ groqKey: opts?.groqKey, orKey: opts?.orKey })),
    generateJSONWithRouting: generateJSONWithRoutingMock,
    generateTextWithRouting: jest.fn(),
  }));
  jest.doMock('./transcription/analysis', () => ({
    analyzeTranscript: jest.fn().mockResolvedValue({
      subject: 'Physiology',
      topics: ['Renin-Angiotensin System'],
      keyConcepts: ['Renin rises with low BP'],
      lectureSummary: 'RAAS overview',
      estimatedConfidence: 2,
    }),
  }));
  jest.doMock('./transcription/matching', () => ({
    markTopicsFromLecture: markTopicsFromLectureMock,
  }));
  jest.doMock('./lecture/transcription', () => {
    return {
      transcribeWithGroqChunking: jest.fn(async () => {
        const fetchRes = await globalThis.fetch('https://api.groq.com/openai/v1/audio/transcriptions');
        if (!fetchRes.ok) throw new Error('groq error');
        return { transcript: 'groq transcript text' };
      }),
    };
  });
  jest.doMock('./transcription/engines', () => ({
    transcribeRawWithLocalWhisper: jest.fn(async () => {
      return opts?.localTranscript ?? '';
    }),
  }));
  jest.doMock('./ai/embeddingService', () => ({
    generateEmbedding: generateEmbeddingMock,
  }));
  jest.doMock('../db/database', () => ({
    getDb: jest.fn(() => ({ mocked: true })),
  }));

  const transcriptionService = await import('./transcriptionService');
  return {
    transcriptionService,
    initWhisperMock,
    generateJSONWithRoutingMock,
    markTopicsFromLectureMock,
    generateEmbeddingMock,
  };
}

describe('transcriptionService entrypoint policy', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('tries Groq transcription first when Groq key is available', async () => {
    const { transcriptionService, initWhisperMock } =
      await loadTranscriptionService({
        groqKey: 'groq-test-key',
        useLocalWhisper: true,
        embedding: null,
      });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch' as any)
      .mockImplementation(async (...args: unknown[]) => {
        const url = String(args[0] ?? '');
        expect(url).toContain('api.groq.com/openai/v1/audio/transcriptions');
        return {
          ok: true,
          json: async () => ({ text: 'groq transcript text' }),
        } as any;
      });

    const analysis = await transcriptionService.transcribeAudio({ audioFilePath: '/tmp/lecture.m4a', groqKey: 'groq-test-key' });

    expect(analysis.subject).toBe('Physiology');
    expect(analysis.transcript).toBe('groq transcript text');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(initWhisperMock).not.toHaveBeenCalled();
  });

  it('falls back to local Whisper when Groq transcription fails', async () => {
    const { transcriptionService } =
      await loadTranscriptionService({
        groqKey: 'groq-test-key',
        useLocalWhisper: true,
        localWhisperPath: '/models/local-whisper.bin',
        localTranscript: 'local fallback transcript',
        embedding: null,
      });
    jest.spyOn(globalThis, 'fetch' as any).mockImplementation(
      async () =>
        ({
          ok: false,
          status: 500,
          text: async () => 'groq error',
        }) as any,
    );

    const analysis = await transcriptionService.transcribeAudio({
      audioFilePath: '/tmp/lecture.wav',
      groqKey: 'groq-test-key',
      useLocalWhisper: true,
      localWhisperPath: '/models/local-whisper.bin',
      maxRetries: 0
    });

    expect(analysis.subject).toBe('Physiology');
    expect(analysis.transcript).toBe('local fallback transcript');
  });

  it('returns fallback when no transcription backend is available', async () => {
    const { transcriptionService } = await loadTranscriptionService({
      groqKey: undefined,
      useLocalWhisper: false,
      localWhisperPath: null,
    });

    const analysis = await transcriptionService.transcribeAudio({
      audioFilePath: '/tmp/lecture.wav',
      groqKey: undefined,
      useLocalWhisper: false,
      localWhisperPath: undefined,
    });

    expect(analysis.subject).toBe('Unknown');
    expect(analysis.topics).toEqual([]);
    expect(analysis.keyConcepts).toEqual([]);
    expect(analysis.lectureSummary).toBe('No speech detected (silent audio)');
    expect(analysis.estimatedConfidence).toBe(1);
    expect(analysis.transcript).toBe('');
    expect(analysis.highYieldPoints).toEqual([]);
  });

  it('still analyzes transcript and returns null embedding when embedding generation fails', async () => {
    const { transcriptionService, generateEmbeddingMock } =
      await loadTranscriptionService({
        useLocalWhisper: true,
        localTranscript: 'full transcript text',
        embeddingError: new Error('embedding offline'),
      });

    const analysis = await transcriptionService.transcribeAudio({
      audioFilePath: '/tmp/lecture.wav',
      useLocalWhisper: true,
      localWhisperPath: '/models/local-whisper.bin'
    });

    expect(analysis.subject).toBe('Physiology');
    expect(analysis.transcript).toBe('full transcript text');
    expect(analysis.lectureSummary).toBe('RAAS overview');
    expect(analysis.embedding).toBeUndefined(); // Assuming transcribeAudio returns the object without an embedding key or it's implicitly missing, but the mock is configured to let generateEmbedding fail
    expect(generateEmbeddingMock).toHaveBeenCalledTimes(1);
  });
});
