jest.mock('./providers/brave', () => ({
  braveProvider: {
    id: 'brave',
    searchText: jest.fn(),
    searchImages: jest.fn(),
  },
}));

jest.mock('./providers/duckduckgo', () => ({
  duckduckgoProvider: {
    id: 'duckduckgo',
    searchText: jest.fn(),
  },
}));

jest.mock('./providers/geminiGrounding', () => ({
  geminiGroundingProvider: {
    id: 'gemini_grounding',
    searchText: jest.fn(),
  },
}));

jest.mock('./providers/deepseekWeb', () => ({
  deepseekWebProvider: {
    id: 'deepseek_web',
    searchText: jest.fn(),
  },
}));

import { searchImages, searchWeb } from './orchestrator';

describe('webSearch orchestrator', () => {
  const { braveProvider } = require('./providers/brave');
  const { duckduckgoProvider } = require('./providers/duckduckgo');

  const asMock = <T>(v: T) => v as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('falls back through providers until it finds results', async () => {
    asMock(braveProvider.searchText).mockResolvedValue([]);
    asMock(duckduckgoProvider.searchText).mockResolvedValue([
      { title: 't', url: 'u', provider: 'duckduckgo' },
    ]);

    const profile: any = {
      webSearchOrder: ['brave', 'duckduckgo'],
      disabledWebSearchProviders: [],
      braveSearchApiKey: 'x',
    };

    const results = await searchWeb({ query: 'kidney', profile });
    expect(braveProvider.searchText).toHaveBeenCalled();
    expect(duckduckgoProvider.searchText).toHaveBeenCalled();
    expect(results[0].provider).toBe('duckduckgo');
  });

  it('skips brave when api key is missing', async () => {
    asMock(duckduckgoProvider.searchText).mockResolvedValue([
      { title: 't', url: 'u', provider: 'duckduckgo' },
    ]);

    const profile: any = {
      webSearchOrder: ['brave', 'duckduckgo'],
      disabledWebSearchProviders: [],
      braveSearchApiKey: '',
    };

    const results = await searchWeb({ query: 'kidney', profile });
    expect(braveProvider.searchText).not.toHaveBeenCalled();
    expect(duckduckgoProvider.searchText).toHaveBeenCalled();
    expect(results.length).toBe(1);
  });

  it('returns image results from the first image-capable provider', async () => {
    asMock(braveProvider.searchImages).mockResolvedValue([
      { title: 'img', url: 'https://img', provider: 'brave' },
    ]);

    const profile: any = {
      webSearchOrder: ['brave', 'duckduckgo'],
      disabledWebSearchProviders: [],
      braveSearchApiKey: 'x',
    };

    const results = await searchImages({ query: 'kidney', profile, maxResults: 3 });
    expect(braveProvider.searchImages).toHaveBeenCalled();
    expect(results[0].provider).toBe('brave');
  });
});
