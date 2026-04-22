'use strict';
var __spreadArray =
  (this && this.__spreadArray) ||
  function (to, from, pack) {
    if (pack || arguments.length === 2)
      for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
          if (!ar) ar = Array.prototype.slice.call(from, 0, i);
          ar[i] = from[i];
        }
      }
    return to.concat(ar || Array.prototype.slice.call(from));
  };
var _a, _b, _c, _d, _e, _f, _g, _h;
Object.defineProperty(exports, '__esModule', { value: true });
exports.FEATURE_TEXTURE =
  exports.MOCK_EXTERNAL_LECTURE_AUDIO_URL =
  exports.MOCK_EXTERNAL_LECTURE_AUDIO_ENABLED =
  exports.DEFAULT_HF_TRANSCRIPTION_MODEL =
  exports.GROQ_MODELS =
  exports.OPENROUTER_FREE_MODELS =
  exports.IMAGE_GENERATION_MODEL_OPTIONS =
  exports.DEFAULT_IMAGE_GENERATION_MODEL =
  exports.FAL_IMAGE_GENERATION_MODEL_OPTIONS =
  exports.FAL_IMAGE_MODEL_LABELS =
  exports.GEMINI_IMAGE_MODEL_LABELS =
  exports.OPENROUTER_IMAGE_MODELS =
  exports.FAL_IMAGE_MODELS =
  exports.GEMINI_IMAGE_MODELS =
  exports.CLOUDFLARE_IMAGE_MODEL =
  exports.CLOUDFLARE_IMAGE_MODELS =
  exports.CLOUDFLARE_MODELS =
  exports.GEMINI_STRUCTURED_JSON_MODELS =
  exports.GEMINI_MODELS =
  exports.CHATGPT_MODELS =
  exports.AGENTROUTER_MODELS =
  exports.KILO_MODELS =
  exports.DEEPSEEK_MODELS =
  exports.POE_MODELS =
  exports.GITLAB_DUO_MODELS =
  exports.GITHUB_COPILOT_MODELS =
  exports.GITHUB_MODELS_CHAT_MODELS =
  exports.GITHUB_MODELS_ORG =
  exports.GITHUB_MODELS_INFERENCE_ORIGIN =
  exports.GITHUB_MODELS_API_VERSION =
  exports.GOOGLE_WEB_CLIENT_ID =
  exports.G4F_PROXY_URL =
  exports.BUNDLED_GITHUB_MODELS_PAT =
  exports.BUNDLED_DEEPSEEK_KEY =
  exports.BUNDLED_BRAVE_SEARCH_KEY =
  exports.BUNDLED_FAL_KEY =
  exports.BUNDLED_CF_API_TOKEN =
  exports.BUNDLED_CF_ACCOUNT_ID =
  exports.BUNDLED_GEMINI_FALLBACK_KEY =
  exports.BUNDLED_GEMINI_KEY =
  exports.BUNDLED_OPENROUTER_KEY =
  exports.BUNDLED_HF_TOKEN =
  exports.BUNDLED_GROQ_KEY =
  exports.DEFAULT_NEET_DATE =
  exports.DEFAULT_INICET_DATE =
    void 0;
exports.getGitHubModelsChatCompletionsUrl = getGitHubModelsChatCompletionsUrl;
exports.orderedGitHubCopilotModels = orderedGitHubCopilotModels;
exports.orderedGitLabDuoModels = orderedGitLabDuoModels;
exports.normalizeImageGenerationModel = normalizeImageGenerationModel;
var bundledEnv_1 = require('./bundledEnv');
/**
 * Centralized app configuration — single source for exam dates, AI model lists, and env-driven values.
 * Decouples hardcoded values from migrations, schema, and services.
 */
/** Default INICET exam date (YYYY-MM-DD). Override via EXPO_PUBLIC_DEFAULT_INICET_DATE. */
exports.DEFAULT_INICET_DATE =
  ((_a = process.env.EXPO_PUBLIC_DEFAULT_INICET_DATE) !== null && _a !== void 0
    ? _a
    : '2026-05-17'
  ).trim() || '2026-05-17';
