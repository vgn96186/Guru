/**
 * Offline AI Request Queue
 *
 * Persists failed AI/transcription requests to SQLite and retries them
 * when the device is back online. Prevents silent data loss on network errors.
 *
 * Usage:
 *   import { enqueueRequest, processQueue } from './offlineQueue';
 *
 *   // In aiService.ts on network error:
 *   await enqueueRequest('generate_json', { prompt, schemaName });
 *
 *   // In AppState 'active' listener:
 *   await processQueue();
 */

import { getDb, nowTs } from '../db/database';
import { AppState, AppStateStatus } from 'react-native';

export type OfflineRequestType = 'generate_json' | 'generate_text' | 'transcribe';

export interface OfflineQueueItem {
  id: number;
  requestType: OfflineRequestType;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'failed' | 'completed';
  attempts: number;
  createdAt: number;
  lastAttemptAt: number | null;
  errorMessage: string | null;
}

const MAX_ATTEMPTS = 5;
const MAX_QUEUE_SIZE = 100; // Prevent storage exhaustion
const DEDUPE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RETRY_BASE_DELAY = 1000; // 1 second base delay for retries

/** Generate a deduplication key for a request */
function getDedupeKey(requestType: OfflineRequestType, payload: Record<string, unknown>): string {
  // Create a stable string representation of the payload
  const payloadStr = JSON.stringify(payload, Object.keys(payload).sort());
  return `${requestType}:${payloadStr}`;
}

