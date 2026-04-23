/**
 * Shared constants for local AI / LiteRT LLM operations.
 */

/** Timeout for streaming operations (60 seconds). */
export const STREAM_TIMEOUT_MS = 60_000;

/** Debounce time between warmup calls (30 seconds). */
export const WARMUP_DEBOUNCE_MS = 30_000;

/** Token chunk size for simulated streaming (tools mode fallback). */
export const SIMULATED_CHUNK_SIZE = 12;