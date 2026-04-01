/**
 * GitLab host URLs from env — no Expo imports (safe for Jest / Node).
 */
const DEFAULT_INSTANCE = 'https://gitlab.com';

export function getGitLabInstanceUrl(): string {
  return (process.env.EXPO_PUBLIC_GITLAB_INSTANCE_URL?.trim() || DEFAULT_INSTANCE).replace(
    /\/+$/,
    '',
  );
}

/** AI Gateway default matches OpenCode / `gitlab-ai-provider`. */
export function getGitLabAiGatewayUrl(): string {
  const raw = (process.env.EXPO_PUBLIC_GITLAB_AI_GATEWAY_URL ?? 'https://cloud.gitlab.com').trim();
  const u = raw.replace(/\/+$/, '');
  return u || 'https://cloud.gitlab.com';
}
