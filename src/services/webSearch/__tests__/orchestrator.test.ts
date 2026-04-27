import type { WebSearchProviderId } from '../../../types';
import type { WebSearchResult } from '../types';

const mockSearchText = jest.fn();
const mockSearchImages = jest.fn();

jest.mock('../providers/brave', () => ({
  braveProvider: {
    id: 'brave',
    searchText: (...args: unknown[]) => mockSearchText('brave', ...args),
    searchImages: (...args: unknown[]) => mockSearchImages('brave', ...args),
  },
}));

jest.mock('../providers/geminiGrounding', () => ({
  geminiGroundingProvider: {
    id: 'gemini_grounding',
    searchText: (...args: unknown[]) => mockSearchText('gemini_grounding', ...args),
  },
}));

jest.mock('../providers/deepseekWeb', () => ({
  deepseekWebProvider: {
    id: 'deepseek_web',
    searchText: (...args: unknown[]) => mockSearchText('deepseek_web', ...args),
  },
}));

jest.mock('../providers/duckduckgo', () => ({
  duckduckgoProvider: {
    id: 'duckduckgo',
    searchText: (...args: unknown[]) => mockSearchText('duckduckgo', ...args),
    searchImages: (...args: unknown[]) => mockSearchImages('duckduckgo', ...args),
  },
}));

import { searchWeb, searchImages } from '../orchestrator';

function profile(overrides: Record<string, unknown> = {}) {
  return {
    braveSearchApiKey: 'brave-key',
    geminiKey: 'gemini-key',
    deepseekKey: 'deepseek-key',
    webSearchOrder: undefined as WebSearchProviderId[] | undefined,
    disabledWebSearchProviders: [] as WebSearchProviderId[],
    ...overrides,
  };
}

function hit(title: string): WebSearchResult {
  return { title, url: `https://${title}.com`, snippet: title, provider: 'brave' };
}

describe('searchWeb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns results from the first provider that yields them', async () => {
    mockSearchText.mockImplementation((id: string) => {
      if (id === 'brave') return [];
      if (id === 'gemini_grounding') return [hit('gemini-result')];
      return [];
    });

    const results = await searchWeb({ query: 'test', profile: profile() });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('gemini-result');
    // brave was called first (got empty), gemini second
    expect(mockSearchText).toHaveBeenCalledTimes(2);
    expect(mockSearchText).toHaveBeenNthCalledWith(1, 'brave', expect.anything());
    expect(mockSearchText).toHaveBeenNthCalledWith(2, 'gemini_grounding', expect.anything());
  });

  it('skips providers missing API keys', async () => {
    mockSearchText.mockResolvedValue([hit('ddg')]);

    const results = await searchWeb({
      query: 'test',
      profile: profile({ braveSearchApiKey: '', geminiKey: '', deepseekKey: '' }),
    });

    // Only duckduckgo (no key needed) should be called
    expect(results).toHaveLength(1);
    expect(mockSearchText).toHaveBeenCalledTimes(1);
    expect(mockSearchText).toHaveBeenCalledWith('duckduckgo', expect.anything());
  });

  it('skips disabled providers', async () => {
    mockSearchText.mockImplementation((id: string) => {
      if (id === 'duckduckgo') return [hit('ddg')];
      return [];
    });

    await searchWeb({
      query: 'test',
      profile: profile({
        disabledWebSearchProviders: ['brave', 'gemini_grounding', 'deepseek_web'],
      }),
    });

    expect(mockSearchText).toHaveBeenCalledTimes(1);
    expect(mockSearchText).toHaveBeenCalledWith('duckduckgo', expect.anything());
  });

  it('respects custom order from profile', async () => {
    mockSearchText.mockImplementation((id: string) => {
      if (id === 'duckduckgo') return [hit('ddg')];
      return [];
    });

    await searchWeb({
      query: 'test',
      profile: profile({ webSearchOrder: ['duckduckgo', 'brave'] }),
    });

    // duckduckgo should be tried first per custom order
    expect(mockSearchText).toHaveBeenNthCalledWith(1, 'duckduckgo', expect.anything());
  });

  it('falls through errors to next provider', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSearchText.mockImplementation((id: string) => {
      if (id === 'brave') throw new Error('brave down');
      if (id === 'gemini_grounding') return [hit('gemini-fallback')];
      return [];
    });

    const results = await searchWeb({ query: 'test', profile: profile() });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('gemini-fallback');
    expect(warnSpy).toHaveBeenCalledWith('[WebSearch] Provider brave failed:', expect.any(Error));
    warnSpy.mockRestore();
  });

  it('returns empty when all providers fail', async () => {
    mockSearchText.mockResolvedValue([]);
    const results = await searchWeb({ query: 'test', profile: profile() });
    expect(results).toEqual([]);
  });
});

describe('searchImages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns image results from first capable provider', async () => {
    const img = { title: 'img', url: 'https://img.com', provider: 'brave' as const };
    // gemini_grounding doesn't have searchImages — only brave and duckduckgo do
    mockSearchImages.mockImplementation((id: string) => {
      if (id === 'brave') return [img];
      return [];
    });

    const results = await searchImages({
      query: 'test',
      profile: profile(),
    });

    expect(results).toHaveLength(1);
    expect(mockSearchImages).toHaveBeenCalledWith('brave', expect.anything());
  });

  it('skips providers without searchImages', async () => {
    const img = { title: 'ddg-img', url: 'https://ddg.com', provider: 'duckduckgo' as const };
    // braves images returns empty, gemini has no searchImages, deepseek has no searchImages
    mockSearchImages.mockImplementation((id: string) => {
      if (id === 'brave') return [];
      if (id === 'duckduckgo') return [img];
      return [];
    });

    const results = await searchImages({
      query: 'test',
      profile: profile(),
    });

    expect(results).toHaveLength(1);
    // gemini_grounding and deepseek_web should be skipped (no searchImages method)
    // So brave is called first (returns empty), then duckduckgo
    expect(mockSearchImages).toHaveBeenCalledTimes(2);
  });
});
