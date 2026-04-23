const fs = require('fs');

let content = fs.readFileSync('src/services/lecture/persistence.ts', 'utf-8');

// put back runInTransaction
content = content.replace(/import \{ getDrizzleDb \} from '\.\.\/\.\.\/db\/drizzle';\nimport \{ subjects, lectureNotes, externalAppLogs \} from '\.\.\/\.\.\/db\/drizzleSchema';\nimport \{ sql, eq \} from 'drizzle-orm';\nconst nowTs = \(\) => Date\.now\(\);/g, "import { getDrizzleDb } from '../../db/drizzle';\nimport { runInTransaction, nowTs } from '../../db/database';\nimport { subjects, lectureNotes, externalAppLogs } from '../../db/drizzleSchema';\nimport { sql, eq } from 'drizzle-orm';");

content = content.replace(/const noteId = await db\.transaction\(async \(tx\) => \{/g, 'const noteId = await runInTransaction(async (txDb) => {');
content = content.replace(/const result = await db\.transaction\(async \(tx\) => \{/g, 'const result = await runInTransaction(async (txDb) => {');

// tx is now txDb, but the variables inside are tx...
// Let's replace the (txDb) back to (tx) so the inner code works
content = content.replace(/const noteId = await runInTransaction\(async \(txDb\) => \{/g, 'const noteId = await runInTransaction(async () => {');
content = content.replace(/const result = await runInTransaction\(async \(txDb\) => \{/g, 'const result = await runInTransaction(async () => {');
content = content.replace(/await markTopicsFromLecture\(\s*tx,/g, 'await markTopicsFromLecture(\n          {},');
content = content.replace(/await addXpInTx\(tx,/g, 'await addXpInTx({},');
content = content.replace(/await tx\.insert/g, 'await getDrizzleDb().insert');
content = content.replace(/await tx\.update/g, 'await getDrizzleDb().update');

fs.writeFileSync('src/services/lecture/persistence.ts', content);
