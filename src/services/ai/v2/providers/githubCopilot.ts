/**
 * GitHub Copilot adapter — OpenAI-compatible Chat Completions.
 *
 * The Copilot inference endpoint (`api.githubcopilot.com/chat/completions`)
 * speaks the standard OpenAI wire format, so we wire it through
 * `createOpenAICompatibleModel` and get tool calling + streaming + JSON
 * response_format for free. Auth is a fresh OAuth token per request, pulled
 * via `getValidAccessToken()` so refreshes happen transparently.
 */

import type { LanguageModelV2 } from '../spec';
import { createOpenAICompatibleModel } from './openaiCompatible';
import { getValidAccessToken } from '../../github/githubTokenStore';
import {
  getGitHubCopilotChatCompletionsUrl,
  getGitHubCopilotEditorVersion,
  getGitHubCopilotIntegrationId,
} from '../../github/githubCopilotEnv';

export interface GitHubCopilotConfig {
  modelId: string;
}

export function createGitHubCopilotModel(config: GitHubCopilotConfig): LanguageModelV2 {
  return createOpenAICompatibleModel({
    provider: 'github_copilot',
    modelId: config.modelId,
    url: getGitHubCopilotChatCompletionsUrl(),
    headers: async () => {
      const oauthToken = await getValidAccessToken();
      return {
        Authorization: `Bearer ${oauthToken}`,
        'User-Agent': 'GuruStudy/1.0',
        'Editor-Version': getGitHubCopilotEditorVersion(),
        'Copilot-Integration-Id': getGitHubCopilotIntegrationId(),
        'Openai-Intent': 'conversation-edits',
      };
    },
  });
}
