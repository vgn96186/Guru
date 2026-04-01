/**
 * GitHub Copilot HTTP API — env defaults (no Expo). Matches VS Code–style
 * `api.githubcopilot.com/chat/completions` usage; override host/headers for enterprise mirrors if GitHub documents them.
 */
export const DEFAULT_GITHUB_COPILOT_API_ORIGIN = 'https://api.githubcopilot.com';

/** Base URL for Copilot inference (no trailing slash). */
export function getGitHubCopilotApiOrigin(): string {
  const raw = (
    process.env.EXPO_PUBLIC_GITHUB_COPILOT_API_ORIGIN ?? DEFAULT_GITHUB_COPILOT_API_ORIGIN
  ).trim();
  const u = raw.replace(/\/+$/, '');
  return u || DEFAULT_GITHUB_COPILOT_API_ORIGIN;
}

/** `Editor-Version` header — third-party clients often mimic a supported editor. */
export function getGitHubCopilotEditorVersion(): string {
  const v = (process.env.EXPO_PUBLIC_GITHUB_COPILOT_EDITOR_VERSION ?? 'vscode/1.96.0').trim();
  return v || 'vscode/1.96.0';
}

/** `Copilot-Integration-Id` header (e.g. vscode-chat). */
export function getGitHubCopilotIntegrationId(): string {
  const v = (process.env.EXPO_PUBLIC_GITHUB_COPILOT_INTEGRATION_ID ?? 'vscode-chat').trim();
  return v || 'vscode-chat';
}

export function getGitHubCopilotChatCompletionsUrl(): string {
  return `${getGitHubCopilotApiOrigin()}/chat/completions`;
}
