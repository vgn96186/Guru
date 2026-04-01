/**
 * GitHub Copilot chat/completions client.
 *
 * Uses the same approach as OpenCode: send the OAuth access token directly
 * as `Authorization: Bearer <token>` to api.githubcopilot.com/chat/completions.
 * No intermediate session token exchange needed.
 */
import {
  getGitHubCopilotChatCompletionsUrl,
  getGitHubCopilotEditorVersion,
  getGitHubCopilotIntegrationId,
} from './githubCopilotEnv';

/**
 * @deprecated Session token exchange is no longer used.
 * The OAuth access token is sent directly to the Copilot API.
 * This function now simply returns the OAuth token as-is for backward compatibility.
 */
export async function getCopilotSessionToken(oauthAccessToken: string): Promise<string> {
  return oauthAccessToken;
}

/** Clear cached session token — no-op now but kept for API compatibility. */
export function invalidateCopilotSessionToken(): void {
  // no-op: no session token cache anymore
}

export function buildGitHubCopilotHeaders(oauthToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${oauthToken}`,
    'User-Agent': 'GuruStudy/1.0',
    'Editor-Version': getGitHubCopilotEditorVersion(),
    'Copilot-Integration-Id': getGitHubCopilotIntegrationId(),
    'Openai-Intent': 'conversation-edits',
  };
}

/**
 * POST chat/completions using the OAuth access token directly.
 * Caller handles status, JSON parse, and rate limits.
 */
export async function postGitHubCopilotChatCompletions(
  oauthToken: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(getGitHubCopilotChatCompletionsUrl(), {
    method: 'POST',
    headers: buildGitHubCopilotHeaders(oauthToken),
    body: JSON.stringify(body),
  });
}
