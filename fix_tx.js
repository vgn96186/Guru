const fs = require('fs');

let content = fs.readFileSync('src/services/lecture/persistence.ts', 'utf-8');

// remove runInTransaction import
content = content.replace(/import \{ getDb, nowTs, runInTransaction \} from '\.\.\/\.\.\/db\/database';/g, "import { getDrizzleDb } from '../../db/drizzle';\nimport { subjects, lectureNotes, externalAppLogs } from '../../db/drizzleSchema';\nimport { sql, eq } from 'drizzle-orm';\nconst nowTs = () => Date.now();");

// Replace runInTransaction with db.transaction
content = content.replace(/await runInTransaction\(async \(tx\) => \{/g, 'await db.transaction(async (tx) => {');

// Fix any getDb leftover
content = content.replace(/const db = getDb\(\);/g, 'const db = getDrizzleDb();');

fs.writeFileSync('src/services/lecture/persistence.ts', content);
