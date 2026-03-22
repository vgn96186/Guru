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
  BUNDLED_GROQ_KEY,
  BUNDLED_OPENROUTER_KEY,
  BUNDLED_GEMINI_KEY,
  BUNDLED_GEMINI_FALLBACK_KEY,
  BUNDLED_CF_ACCOUNT_ID,
  BUNDLED_CF_API_TOKEN,
  BUNDLED_DEEPSEEK_KEY,
  BUNDLED_MULEROUTER_KEY,
  DEEPSEEK_MODELS,
  MULEROUTER_MODELS,
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
  BUNDLED_GROQ_KEY,
  BUNDLED_OPENROUTER_KEY,
  BUNDLED_GEMINI_KEY,
  BUNDLED_GEMINI_FALLBACK_KEY,
  BUNDLED_CF_ACCOUNT_ID,
  BUNDLED_CF_API_TOKEN,
  BUNDLED_DEEPSEEK_KEY,
  BUNDLED_MULEROUTER_KEY,
  DEEPSEEK_MODELS,
  MULEROUTER_MODELS,
};

/** Read API keys from the user profile. When profile is omitted, returns empty keys (no DB access). */
export function getApiKeys(
  profile?: {
    openrouterKey?: string;
    groqApiKey?: string;
    geminiKey?: string;
    cloudflareAccountId?: string;
    cloudflareApiToken?: string;
    deepseekKey?: string;
    mulerouterKey?: string;
  } | null,
): {
  orKey: string | undefined;
  groqKey: string | undefined;
  geminiKey: string | undefined;
  geminiFallbackKey: string | undefined;
  cfAccountId: string | undefined;
  cfApiToken: string | undefined;
  deepseekKey: string | undefined;
  mulerouterKey: string | undefined;
} {
  if (!profile) {
    return {
      orKey: BUNDLED_OPENROUTER_KEY || undefined,
      groqKey: BUNDLED_GROQ_KEY || undefined,
      geminiKey: BUNDLED_GEMINI_KEY || undefined,
      geminiFallbackKey: BUNDLED_GEMINI_FALLBACK_KEY || undefined,
      cfAccountId: BUNDLED_CF_ACCOUNT_ID || undefined,
      cfApiToken: BUNDLED_CF_API_TOKEN || undefined,
      deepseekKey: BUNDLED_DEEPSEEK_KEY || undefined,
      mulerouterKey: BUNDLED_MULEROUTER_KEY || undefined,
    };
  }
  return {
    orKey: profile.openrouterKey?.trim() || BUNDLED_OPENROUTER_KEY || undefined,
    groqKey: profile.groqApiKey?.trim() || BUNDLED_GROQ_KEY || undefined,
    geminiKey: profile.geminiKey?.trim() || BUNDLED_GEMINI_KEY || undefined,
    geminiFallbackKey: BUNDLED_GEMINI_FALLBACK_KEY || undefined,
    cfAccountId: profile.cloudflareAccountId?.trim() || BUNDLED_CF_ACCOUNT_ID || undefined,
    cfApiToken: profile.cloudflareApiToken?.trim() || BUNDLED_CF_API_TOKEN || undefined,
    deepseekKey: profile.deepseekKey?.trim() || BUNDLED_DEEPSEEK_KEY || undefined,
    mulerouterKey: profile.mulerouterKey?.trim() || BUNDLED_MULEROUTER_KEY || undefined,
  };
}
