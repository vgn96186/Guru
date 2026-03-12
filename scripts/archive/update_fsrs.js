const fs = require('fs');

let schema = fs.readFileSync('../src/db/schema.ts', 'utf-8');
const fsrsCols = `
  , fsrs_due TEXT
  , fsrs_stability REAL DEFAULT 0
  , fsrs_difficulty REAL DEFAULT 0
  , fsrs_elapsed_days INTEGER DEFAULT 0
  , fsrs_scheduled_days INTEGER DEFAULT 0
  , fsrs_reps INTEGER DEFAULT 0
  , fsrs_lapses INTEGER DEFAULT 0
  , fsrs_state INTEGER DEFAULT 0
  , fsrs_last_review TEXT
`;
schema = schema.replace(/user_notes TEXT NOT NULL DEFAULT ''/, "user_notes TEXT NOT NULL DEFAULT ''" + fsrsCols);
fs.writeFileSync('../src/db/schema.ts', schema);

let db = fs.readFileSync('../src/db/database.ts', 'utf-8');
const alterFsrs = `
  try {
    await db.execAsync("ALTER TABLE topic_progress ADD COLUMN fsrs_due TEXT;");
    await db.execAsync("ALTER TABLE topic_progress ADD COLUMN fsrs_stability REAL DEFAULT 0;");
    await db.execAsync("ALTER TABLE topic_progress ADD COLUMN fsrs_difficulty REAL DEFAULT 0;");
    await db.execAsync("ALTER TABLE topic_progress ADD COLUMN fsrs_elapsed_days INTEGER DEFAULT 0;");
    await db.execAsync("ALTER TABLE topic_progress ADD COLUMN fsrs_scheduled_days INTEGER DEFAULT 0;");
    await db.execAsync("ALTER TABLE topic_progress ADD COLUMN fsrs_reps INTEGER DEFAULT 0;");
    await db.execAsync("ALTER TABLE topic_progress ADD COLUMN fsrs_lapses INTEGER DEFAULT 0;");
    await db.execAsync("ALTER TABLE topic_progress ADD COLUMN fsrs_state INTEGER DEFAULT 0;");
    await db.execAsync("ALTER TABLE topic_progress ADD COLUMN fsrs_last_review TEXT;");
    console.log("Added FSRS columns");
  } catch(e) {}
`;
db = db.replace('console.log("Added is_flagged column");', 'console.log("Added is_flagged column");' + alterFsrs);
fs.writeFileSync('../src/db/database.ts', db);
console.log('Database schema updated for FSRS');