/** Default NEET-PG exam date (YYYY-MM-DD). Override via EXPO_PUBLIC_DEFAULT_NEET_DATE. */
exports.DEFAULT_NEET_DATE =
  ((_b = process.env.EXPO_PUBLIC_DEFAULT_NEET_DATE) !== null && _b !== void 0
    ? _b
    : '2026-08-30'
  ).trim() || '2026-08-30';
function getExpoExtraString(key) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
  try {
    var Constants = require('expo-constants');
    var extra =
      (_q =
        (_o =
          (_k =
            (_h =
              (_e =
                (_c =
                  (_b =
                    (_a = Constants.default) === null || _a === void 0 ? void 0 : _a.expoConfig) ===
                    null || _b === void 0
                    ? void 0
                    : _b.extra) !== null && _c !== void 0
                  ? _c
                  : (_d = Constants.expoConfig) === null || _d === void 0
                  ? void 0
                  : _d.extra) !== null && _e !== void 0
                ? _e
                : (_g =
                    (_f = Constants.default) === null || _f === void 0 ? void 0 : _f.manifest2) ===
                    null || _g === void 0
                ? void 0
                : _g.extra) !== null && _h !== void 0
              ? _h
              : (_j = Constants.manifest2) === null || _j === void 0
              ? void 0
              : _j.extra) !== null && _k !== void 0
            ? _k
            : (_m = (_l = Constants.default) === null || _l === void 0 ? void 0 : _l.manifest) ===
                null || _m === void 0
            ? void 0
            : _m.extra) !== null && _o !== void 0
          ? _o
          : (_p = Constants.manifest) === null || _p === void 0
          ? void 0
          : _p.extra) !== null && _q !== void 0
        ? _q
        : null;
    return typeof (extra === null || extra === void 0 ? void 0 : extra[key]) === 'string'
      ? extra[key].trim()
      : '';
  } catch (_r) {
    return '';
  }
}
// ── No bundled API keys in release builds ────────────────────────────────────
// Users must manually enter keys in Settings after a fresh install.
// Dev builds can still override via .env (EXPO_PUBLIC_BUNDLED_*) if needed.
exports.BUNDLED_GROQ_KEY = '';
exports.BUNDLED_HF_TOKEN = '';
exports.BUNDLED_OPENROUTER_KEY = '';
exports.BUNDLED_GEMINI_KEY = '';
exports.BUNDLED_GEMINI_FALLBACK_KEY = '';
exports.BUNDLED_CF_ACCOUNT_ID = '';
exports.BUNDLED_CF_API_TOKEN = '';
exports.BUNDLED_FAL_KEY = '';
exports.BUNDLED_BRAVE_SEARCH_KEY = '';
exports.BUNDLED_DEEPSEEK_KEY = '';
exports.BUNDLED_GITHUB_MODELS_PAT = '';
// G4F (gpt4free) OpenAI-compatible proxy URL. Deploy via deploy/g4f/README.md,
// then set EXPO_PUBLIC_G4F_URL in .env. Empty = disabled.
exports.G4F_PROXY_URL = (
  process.env.EXPO_PUBLIC_G4F_URL ||
  getExpoExtraString('g4fProxyUrl') ||
  ''
).trim();
// Project-level default so Google Drive sign-in works out-of-the-box on fresh installs.
var DEFAULT_GOOGLE_WEB_CLIENT_ID =
  '132201315043-443j8hva0nhoapt6j4brcdb9n57kb1rv.apps.googleusercontent.com';
/**
 * Google OAuth Web Client ID for Google Sign-In (used for GDrive backup).
 * Create at: Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs.
 * Must be a **Web application** type client ID (not Android).
 * Set via EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in .env.
 */
exports.GOOGLE_WEB_CLIENT_ID = (
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  bundledEnv_1.BUNDLED_GOOGLE_WEB_CLIENT_ID ||
  getExpoExtraString('googleWebClientId') ||
  DEFAULT_GOOGLE_WEB_CLIENT_ID
).trim();
/**
 * GitHub Models inference API (OpenAI-style chat). See REST: POST .../inference/chat/completions.
 * @see https://docs.github.com/en/rest/models/inference
 */
