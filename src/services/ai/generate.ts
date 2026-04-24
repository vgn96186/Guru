/**
 * Legacy re-exports — all generation now goes through v2/compat.
 *
 * Kept only as a safety net so stale imports don't break.
 * New code should import directly from './v2/compat'.
 */
export { generateTextV2 as generateTextWithRouting } from './v2/compat';
export { generateTextStreamV2 as generateTextWithRoutingStream } from './v2/compat';
export { generateJSONV2 as generateJSONWithRouting } from './v2/compat';
