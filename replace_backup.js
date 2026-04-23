const fs = require('fs');

let content = fs.readFileSync('src/services/jsonBackupService.ts', 'utf-8');

// Imports
content = content.replace(/import \{ getDb \} from '\.\.\/db\/database';/g, "import { getDb } from '../db/database';\nimport { getDrizzleDb } from '../db/drizzle';\nimport { subjects, topics, userProfile } from '../db/drizzleSchema';\nimport { sql, eq } from 'drizzle-orm';");

// exportJsonBackup subject/topic queries
content = content.replace(/const db = getDb\(\);\n  const \[subjects, topics\] = await Promise\.all\(\[\n    db\.getAllAsync<\s*\{\s*id:\s*number;\s*name:\s*string;\s*short_code:\s*string\s*\}\s*>\(\s*'SELECT id, name, short_code FROM subjects',\s*\),\n    db\.getAllAsync<\s*\{\s*id:\s*number;\s*name:\s*string;\s*subject_id:\s*number;\s*short_code:\s*string\s*\}\s*>\(\s*`SELECT t\.id, t\.name, t\.subject_id, s\.short_code\s*FROM topics t\s*JOIN subjects s ON t\.subject_id = s\.id`,\s*\),\n  \]\);/g, `const db = getDb();
  const drizzle = getDrizzleDb();
  const [subjectsRaw, topicsRaw] = await Promise.all([
    drizzle.select({ id: subjects.id, name: subjects.name, short_code: subjects.shortCode }).from(subjects),
    drizzle.select({ id: topics.id, name: topics.name, subject_id: topics.subjectId, short_code: subjects.shortCode })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id)),
  ]);
  const subjectsData = subjectsRaw;
  const topicsData = topicsRaw as Array<{ id: number; name: string; subject_id: number; short_code: string }>;`);

// The mapped variables are named `subjects` and `topics`, let's fix it by reusing those names
content = content.replace(/const subjectsData = subjectsRaw;\n  const topicsData = topicsRaw as Array<\s*\{\s*id:\s*number;\s*name:\s*string;\s*subject_id:\s*number;\s*short_code:\s*string\s*\}\s*>;/g, `const subjects = subjectsRaw;
  const topics = topicsRaw as Array<{ id: number; name: string; subject_id: number; short_code: string }>;`);

// importJsonBackup subject/topic queries
content = content.replace(/const \[subjects, topics\] = await Promise\.all\(\[\n    db\.getAllAsync<\s*\{\s*id:\s*number;\s*name:\s*string;\s*short_code:\s*string\s*\}\s*>\(\s*'SELECT id, name, short_code FROM subjects',\s*\),\n    db\.getAllAsync<\s*\{\s*id:\s*number;\s*name:\s*string;\s*subject_id:\s*number;\s*short_code:\s*string\s*\}\s*>\(\s*`SELECT t\.id, t\.name, t\.subject_id, s\.short_code\s*FROM topics t\s*JOIN subjects s ON t\.subject_id = s\.id`,\s*\),\n  \]\);/g, `const drizzle = getDrizzleDb();
  const [subjectsRaw, topicsRaw] = await Promise.all([
    drizzle.select({ id: subjects.id, name: subjects.name, short_code: subjects.shortCode }).from(subjects),
    drizzle.select({ id: topics.id, name: topics.name, subject_id: topics.subjectId, short_code: subjects.shortCode })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id)),
  ]);
  const subjects = subjectsRaw;
  const topics = topicsRaw as Array<{ id: number; name: string; subject_id: number; short_code: string }>;`);

// user profile update
content = content.replace(/await db\.runAsync\(`UPDATE user_profile SET \$\{setSql\} WHERE id = 1`, values\);/g, `// For user profile, since fields are dynamic based on backup, continue using raw query, but use Drizzle's sql if we want, but expo-sqlite is fine.
        await db.runAsync(\`UPDATE user_profile SET \$\{setSql\} WHERE id = 1\`, values);`);

fs.writeFileSync('src/services/jsonBackupService.ts', content);
