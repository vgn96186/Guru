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
import * as env from './bundledEnv'; // Import the env object

export const BUNDLED_GROQ_KEY =
  typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_BUNDLED_GROQ_KEY || env.BUNDLED_GROQ_KEY
    : env.BUNDLED_GROQ_KEY;
export const BUNDLED_HF_TOKEN =
  typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_BUNDLED_HF_TOKEN || env.BUNDLED_HF_TOKEN
    : env.BUNDLED_HF_TOKEN;
export const BUNDLED_OPENROUTER_KEY =
  typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_BUNDLED_OPENROUTER_KEY || env.BUNDLED_OPENROUTER_KEY
    : env.BUNDLED_OPENROUTER_KEY;
export const BUNDLED_GEMINI_KEY =
  typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_BUNDLED_GEMINI_KEY || env.BUNDLED_GEMINI_KEY
    : env.BUNDLED_GEMINI_KEY;
export const BUNDLED_GEMINI_FALLBACK_KEY =
  typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_BUNDLED_GEMINI_FALLBACK_KEY || env.BUNDLED_GEMINI_FALLBACK_KEY
    : env.BUNDLED_GEMINI_FALLBACK_KEY;
export const BUNDLED_CF_ACCOUNT_ID =
  typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_BUNDLED_CF_ACCOUNT_ID || env.BUNDLED_CF_ACCOUNT_ID
    : env.BUNDLED_CF_ACCOUNT_ID;
export const BUNDLED_CF_API_TOKEN =
  typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_BUNDLED_CF_API_TOKEN || env.BUNDLED_CF_API_TOKEN
    : env.BUNDLED_CF_API_TOKEN;
export const BUNDLED_DEEPSEEK_KEY =
  typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_BUNDLED_DEEPSEEK_KEY || env.BUNDLED_DEEPSEEK_KEY
    : env.BUNDLED_DEEPSEEK_KEY;
export const BUNDLED_GITHUB_MODELS_PAT =
  typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_BUNDLED_GITHUB_MODELS_PAT || env.BUNDLED_GITHUB_MODELS_PAT
    : env.BUNDLED_GITHUB_MODELS_PAT;

/**
 * GitHub Models inference API (OpenAI-style chat). See REST: POST .../inference/chat/completions.
 * @see https://docs.github.com/en/rest/models/inference
 */
export const GITHUB_MODELS_API_VERSION =
  (process.env.EXPO_PUBLIC_GITHUB_MODELS_API_VERSION ?? '2022-11-28').trim() || '2022-11-28';

/** Base host only (no path). Override if GitHub documents a new hostname. */
export const GITHUB_MODELS_INFERENCE_ORIGIN =
  (process.env.EXPO_PUBLIC_GITHUB_MODELS_INFERENCE_ORIGIN ?? 'https://models.github.ai').trim() ||
  'https://models.github.ai';

/** When set, requests use POST /orgs/{org}/inference/chat/completions instead of user-scoped URL. */
export const GITHUB_MODELS_ORG = (process.env.EXPO_PUBLIC_GITHUB_MODELS_ORG ?? '').trim();

export function getGitHubModelsChatCompletionsUrl(): string {
  const origin = GITHUB_MODELS_INFERENCE_ORIGIN.replace(/\/$/, '');
  const org = GITHUB_MODELS_ORG;
  if (org) return `${origin}/orgs/${org}/inference/chat/completions`;
  return `${origin}/inference/chat/completions`;
}

/**
 * Model IDs for Guru Chat / routing ({publisher}/{model} as in GitHub Models playground).
 * Adjust via env if catalog names change.
 */
export const GITHUB_MODELS_CHAT_MODELS = [
  'openai/gpt-4.1',
  'openai/gpt-4o-mini',
  'meta/Llama-3.3-70B-Instruct',
] as const;

/** DeepSeek cloud models — explicitly testing deepseek-chat or v3. */
export const DEEPSEEK_MODELS = ['deepseek-chat', 'deepseek-reasoner'] as const;
/** Kilo gateway models (OpenAI-compatible). */
export const KILO_MODELS = ['xiaomi/mimo', 'anthropic/claude-sonnet-4.5'] as const;

/**
 * Gemini text chat / streaming — fallback order.
 * Prefer stable **2.5 / 2.0 Flash** first (better free-tier behavior and fewer surprises than preview).
 * **Preview** last so it only runs if listed models fail (saves quota for experimental IDs).
 */
export const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-3-flash-preview',
] as const;

/**
 * Native JSON + `responseJsonSchema` — stable IDs only (no preview) so quizzes/plans/catalyst
 * don’t burn preview quota and get more consistent schema fills. Tunable independently of chat.
 */
export const GEMINI_STRUCTURED_JSON_MODELS = {
  /** Faster / cheaper structured calls (keypoints, small JSON). */
  low: 'gemini-2.0-flash',
  /** Heavier structured output (daily agenda, catalyst, long JSON). */
  high: 'gemini-2.5-flash',
} as const;

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

/**
 * Google native image models (Interactions API `model` field), 2026 Gemini API.
 * **Auto** tries these in order: Flash / preview models before Pro (typical free AI Studio keys).
 * @see https://ai.google.dev/gemini-api/docs/image-generation
 */
export const GEMINI_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
] as const;

/** OpenRouter free image models — tried in order when Cloudflare & Gemini are unavailable or rate limited. */
export const OPENROUTER_IMAGE_MODELS = [
  'bytedance-seed/seedream-4.5',
  'black-forest-labs/flux.2-max',
  'sourceful/riverflow-v2-pro',
] as const;

/** Short labels for Settings chips (billing is account-specific; Flash lines usually work on free quota). */
export const GEMINI_IMAGE_MODEL_LABELS: Record<(typeof GEMINI_IMAGE_MODELS)[number], string> = {
  'gemini-2.5-flash-image': '2.5 Flash Image (usually free quota)',
  'gemini-3.1-flash-image-preview': '3.1 Flash Image preview',
  'gemini-3-pro-image-preview': '3 Pro Image (often paid / higher tier)',
};

/** Persisted in `user_profile.image_generation_model`. `auto` = Gemini chain, then Cloudflare. */
export const DEFAULT_IMAGE_GENERATION_MODEL = 'auto' as const;

export const IMAGE_GENERATION_MODEL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  {
    value: DEFAULT_IMAGE_GENERATION_MODEL,
    label: 'Auto (Gemini: Flash first → Pro → then Cloudflare)',
  },
  ...GEMINI_IMAGE_MODELS.map((m) => ({
    value: m,
    label: `Google — ${GEMINI_IMAGE_MODEL_LABELS[m]}`,
  })),
  ...CLOUDFLARE_IMAGE_MODELS.map((m) => ({
    value: m,
    label: `Cloudflare — ${m.replace('@cf/black-forest-labs/', '')}`,
  })),
];

export function normalizeImageGenerationModel(raw: string | undefined | null): string {
  const v = (raw ?? '').trim();
  if (!v || v === DEFAULT_IMAGE_GENERATION_MODEL) return DEFAULT_IMAGE_GENERATION_MODEL;
  const allowed = new Set<string>([
    DEFAULT_IMAGE_GENERATION_MODEL,
    ...GEMINI_IMAGE_MODELS,
    ...CLOUDFLARE_IMAGE_MODELS,
    ...OPENROUTER_IMAGE_MODELS,
  ]);
  return allowed.has(v) ? v : DEFAULT_IMAGE_GENERATION_MODEL;
}

export const OPENROUTER_FREE_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'stepfun/step-3.5-flash:free',
  'deepseek/deepseek-v3.2',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-3-27b-it:free',
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
