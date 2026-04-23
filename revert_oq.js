const fs = require('fs');

let oqs = fs.readFileSync('src/services/offlineQueueService.ts', 'utf-8');
oqs = oqs.replace(/import \{ getDrizzleDb \} from '\.\.\/db\/drizzle';\nimport \{ offlineAiQueue \} from '\.\.\/db\/drizzleSchema';\nimport \{ showToast \} from '\.\.\/components\/notificationService';\nimport \{ eq, asc, lt \} from 'drizzle-orm';/g, "import { getDb } from '../db/database';\nimport { showToast } from '../components/notificationService';");

oqs = oqs.replace(/const db = getDrizzleDb\(\);\s*\/\/ Insert the operation\s*const result = await db\.insert\(offlineAiQueue\)\.values\(\{\s*requestType: type,\s*payload: JSON\.stringify\(payload\),\s*createdAt: Date\.now\(\),\s*attempts: 0,\s*status: 'pending'\s*\}\)\.returning\(\{ id: offlineAiQueue\.id \}\);\s*showToast\(\{\s*message: `Operation queued for offline processing`,\s*variant: 'info',\s*\}\);\s*return result\[0\]\.id;/g, `const db = getDb();
  
  // Create offline_queue table if it doesn't exist
  await db.runAsync(
    \`CREATE TABLE IF NOT EXISTS offline_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      attempts INTEGER DEFAULT 0,
      lastAttempt INTEGER
    )\`
  );
  
  // Insert the operation
  const result = await db.runAsync(
    \`INSERT INTO offline_queue (type, payload, createdAt, attempts)
     VALUES (?, ?, ?, ?)\`,
    [type, JSON.stringify(payload), Date.now(), 0]
  );
  
  showToast({
    message: \`Operation queued for offline processing\`,
    variant: 'info',
  });
  
  return result.lastInsertRowId;`);

const procReg = /const db = getDrizzleDb\(\);\s*\/\/ Get pending operations \(not yet attempted or with attempts < max\)\s*const pending = await db\.select\(\)\s*\.from\(offlineAiQueue\)\s*\.where\(lt\(offlineAiQueue\.attempts, 3\)\)\s*\.orderBy\(asc\(offlineAiQueue\.createdAt\)\);/g;
oqs = oqs.replace(procReg, `const db = getDb();
  
  // Get pending operations (not yet attempted or with attempts < max)
  const pending = (await db.getAllAsync(
    \`SELECT * FROM offline_queue WHERE attempts < 3 ORDER BY createdAt ASC\`
  )) as OfflineQueueItem[];`);

oqs = oqs.replace(/await db\.delete\(offlineAiQueue\)\.where\(eq\(offlineAiQueue\.id, item\.id\)\);/g, "await db.runAsync(`DELETE FROM offline_queue WHERE id = ?`, [item.id ?? null]);");

oqs = oqs.replace(/await db\.update\(offlineAiQueue\)\s*\.set\(\{ \s*attempts: \(item\.attempts \|\| 0\) \+ 1, \s*lastAttemptAt: Date\.now\(\) \s*\}\)\s*\.where\(eq\(offlineAiQueue\.id, item\.id\)\);/g, "await db.runAsync(`UPDATE offline_queue SET attempts = attempts + 1, lastAttempt = ? WHERE id = ?`, [Date.now(), item.id ?? null]);");

oqs = oqs.replace(/const db = getDrizzleDb\(\);\s*const items = await db\.select\(\)\.from\(offlineAiQueue\)\.orderBy\(asc\(offlineAiQueue\.createdAt\)\);\s*return items\.map\(\(item\) => \(\{\s*id: item\.id,\s*type: item\.requestType,\s*attempts: item\.attempts \|\| 0,\s*createdAt: item\.createdAt,\s*lastAttempt: item\.lastAttemptAt \?\? undefined,\s*payload: JSON\.parse\(item\.payload\),\s*\}\)\);/g, `const db = getDb();
  const items = (await db.getAllAsync(
    \`SELECT * FROM offline_queue ORDER BY createdAt ASC\`
  )) as OfflineQueueItem[];

  return items.map((item) => ({
    ...item,
    payload: JSON.parse(item.payload as string),
  }));`);

oqs = oqs.replace(/const db = getDrizzleDb\(\);\s*await db\.delete\(offlineAiQueue\);/g, "const db = getDb();\n  await db.runAsync(`DELETE FROM offline_queue`);");

// Ensure item.requestType becomes item.type in processOfflineQueue
oqs = oqs.replace(/item\.requestType/g, "item.type");

fs.writeFileSync('src/services/offlineQueueService.ts', oqs);
