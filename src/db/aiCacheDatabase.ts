/**
 * AI cache storage lives in `neet_ai_cache.db`, accessed only via the main connection
 * (`ATTACH … AS guru_aicache`). Re-exports keep legacy import paths stable.
 */
export { getAiCacheDb, resetAiCacheDbSingleton } from './database';
