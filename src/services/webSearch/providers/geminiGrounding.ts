import { createGeminiModel, extractGroundingMetadata } from '../../ai/v2/providers/gemini';
import { GEMINI_MODELS } from '../../../config/appConfig';
import { VERTEX_MODELS } from '../../../config/appConfig';
import type { WebSearchProvider, WebSearchResult, WebSearchParams } from '../types';

export const geminiGroundingProvider: WebSearchProvider = {
  id: 'gemini_grounding',

  async searchText(params: WebSearchParams): Promise<WebSearchResult[]> {
    const vertexToken = params.profile.vertexAiToken?.trim();
    const vertexProject = params.profile.vertexAiProject?.trim();
    const vertexLocation = params.profile.vertexAiLocation?.trim();

    const isVertexApiKey = Boolean(
      vertexToken && (vertexToken.startsWith('AIza') || vertexToken.startsWith('AQ')),
    );
    const useVertex = Boolean(vertexToken && (isVertexApiKey || (vertexProject && vertexLocation)));
    const apiKey = useVertex ? vertexToken : params.profile.geminiKey?.trim();
    if (!apiKey) return [];

    const modelIds = useVertex
      ? (['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro'] as const).filter((m) =>
          (VERTEX_MODELS as readonly string[]).includes(m),
        )
      : [...GEMINI_MODELS];

    for (const modelId of modelIds) {
      try {
        const model = createGeminiModel({
          modelId,
          apiKey,
          ...(useVertex
            ? {
                isVertex: true,
                vertexProject: vertexProject || undefined,
                vertexLocation: vertexLocation || undefined,
              }
            : null),
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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('[gemini] 429:') || message.includes('RESOURCE_EXHAUSTED')) continue;
        throw error;
      }
    }

    return [];
  },
};
