import { BUNDLED_GOOGLE_WEB_CLIENT_ID } from './bundledEnv';

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

function getExpoExtraString(key: string): string {
  try {
    const Constants = require('expo-constants');
    const extra =
      Constants.default?.expoConfig?.extra ??
      Constants.expoConfig?.extra ??
      Constants.default?.manifest2?.extra ??
      Constants.manifest2?.extra ??
      Constants.default?.manifest?.extra ??
      Constants.manifest?.extra ??
      null;
    return typeof extra?.[key] === 'string' ? extra[key].trim() : '';
  } catch {
    return '';
  }
}

// ── No bundled API keys in release builds ────────────────────────────────────
// Users must manually enter keys in Settings after a fresh install.
// Dev builds can still override via .env (EXPO_PUBLIC_BUNDLED_*) if needed.
export const BUNDLED_GROQ_KEY = '';
export const BUNDLED_HF_TOKEN = '';
export const BUNDLED_OPENROUTER_KEY = '';
export const BUNDLED_GEMINI_KEY = '';
export const BUNDLED_GEMINI_FALLBACK_KEY = '';
export const BUNDLED_CF_ACCOUNT_ID = '';
export const BUNDLED_CF_API_TOKEN = '';
export const BUNDLED_FAL_KEY = '';
export const BUNDLED_BRAVE_SEARCH_KEY = '';
export const BUNDLED_DEEPSEEK_KEY = '';
export const BUNDLED_GITHUB_MODELS_PAT = '';

// Project-level default so Google Drive sign-in works out-of-the-box on fresh installs.
const DEFAULT_GOOGLE_WEB_CLIENT_ID =
  '132201315043-443j8hva0nhoapt6j4brcdb9n57kb1rv.apps.googleusercontent.com';

/**
 * Google OAuth Web Client ID for Google Sign-In (used for GDrive backup).
 * Create at: Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs.
 * Must be a **Web application** type client ID (not Android).
 * Set via EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in .env.
 */
export const GOOGLE_WEB_CLIENT_ID = (
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  BUNDLED_GOOGLE_WEB_CLIENT_ID ||
  getExpoExtraString('googleWebClientId') ||
  DEFAULT_GOOGLE_WEB_CLIENT_ID
).trim();

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

/**
 * GitHub Copilot — `model` for `POST …/chat/completions` (see `services/ai/github/githubCopilotEnv.ts`
 * for `EXPO_PUBLIC_GITHUB_COPILOT_API_ORIGIN`, `_EDITOR_VERSION`, `_INTEGRATION_ID`).
 * Order matters for auto-routing.
 */
export const GITHUB_COPILOT_MODELS = [
  'gpt-4o',
  'gpt-5-codex',
  'gpt-5.2',
  'gpt-5.3-codex',
  'gpt-5.2-codex',
  'gpt-5.1-codex',
  'gpt-5.1-codex-mini',
  'gpt-5.1',
  'gpt-5.4',
  'gpt-5-mini',
  'gpt-4.1',
  'gemini-2.5-pro',
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
  'claude-haiku-4-5',
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-5',
  'claude-sonnet-4.6',
  'claude-opus-4-5',
  'claude-opus-4-6',
  'claude-opus-4-6-fast-preview',
  'grok-code-fast-1',
  'raptor-mini',
  'goldeneye',
] as const;

const GITHUB_COPILOT_MODEL_ID_SET = new Set<string>([...GITHUB_COPILOT_MODELS]);

export function orderedGitHubCopilotModels(preferred?: string | null): readonly string[] {
  const p = (preferred ?? '').trim();
  if (!p || !GITHUB_COPILOT_MODEL_ID_SET.has(p)) {
    return GITHUB_COPILOT_MODELS;
  }
  const rest = (GITHUB_COPILOT_MODELS as readonly string[]).filter((m) => m !== p);
  return [p, ...rest];
}

/**
 * GitLab Duo — Settings / routing. `duo-chat-*` uses OpenCode-style gateway (direct_access + AI Gateway).
 * Other ids fall back to `POST .../api/v4/chat/completions` with `content` only.
 */
export const GITLAB_DUO_MODELS = [
  'duo-chat-haiku-4-5',
  'duo-chat-sonnet-4-5',
  'duo-chat-opus-4-5',
  'duo-chat-opus-4-6',
  'duo-chat-sonnet-4-6',
  'duo-chat-gpt-5-4',
  'duo-chat-gpt-5-2',
  'duo-chat-gpt-5-1',
  'duo-chat-gpt-5-mini',
  'duo-chat-gpt-5-4-mini',
  'duo-chat-gpt-5-4-nano',
  'gitlab-duo-chat-eta',
  'gpt-4o',
  'claude-sonnet-4-20250514',
] as const;

const GITLAB_DUO_MODEL_ID_SET = new Set<string>([...GITLAB_DUO_MODELS]);

export function orderedGitLabDuoModels(preferred?: string | null): readonly string[] {
  const p = (preferred ?? '').trim();
  if (!p || !GITLAB_DUO_MODEL_ID_SET.has(p)) {
    return GITLAB_DUO_MODELS;
  }
  const rest = (GITLAB_DUO_MODELS as readonly string[]).filter((m) => m !== p);
  return [p, ...rest];
}

/** Poe API chat models (OpenAI-compatible). */
export const POE_MODELS = ['claude-sonnet-4-20250514', 'gpt-4o', 'gemini-2.5-flash'] as const;

/** DeepSeek cloud models — explicitly testing deepseek-chat or v3. */
export const DEEPSEEK_MODELS = ['deepseek-chat', 'deepseek-reasoner'] as const;
/** Kilo gateway models (OpenAI-compatible). */
export const KILO_MODELS = ['xiaomi/mimo', 'anthropic/claude-sonnet-4.5'] as const;
/** AgentRouter models (OpenAI-compatible at agentrouter.org/v1). */
export const AGENTROUTER_MODELS = [
  'deepseek-v3.2',
  'deepseek-v3.1',
  'deepseek-r1-0528',
  'glm-4.5',
  'glm-4.6',
] as const;
/**
 * ChatGPT subscription models via the Codex backend.
 * GPT-4.x is not supported in Codex. Keep this list aligned with the official Codex models page.
 * Docs currently recommend starting with GPT-5.4 and using GPT-5.4-mini for lower-cost tasks.
 */
export const CHATGPT_MODELS = [
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.3-codex',
  'gpt-5.2-codex',
  'gpt-5.2',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex',
  'gpt-5.1-codex-mini',
  'gpt-5-codex',
] as const;

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

export const FAL_IMAGE_MODELS = [
  'fal-ai/nano-banana-2',
  'fal-ai/flux-pro/kontext/max/text-to-image',
  'fal-ai/qwen-image-2/pro/text-to-image',
  'fal-ai/gpt-image-1.5',
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

export const FAL_IMAGE_MODEL_LABELS: Record<(typeof FAL_IMAGE_MODELS)[number], string> = {
  'fal-ai/nano-banana-2': 'Nano Banana 2 via fal',
  'fal-ai/flux-pro/kontext/max/text-to-image': 'FLUX.1 Kontext Max via fal',
  'fal-ai/qwen-image-2/pro/text-to-image': 'Qwen Image 2 Pro via fal',
  'fal-ai/gpt-image-1.5': 'GPT Image 1.5 via fal',
};

export const FAL_IMAGE_GENERATION_MODEL_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = FAL_IMAGE_MODELS.map((m) => ({
  value: m,
  label: `fal - ${FAL_IMAGE_MODEL_LABELS[m]}`,
}));

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
    ...FAL_IMAGE_MODELS,
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
