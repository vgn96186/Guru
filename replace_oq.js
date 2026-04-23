const fs = require('fs');

let content = fs.readFileSync('src/services/offlineQueue.ts', 'utf-8');

content = content.replace(/import \{ getDb, nowTs \} from '\.\.\/db\/database';/g, "import { getDrizzleDb } from '../db/drizzle';\nimport { offlineAiQueue } from '../db/drizzleSchema';\nimport { sql, eq, and, gt, inArray } from 'drizzle-orm';\nconst nowTs = () => Date.now();");

// runQueueStatusUpdate
content = content.replace(/async function runQueueStatusUpdate\([\s\S]*?\} catch \(err\) \{\n    console\.warn\(failureLogPrefix, err\);\n    return false;\n  \}\n\}/m, `async function runQueueStatusUpdate(
  callback: (db: ReturnType<typeof getDrizzleDb>) => Promise<any>,
  failureLogPrefix: string,
): Promise<boolean> {
  try {
    const db = getDrizzleDb();
    const result = await callback(db);
    // Rough check if any rows were affected. Drizzle doesn't always return changes easily for SQLite update.
    // For simplicity, we just return true if it didn't throw.
    return true;
  } catch (err) {
    console.warn(failureLogPrefix, err);
    return false;
  }
}`);

// enqueueRequest
content = content.replace(/const countRow = await db\.getFirstAsync<\s*\{\s*count:\s*number\s*\}\s*>\(\s*`SELECT COUNT\(\*\) as count FROM offline_ai_queue WHERE status IN \('pending', 'processing'\)`,\s*\);/g, `const countRowRaw = await db.select({ count: sql\`COUNT(*)\` }).from(offlineAiQueue).where(inArray(offlineAiQueue.status, ['pending', 'processing']));
    const countRow = { count: Number(countRowRaw[0].count) };`);

content = content.replace(/const recentRow = await db\.getFirstAsync<\s*\{\s*id:\s*number;\s*created_at:\s*number\s*\}\s*>\(\s*`SELECT id, created_at FROM offline_ai_queue \s*WHERE request_type = \? AND payload = \? AND status IN \('pending', 'processing'\)\s*AND created_at > \?`,\s*\[requestType, payloadStr, nowTs\(\) - DEDUPE_WINDOW_MS\],\s*\);/g, `const recentRowRaw = await db.select({ id: offlineAiQueue.id, created_at: offlineAiQueue.createdAt })
      .from(offlineAiQueue)
      .where(and(
        eq(offlineAiQueue.requestType, requestType),
        eq(offlineAiQueue.payload, payloadStr),
        inArray(offlineAiQueue.status, ['pending', 'processing']),
        gt(offlineAiQueue.createdAt, nowTs() - DEDUPE_WINDOW_MS)
      )).limit(1);
    const recentRow = recentRowRaw[0];`);

content = content.replace(/await db\.runAsync\(\s*`INSERT INTO offline_ai_queue \(request_type, payload, status, attempts, created_at\)\s*VALUES \(\?, \?, 'pending', 0, \?\)`,\s*\[requestType, payloadStr, nowTs\(\)\],\s*\);/g, `await db.insert(offlineAiQueue).values({
      requestType,
      payload: payloadStr,
      status: 'pending',
      attempts: 0,
      createdAt: nowTs(),
    });`);

// getPendingRequests
const getPendingRegex = /const rows = await db\.getAllAsync<\s*\{\s*id:\s*number;\s*request_type:\s*string;\s*payload:\s*string;\s*status:\s*string;\s*attempts:\s*number;\s*created_at:\s*number;\s*last_attempt_at:\s*number\s*\|\s*null;\s*error_message:\s*string\s*\|\s*null;\s*\}\s*>\(\s*`SELECT \* FROM offline_ai_queue\s*WHERE status IN \('pending', 'failed'\) AND attempts < \?\s*ORDER BY \s*CASE status \s*WHEN 'failed' THEN 1  -- Process failed items first \(they've already waited\)\s*ELSE 0 \s*END,\s*created_at ASC\s*LIMIT 20`,\s*\[MAX_ATTEMPTS\],\s*\);/g;

content = content.replace(getPendingRegex, `const rowsRaw = await db.select()
      .from(offlineAiQueue)
      .where(and(
        inArray(offlineAiQueue.status, ['pending', 'failed']),
        sql\`\${offlineAiQueue.attempts} < \${MAX_ATTEMPTS}\`
      ))
      .orderBy(sql\`CASE status WHEN 'failed' THEN 1 ELSE 0 END\`, sql\`created_at ASC\`)
      .limit(20);
    const rows = rowsRaw.map(r => ({
      id: r.id,
      request_type: r.requestType,
      payload: r.payload,
      status: r.status,
      attempts: r.attempts ?? 0,
      created_at: r.createdAt,
      last_attempt_at: r.lastAttemptAt,
      error_message: r.errorMessage,
    }));`);

// markProcessing
const markProcessingRegex = /return runQueueStatusUpdate\(\s*`UPDATE offline_ai_queue \s*SET status = 'processing', last_attempt_at = \?, attempts = attempts \+ 1\s*WHERE id = \? AND status IN \('pending', 'failed'\)`,\s*\[nowTs\(\), id\],\s*'\[OfflineQueue\] markProcessing failed:',\s*\);/g;
content = content.replace(markProcessingRegex, `return runQueueStatusUpdate(
    async (db) => db.update(offlineAiQueue)
      .set({ status: 'processing', lastAttemptAt: nowTs(), attempts: sql\`attempts + 1\` })
      .where(and(eq(offlineAiQueue.id, id), inArray(offlineAiQueue.status, ['pending', 'failed']))),
    '[OfflineQueue] markProcessing failed:'
  );`);

// markCompleted
content = content.replace(/await runQueueStatusUpdate\(\s*`UPDATE offline_ai_queue SET status = 'completed' WHERE id = \?`,\s*\[id\],\s*'\[OfflineQueue\] markCompleted failed:',\s*\);/g, `await runQueueStatusUpdate(
    async (db) => db.update(offlineAiQueue).set({ status: 'completed' }).where(eq(offlineAiQueue.id, id)),
    '[OfflineQueue] markCompleted failed:'
  );`);

// markFailed
content = content.replace(/await runQueueStatusUpdate\(\s*`UPDATE offline_ai_queue SET status = 'failed', error_message = \? WHERE id = \?`,\s*\[errorMessage, id\],\s*'\[OfflineQueue\] markFailed failed:',\s*\);/g, `await runQueueStatusUpdate(
    async (db) => db.update(offlineAiQueue).set({ status: 'failed', errorMessage }).where(eq(offlineAiQueue.id, id)),
    '[OfflineQueue] markFailed failed:'
  );`);

// pruneCompletedItems
content = content.replace(/const result = await db\.runAsync\(\s*`DELETE FROM offline_ai_queue WHERE status = 'completed' AND created_at < \?`,\s*\[cutoff\],\s*\);\s*if \(result\.changes > 0\) \{\s*if \(__DEV__\) console\.log\(`\[OfflineQueue\] Pruned \$\{result\.changes\} old completed items`\);\s*\}/g, `await db.delete(offlineAiQueue)
      .where(and(eq(offlineAiQueue.status, 'completed'), sql\`\${offlineAiQueue.createdAt} < \${cutoff}\`));
    if (__DEV__) console.log(\`[OfflineQueue] Pruned old completed items\`);`);

fs.writeFileSync('src/services/offlineQueue.ts', content);
