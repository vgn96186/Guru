import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { fetchWikipediaImage } from './imageService';

// Mock fetch globally
globalThis.fetch = jest.fn() as any;

describe('fetchWikipediaImage', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    (globalThis.fetch as any).mockReset();
  });

  it('returns image url on exact match', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      json: async () => ({
        query: {
          pages: {
            '123': { thumbnail: { source: 'https://example.com/exact.jpg' } },
          },
        },
      }),
    });

    const result = await fetchWikipediaImage('Heart');
    expect(result).toBe('https://example.com/exact.jpg');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns image url on cleaned match when exact match fails', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        json: async () => ({ query: { pages: { '-1': {} } } }), // Exact match fails
      })
      .mockResolvedValueOnce({
        json: async () => ({
          query: {
            pages: {
              '124': { thumbnail: { source: 'https://example.com/cleaned.jpg' } },
            },
          },
        }),
      });

    const result = await fetchWikipediaImage('Anatomy of Heart');
    expect(result).toBe('https://example.com/cleaned.jpg');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns image url from Wikipedia search when direct matches fail', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        json: async () => ({ query: { pages: { '-1': {} } } }), // Exact match fails
      })
      // No cleaned match because string is already clean ("Heart")
      .mockResolvedValueOnce({
        json: async () => ({
          query: { search: [{ title: 'Heart (organ)' }] }, // Wikipedia search match
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          query: {
            pages: {
              '125': { thumbnail: { source: 'https://example.com/search.jpg' } },
            },
          },
        }),
      });

    const result = await fetchWikipediaImage('Heart');
    expect(result).toBe('https://example.com/search.jpg');
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('returns image url from Wikimedia Commons when Wikipedia search fails', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        json: async () => ({ query: { pages: { '-1': {} } } }), // Exact match fails
      })
      .mockResolvedValueOnce({
        json: async () => ({ query: { search: [] } }), // Wikipedia search fails
      })
      .mockResolvedValueOnce({
        json: async () => ({
          query: { search: [{ title: 'File:Heart.jpg' }] }, // Commons search match
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          query: {
            pages: {
              '126': { imageinfo: [{ thumburl: 'https://example.com/commons.jpg' }] },
            },
          },
        }),
      });

    const result = await fetchWikipediaImage('Heart');
    expect(result).toBe('https://example.com/commons.jpg');
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it('returns null when everything fails', async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce({
        json: async () => ({ query: { pages: { '-1': {} } } }), // Exact
      })
      .mockResolvedValueOnce({
        json: async () => ({ query: { search: [] } }), // Wiki search
      })
      .mockResolvedValueOnce({
        json: async () => ({ query: { search: [] } }), // Commons search
      });

    const result = await fetchWikipediaImage('Heart');
    expect(result).toBeNull();
  });

  it('returns null on network errors gracefully', async () => {
    (globalThis.fetch as any).mockRejectedValue(new Error('Network Error'));

    const result = await fetchWikipediaImage('Heart');
    expect(result).toBeNull();
  });
});