exports.GITHUB_MODELS_API_VERSION =
  ((_c = process.env.EXPO_PUBLIC_GITHUB_MODELS_API_VERSION) !== null && _c !== void 0
    ? _c
    : '2022-11-28'
  ).trim() || '2022-11-28';
/** Base host only (no path). Override if GitHub documents a new hostname. */
exports.GITHUB_MODELS_INFERENCE_ORIGIN =
  ((_d = process.env.EXPO_PUBLIC_GITHUB_MODELS_INFERENCE_ORIGIN) !== null && _d !== void 0
    ? _d
    : 'https://models.github.ai'
  ).trim() || 'https://models.github.ai';
/** When set, requests use POST /orgs/{org}/inference/chat/completions instead of user-scoped URL. */
exports.GITHUB_MODELS_ORG = (
  (_e = process.env.EXPO_PUBLIC_GITHUB_MODELS_ORG) !== null && _e !== void 0 ? _e : ''
).trim();
function getGitHubModelsChatCompletionsUrl() {
  var origin = exports.GITHUB_MODELS_INFERENCE_ORIGIN.replace(/\/$/, '');
  var org = exports.GITHUB_MODELS_ORG;
  if (org) return ''.concat(origin, '/orgs/').concat(org, '/inference/chat/completions');
  return ''.concat(origin, '/inference/chat/completions');
}
/**
 * Model IDs for Guru Chat / routing ({publisher}/{model} as in GitHub Models playground).
 * Adjust via env if catalog names change.
 */
exports.GITHUB_MODELS_CHAT_MODELS = [
  'openai/gpt-4.1',
  'openai/gpt-4o-mini',
  'meta/Llama-3.3-70B-Instruct',
];
/**
 * GitHub Copilot — `model` for `POST …/chat/completions` (see `services/ai/github/githubCopilotEnv.ts`
 * for `EXPO_PUBLIC_GITHUB_COPILOT_API_ORIGIN`, `_EDITOR_VERSION`, `_INTEGRATION_ID`).
 * Order matters for auto-routing.
 */
exports.GITHUB_COPILOT_MODELS = [
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
];
var GITHUB_COPILOT_MODEL_ID_SET = new Set(__spreadArray([], exports.GITHUB_COPILOT_MODELS, true));
function orderedGitHubCopilotModels(preferred) {
  var p = (preferred !== null && preferred !== void 0 ? preferred : '').trim();
  if (!p || !GITHUB_COPILOT_MODEL_ID_SET.has(p)) {
    return exports.GITHUB_COPILOT_MODELS;
  }
  var rest = exports.GITHUB_COPILOT_MODELS.filter(function (m) {
    return m !== p;
  });
  return __spreadArray([p], rest, true);
}
/**
 * GitLab Duo — Settings / routing. `duo-chat-*` uses OpenCode-style gateway (direct_access + AI Gateway).
 * Other ids fall back to `POST .../api/v4/chat/completions` with `content` only.
 */
exports.GITLAB_DUO_MODELS = [
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
];
var GITLAB_DUO_MODEL_ID_SET = new Set(__spreadArray([], exports.GITLAB_DUO_MODELS, true));
function orderedGitLabDuoModels(preferred) {
  var p = (preferred !== null && preferred !== void 0 ? preferred : '').trim();
  if (!p || !GITLAB_DUO_MODEL_ID_SET.has(p)) {
    return exports.GITLAB_DUO_MODELS;
  }
  var rest = exports.GITLAB_DUO_MODELS.filter(function (m) {
    return m !== p;
  });
  return __spreadArray([p], rest, true);
}
/** Poe API chat models (OpenAI-compatible). */
exports.POE_MODELS = ['claude-sonnet-4-20250514', 'gpt-4o', 'gemini-2.5-flash'];
/** DeepSeek cloud models — explicitly testing deepseek-chat or v3. */
exports.DEEPSEEK_MODELS = ['deepseek-chat', 'deepseek-reasoner'];
/** Kilo gateway models (OpenAI-compatible). */
exports.KILO_MODELS = ['xiaomi/mimo', 'anthropic/claude-sonnet-4.5'];
/** AgentRouter models (OpenAI-compatible at agentrouter.org/v1). */
exports.AGENTROUTER_MODELS = [
  'deepseek-v3.2',
  'deepseek-v3.1',
  'deepseek-r1-0528',
  'glm-4.5',
  'glm-4.6',
];
/**
 * ChatGPT subscription models via the Codex backend.
 * GPT-4.x is not supported in Codex. Keep this list aligned with the official Codex models page.
 * Docs currently recommend starting with GPT-5.4 and using GPT-5.4-mini for lower-cost tasks.
 */
