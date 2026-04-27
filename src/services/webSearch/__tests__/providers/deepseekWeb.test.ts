const mockGenerateText = jest.fn();

jest.mock('../../../ai/v2/generateText', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

jest.mock('../../../ai/v2/providers/presets', () => ({
  createDeepSeekModel: () => ({
    provider: 'deepseek',
    modelId: 'deepseek-chat',
  }),
}));

import { deepseekWebProvider } from '../../providers/deepseekWeb';

function profile(key?: string) {
  return { deepseekKey: key ?? 'test-deepseek-key' } as any;
}

describe('deepseekWebProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when no API key', async () => {
    const results = await deepseekWebProvider.searchText({
      query: 'test',
      maxResults: 5,
      profile: profile(''),
    });
    expect(results).toEqual([]);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it('calls generateText with webSearch: true', async () => {
    mockGenerateText.mockResolvedValueOnce({ text: '' });

    await deepseekWebProvider.searchText({
      query: 'NEET-PG 2026 dates',
      maxResults: 5,
      profile: profile(),
    });

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        webSearch: true,
        prompt: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('NEET-PG 2026 dates'),
          }),
        ]),
      }),
    );
  });

  it('parses structured response into results', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: '- Title: Example\n  URL: https://example.com\n  Description: An example result\n- Title: Second\n  URL: https://second.com\n  Description: Another result',
    });

    const results = await deepseekWebProvider.searchText({
      query: 'test',
      maxResults: 3,
      profile: profile(),
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: 'Example',
      url: 'https://example.com',
      snippet: 'An example result',
      provider: 'deepseek_web',
    });
    expect(results[1]).toEqual({
      title: 'Second',
      url: 'https://second.com',
      snippet: 'Another result',
      provider: 'deepseek_web',
    });
  });

  it('handles partial entries (missing URL/Description)', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: '- Title: OnlyTitle\n- Title: Complete\n  URL: https://complete.com',
    });

    const results = await deepseekWebProvider.searchText({
      query: 'test',
      maxResults: 3,
      profile: profile(),
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: 'OnlyTitle',
      provider: 'deepseek_web',
    });
    expect(results[1].url).toBe('https://complete.com');
  });

  it('returns empty when generateText produces no parseable results', async () => {
    mockGenerateText.mockResolvedValueOnce({ text: '' });

    const results = await deepseekWebProvider.searchText({
      query: 'test',
      maxResults: 3,
      profile: profile(),
    });

    expect(results).toEqual([]);
  });
});
