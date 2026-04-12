import {
  fetchAllLiveGuruChatModelIds,
  fetchCloudflareChatModelIds,
  fetchGeminiChatModelIds,
  fetchGroqChatModelIds,
  fetchOpenRouterFreeModelIds,
} from './liveModelCatalog';
import {
  CLOUDFLARE_MODELS,
  GEMINI_MODELS,
  GROQ_MODELS,
  OPENROUTER_FREE_MODELS,
} from '../../config/appConfig';

jest.mock('./google/geminiListModels', () => {
  const actual = jest.requireActual<typeof import('./google/geminiListModels')>(
    './google/geminiListModels',
  );
  return {
    ...actual,
    fetchGeminiChatModelIdsViaSdk: jest.fn().mockResolvedValue([]),
  };
});

describe('liveModelCatalog', () => {
  const origFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  afterEach(() => {
    global.fetch = origFetch;
  });

  describe('fetchGroqChatModelIds', () => {
    it('returns fallback when key empty', async () => {
      const r = await fetchGroqChatModelIds('');
      expect(r.source).toBe('fallback');
      expect(r.ids).toEqual([...GROQ_MODELS]);
    });

    it('filters non-chat models and marks live when chat ids remain', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'llama-3.3-70b-versatile' },
            { id: 'whisper-large-v3' },
            { id: 'embed-english' },
          ],
        }),
      });
      const r = await fetchGroqChatModelIds('gsk_test');
      expect(r.source).toBe('live');
      expect(r.ids).toContain('llama-3.3-70b-versatile');
      expect(r.ids.some((id) => /whisper|embed/i.test(id))).toBe(false);
    });

    it('returns fallback when fetch throws', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
      const r = await fetchGroqChatModelIds('gsk_test');
      expect(r.source).toBe('fallback');
      expect(r.error).toBe('offline');
    });
  });

  describe('fetchOpenRouterFreeModelIds', () => {
    it('returns fallback when key empty', async () => {
      const r = await fetchOpenRouterFreeModelIds('');
      expect(r.source).toBe('fallback');
      expect(r.ids).toEqual([...OPENROUTER_FREE_MODELS]);
    });

    it('keeps :free slugs and zero-priced models', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'x/y:free', pricing: { prompt: '0', completion: '0' } },
            { id: 'a/b:paid', pricing: { prompt: '1', completion: '1' } },
          ],
        }),
      });
      const r = await fetchOpenRouterFreeModelIds('sk-or');
      expect(r.source).toBe('live');
      expect(r.ids).toContain('x/y:free');
    });
  });

  describe('fetchGeminiChatModelIds', () => {
    it('returns fallback when key empty', async () => {
      const r = await fetchGeminiChatModelIds('');
      expect(r.source).toBe('fallback');
      expect(r.ids).toEqual([...GEMINI_MODELS]);
    });

    it('maps models/ prefix and generateContent', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            {
              name: 'models/gemini-2.0-flash',
              supportedGenerationMethods: ['generateContent'],
            },
            { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
          ],
        }),
      });
      const r = await fetchGeminiChatModelIds('AIza');
      expect(r.source).toBe('live');
      expect(r.ids).toContain('gemini-2.0-flash');
      expect(r.ids.some((id) => id.includes('embedding'))).toBe(false);
    });
  });

  describe('fetchCloudflareChatModelIds', () => {
    it('returns fallback when creds missing', async () => {
      const r = await fetchCloudflareChatModelIds('', '');
      expect(r.source).toBe('fallback');
      expect(r.ids).toEqual([...CLOUDFLARE_MODELS]);
    });

    it('parses result array and filters heuristics', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: [{ id: '@cf/meta/llama-3.1-8b-instruct' }, { id: 'noise' }],
        }),
      });
      const r = await fetchCloudflareChatModelIds('a'.repeat(32), 'tok');
      expect(r.source).toBe('live');
      expect(r.ids).toContain('@cf/meta/llama-3.1-8b-instruct');
    });
  });

  describe('fetchAllLiveGuruChatModelIds', () => {
    it('aggregates providers and sets anyLive', async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('groq.com')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ data: [{ id: 'llama-3.3-70b-versatile' }] }),
          });
        }
        if (url.includes('openrouter')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              data: [{ id: 'm/n:free', pricing: { prompt: 0, completion: 0 } }],
            }),
          });
        }
        if (url.includes('googleapis.com')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              models: [
                {
                  name: 'models/gemini-2.0-flash',
                  supportedGenerationMethods: ['generateContent'],
                },
              ],
            }),
          });
        }
        if (url.includes('cloudflare.com')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ result: [{ id: '@cf/x' }] }),
          });
        }
        return Promise.reject(new Error('unexpected url'));
      });

      const r = await fetchAllLiveGuruChatModelIds({
        groqKey: 'g',
        orKey: 'o',
        geminiKey: 'gem',
        cfAccountId: 'a'.repeat(32),
        cfApiToken: 't',
      });
      expect(r.anyLive).toBe(true);
      expect(r.groq.length).toBeGreaterThan(0);
      expect(r.openrouter.length).toBeGreaterThan(0);
      expect(r.gemini.length).toBeGreaterThan(0);
      expect(r.cloudflare.length).toBeGreaterThan(0);
    });
  });
});
