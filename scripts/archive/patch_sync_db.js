const fs = require('fs');

let schema = fs.readFileSync('../src/db/schema.ts', 'utf-8');
if (!schema.includes('sync_code')) {
  schema = schema.replace(/last_active_date TEXT/, 'last_active_date TEXT,\n  sync_code TEXT');
  fs.writeFileSync('../src/db/schema.ts', schema);
}

let db = fs.readFileSync('../src/db/database.ts', 'utf-8');
if (!db.includes('sync_code')) {
  const alterCode = `
  try {
    await db.execAsync("ALTER TABLE user_profile ADD COLUMN sync_code TEXT;");
    console.log("Added sync_code column");
  } catch(e) {}
`;
  db = db.replace('console.log("Added FSRS columns");', 'console.log("Added FSRS columns");\n' + alterCode);
  fs.writeFileSync('../src/db/database.ts', db);
}
console.log('Database updated for sync_code');