/** Enqueue a failed request for later retry. */
export async function enqueueRequest(
  requestType: OfflineRequestType,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const db = getDb();

    // Check queue size before enqueueing
    const countRow = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM offline_ai_queue WHERE status IN ('pending', 'processing')`,
    );
    if (countRow && countRow.count >= MAX_QUEUE_SIZE) {
      console.warn(
        '[OfflineQueue] Queue full (max %d), dropping request of type: %s',
        MAX_QUEUE_SIZE,
        requestType,
      );
      return;
    }

    // Check for recent duplicate (within dedupe window)
    const dedupeKey = getDedupeKey(requestType, payload);
    const recentRow = await db.getFirstAsync<{ id: number; created_at: number }>(
      `SELECT id, created_at FROM offline_ai_queue 
       WHERE request_type = ? AND payload = ? AND status IN ('pending', 'processing')
       AND created_at > ?`,
      [requestType, JSON.stringify(payload), nowTs() - DEDUPE_WINDOW_MS],
    );

    if (recentRow) {
      console.debug(
        '[OfflineQueue] Duplicate request detected (within dedupe window), skipping enqueue',
      );
      return;
    }

    await db.runAsync(
      `INSERT INTO offline_ai_queue (request_type, payload, status, attempts, created_at)
       VALUES (?, ?, 'pending', 0, ?)`,
      [requestType, JSON.stringify(payload), nowTs()],
    );
  } catch (err) {
    console.warn('[OfflineQueue] Failed to enqueue request:', err);
  }
}

/** Returns all pending/failed requests that haven't exhausted retries. */
export async function getPendingRequests(): Promise<OfflineQueueItem[]> {
  try {
    const db = getDb();
    const rows = await db.getAllAsync<{
      id: number;
      request_type: string;
      payload: string;
      status: string;
      attempts: number;
      created_at: number;
      last_attempt_at: number | null;
      error_message: string | null;
    }>(
      `SELECT * FROM offline_ai_queue
       WHERE status IN ('pending', 'failed') AND attempts < ?
       ORDER BY 
         CASE status 
           WHEN 'failed' THEN 1  -- Process failed items first (they've already waited)
           ELSE 0 
         END,
         created_at ASC
       LIMIT 20`,
      [MAX_ATTEMPTS],
    );
    return rows.map((r) => ({
      id: r.id,
      requestType: r.request_type as OfflineRequestType,
      payload: JSON.parse(r.payload),
      status: r.status as OfflineQueueItem['status'],
      attempts: r.attempts,
      createdAt: r.created_at,
      lastAttemptAt: r.last_attempt_at,
      errorMessage: r.error_message,
    }));
  } catch (err) {
    console.error('[OfflineQueue] Failed to get pending requests:', err);
    return [];
  }
}

/** Mark a queued item as processing (optimistic lock). */
async function markProcessing(id: number): Promise<boolean> {
  try {
    const db = getDb();
    const result = await db.runAsync(
      `UPDATE offline_ai_queue 
       SET status = 'processing', last_attempt_at = ?, attempts = attempts + 1
       WHERE id = ? AND status IN ('pending', 'failed')`,
      [nowTs(), id],
    );
    return result.changes > 0;
  } catch (err) {
    console.warn('[OfflineQueue] markProcessing failed:', err);
    return false;
  }
}

/** Mark an item as completed and remove it from the active queue. */
export async function markCompleted(id: number): Promise<void> {
  try {
    const db = getDb();
    await db.runAsync(`UPDATE offline_ai_queue SET status = 'completed' WHERE id = ?`, [id]);
  } catch (err) {
    console.warn('[OfflineQueue] markCompleted failed:', err);
  }
}

/** Mark an item as failed with an error message. */
export async function markFailed(id: number, errorMessage: string): Promise<void> {
  try {
    const db = getDb();
    await db.runAsync(
      `UPDATE offline_ai_queue SET status = 'failed', error_message = ? WHERE id = ?`,
      [errorMessage, id],
    );
  } catch (err) {
    console.warn('[OfflineQueue] markFailed failed:', err);
  }
}

/** Calculate retry delay with exponential backoff */
export function getRetryDelay(attempts: number): number {
  // Exponential backoff with jitter: base * 2^attempts + random(0, base)
  const base = RETRY_BASE_DELAY;
  const backoff = base * Math.pow(2, Math.min(attempts, 5)); // Cap at 2^5 = 32x
  const jitter = Math.random() * base;
  return Math.min(backoff + jitter, 60 * 1000); // Cap at 60 seconds
}

/** Delete completed items older than 7 days to prevent queue bloat. */
export async function pruneCompletedItems(): Promise<void> {
  try {
    const db = getDb();
    const cutoff = nowTs() - 7 * 24 * 60 * 60 * 1000;
    const result = await db.runAsync(
      `DELETE FROM offline_ai_queue WHERE status = 'completed' AND created_at < ?`,
      [cutoff],
    );
    if (result.changes > 0) {
      if (__DEV__) console.log(`[OfflineQueue] Pruned ${result.changes} old completed items`);
    }
  } catch (error) {
    console.warn('[OfflineQueue] Failed to prune completed items:', error);
  }
}

type RequestProcessor = (item: OfflineQueueItem) => Promise<void>;

const processorRegistry: Partial<Record<OfflineRequestType, RequestProcessor>> = {};

/**
 * Register a handler for a request type. Called during app init.
 *
 * @example
 * registerProcessor('generate_json', async (item) => {
 *   const result = await generateJSONWithRouting(item.payload.prompt, item.payload.schema);
 *   if (result) markCompleted(item.id);
 * });
 */
export function registerProcessor(
  requestType: OfflineRequestType,
  processor: RequestProcessor,
): void {
  processorRegistry[requestType] = processor;
}

let isProcessing = false;

/**
 * Process all pending queued requests using registered processors.
 * Safe to call multiple times — uses a lock to prevent concurrent runs.
 * Includes retry delay for failed items to avoid hammering the network.
 */
export async function processQueue(): Promise<void> {
  if (isProcessing) {
    console.debug('[OfflineQueue] Already processing, skipping');
    return;
  }

  isProcessing = true;
  try {
    const items = await getPendingRequests();
    if (items.length === 0) {
      // Also prune old completed items periodically
      await pruneCompletedItems();
      return;
    }

    if (__DEV__) console.log(`[OfflineQueue] Processing ${items.length} queued request(s)`);

    // Process items one at a time (avoid parallel processing issues)
    for (const item of items) {
      const processor = processorRegistry[item.requestType];
      if (!processor) {
        console.warn(`[OfflineQueue] No processor for type: ${item.requestType}`);
        await markFailed(item.id, `No processor registered for ${item.requestType}`);
        continue;
      }

      // Try to mark as processing, skip if already taken by another process
      const marked = await markProcessing(item.id);
      if (!marked) {
        console.debug(`[OfflineQueue] Item ${item.id} already being processed by another worker`);
        continue;
      }

      // If this is a retry (failed status), apply backoff delay
      if (item.status === 'failed' && item.attempts > 1) {
        const delay = getRetryDelay(item.attempts - 1);
        if (__DEV__)
          console.log(
            `[OfflineQueue] Item ${item.id} is a retry (attempt ${item.attempts}), waiting ${delay}ms`,
          );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        await processor(item);
        await markCompleted(item.id);
        if (__DEV__) console.log(`[OfflineQueue] Successfully processed item ${item.id}`);
      } catch (err: any) {
        const errorMsg = err?.message ?? String(err);
        await markFailed(item.id, errorMsg);
        console.warn(`[OfflineQueue] Request ${item.id} failed (attempt ${item.attempts}):`, err);
      }
    }

    // Prune after processing
    await pruneCompletedItems();
  } finally {
    isProcessing = false;
  }
}

// Auto-process queue when app returns to foreground
const appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
  if (state === 'active') {
    // Add a small delay to ensure network is ready
    setTimeout(() => {
      processQueue().catch((error) => {
        console.error('[OfflineQueue] background processQueue failed:', error);
      });
    }, 1000);
  }
});

// Cleanup on module unload (in development hot reload)
if (typeof window !== 'undefined' && (window as any).__DEV__) {
  (window as any).__OFFLINE_QUEUE_CLEANUP__ = () => {
    appStateSubscription?.remove();
  };
}
