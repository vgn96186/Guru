import {
  OPENROUTER_FREE_MODELS,
  GROQ_MODELS,
  GEMINI_MODELS,
  GEMINI_STRUCTURED_JSON_MODELS,
  CLOUDFLARE_MODELS,
  GEMINI_IMAGE_MODELS,
  CLOUDFLARE_IMAGE_MODELS,
  CLOUDFLARE_IMAGE_MODEL,
  OPENROUTER_IMAGE_MODELS,
  FAL_IMAGE_MODELS,
  BUNDLED_GROQ_KEY,
  BUNDLED_OPENROUTER_KEY,
  BUNDLED_GEMINI_KEY,
  BUNDLED_GEMINI_FALLBACK_KEY,
  BUNDLED_CF_ACCOUNT_ID,
  BUNDLED_CF_API_TOKEN,
  BUNDLED_FAL_KEY,
  BUNDLED_BRAVE_SEARCH_KEY,
  BUNDLED_DEEPSEEK_KEY,
  BUNDLED_GITHUB_MODELS_PAT,
  DEEPSEEK_MODELS,
  KILO_MODELS,
  AGENTROUTER_MODELS,
  CHATGPT_MODELS,
  GITHUB_MODELS_CHAT_MODELS,
  GITHUB_MODELS_API_VERSION,
  getGitHubModelsChatCompletionsUrl,
  GITHUB_COPILOT_MODELS,
  orderedGitHubCopilotModels,
  GITLAB_DUO_MODELS,
  orderedGitLabDuoModels,
  POE_MODELS,
  BUNDLED_VERTEX_AI_PROJECT,
  BUNDLED_VERTEX_AI_LOCATION,
  BUNDLED_VERTEX_AI_TOKEN,
  VERTEX_MODELS,
} from '../../config/appConfig';

export {
  OPENROUTER_FREE_MODELS,
  GROQ_MODELS,
  GEMINI_MODELS,
  GEMINI_STRUCTURED_JSON_MODELS,
  CLOUDFLARE_MODELS,
  GEMINI_IMAGE_MODELS,
  CLOUDFLARE_IMAGE_MODELS,
  CLOUDFLARE_IMAGE_MODEL,
  OPENROUTER_IMAGE_MODELS,
  FAL_IMAGE_MODELS,
  BUNDLED_GROQ_KEY,
  BUNDLED_OPENROUTER_KEY,
  BUNDLED_GEMINI_KEY,
  BUNDLED_GEMINI_FALLBACK_KEY,
  BUNDLED_CF_ACCOUNT_ID,
  BUNDLED_CF_API_TOKEN,
  BUNDLED_FAL_KEY,
  BUNDLED_BRAVE_SEARCH_KEY,
  BUNDLED_DEEPSEEK_KEY,
  BUNDLED_GITHUB_MODELS_PAT,
  DEEPSEEK_MODELS,
  KILO_MODELS,
  AGENTROUTER_MODELS,
  CHATGPT_MODELS,
  GITHUB_MODELS_CHAT_MODELS,
  GITHUB_MODELS_API_VERSION,
  getGitHubModelsChatCompletionsUrl,
  GITHUB_COPILOT_MODELS,
  orderedGitHubCopilotModels,
  GITLAB_DUO_MODELS,
  orderedGitLabDuoModels,
  POE_MODELS,
  BUNDLED_VERTEX_AI_PROJECT,
  BUNDLED_VERTEX_AI_LOCATION,
  BUNDLED_VERTEX_AI_TOKEN,
  VERTEX_MODELS,
};

export { getGitLabAiGatewayUrl } from './gitlab/gitlabInstance';

function isChatGptSlotEnabledAndConnected(
  slot?: { enabled?: boolean; connected?: boolean } | null,
): boolean {
  return !!slot?.enabled && !!slot?.connected;
}

function resolveChatGptConnected(
  profile?: {
    chatgptConnected?: boolean;
    chatgptAccounts?: {
      primary?: { enabled?: boolean; connected?: boolean };
      secondary?: { enabled?: boolean; connected?: boolean };
    };
  } | null,
): boolean {
  if (!profile) return false;
  const accounts = profile.chatgptAccounts;
  if (accounts) {
    return (
      isChatGptSlotEnabledAndConnected(accounts.primary) ||
      isChatGptSlotEnabledAndConnected(accounts.secondary)
    );
  }
  return !!profile.chatgptConnected;
}

