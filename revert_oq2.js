const fs = require('fs');

let content = fs.readFileSync('src/services/offlineQueue.ts', 'utf-8');

content = content.replace(/import \{ getDrizzleDb \} from '\.\.\/db\/drizzle';\nimport \{ offlineAiQueue \} from '\.\.\/db\/drizzleSchema';\nimport \{ sql, eq, and, gt, inArray \} from 'drizzle-orm';/g, "import { getDb } from '../db/database';");

// runQueueStatusUpdate
content = content.replace(/async function runQueueStatusUpdate\(\s*callback: \(db: ReturnType<typeof getDrizzleDb>\) => Promise<any>,\s*failureLogPrefix: string,\s*\): Promise<boolean> \{\s*try \{\s*const db = getDrizzleDb\(\);\s*const result = await callback\(db\);\s*\/\/ Rough check if any rows were affected\. Drizzle doesn't always return changes easily for SQLite update\.\s*\/\/ For simplicity, we just return true if it didn't throw\.\s*return true;\s*\} catch \(err\) \{\s*console\.warn\(failureLogPrefix, err\);\s*return false;\s*\}\s*\}/m, `async function runQueueStatusUpdate(
  sqlQuery: string,
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
}`);

// enqueueRequest
content = content.replace(/const db = getDrizzleDb\(\);/g, 'const db = getDb();');

content = content.replace(/const countRowRaw = await db\.select\(\{ count: sql`COUNT\(\*\)` \}\)\.from\(offlineAiQueue\)\.where\(inArray\(offlineAiQueue\.status, \['pending', 'processing'\]\)\);\s*const countRow = \{ count: Number\(countRowRaw\[0\]\.count\) \};/g, "const countRow = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM offline_ai_queue WHERE status IN ('pending', 'processing')`,);");

content = content.replace(/const recentRowRaw = await db\.select\(\{ id: offlineAiQueue\.id, created_at: offlineAiQueue\.createdAt \}\)\s*\.from\(offlineAiQueue\)\s*\.where\(and\(\s*eq\(offlineAiQueue\.requestType, requestType\),\s*eq\(offlineAiQueue\.payload, payloadStr\),\s*inArray\(offlineAiQueue\.status, \['pending', 'processing'\]\),\s*gt\(offlineAiQueue\.createdAt, nowTs\(\) - DEDUPE_WINDOW_MS\)\s*\)\)\.limit\(1\);\s*const recentRow = recentRowRaw\[0\];/g, "const recentRow = await db.getFirstAsync<{ id: number; created_at: number }>(`SELECT id, created_at FROM offline_ai_queue WHERE request_type = ? AND payload = ? AND status IN ('pending', 'processing') AND created_at > ?`,[requestType, payloadStr, nowTs() - DEDUPE_WINDOW_MS],);");

content = content.replace(/await db\.insert\(offlineAiQueue\)\.values\(\{\s*requestType,\s*payload: payloadStr,\s*status: 'pending',\s*attempts: 0,\s*createdAt: nowTs\(\),\s*\}\);/g, "await db.runAsync(`INSERT INTO offline_ai_queue (request_type, payload, status, attempts, created_at) VALUES (?, ?, 'pending', 0, ?)`, [requestType, payloadStr, nowTs()]);");

// getPendingRequests
content = content.replace(/const rowsRaw = await db\.select\(\)\s*\.from\(offlineAiQueue\)\s*\.where\(and\(\s*inArray\(offlineAiQueue\.status, \['pending', 'failed'\]\),\s*sql`\$\{offlineAiQueue\.attempts\} < \$\{MAX_ATTEMPTS\}`\s*\)\)\s*\.orderBy\(sql`CASE status WHEN 'failed' THEN 1 ELSE 0 END`, sql`created_at ASC`\)\s*\.limit\(20\);\s*const rows = rowsRaw\.map\(r => \(\{\s*id: r\.id,\s*request_type: r\.requestType,\s*payload: r\.payload,\s*status: r\.status,\s*attempts: r\.attempts \?\? 0,\s*created_at: r\.createdAt,\s*last_attempt_at: r\.lastAttemptAt,\s*error_message: r\.errorMessage,\s*\}\)\);/g, "const rows = await db.getAllAsync<{ id: number; request_type: string; payload: string; status: string; attempts: number; created_at: number; last_attempt_at: number | null; error_message: string | null; }>(`SELECT * FROM offline_ai_queue WHERE status IN ('pending', 'failed') AND attempts < ? ORDER BY CASE status WHEN 'failed' THEN 1 ELSE 0 END, created_at ASC LIMIT 20`, [MAX_ATTEMPTS],);");

// markProcessing
content = content.replace(/return runQueueStatusUpdate\(\s*async \(db\) => db\.update\(offlineAiQueue\)\s*\.set\(\{ status: 'processing', lastAttemptAt: nowTs\(\), attempts: sql`attempts \+ 1` \}\)\s*\.where\(and\(eq\(offlineAiQueue\.id, id\), inArray\(offlineAiQueue\.status, \['pending', 'failed'\]\)\)\),\s*'\[OfflineQueue\] markProcessing failed:'\s*\);/g, "return runQueueStatusUpdate(`UPDATE offline_ai_queue SET status = 'processing', last_attempt_at = ?, attempts = attempts + 1 WHERE id = ? AND status IN ('pending', 'failed')`, [nowTs(), id], '[OfflineQueue] markProcessing failed:',);");

// markCompleted
content = content.replace(/await runQueueStatusUpdate\(\s*async \(db\) => db\.update\(offlineAiQueue\)\.set\(\{ status: 'completed' \}\)\.where\(eq\(offlineAiQueue\.id, id\)\),\s*'\[OfflineQueue\] markCompleted failed:'\s*\);/g, "await runQueueStatusUpdate(`UPDATE offline_ai_queue SET status = 'completed' WHERE id = ?`, [id], '[OfflineQueue] markCompleted failed:');");

// markFailed
content = content.replace(/await runQueueStatusUpdate\(\s*async \(db\) => db\.update\(offlineAiQueue\)\.set\(\{ status: 'failed', errorMessage \}\)\.where\(eq\(offlineAiQueue\.id, id\)\),\s*'\[OfflineQueue\] markFailed failed:'\s*\);/g, "await runQueueStatusUpdate(`UPDATE offline_ai_queue SET status = 'failed', error_message = ? WHERE id = ?`, [errorMessage, id], '[OfflineQueue] markFailed failed:');");

// pruneCompletedItems
content = content.replace(/await db\.delete\(offlineAiQueue\)\s*\.where\(and\(eq\(offlineAiQueue\.status, 'completed'\), sql`\$\{offlineAiQueue\.createdAt\} < \$\{cutoff\}`\)\);\s*if \(__DEV__\) console\.log\(`\[OfflineQueue\] Pruned old completed items`\);/g, "const result = await db.runAsync(`DELETE FROM offline_ai_queue WHERE status = 'completed' AND created_at < ?`, [cutoff],); if (result.changes > 0) { if (__DEV__) console.log(`[OfflineQueue] Pruned ${result.changes} old completed items`); }");

content = content.replace(/const nowTs = \(\) => Date\.now\(\);/g, "import { nowTs } from '../db/database';");

fs.writeFileSync('src/services/offlineQueue.ts', content);
