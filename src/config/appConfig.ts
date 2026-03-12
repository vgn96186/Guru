/**
 * Centralized app configuration — single source for exam dates, AI model lists, and env-driven values.
 * Decouples hardcoded values from migrations, schema, and services.
 */

/** Default INICET exam date (YYYY-MM-DD). Override via EXPO_PUBLIC_DEFAULT_INICET_DATE. */
export const DEFAULT_INICET_DATE =
  (process.env.EXPO_PUBLIC_DEFAULT_INICET_DATE ?? '2026-05-17').trim() || '2026-05-17';

/** Default NEET-PG exam date (YYYY-MM-DD). Override via EXPO_PUBLIC_DEFAULT_NEET_DATE. */
export const DEFAULT_NEET_DATE =
  (process.env.EXPO_PUBLIC_DEFAULT_NEET_DATE ?? '2026-08-30').trim() || '2026-08-30';

/** Optional bundled Groq key from env, used as primary cloud backend when provided. */
export const BUNDLED_GROQ_KEY = (process.env.EXPO_PUBLIC_BUNDLED_GROQ_KEY ?? '').trim();

/** OpenRouter free models — tried in order when Groq unavailable. */
export const OPENROUTER_FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
] as const;

/** Groq cloud models — order: best quality first, then fallbacks. */
export const GROQ_MODELS = [
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
] as const;
