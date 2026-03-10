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

/** Enqueue a failed request for later retry. */
export function enqueueRequest(
  requestType: OfflineRequestType,
  payload: Record<string, unknown>,
): void {
  try {
    const db = getDb();
    db.runSync(
      `INSERT INTO offline_ai_queue (request_type, payload, status, attempts, created_at)
       VALUES (?, ?, 'pending', 0, ?)`,
      [requestType, JSON.stringify(payload), nowTs()],
    );
  } catch (err) {
    console.warn('[OfflineQueue] Failed to enqueue request:', err);
  }
}

/** Returns all pending/failed requests that haven't exhausted retries. */
export function getPendingRequests(): OfflineQueueItem[] {
  try {
    const db = getDb();
    const rows = db.getAllSync<{
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
       ORDER BY created_at ASC
       LIMIT 20`,
      [MAX_ATTEMPTS],
    );
    return rows.map(r => ({
      id: r.id,
      requestType: r.request_type as OfflineRequestType,
      payload: JSON.parse(r.payload),
      status: r.status as OfflineQueueItem['status'],
      attempts: r.attempts,
      createdAt: r.created_at,
      lastAttemptAt: r.last_attempt_at,
      errorMessage: r.error_message,
    }));
  } catch {
    return [];
  }
}

/** Mark a queued item as processing (optimistic lock). */
function markProcessing(id: number): void {
  const db = getDb();
  db.runSync(
    `UPDATE offline_ai_queue SET status = 'processing', last_attempt_at = ?, attempts = attempts + 1
     WHERE id = ?`,
    [nowTs(), id],
  );
}

/** Mark an item as completed and remove it from the active queue. */
export function markCompleted(id: number): void {
  try {
    const db = getDb();
    db.runSync(
      `UPDATE offline_ai_queue SET status = 'completed' WHERE id = ?`,
      [id],
    );
  } catch (err) {
    console.warn('[OfflineQueue] markCompleted failed:', err);
  }
}

/** Mark an item as failed with an error message. */
export function markFailed(id: number, errorMessage: string): void {
  try {
    const db = getDb();
    db.runSync(
      `UPDATE offline_ai_queue SET status = 'failed', error_message = ? WHERE id = ?`,
      [errorMessage, id],
    );
  } catch (err) {
    console.warn('[OfflineQueue] markFailed failed:', err);
  }
}

/** Delete completed items older than 7 days to prevent queue bloat. */
export function pruneCompletedItems(): void {
  try {
    const db = getDb();
    const cutoff = nowTs() - 7 * 24 * 60 * 60 * 1000;
    db.runSync(
      `DELETE FROM offline_ai_queue WHERE status = 'completed' AND created_at < ?`,
      [cutoff],
    );
  } catch {}
}

type RequestProcessor = (item: OfflineQueueItem) => Promise<void>;

let processorRegistry: Partial<Record<OfflineRequestType, RequestProcessor>> = {};

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
 */
export async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const items = getPendingRequests();
    if (items.length === 0) return;

    console.log(`[OfflineQueue] Processing ${items.length} queued request(s)`);
    for (const item of items) {
      const processor = processorRegistry[item.requestType];
      if (!processor) continue;

      markProcessing(item.id);
      try {
        await processor(item);
      } catch (err: any) {
        markFailed(item.id, err?.message ?? String(err));
        console.warn(`[OfflineQueue] Request ${item.id} failed (attempt ${item.attempts}):`, err);
      }
    }
    pruneCompletedItems();
  } finally {
    isProcessing = false;
  }
}

// Auto-process queue when app returns to foreground
AppState.addEventListener('change', (state: AppStateStatus) => {
  if (state === 'active') {
    processQueue().catch(() => {});
  }
});
