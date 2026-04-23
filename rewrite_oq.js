const fs = require('fs');
let code = fs.readFileSync('src/services/offlineQueue.ts', 'utf-8');

const enq = /export async function enqueueRequest[\s\S]*?\}\s*catch\s*\(err\)\s*\{\s*console\.warn\('\[OfflineQueue\] Failed to enqueue request:', err\);\s*\}\s*\}/;

const enqRaw = `export async function enqueueRequest(requestType: string, payload: any): Promise<void> {
  try {
    const db = getDb();
    const countRow = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM offline_ai_queue WHERE status IN ('pending', 'processing')"
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
              {} as Record<string, any>,
            )
        : payload;
    const payloadStr = JSON.stringify(sortedPayload);

    const recentRow = await db.getFirstAsync<{ id: number; created_at: number }>(
      "SELECT id, created_at FROM offline_ai_queue WHERE request_type = ? AND payload = ? AND status IN ('pending', 'processing') AND created_at > ?",
      [requestType, payloadStr, nowTs() - DEDUPE_WINDOW_MS]
    );

    if (recentRow) {
      if (__DEV__) console.log('[OfflineQueue] Deduplicating identical request');
      return;
    }

    await db.runAsync(
      "INSERT INTO offline_ai_queue (request_type, payload, status, attempts, created_at) VALUES (?, ?, 'pending', 0, ?)",
      [requestType, payloadStr, nowTs()]
    );
  } catch (err) {
    console.warn('[OfflineQueue] Failed to enqueue request:', err);
  }
}`;

code = code.replace(enq, enqRaw);

const getP = /export async function getPendingRequests\(\): Promise<OfflineQueueItem\[\]> \{\s*try \{\s*const db = getDb\(\);[\s\S]*?\}\s*catch\s*\(err\)\s*\{\s*console\.error\('\[OfflineQueue\] Failed to get pending requests:', err\);\s*return \[\];\s*\}\s*\}/;

const getPRaw = `export async function getPendingRequests(): Promise<OfflineQueueItem[]> {
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
      [MAX_ATTEMPTS]
    );

    return rows.map((r) => ({
      id: r.id,
      requestType: r.request_type,
      payload: r.payload,
      status: r.status as 'pending' | 'processing' | 'completed' | 'failed',
      attempts: r.attempts ?? 0,
      createdAt: r.created_at,
      lastAttemptAt: r.last_attempt_at || undefined,
      errorMessage: r.error_message || undefined,
    }));
  } catch (err) {
    console.error('[OfflineQueue] Failed to get pending requests:', err);
    return [];
  }
}`;

code = code.replace(getP, getPRaw);

const prune = /async function pruneCompletedItems\(\) \{\s*try \{\s*const cutoff = nowTs\(\) - 7 \* 24 \* 60 \* 60 \* 1000;\s*const db = getDb\(\);[\s\S]*?\}\s*catch\s*\(error\)\s*\{\s*console\.warn\('\[OfflineQueue\] Failed to prune completed items:', error\);\s*\}\s*\}/;

const pruneRaw = `async function pruneCompletedItems() {
  try {
    const cutoff = nowTs() - 7 * 24 * 60 * 60 * 1000; // 7 days
    const db = getDb();
    const result = await db.runAsync(
      "DELETE FROM offline_ai_queue WHERE status = 'completed' AND created_at < ?",
      [cutoff]
    );
    if (result.changes > 0) {
      if (__DEV__) console.log(\`[OfflineQueue] Pruned \${result.changes} old completed items\`);
    }
  } catch (error) {
    console.warn('[OfflineQueue] Failed to prune completed items:', error);
  }
}`;

code = code.replace(prune, pruneRaw);

fs.writeFileSync('src/services/offlineQueue.ts', code);

