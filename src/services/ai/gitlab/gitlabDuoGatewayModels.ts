/**
 * `duo-chat-*` and other GitLab Duo model ids → Anthropic / OpenAI model ids
 * for the GitLab AI Gateway (OpenCode / gitlab-ai-provider).
 *
 * ALL models go through the gateway; the legacy `/api/v4/chat/completions`
 * endpoint is deprecated and returns 502 on many instances.
 */
const GATEWAY_MODEL_MAP: Record<
  string,
  | { provider: 'anthropic'; model: string }
  | { provider: 'openai'; model: string; openaiApiType?: 'chat' | 'responses' }
> = {
  // ── Anthropic (via gateway proxy) ──────────────────────────────────
  'duo-chat-opus-4-6': { provider: 'anthropic', model: 'claude-opus-4-6' },
  'duo-chat-sonnet-4-6': { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  'duo-chat-opus-4-5': { provider: 'anthropic', model: 'claude-opus-4-5-20251101' },
  'duo-chat-sonnet-4-5': { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929' },
  'duo-chat-haiku-4-5': { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  // Bare Anthropic model names (used when user selects raw model id in Settings)
  'claude-sonnet-4-20250514': { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },

  // ── OpenAI (via gateway proxy) ─────────────────────────────────────
  'duo-chat-gpt-5-1': { provider: 'openai', model: 'gpt-5.1-2025-11-13', openaiApiType: 'chat' },
  'duo-chat-gpt-5-2': { provider: 'openai', model: 'gpt-5.2-2025-12-11', openaiApiType: 'chat' },
  'duo-chat-gpt-5-4': { provider: 'openai', model: 'gpt-5.4-2026-03-05', openaiApiType: 'chat' },
  'duo-chat-gpt-5-mini': {
    provider: 'openai',
    model: 'gpt-5-mini-2025-08-07',
    openaiApiType: 'chat',
  },
  'duo-chat-gpt-5-4-mini': { provider: 'openai', model: 'gpt-5.4-mini', openaiApiType: 'chat' },
  'duo-chat-gpt-5-4-nano': { provider: 'openai', model: 'gpt-5.4-nano', openaiApiType: 'chat' },
  // Bare OpenAI model names
  'gpt-4o': { provider: 'openai', model: 'gpt-4o', openaiApiType: 'chat' },

  // ── GitLab native models (routed as Anthropic through gateway) ─────
  // `gitlab-duo-chat-eta` is GitLab's own chat model, served via Anthropic proxy on the gateway.
  'gitlab-duo-chat-eta': { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
};

export type GitLabDuoGatewayResolved =
  | { kind: 'anthropic'; anthropicModel: string }
  | { kind: 'openai'; openaiModel: string };

export function resolveGitLabDuoGatewayModel(guruModelId: string): GitLabDuoGatewayResolved | null {
  const row = GATEWAY_MODEL_MAP[guruModelId];
  if (!row) return null;
  if (row.provider === 'anthropic') {
    return { kind: 'anthropic', anthropicModel: row.model };
  }
  if (row.openaiApiType === 'responses') return null;
  return { kind: 'openai', openaiModel: row.model };
}

export function isGitLabDuoOpenCodeGatewayModel(guruModelId: string): boolean {
  return resolveGitLabDuoGatewayModel(guruModelId) !== null;
}
