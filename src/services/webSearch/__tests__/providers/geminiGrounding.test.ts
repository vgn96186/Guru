const mockDoGenerate = jest.fn();
const mockExtractGrounding = jest.fn();
const mockCreateGeminiModel = jest.fn();

jest.mock('../../../ai/v2/providers/gemini', () => ({
  createGeminiModel: (config: any) => {
    mockCreateGeminiModel(config);
    return {
      doGenerate: mockDoGenerate,
      provider: 'gemini',
      modelId: config?.modelId,
    };
  },
  extractGroundingMetadata: (raw: unknown) => mockExtractGrounding(raw),
}));

import { geminiGroundingProvider } from '../../providers/geminiGrounding';

function profile(input?: {
  geminiKey?: string;
  vertexAiProject?: string;
  vertexAiLocation?: string;
  vertexAiToken?: string;
}) {
  return {
    geminiKey: input?.geminiKey ?? 'test-gemini-key',
    vertexAiProject: input?.vertexAiProject ?? '',
    vertexAiLocation: input?.vertexAiLocation ?? '',
    vertexAiToken: input?.vertexAiToken ?? '',
  } as any;
}

describe('geminiGroundingProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when no API key', async () => {
    const results = await geminiGroundingProvider.searchText({
      query: 'test',
      maxResults: 5,
      profile: profile({ geminiKey: '' }),
    });
    expect(results).toEqual([]);
    expect(mockDoGenerate).not.toHaveBeenCalled();
  });

  it('calls doGenerate with webSearch: true', async () => {
    mockDoGenerate.mockResolvedValueOnce({ rawResponse: {} });
    mockExtractGrounding.mockReturnValueOnce([]);

    await geminiGroundingProvider.searchText({
      query: 'INICET 2026 exam date',
      maxResults: 5,
      profile: profile(),
    });

    expect(mockDoGenerate).toHaveBeenCalledTimes(1);
    expect(mockDoGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        webSearch: true,
        prompt: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('INICET 2026 exam date'),
          }),
        ]),
      }),
    );
  });

  it('uses Vertex AI when vertex token is set', async () => {
    mockDoGenerate.mockResolvedValueOnce({ rawResponse: {} });
    mockExtractGrounding.mockReturnValueOnce([]);

    await geminiGroundingProvider.searchText({
      query: 'test',
      maxResults: 5,
      profile: profile({
        geminiKey: '',
        vertexAiProject: 'my-project',
        vertexAiLocation: 'us-central1',
        vertexAiToken: 'ya29.test',
      }),
    });

    expect(mockCreateGeminiModel).toHaveBeenCalledWith(
      expect.objectContaining({
        isVertex: true,
        apiKey: 'ya29.test',
        vertexProject: 'my-project',
        vertexLocation: 'us-central1',
      }),
    );
  });

  it('extracts and maps grounding chunks to results', async () => {
    mockDoGenerate.mockResolvedValueOnce({
      rawResponse: { candidates: [{ groundingMetadata: {} }] },
    });
    mockExtractGrounding.mockReturnValueOnce([
      { title: 'Example', url: 'https://example.com' },
      { title: 'PubMed', url: 'https://pubmed.gov/article' },
    ]);

    const results = await geminiGroundingProvider.searchText({
      query: 'diabetes',
      maxResults: 3,
      profile: profile(),
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: 'Example',
      url: 'https://example.com',
      snippet: 'Example',
      provider: 'gemini_grounding',
    });
    expect(results[1].url).toBe('https://pubmed.gov/article');
  });

  it('returns empty when grounding metadata is empty', async () => {
    mockDoGenerate.mockResolvedValueOnce({ rawResponse: {} });
    mockExtractGrounding.mockReturnValueOnce([]);

    const results = await geminiGroundingProvider.searchText({
      query: 'test',
      maxResults: 5,
      profile: profile(),
    });

    expect(results).toEqual([]);
  });
});
