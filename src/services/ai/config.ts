import {
  OPENROUTER_FREE_MODELS,
  GROQ_MODELS,
  GEMINI_MODELS,
  CLOUDFLARE_MODELS,
  GEMINI_IMAGE_MODELS,
  CLOUDFLARE_IMAGE_MODELS,
  CLOUDFLARE_IMAGE_MODEL,
  BUNDLED_GROQ_KEY,
  BUNDLED_OPENROUTER_KEY,
  BUNDLED_GEMINI_KEY,
  BUNDLED_CF_ACCOUNT_ID,
  BUNDLED_CF_API_TOKEN,
} from '../../config/appConfig';

export {
  OPENROUTER_FREE_MODELS,
  GROQ_MODELS,
  GEMINI_MODELS,
  CLOUDFLARE_MODELS,
  GEMINI_IMAGE_MODELS,
  CLOUDFLARE_IMAGE_MODELS,
  CLOUDFLARE_IMAGE_MODEL,
  BUNDLED_GROQ_KEY,
  BUNDLED_OPENROUTER_KEY,
  BUNDLED_GEMINI_KEY,
  BUNDLED_CF_ACCOUNT_ID,
  BUNDLED_CF_API_TOKEN,
};

/** Read API keys from the user profile. When profile is omitted, returns empty keys (no DB access). */
export function getApiKeys(
  profile?: {
    openrouterKey?: string;
    groqApiKey?: string;
    geminiKey?: string;
    cloudflareAccountId?: string;
    cloudflareApiToken?: string;
  } | null,
): {
  orKey: string | undefined;
  groqKey: string | undefined;
  geminiKey: string | undefined;
  cfAccountId: string | undefined;
  cfApiToken: string | undefined;
} {
  if (!profile) {
    return {
      orKey: BUNDLED_OPENROUTER_KEY || undefined,
      groqKey: BUNDLED_GROQ_KEY || undefined,
      geminiKey: BUNDLED_GEMINI_KEY || undefined,
      cfAccountId: BUNDLED_CF_ACCOUNT_ID || undefined,
      cfApiToken: BUNDLED_CF_API_TOKEN || undefined,
    };
  }
  return {
    orKey: profile.openrouterKey?.trim() || BUNDLED_OPENROUTER_KEY || undefined,
    groqKey: profile.groqApiKey?.trim() || BUNDLED_GROQ_KEY || undefined,
    geminiKey: profile.geminiKey?.trim() || BUNDLED_GEMINI_KEY || undefined,
    cfAccountId: profile.cloudflareAccountId?.trim() || BUNDLED_CF_ACCOUNT_ID || undefined,
    cfApiToken: profile.cloudflareApiToken?.trim() || BUNDLED_CF_API_TOKEN || undefined,
  };
}
