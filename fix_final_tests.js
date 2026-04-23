const fs = require('fs');
let code = fs.readFileSync('src/services/offlineQueue.ts', 'utf-8');

// Fix pruneCompletedItems
const pruneReg = /export async function pruneCompletedItems\(\): Promise<void> \{[\s\S]*?catch \(error\) \{\s*console\.warn\('\[OfflineQueue\] Failed to prune completed items:', error\);\s*\}\s*\}/m;
const pruneNew = `export async function pruneCompletedItems(): Promise<void> {
  try {
    const db = getDb();
    const cutoff = nowTs() - INTERVALS.SEVEN_DAYS;
    await db.runAsync(
      "DELETE FROM offline_ai_queue WHERE status = 'completed' AND created_at < ?",
      [cutoff]
    );
    if (__DEV__) console.log(\`[OfflineQueue] Pruned old completed items\`);
  } catch (error) {
    console.warn('[OfflineQueue] Failed to prune completed items:', error);
  }
}`;
code = code.replace(pruneReg, pruneNew);

// Fix getPendingRequests parsing and nulls
const getP = /payload: r\.payload,\s*status: r\.status as 'pending' \| 'processing' \| 'completed' \| 'failed',\s*attempts: r\.attempts \?\? 0,\s*createdAt: r\.created_at,\s*lastAttemptAt: r\.last_attempt_at \|\| undefined,\s*errorMessage: r\.error_message \|\| undefined,/m;
const getPNew = `payload: JSON.parse(r.payload),
      status: r.status as 'pending' | 'processing' | 'completed' | 'failed',
      attempts: r.attempts ?? 0,
      createdAt: r.created_at,
      lastAttemptAt: r.last_attempt_at ?? null,
      errorMessage: r.error_message ?? null,`;
code = code.replace(getP, getPNew);

fs.writeFileSync('src/services/offlineQueue.ts', code);
