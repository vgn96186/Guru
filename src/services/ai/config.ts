import {
  OPENROUTER_FREE_MODELS,
  GROQ_MODELS,
  GEMINI_MODELS,
  BUNDLED_GROQ_KEY,
  BUNDLED_OPENROUTER_KEY,
  BUNDLED_GEMINI_KEY,
} from '../../config/appConfig';

export {
  OPENROUTER_FREE_MODELS,
  GROQ_MODELS,
  GEMINI_MODELS,
  BUNDLED_GROQ_KEY,
  BUNDLED_OPENROUTER_KEY,
  BUNDLED_GEMINI_KEY,
};

/** Read API keys from the user profile. When profile is omitted, returns empty keys (no DB access). */
export function getApiKeys(
  profile?: { openrouterKey?: string; groqApiKey?: string; geminiKey?: string } | null,
): {
  orKey: string | undefined;
  groqKey: string | undefined;
  geminiKey: string | undefined;
} {
  if (!profile) {
    return {
      orKey: BUNDLED_OPENROUTER_KEY || undefined,
      groqKey: BUNDLED_GROQ_KEY || undefined,
      geminiKey: BUNDLED_GEMINI_KEY || undefined,
    };
  }
  return {
    orKey: profile.openrouterKey?.trim() || BUNDLED_OPENROUTER_KEY || undefined,
    groqKey: profile.groqApiKey?.trim() || BUNDLED_GROQ_KEY || undefined,
    geminiKey: (profile as any).geminiKey?.trim() || BUNDLED_GEMINI_KEY || undefined,
  };
}
