import {
  generateEmbedding,
  cosineSimilarity,
  embeddingToBlob,
  blobToEmbedding,
  __resetEmbeddingSessionStateForTests,
} from './embeddingService';
import { profileRepository } from '../../db/repositories';
import { getApiKeys } from './config';

jest.mock('../../db/repositories', () => ({
  profileRepository: {
    getProfile: jest.fn(),
  },
}));

// Plain function so `resetMocks` in jest.unit.config does not wipe the implementation
jest.mock('./config', () => ({
  getApiKeys: jest.fn(),
}));

let mockProfile: any;
let mockKeys: any;

describe('embeddingService', () => {
  const origFetch = global.fetch;

  beforeEach(() => {
    mockProfile = { id: 1, embeddingProvider: undefined, embeddingModel: undefined };
    mockKeys = { orKey: 'or-key', geminiKey: undefined, jinaKey: undefined };
    (profileRepository.getProfile as jest.Mock).mockResolvedValue(mockProfile);
    (getApiKeys as jest.Mock).mockReturnValue(mockKeys);
  });

  afterEach(() => {
    global.fetch = origFetch;
    jest.clearAllMocks();
    __resetEmbeddingSessionStateForTests();
  });

  describe('pure helpers', () => {
    it('cosineSimilarity is 1 for identical unit vectors', () => {
      const v = [1, 0, 0];
      expect(cosineSimilarity(v, v)).toBeCloseTo(1);
    });

    it('cosineSimilarity handles zero-length overlap', () => {
      expect(cosineSimilarity([], [1])).toBe(0);
    });

    it('cosineSimilarity uses min length when vectors differ in size', () => {
      expect(cosineSimilarity([1, 0], [1, 0, 0])).toBeCloseTo(1);
    });

    it('embeddingToBlob and blobToEmbedding round-trip', () => {
      const v = [0.25, -0.5, 1.25];
      const blob = embeddingToBlob(v);
      expect(blob).toBeInstanceOf(Uint8Array);
      const back = blobToEmbedding(blob);
      expect(back.length).toBe(v.length);
      expect(back[0]).toBeCloseTo(v[0]);
      expect(back[1]).toBeCloseTo(v[1]);
      expect(back[2]).toBeCloseTo(v[2]);
    });
  });

  describe('generateEmbedding', () => {
    it('returns null for blank text', async () => {
      await expect(generateEmbedding('   ')).resolves.toBeNull();
      expect(global.fetch).toBe(origFetch);
    });

    it('returns embedding vector on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
      });
      const vec = await generateEmbedding('diabetes');
      expect(vec).toEqual([0.1, 0.2, 0.3]);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/embeddings',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('returns null when API returns non-OK (errors are caught)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        text: async () => 'bad',
      });
      await expect(generateEmbedding('x')).resolves.toBeNull();
    });

    it('returns null when response has no embedding array (errors are caught)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });
      await expect(generateEmbedding('x')).resolves.toBeNull();
    });

    describe('fallback logic', () => {
      it('uses preferred provider first', async () => {
        mockProfile.embeddingProvider = 'jina';
        mockProfile.embeddingModel = 'my-jina-model';
        mockKeys.jinaKey = 'j-key';

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ data: [{ embedding: [0.9] }] }),
        });

        const vec = await generateEmbedding('test');
        expect(vec).toEqual([0.9]);
        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.jina.ai/v1/embeddings',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('my-jina-model'),
          })
        );
      });

      it('falls back to Gemini, then OpenRouter, then Jina if primary fails', async () => {
        mockProfile.embeddingProvider = 'openrouter';
        mockKeys.orKey = 'or-key';
        mockKeys.geminiKey = 'g-key';
        // jinaKey undefined

        const fetchMock = jest.fn();
        global.fetch = fetchMock;

        // 1. Try Preferred (OpenRouter) -> fails
        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => 'error',
        });

        // 2. Fallback 1 (Gemini) -> fails
        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => 'error',
        });

        // 3. Fallback 2 (Jina) -> succeeds
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ embedding: [0.5] }] }),
        });

        const vec = await generateEmbedding('test');
        expect(vec).toEqual([0.5]);

        expect(fetchMock).toHaveBeenCalledTimes(3);
        // Call 1: OpenRouter
        expect(fetchMock.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/embeddings');
        // Call 2: Gemini fallback
        expect(fetchMock.mock.calls[1][0]).toContain('generativelanguage.googleapis.com');
        // Call 3: Jina fallback
        expect(fetchMock.mock.calls[2][0]).toBe('https://api.jina.ai/v1/embeddings');
      });

      it('skips fallback for provider if it was already the preferred one', async () => {
        mockProfile.embeddingProvider = 'gemini';
        mockKeys.geminiKey = 'g-key';
        mockKeys.orKey = 'or-key';

        const fetchMock = jest.fn();
        global.fetch = fetchMock;

        // 1. Try Preferred (Gemini) -> fails
        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: async () => 'error',
        });

        // 2. Fallback 1 (Gemini) -> Skipped
        // 3. Fallback 2 (OpenRouter) -> Succeeds
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ embedding: [0.6] }] }),
        });

        const vec = await generateEmbedding('test');
        expect(vec).toEqual([0.6]);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][0]).toContain('generativelanguage.googleapis.com');
        expect(fetchMock.mock.calls[1][0]).toBe('https://openrouter.ai/api/v1/embeddings');
      });

      it('handles Gemini 429 quota exhausted by not retrying Gemini', async () => {
        mockProfile.embeddingProvider = 'gemini';
        mockKeys.geminiKey = 'g-key';
        mockKeys.orKey = 'or-key';

        const fetchMock = jest.fn();
        global.fetch = fetchMock;

        // GEMINI_EMBEDDING_FAIL_THRESHOLD = 2
        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: async () => 'error',
        });
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ embedding: [0.1] }] }),
        });

        await generateEmbedding('test 1');

        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: async () => 'error',
        });
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ embedding: [0.2] }] }),
        });

        await generateEmbedding('test 2');

        // Next call should skip Gemini entirely
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ embedding: [0.3] }] }), // OpenRouter fallback
        });

        const vec = await generateEmbedding('test 3');
        expect(vec).toEqual([0.3]);

        expect(fetchMock).toHaveBeenCalledTimes(5);
        expect(fetchMock.mock.calls[4][0]).toBe('https://openrouter.ai/api/v1/embeddings');
      });
    });
  });
});