exports.CHATGPT_MODELS = [
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.3-codex',
  'gpt-5.2-codex',
  'gpt-5.2',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex',
  'gpt-5.1-codex-mini',
  'gpt-5-codex',
];
/**
 * Gemini text chat / streaming — fallback order.
 * Prefer stable **2.5 / 2.0 Flash** first (better free-tier behavior and fewer surprises than preview).
 * **Preview** last so it only runs if listed models fail (saves quota for experimental IDs).
 */
exports.GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-3-flash-preview'];
/**
 * Native JSON + `responseJsonSchema` — stable IDs only (no preview) so quizzes/plans/catalyst
 * don’t burn preview quota and get more consistent schema fills. Tunable independently of chat.
 */
exports.GEMINI_STRUCTURED_JSON_MODELS = {
  /** Faster / cheaper structured calls (keypoints, small JSON). */
  low: 'gemini-2.0-flash',
  /** Heavier structured output (daily agenda, catalyst, long JSON). */
  high: 'gemini-2.5-flash',
};
/** Cloudflare Workers AI models — tried in order. Free: 10K neurons/day. */
exports.CLOUDFLARE_MODELS = ['@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3.2-3b-instruct'];
/** Cloudflare Workers AI image generation model. */
exports.CLOUDFLARE_IMAGE_MODELS = [
  '@cf/black-forest-labs/flux-2-dev',
  '@cf/black-forest-labs/flux-1-schnell',
];
/** Default Cloudflare Workers AI image generation model. */
exports.CLOUDFLARE_IMAGE_MODEL = exports.CLOUDFLARE_IMAGE_MODELS[0];
/**
 * Google native image models (Interactions API `model` field), 2026 Gemini API.
 * **Auto** tries these in order: Flash / preview models before Pro (typical free AI Studio keys).
 * @see https://ai.google.dev/gemini-api/docs/image-generation
 */
