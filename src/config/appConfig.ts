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

// Bundled defaults generated from `.env` by `scripts/generate-bundled-env.js`.
export {
  BUNDLED_GROQ_KEY,
  BUNDLED_HF_TOKEN,
  BUNDLED_OPENROUTER_KEY,
  BUNDLED_GEMINI_KEY,
  BUNDLED_CF_ACCOUNT_ID,
  BUNDLED_CF_API_TOKEN,
} from './bundledEnv';

/** Gemini models — tried in order. Free tier: 1500 req/day. */
export const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'] as const;

/** Cloudflare Workers AI models — tried in order. Free: 10K neurons/day. */
export const CLOUDFLARE_MODELS = [
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/meta/llama-3.2-3b-instruct',
] as const;

/** Cloudflare Workers AI image generation model. */
export const CLOUDFLARE_IMAGE_MODELS = [
  '@cf/black-forest-labs/flux-2-dev',
  '@cf/black-forest-labs/flux-1-schnell',
] as const;

/** Default Cloudflare Workers AI image generation model. */
export const CLOUDFLARE_IMAGE_MODEL = CLOUDFLARE_IMAGE_MODELS[0];

/** Google image generation models — tried in order. */
export const GEMINI_IMAGE_MODELS = ['gemini-3-pro-image-preview'] as const;

/** OpenRouter free models — tried in order when Groq unavailable. */
export const OPENROUTER_FREE_MODELS = [
  'openai/gpt-oss-120b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-3-27b-it:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'qwen/qwen3-coder:free',
] as const;

/** Groq cloud models — order: best quality first, then fallbacks. */
export const GROQ_MODELS = [
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
] as const;

/** Default Hugging Face speech-to-text model. */
export const DEFAULT_HF_TRANSCRIPTION_MODEL =
  (process.env.EXPO_PUBLIC_DEFAULT_HF_TRANSCRIPTION_MODEL ?? 'openai/whisper-large-v3').trim() ||
  'openai/whisper-large-v3';

/** Enable mock external lecture flow (browser audio instead of installed lecture apps). */
export const MOCK_EXTERNAL_LECTURE_AUDIO_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  (process.env.EXPO_PUBLIC_MOCK_EXTERNAL_LECTURE_AUDIO ?? '').trim().toLowerCase(),
);

/** Audio URL opened in mock external lecture flow. */
export const MOCK_EXTERNAL_LECTURE_AUDIO_URL =
  (
    process.env.EXPO_PUBLIC_MOCK_EXTERNAL_LECTURE_AUDIO_URL ??
    'https://www.learningcontainer.com/wp-content/uploads/2020/02/Kalimba.mp3'
  ).trim() || 'https://www.learningcontainer.com/wp-content/uploads/2020/02/Kalimba.mp3';
