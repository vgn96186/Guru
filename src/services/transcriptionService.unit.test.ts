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
    getInfoAsync: jest.fn(async () => ({ exists: true, size: 1024 })),
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
  jest.doMock('./transcription/matching', () => ({
    markTopicsFromLecture: markTopicsFromLectureMock,
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
    const { transcriptionService, initWhisperMock, markTopicsFromLectureMock } =
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

    const analysis = await transcriptionService.transcribeAudio('/tmp/lecture.m4a');

    expect(analysis.subject).toBe('Physiology');
    expect(analysis.transcript).toBe('groq transcript text');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(initWhisperMock).not.toHaveBeenCalled();
    expect(markTopicsFromLectureMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to local Whisper when Groq transcription fails', async () => {
    const { transcriptionService, initWhisperMock, markTopicsFromLectureMock } =
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

    const analysis = await transcriptionService.transcribeAudio('/tmp/lecture.wav');

    expect(analysis.subject).toBe('Physiology');
    expect(analysis.transcript).toBe('local fallback transcript');
    expect(initWhisperMock).toHaveBeenCalledTimes(1);
    expect(markTopicsFromLectureMock).toHaveBeenCalledTimes(1);
  });

  it('throws when no transcription backend is available', async () => {
    const { transcriptionService } = await loadTranscriptionService({
      groqKey: undefined,
      useLocalWhisper: false,
      localWhisperPath: null,
    });

    await expect(transcriptionService.transcribeAudio('/tmp/lecture.wav')).rejects.toThrow(
      'No transcription engine available',
    );
  });

  it('still runs topic matching when embedding generation fails', async () => {
    const { transcriptionService, markTopicsFromLectureMock, generateEmbeddingMock } =
      await loadTranscriptionService({
        useLocalWhisper: true,
        localTranscript: 'full transcript text',
        embeddingError: new Error('embedding offline'),
      });

    const analysis = await transcriptionService.transcribeAudio('/tmp/lecture.wav');
    const matchCall = markTopicsFromLectureMock.mock.calls[0] as any[];

    expect(analysis.transcript).toBe('full transcript text');
    expect(generateEmbeddingMock).toHaveBeenCalledTimes(1);
    expect(markTopicsFromLectureMock).toHaveBeenCalledTimes(1);
    expect(matchCall[5]).toBeNull();
  });
});
