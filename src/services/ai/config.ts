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
};

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
    deepseekKey?: string;
    githubModelsPat?: string;
    kiloApiKey?: string;
    agentRouterKey?: string;
    deepgramApiKey?: string;
    chatgptConnected?: boolean;
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
  deepseekKey: string | undefined;
  githubModelsPat: string | undefined;
  kiloApiKey: string | undefined;
  agentRouterKey: string | undefined;
  deepgramKey: string | undefined;
  chatgptConnected: boolean;
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
      deepseekKey: BUNDLED_DEEPSEEK_KEY || undefined,
      githubModelsPat: BUNDLED_GITHUB_MODELS_PAT || undefined,
      kiloApiKey: undefined,
      agentRouterKey: undefined,
      deepgramKey: undefined,
      chatgptConnected: false,
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
    deepseekKey: profile.deepseekKey?.trim() || BUNDLED_DEEPSEEK_KEY || undefined,
    githubModelsPat: profile.githubModelsPat?.trim() || BUNDLED_GITHUB_MODELS_PAT || undefined,
    kiloApiKey: profile.kiloApiKey?.trim() || undefined,
    agentRouterKey: profile.agentRouterKey?.trim() || undefined,
    deepgramKey: profile.deepgramApiKey?.trim() || undefined,
    chatgptConnected: !!profile.chatgptConnected,
  };
}
