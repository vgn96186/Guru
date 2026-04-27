import { createGeminiModel, extractGroundingMetadata } from '../../ai/v2/providers/gemini';
import type { WebSearchProvider, WebSearchResult, WebSearchParams } from '../types';

export const geminiGroundingProvider: WebSearchProvider = {
  id: 'gemini_grounding',

  async searchText(params: WebSearchParams): Promise<WebSearchResult[]> {
    const apiKey = params.profile.geminiKey;
    if (!apiKey) return [];

    const model = createGeminiModel({
      modelId: 'gemini-2.5-flash',
      apiKey,
    });

    const result = await model.doGenerate({
      prompt: [
        {
          role: 'user',
          content: `Search the web for: ${params.query}. Return the search results with their URLs and brief descriptions.`,
        },
      ],
      maxOutputTokens: 1024,
      webSearch: true,
    });

    const chunks = extractGroundingMetadata(result.rawResponse);
    return chunks.map((c) => ({
      title: c.title,
      url: c.url,
      snippet: c.title,
      provider: 'gemini_grounding' as const,
    }));
  },
};
