/**
 * Shared completion (output) token ceilings for chat-style calls.
 * Groq keeps a separate lower cap in `llmRouting.ts` (`GROQ_MAX_COMPLETION_TOKENS`) because
 * prompt + max_tokens must stay within each model's context window.
 */
export const CLOUD_MAX_COMPLETION_TOKENS = 8192;

/** MediaPipe LiteRT local LLM — `loadModel` max generation tokens. */
export const LOCAL_LLM_MAX_COMPLETION_TOKENS = 4096;
