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
export { BUNDLED_GROQ_KEY, BUNDLED_HF_TOKEN, BUNDLED_OPENROUTER_KEY } from './bundledEnv';

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
