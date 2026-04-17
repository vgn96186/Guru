import {
  generateEmbedding,
  cosineSimilarity,
  embeddingToBlob,
  blobToEmbedding,
  __resetEmbeddingSessionStateForTests,
} from './embeddingService';

jest.mock('../../db/repositories', () => ({
  profileRepository: {
    getProfile: jest.fn().mockResolvedValue({ id: 1, openrouterKey: 'or-key' }),
  },
}));

// Plain function so `resetMocks` in jest.unit.config does not wipe the implementation
jest.mock('./config', () => ({
  getApiKeys: () => ({ orKey: 'or-key', groqKey: 'g' }),
}));

describe('embeddingService', () => {
  const origFetch = global.fetch;

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
  });
});
