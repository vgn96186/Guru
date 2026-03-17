import { fetchWikipediaImage } from './imageService';

describe('imageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = jest.fn();
  });

  describe('fetchWikipediaImage', () => {
    it('returns thumbnail for exact match', async () => {
      (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({
          query: {
            pages: {
              '123': {
                thumbnail: { source: 'https://example.com/exact.jpg' },
              },
            },
          },
        }),
      });

      const result = await fetchWikipediaImage('Heart');
      expect(result).toBe('https://example.com/exact.jpg');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('cleans the topic name and falls back to cleaned string match', async () => {
      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          json: async () => ({ query: { pages: { '-1': {} } } }), // Exact match fails
        })
        .mockResolvedValueOnce({
          json: async () => ({
            query: {
              pages: {
                '456': {
                  thumbnail: { source: 'https://example.com/cleaned.jpg' },
                },
              },
            },
          }), // Cleaned match succeeds
        });

      const result = await fetchWikipediaImage('Anatomy of Heart');
      expect(result).toBe('https://example.com/cleaned.jpg');
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toContain(
        encodeURIComponent('Anatomy of Heart'),
      );
      expect((globalThis.fetch as jest.Mock).mock.calls[1][0]).toContain(
        encodeURIComponent('Heart'),
      );
    });

    it('falls back to Wikipedia search match if direct matches fail', async () => {
      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({ json: async () => ({}) }) // Exact match fails
        .mockResolvedValueOnce({
          json: async () => ({
            query: { search: [{ title: 'Heart Search Result' }] },
          }),
        }) // Search returns result
        .mockResolvedValueOnce({
          json: async () => ({
            query: {
              pages: {
                '789': {
                  thumbnail: { source: 'https://example.com/search.jpg' },
                },
              },
            },
          }),
        }); // searchWiki for firstResult succeeds

      const result = await fetchWikipediaImage('UnknownTopic');
      expect(result).toBe('https://example.com/search.jpg');
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it('falls back to Wikimedia Commons if Wikipedia search fails', async () => {
      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({ json: async () => ({}) }) // Exact match fails
        .mockRejectedValueOnce(new Error('Search failed')) // Wikipedia Search fails
        .mockResolvedValueOnce({
          json: async () => ({
            query: { search: [{ title: 'File:Heart_Commons.jpg' }] },
          }),
        }) // Commons search returns result
        .mockResolvedValueOnce({
          json: async () => ({
            query: {
              pages: {
                '101': {
                  imageinfo: [{ thumburl: 'https://example.com/commons.jpg' }],
                },
              },
            },
          }),
        }); // Commons file info succeeds

      const result = await fetchWikipediaImage('UnknownTopic');
      expect(result).toBe('https://example.com/commons.jpg');
      expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    });

    it('returns null if all methods fail and fallback to ultimate null', async () => {
      (globalThis.fetch as jest.Mock).mockRejectedValue(new Error('Network error')); // All fetches fail

      const result = await fetchWikipediaImage('FailTopic');
      expect(result).toBeNull();
      // exact match searchWiki
      // skip cleaned string because FailTopic equals cleaned
      // wikipedia search
      // commons search
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it('returns null if searchWiki fails due to missing pages', async () => {
      (globalThis.fetch as jest.Mock).mockResolvedValue({ json: async () => ({ query: {} }) }); // No pages

      const result = await fetchWikipediaImage('NoPagesTopic');
      expect(result).toBeNull();
    });

    it('returns null if Commons file info returns no pages', async () => {
      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({ json: async () => ({}) }) // Exact match fails
        .mockResolvedValueOnce({ json: async () => ({ query: { search: [] } }) }) // Wikipedia Search no results
        .mockResolvedValueOnce({
          json: async () => ({
            query: { search: [{ title: 'File:NoPages_Commons.jpg' }] },
          }),
        }) // Commons search returns result
        .mockResolvedValueOnce({
          json: async () => ({
            query: {}, // Commons file info no pages
          }),
        });

      const result = await fetchWikipediaImage('NoCommonsPagesTopic');
      expect(result).toBeNull();
    });

    it('returns null if Commons file info returns -1 pageId', async () => {
      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({ json: async () => ({}) }) // Exact match fails
        .mockResolvedValueOnce({ json: async () => ({ query: { search: [] } }) }) // Wikipedia Search no results
        .mockResolvedValueOnce({
          json: async () => ({
            query: { search: [{ title: 'File:MinusOne_Commons.jpg' }] },
          }),
        }) // Commons search returns result
        .mockResolvedValueOnce({
          json: async () => ({
            query: { pages: { '-1': {} } }, // Commons file info pageId -1
          }),
        });

      const result = await fetchWikipediaImage('MinusOneCommonsTopic');
      expect(result).toBeNull();
    });
  });
});
