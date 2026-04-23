const fs = require('fs');

function replaceFile(path, replacer) {
  if (fs.existsSync(path)) {
    let content = fs.readFileSync(path, 'utf-8');
    content = replacer(content);
    fs.writeFileSync(path, content);
  }
}

// aiCache.ts
replaceFile('src/db/queries/aiCache.ts', (content) => {
  content = content.replace(/import \{ getDrizzleDb \} from '\.\.\/drizzle';/g, "import { getDrizzleDb } from '../drizzle';\nimport { runInTransaction } from '../database';");
  content = content.replace(/await db\.transaction\(async \(tx\) => \{/g, 'await runInTransaction(async (txDb) => {');
  // tx usage inside
  content = content.replace(/tx\.insert/g, 'getDrizzleDb().insert');
  content = content.replace(/tx\.update/g, 'getDrizzleDb().update');
  return content;
});

// sessionsRepository.drizzle.ts
replaceFile('src/db/repositories/sessionsRepository.drizzle.ts', (content) => {
  content = content.replace(/import \{ getDrizzleDb \} from '\.\.\/drizzle';/g, "import { getDrizzleDb } from '../drizzle';\nimport { runInTransaction } from '../database';");
  content = content.replace(/await db\.transaction\(async \(tx\) => \{/g, 'await runInTransaction(async () => {');
  content = content.replace(/tx\.insert/g, 'getDrizzleDb().insert');
  content = content.replace(/tx\.update/g, 'getDrizzleDb().update');
  content = content.replace(/tx\.select/g, 'getDrizzleDb().select');
  return content;
});

// questionBankRepository.drizzle.ts
replaceFile('src/db/repositories/questionBankRepository.drizzle.ts', (content) => {
  content = content.replace(/import \{ getDrizzleDb \} from '\.\.\/drizzle';/g, "import { getDrizzleDb } from '../drizzle';\nimport { runInTransaction } from '../database';");
  content = content.replace(/return db\.transaction\(async \(tx\) => \{/g, 'return runInTransaction(async () => {');
  content = content.replace(/await db\.transaction\(async \(tx\) => \{/g, 'await runInTransaction(async () => {');
  content = content.replace(/tx\.insert/g, 'getDrizzleDb().insert');
  content = content.replace(/tx\.update/g, 'getDrizzleDb().update');
  content = content.replace(/tx\.delete/g, 'getDrizzleDb().delete');
  return content;
});

// persistence.ts (we fixed this earlier but let's check it uses runInTransaction instead of db.transaction)
replaceFile('src/services/lecture/persistence.ts', (content) => {
  content = content.replace(/const noteId = await db\.transaction\(async \(tx\) => \{/g, 'const noteId = await runInTransaction(async (txDb) => {');
  content = content.replace(/const result = await db\.transaction\(async \(tx\) => \{/g, 'const result = await runInTransaction(async (txDb) => {');
  // It passes tx to markTopicsFromLecture, so let's import getDrizzleDb and use it
  content = content.replace(/await markTopicsFromLecture\(\s*tx,/g, 'await markTopicsFromLecture(\n          txDb,');
  content = content.replace(/await addXpInTx\(tx,/g, 'await addXpInTx(txDb,');
  content = content.replace(/const result = await tx\.insert/g, 'const result = await getDrizzleDb().insert');
  content = content.replace(/await tx\.update/g, 'await getDrizzleDb().update');
  content = content.replace(/const insertResult = await tx\.insert/g, 'const insertResult = await getDrizzleDb().insert');
  return content;
});

// Let's add runInTransaction import to persistence.ts if missing
replaceFile('src/services/lecture/persistence.ts', (content) => {
  if (!content.includes('runInTransaction')) {
    content = content.replace(/import \{ getDrizzleDb \} from '\.\.\/\.\.\/db\/drizzle';/, "import { getDrizzleDb } from '../../db/drizzle';\nimport { runInTransaction } from '../../db/database';");
  }
  return content;
});