exports.GEMINI_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
];
exports.FAL_IMAGE_MODELS = [
  'fal-ai/nano-banana-2',
  'fal-ai/flux-pro/kontext/max/text-to-image',
  'fal-ai/qwen-image-2/pro/text-to-image',
  'fal-ai/gpt-image-1.5',
];
/** OpenRouter free image models — tried in order when Cloudflare & Gemini are unavailable or rate limited. */
exports.OPENROUTER_IMAGE_MODELS = [
  'bytedance-seed/seedream-4.5',
  'black-forest-labs/flux.2-max',
  'sourceful/riverflow-v2-pro',
];
/** Short labels for Settings chips (billing is account-specific; Flash lines usually work on free quota). */
exports.GEMINI_IMAGE_MODEL_LABELS = {
  'gemini-2.5-flash-image': '2.5 Flash Image (usually free quota)',
  'gemini-3.1-flash-image-preview': '3.1 Flash Image preview',
  'gemini-3-pro-image-preview': '3 Pro Image (often paid / higher tier)',
};
exports.FAL_IMAGE_MODEL_LABELS = {
  'fal-ai/nano-banana-2': 'Nano Banana 2 via fal',
  'fal-ai/flux-pro/kontext/max/text-to-image': 'FLUX.1 Kontext Max via fal',
  'fal-ai/qwen-image-2/pro/text-to-image': 'Qwen Image 2 Pro via fal',
  'fal-ai/gpt-image-1.5': 'GPT Image 1.5 via fal',
};
exports.FAL_IMAGE_GENERATION_MODEL_OPTIONS = exports.FAL_IMAGE_MODELS.map(function (m) {
  return {
    value: m,
    label: 'fal - '.concat(exports.FAL_IMAGE_MODEL_LABELS[m]),
  };
});
/** Persisted in `user_profile.image_generation_model`. `auto` = Gemini chain, then Cloudflare. */
exports.DEFAULT_IMAGE_GENERATION_MODEL = 'auto';
exports.IMAGE_GENERATION_MODEL_OPTIONS = __spreadArray(
  __spreadArray(
    [
      {
        value: exports.DEFAULT_IMAGE_GENERATION_MODEL,
        label: 'Auto (Gemini: Flash first → Pro → then Cloudflare)',
      },
    ],
    exports.GEMINI_IMAGE_MODELS.map(function (m) {
      return {
        value: m,
        label: 'Google \u2014 '.concat(exports.GEMINI_IMAGE_MODEL_LABELS[m]),
      };
    }),
    true,
  ),
  exports.CLOUDFLARE_IMAGE_MODELS.map(function (m) {
    return {
      value: m,
      label: 'Cloudflare \u2014 '.concat(m.replace('@cf/black-forest-labs/', '')),
    };
  }),
  true,
);
function normalizeImageGenerationModel(raw) {
  var v = (raw !== null && raw !== void 0 ? raw : '').trim();
  if (!v || v === exports.DEFAULT_IMAGE_GENERATION_MODEL)
    return exports.DEFAULT_IMAGE_GENERATION_MODEL;
  var allowed = new Set(
    __spreadArray(
      __spreadArray(
        __spreadArray(
          __spreadArray([exports.DEFAULT_IMAGE_GENERATION_MODEL], exports.FAL_IMAGE_MODELS, true),
          exports.GEMINI_IMAGE_MODELS,
          true,
        ),
        exports.CLOUDFLARE_IMAGE_MODELS,
        true,
      ),
      exports.OPENROUTER_IMAGE_MODELS,
      true,
    ),
  );
  return allowed.has(v) ? v : exports.DEFAULT_IMAGE_GENERATION_MODEL;
}
exports.OPENROUTER_FREE_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'stepfun/step-3.5-flash:free',
  'deepseek/deepseek-v3.2',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-3-27b-it:free',
];
/** Groq cloud models — order: best quality first, then fallbacks. */
exports.GROQ_MODELS = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
/** Default Hugging Face speech-to-text model. */
exports.DEFAULT_HF_TRANSCRIPTION_MODEL =
  ((_f = process.env.EXPO_PUBLIC_DEFAULT_HF_TRANSCRIPTION_MODEL) !== null && _f !== void 0
    ? _f
    : 'openai/whisper-large-v3'
  ).trim() || 'openai/whisper-large-v3';
/** Enable mock external lecture flow (browser audio instead of installed lecture apps). */
exports.MOCK_EXTERNAL_LECTURE_AUDIO_ENABLED = ['1', 'true', 'yes', 'on'].includes(
  ((_g = process.env.EXPO_PUBLIC_MOCK_EXTERNAL_LECTURE_AUDIO) !== null && _g !== void 0 ? _g : '')
    .trim()
    .toLowerCase(),
);
/** Audio URL opened in mock external lecture flow. */
exports.MOCK_EXTERNAL_LECTURE_AUDIO_URL =
  ((_h = process.env.EXPO_PUBLIC_MOCK_EXTERNAL_LECTURE_AUDIO_URL) !== null && _h !== void 0
    ? _h
    : 'https://www.learningcontainer.com/wp-content/uploads/2020/02/Kalimba.mp3'
  ).trim() || 'https://www.learningcontainer.com/wp-content/uploads/2020/02/Kalimba.mp3';
/** Enable quiet dot-dither texture on empty states + e0 backgrounds (`EmptyState` mounts `Texture`). */
exports.FEATURE_TEXTURE = false;
