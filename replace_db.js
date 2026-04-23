const fs = require('fs');

let content = fs.readFileSync('src/db/database.ts', 'utf-8');

content = content.replace(/import \{ ALL_SCHEMAS, DB_INDEXES \} from '\.\/schema';\nimport \{ LATEST_VERSION, MIGRATIONS \} from '\.\/migrations';/g, "import { migrate } from 'drizzle-orm/expo-sqlite/migrator';\nimport migrations from './drizzle-migrations/migrations';\nimport { getDrizzleDb } from './drizzle';");

content = content.replace(/import \{ migrate \} from 'drizzle-orm\/expo-sqlite\/migrator';\nimport migrations from '\.\/drizzle-migrations\/migrations';\nimport \{ getDrizzleDb \} from '\.\/drizzle';/g, "import { migrate } from 'drizzle-orm/expo-sqlite/migrator';\nimport migrations from './drizzle-migrations/migrations';\nimport { getDrizzleDb } from './drizzle';");

// find `// Enable Foreign Key constraints` down to `// Always seed vault topics (idempotent — INSERT OR IGNORE)`
// replace the legacy schemas and migrations with Drizzle migrate
const replacePattern = /\/\/ Enable Foreign Key constraints[\s\S]*?\/\/ Always seed vault topics \(idempotent — INSERT OR IGNORE\)/;

const newBoot = `// Enable Foreign Key constraints
  await db.execAsync('PRAGMA foreign_keys = ON');

  // Check topic count BEFORE seeding subjects (to detect fresh install)
  const topicCountRes = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='topics'",
  );
  const isFresh = topicCountRes?.count === 0;

  // Run Drizzle migrations
  try {
    await migrate(getDrizzleDb(), migrations);
  } catch (migErr) {
    console.error('[DB] Drizzle migration failed:', migErr);
  }

  // Ensure all subjects exist on every boot (safe due to INSERT OR IGNORE)
  await seedSubjects(db);

  const topicCountValRes = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM topics');
  const topicCount = topicCountValRes?.count ?? 0;

  if (topicCount === 0 || forceSeed) {
    if (forceSeed) {
      await db.execAsync('PRAGMA foreign_keys = OFF');
      await db.execAsync('DELETE FROM topic_progress');
      await db.execAsync('DELETE FROM topics');
      await db.execAsync('DELETE FROM subjects');
      await db.execAsync('PRAGMA foreign_keys = ON');
      await seedSubjects(db);
    }
    await seedTopics(db);
    await seedUserProfile(db);
  }

  // Always seed vault topics (idempotent — INSERT OR IGNORE)`;

content = content.replace(replacePattern, newBoot);

// remove the PRAGMA user_version block
const removePattern = /\/\/ Versioned migrations — only run pending ones; fresh installs skip entirely[\s\S]*?ensureCriticalColumns\(db\);/g;

content = content.replace(removePattern, `// Defensive column check for edge cases
  await ensureCriticalColumns(db);`);

fs.writeFileSync('src/db/database.ts', content);
