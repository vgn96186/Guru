import { createDeepSeekModel } from '../../ai/v2/providers/presets';
import { generateText } from '../../ai/v2/generateText';
import type { WebSearchProvider, WebSearchResult, WebSearchParams } from '../types';

export const deepseekWebProvider: WebSearchProvider = {
  id: 'deepseek_web',

  async searchText(params: WebSearchParams): Promise<WebSearchResult[]> {
    const apiKey = params.profile.deepseekKey;
    if (!apiKey) return [];

    const model = createDeepSeekModel({
      modelId: 'deepseek-chat',
      apiKey,
    });

    const result = await generateText({
      model,
      messages: [
        {
          role: 'user',
          content: `Search the web for: ${params.query}. List the top results with their URLs and brief descriptions. Format each result as: - Title: [title]\n  URL: [url]\n  Description: [description]`,
        },
      ],
      maxOutputTokens: 1024,
    });

    const results: WebSearchResult[] = [];
    const lines = result.text.split('\n');
    let current: Partial<WebSearchResult> = {};
    for (const line of lines) {
      if (line.startsWith('- Title:')) {
        if (current.title) results.push(current as WebSearchResult);
        current = { title: line.replace('- Title:', '').trim(), provider: 'deepseek_web' as const };
      } else if (line.startsWith('  URL:')) {
        current.url = line.replace('  URL:', '').trim();
      } else if (line.startsWith('  Description:')) {
        current.snippet = line.replace('  Description:', '').trim();
      }
    }
    if (current.title) results.push(current as WebSearchResult);
    return results;
  },
};
