async function loadTranscriptionService(opts?: {
  groqKey?: string | undefined;
  useLocalWhisper?: boolean;
  localWhisperPath?: string | null;
  localTranscript?: string;
}) {
  jest.resetModules();
  (globalThis as any).__DEV__ = false;

  const localTranscript = opts?.localTranscript ?? 'local lecture transcript';
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
  jest.doMock('whisper.rn', () => ({
    initWhisper: initWhisperMock,
  }), { virtual: true });
  jest.doMock('../../modules/app-launcher', () => ({
    convertToWav: jest.fn(async () => null),
  }));
  jest.doMock('../db/repositories', () => ({
    profileRepository: {
      getProfile: jest.fn(() => Promise.resolve({
        useLocalWhisper: opts?.useLocalWhisper ?? true,
        localWhisperPath: opts?.localWhisperPath ?? '/models/whisper.bin',
      })),
    },
    dailyLogRepository: {},
  }));
  jest.doMock('./aiService', () => ({
    getApiKeys: jest.fn(() => ({ groqKey: opts?.groqKey, orKey: undefined })),
    generateJSONWithRouting: generateJSONWithRoutingMock,
    generateTextWithRouting: jest.fn(),
  }));

  const transcriptionService = await import('./transcriptionService');
  return { transcriptionService, initWhisperMock, generateJSONWithRoutingMock };
}

describe('transcriptionService entrypoint policy', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('tries Groq transcription first when Groq key is available', async () => {
    const { transcriptionService, initWhisperMock } = await loadTranscriptionService({
      groqKey: 'groq-test-key',
      useLocalWhisper: true,
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async (...args: unknown[]) => {
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
  });

  it('falls back to local Whisper when Groq transcription fails', async () => {
    const { transcriptionService, initWhisperMock } = await loadTranscriptionService({
      groqKey: 'groq-test-key',
      useLocalWhisper: true,
      localWhisperPath: '/models/local-whisper.bin',
      localTranscript: 'local fallback transcript',
    });
    jest.spyOn(globalThis, 'fetch' as any).mockImplementation(async () => ({
      ok: false,
      status: 500,
      text: async () => 'groq error',
    }) as any);

    const analysis = await transcriptionService.transcribeAudio('/tmp/lecture.wav');

    expect(analysis.subject).toBe('Physiology');
    expect(analysis.transcript).toBe('local fallback transcript');
    expect(initWhisperMock).toHaveBeenCalledTimes(1);
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
});