/** Read API keys from the user profile. When profile is omitted, returns empty keys (no DB access). */
export function getApiKeys(
  profile?: {
    openrouterKey?: string;
    groqApiKey?: string;
    geminiKey?: string;
    huggingFaceToken?: string;
    cloudflareAccountId?: string;
    cloudflareApiToken?: string;
    falApiKey?: string;
    braveSearchApiKey?: string;
    googleCustomSearchApiKey?: string;
    deepseekKey?: string;
    githubModelsPat?: string;
    kiloApiKey?: string;
    agentRouterKey?: string;
    deepgramApiKey?: string;
    jinaApiKey?: string;
    chatgptAccounts?: {
      primary?: { enabled?: boolean; connected?: boolean };
      secondary?: { enabled?: boolean; connected?: boolean };
    };
    chatgptConnected?: boolean;
    githubCopilotConnected?: boolean;
    gitlabDuoConnected?: boolean;
    poeConnected?: boolean;
    qwenConnected?: boolean;
    vertexAiProject?: string;
    vertexAiLocation?: string;
    vertexAiToken?: string;
  } | null,
): {
  orKey: string | undefined;
  groqKey: string | undefined;
  geminiKey: string | undefined;
  hfToken?: string | undefined;
  geminiFallbackKey: string | undefined;
  cfAccountId: string | undefined;
  cfApiToken: string | undefined;
  falKey?: string | undefined;
  braveSearchKey?: string | undefined;
  googleCustomSearchKey?: string | undefined;
  deepseekKey: string | undefined;
  githubModelsPat: string | undefined;
  kiloApiKey: string | undefined;
  agentRouterKey: string | undefined;
  deepgramKey: string | undefined;
  jinaKey: string | undefined;
  chatgptConnected: boolean;
  githubCopilotConnected: boolean;
  gitlabDuoConnected: boolean;
  poeConnected: boolean;
  qwenConnected: boolean;
  vertexAiProject: string | undefined;
  vertexAiLocation: string | undefined;
  vertexAiToken: string | undefined;
  /** True when the geminiKey is an AQ-prefixed authorization key (bound to a service account). */
  geminiKeyIsAuthorizationKey: boolean;
} {
  if (!profile) {
    return {
      orKey: BUNDLED_OPENROUTER_KEY || undefined,
      groqKey: BUNDLED_GROQ_KEY || undefined,
      geminiKey: BUNDLED_GEMINI_KEY || undefined,
      hfToken: undefined,
      geminiFallbackKey: BUNDLED_GEMINI_FALLBACK_KEY || undefined,
      cfAccountId: BUNDLED_CF_ACCOUNT_ID || undefined,
      cfApiToken: BUNDLED_CF_API_TOKEN || undefined,
      falKey: BUNDLED_FAL_KEY || undefined,
      braveSearchKey: BUNDLED_BRAVE_SEARCH_KEY || undefined,
      googleCustomSearchKey: undefined,
      deepseekKey: BUNDLED_DEEPSEEK_KEY || undefined,
      githubModelsPat: BUNDLED_GITHUB_MODELS_PAT || undefined,
      kiloApiKey: undefined,
      agentRouterKey: undefined,
      deepgramKey: undefined,
      jinaKey: undefined,
      chatgptConnected: false,
      githubCopilotConnected: false,
      gitlabDuoConnected: false,
      poeConnected: false,
      qwenConnected: false,
      vertexAiProject: BUNDLED_VERTEX_AI_PROJECT || undefined,
      vertexAiLocation: BUNDLED_VERTEX_AI_LOCATION || undefined,
      vertexAiToken: BUNDLED_VERTEX_AI_TOKEN || undefined,
      geminiKeyIsAuthorizationKey: isAuthorizationKey(BUNDLED_GEMINI_KEY),
    };
  }
  return {
    orKey: profile.openrouterKey?.trim() || BUNDLED_OPENROUTER_KEY || undefined,
    groqKey: profile.groqApiKey?.trim() || BUNDLED_GROQ_KEY || undefined,
    geminiKey: profile.geminiKey?.trim() || BUNDLED_GEMINI_KEY || undefined,
    hfToken: profile.huggingFaceToken?.trim() || undefined,
    geminiFallbackKey: BUNDLED_GEMINI_FALLBACK_KEY || undefined,
    cfAccountId: profile.cloudflareAccountId?.trim() || BUNDLED_CF_ACCOUNT_ID || undefined,
    cfApiToken: profile.cloudflareApiToken?.trim() || BUNDLED_CF_API_TOKEN || undefined,
    falKey: profile.falApiKey?.trim() || BUNDLED_FAL_KEY || undefined,
    braveSearchKey: profile.braveSearchApiKey?.trim() || BUNDLED_BRAVE_SEARCH_KEY || undefined,
    googleCustomSearchKey: profile.googleCustomSearchApiKey?.trim() || undefined,
    deepseekKey: profile.deepseekKey?.trim() || BUNDLED_DEEPSEEK_KEY || undefined,
    githubModelsPat: profile.githubModelsPat?.trim() || BUNDLED_GITHUB_MODELS_PAT || undefined,
    kiloApiKey: profile.kiloApiKey?.trim() || undefined,
    agentRouterKey: profile.agentRouterKey?.trim() || undefined,
    deepgramKey: profile.deepgramApiKey?.trim() || undefined,
    jinaKey: profile.jinaApiKey?.trim() || undefined,
    chatgptConnected: resolveChatGptConnected(profile),
    githubCopilotConnected: !!profile.githubCopilotConnected,
    gitlabDuoConnected: !!profile.gitlabDuoConnected,
    poeConnected: !!profile.poeConnected,
    qwenConnected: !!profile.qwenConnected,
    vertexAiProject: profile.vertexAiProject?.trim() || BUNDLED_VERTEX_AI_PROJECT || undefined,
    vertexAiLocation: profile.vertexAiLocation?.trim() || BUNDLED_VERTEX_AI_LOCATION || undefined,
    vertexAiToken: profile.vertexAiToken?.trim() || BUNDLED_VERTEX_AI_TOKEN || undefined,
    geminiKeyIsAuthorizationKey: isAuthorizationKey(profile.geminiKey?.trim() || BUNDLED_GEMINI_KEY),
  };
}

/**
 * Detect Google Cloud authorization keys (AQ prefix).
 * Authorization keys are API keys bound to a service account.
 * Unlike standard keys (AIzaSy...), they work on BOTH:
 *   - generativelanguage.googleapis.com (Gemini Developer API)
 *   - aiplatform.googleapis.com (Vertex AI)
 * See: https://docs.cloud.google.com/docs/authentication/api-keys#authorization-keys
 */
export function isAuthorizationKey(key?: string | null): boolean {
  if (!key) return false;
  const k = key.trim();
  return k.startsWith('AQ');
}
