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

import { getDb } from '../db/database';
import { nowTs } from '../db/database';
import { INTERVALS } from '../constants/time';
import { AppState, AppStateStatus } from 'react-native';

export type OfflineRequestType = 'generate_json' | 'generate_text' | 'transcribe';

export interface OfflineQueueItem {
  id?: number;
  requestType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  payload: any;
  createdAt: number;
  attempts: number;
  lastAttemptAt?: number | null;
  status: string; // 'pending' | 'processing' | 'completed' | 'failed'
  errorMessage?: string | null;
}

const MAX_ATTEMPTS = 5;
const _MAX_QUEUE_SIZE = 100; // Prevent storage exhaustion
const DEDUPE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RETRY_BASE_DELAY = 1000; // 1 second base delay for retries
const FOREGROUND_PROCESS_DELAY_MS = 1000;
const FOREGROUND_PROCESS_COOLDOWN_MS = 5000;

/** Canonical JSON string (sorted keys) so dedupe and storage always match. */
function _canonicalPayloadString(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, Object.keys(payload).sort());
}

async function runQueueStatusUpdate(
  sqlQuery: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  params: any[],
  failureLogPrefix: string,
): Promise<boolean> {
  try {
    const db = getDb();
    const result = await db.runAsync(sqlQuery, params);
    return result.changes > 0;
  } catch (err) {
    console.warn(failureLogPrefix, err);
    return false;
  }
}

/** Enqueue a failed request for later retry. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
export async function enqueueRequest(requestType: string, payload: any): Promise<void> {
  try {
    const db = getDb();
    const countRow = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM offline_ai_queue WHERE status IN ('pending', 'processing')",
    );
    const count = countRow?.count ?? 0;
    if (count >= 100) {
      console.warn('[OfflineQueue] Queue full, dropping request');
      return;
    }

    const sortedPayload =
      typeof payload === 'object' && payload !== null
        ? Object.keys(payload)
            .sort()
            .reduce(
              (acc, key) => {
                acc[key] = payload[key];
                return acc;
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
              {} as Record<string, any>,
            )
        : payload;
    const payloadStr = JSON.stringify(sortedPayload);

    const recentRow = await db.getFirstAsync<{ id: number; created_at: number }>(
      "SELECT id, created_at FROM offline_ai_queue WHERE request_type = ? AND payload = ? AND status IN ('pending', 'processing') AND created_at > ?",
      [requestType, payloadStr, nowTs() - DEDUPE_WINDOW_MS],
    );

    if (recentRow) {
      if (__DEV__) console.log('[OfflineQueue] Deduplicating identical request');
      return;
    }

    await db.runAsync(
      "INSERT INTO offline_ai_queue (request_type, payload, status, attempts, created_at) VALUES (?, ?, 'pending', 0, ?)",
      [requestType, payloadStr, nowTs()],
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
      "SELECT * FROM offline_ai_queue WHERE status IN ('pending', 'failed') AND attempts < ? ORDER BY CASE status WHEN 'failed' THEN 1 ELSE 0 END, created_at ASC LIMIT 20",
      [MAX_ATTEMPTS],
    );

    return rows.map((r) => ({
      id: r.id,
      requestType: r.request_type,
      payload: JSON.parse(r.payload),
      status: r.status as 'pending' | 'processing' | 'completed' | 'failed',
      attempts: r.attempts ?? 0,
      createdAt: r.created_at,
      lastAttemptAt: r.last_attempt_at ?? null,
      errorMessage: r.error_message ?? null,
    }));
  } catch (err) {
    console.error('[OfflineQueue] Failed to get pending requests:', err);
    return [];
  }
}

/** Mark a queued item as processing (optimistic lock). */
async function markProcessing(id: number): Promise<boolean> {
  return runQueueStatusUpdate(
    "UPDATE offline_ai_queue SET status = 'processing', last_attempt_at = ?, attempts = attempts + 1 WHERE id = ? AND status IN ('pending', 'failed')",
    [nowTs(), id],
    '[OfflineQueue] markProcessing failed:',
  );
}

/** Mark an item as completed and remove it from the active queue. */
export async function markCompleted(id: number): Promise<void> {
  await runQueueStatusUpdate(
    "UPDATE offline_ai_queue SET status = 'completed' WHERE id = ?",
    [id],
    '[OfflineQueue] markCompleted failed:',
  );
}

/** Mark an item as failed with an error message. */
export async function markFailed(id: number, errorMessage: string): Promise<void> {
  await runQueueStatusUpdate(
    "UPDATE offline_ai_queue SET status = 'failed', error_message = ? WHERE id = ?",
    [errorMessage, id],
    '[OfflineQueue] markFailed failed:',
  );
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
    const cutoff = nowTs() - INTERVALS.SEVEN_DAYS;
    await db.runAsync(
      "DELETE FROM offline_ai_queue WHERE status = 'completed' AND created_at < ?",
      [cutoff],
    );
    if (__DEV__) console.log(`[OfflineQueue] Pruned old completed items`);
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
let lastProcessStartedAt = 0;
let scheduledForegroundProcess: ReturnType<typeof setTimeout> | null = null;
let hasCompletedInitialProcess = false;

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
  lastProcessStartedAt = Date.now();
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
      if (!item.id) continue;
      const processor = processorRegistry[item.requestType as OfflineRequestType];
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
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await markFailed(item.id, errorMsg);
        console.warn(`[OfflineQueue] Request ${item.id} failed (attempt ${item.attempts}):`, error);
      }
    }

    // Prune after processing
    await pruneCompletedItems();
  } finally {
    isProcessing = false;
    hasCompletedInitialProcess = true;
  }
}

// Auto-process queue when app returns to foreground
const appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
  if (state === 'active') {
    if (scheduledForegroundProcess) {
      clearTimeout(scheduledForegroundProcess);
    }

    // Add a small delay to ensure network is ready, but suppress redundant
    // re-processing immediately after an explicit bootstrap/manual queue run.
    scheduledForegroundProcess = setTimeout(() => {
      scheduledForegroundProcess = null;
      if (!hasCompletedInitialProcess) return;
      if (isProcessing) return;
      if (Date.now() - lastProcessStartedAt < FOREGROUND_PROCESS_COOLDOWN_MS) return;
      processQueue().catch((error) => {
        console.error('[OfflineQueue] background processQueue failed:', error);
      });
    }, FOREGROUND_PROCESS_DELAY_MS);
  }
});

// Cleanup on module unload (in development hot reload)
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
if (typeof window !== 'undefined' && (window as any).__DEV__) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  (window as any).__OFFLINE_QUEUE_CLEANUP__ = () => {
    appStateSubscription?.remove();
  };
}
