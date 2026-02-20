import * as SQLite from 'expo-sqlite';
import { ALL_SCHEMAS } from './schema';
import { SUBJECTS_SEED, TOPICS_SEED } from '../constants/syllabus';
import { VAULT_TOPICS_SEED } from '../constants/vaultTopics';

let _db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  // Check global for persistence across hot reloads in some environments
  const g = global as any;
  const db = _db || g.__GURU_DB__;
  if (!db) throw new Error('DB not initialized — call initDatabase() first');
  return db;
}

export async function initDatabase(forceSeed = false): Promise<void> {
  const g = global as any;
  // Use provided forceSeed parameter (default false)
  const actualForce = forceSeed; 
  
  if (g.__GURU_DB__ && !actualForce) {
    _db = g.__GURU_DB__;
    console.log('[DB] Using existing global DB instance');
    // We don't return here, we want to ensure tables and migrations are checked
  }

  if (!g.__GURU_DB__) {
    _db = await SQLite.openDatabaseAsync('neet_study.db');
    g.__GURU_DB__ = _db;
  } else {
    _db = g.__GURU_DB__;
  }

  const db = _db!;

  // Create all tables
  for (const sql of ALL_SCHEMAS) {
    await db.execAsync(sql);
  }

  // Ensure all subjects exist on every boot (safe due to INSERT OR IGNORE)
  await seedSubjects(db);

  // Seed topics if empty or forced
  const subjectCountRes = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM subjects');
  const subjectCount = subjectCountRes?.count ?? 0;

  if (subjectCount === 0 || actualForce) {
    console.log(`[DB] Seeding topics (force: ${actualForce})`);
    if (actualForce) {
      await db.execAsync('DELETE FROM topic_progress');
      await db.execAsync('DELETE FROM topics');
      await db.execAsync('DELETE FROM subjects');
      await seedSubjects(db);
    }
    await seedTopics(db);
    await seedUserProfile(db);
  } else {
    // Ensure user_profile row exists
    const profile = await db.getFirstAsync<{ id: number }>('SELECT id FROM user_profile WHERE id = 1');
    if (!profile) await seedUserProfile(db);
  }

  // Always seed vault topics (idempotent — INSERT OR IGNORE)
  await seedVaultTopics(db);
  const topicCountAfterRes = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM topics');
  console.log(`[DB] Topics count: ${topicCountAfterRes?.count ?? 0}`);

  // Schema migrations (safe — fail silently if column already exists)
  const migrations = [
    `ALTER TABLE topics ADD COLUMN parent_topic_id INTEGER REFERENCES topics(id)`,
    `ALTER TABLE topic_progress ADD COLUMN next_review_date TEXT`,
    `ALTER TABLE topic_progress ADD COLUMN user_notes TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE user_profile ADD COLUMN strict_mode_enabled INTEGER DEFAULT 0`,
    `ALTER TABLE user_profile ADD COLUMN always_ask_mood_on_launch INTEGER DEFAULT 1`,
    `ALTER TABLE user_profile ADD COLUMN openai_key TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE user_profile ADD COLUMN transcription_engine TEXT NOT NULL DEFAULT 'gemini'`,
    `ALTER TABLE external_app_logs ADD COLUMN recording_path TEXT`,
  ];
  for (const sql of migrations) {
    try { await db.execAsync(sql); } catch (_) { /* already exists */ }
  }

  // FIX: Ensure all topics (including vault seeds) have a progress row
  await db.execAsync('INSERT OR IGNORE INTO topic_progress (topic_id) SELECT id FROM topics');

  // Update streak on open
  await updateStreakOnOpen(db);
}

async function seedSubjects(db: SQLite.SQLiteDatabase): Promise<void> {
  for (const s of SUBJECTS_SEED) {
    await db.runAsync(
      `INSERT OR IGNORE INTO subjects (id, name, short_code, color_hex, inicet_weight, neet_weight, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.name, s.shortCode, s.colorHex, s.inicetWeight, s.neetWeight, s.displayOrder],
    );
  }
}

async function seedTopics(db: SQLite.SQLiteDatabase): Promise<void> {
  // Pass 1: Insert all topics without parent links (ensures parents exist)
  for (const [subjectId, name, priority, minutes] of TOPICS_SEED) {
    const result = await db.runAsync(
      `INSERT OR IGNORE INTO topics (subject_id, name, inicet_priority, estimated_minutes) VALUES (?, ?, ?, ?)`,
      [subjectId, name, priority, minutes],
    );
    if (result.lastInsertRowId > 0) {
      await db.runAsync(
        `INSERT OR IGNORE INTO topic_progress (topic_id) VALUES (?)`,
        [result.lastInsertRowId],
      );
    }
  }

  // Pass 2: Update parent links
  for (const [subjectId, name, priority, minutes, parentName] of TOPICS_SEED) {
    if (parentName) {
      const parent = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM topics WHERE subject_id = ? AND name = ?',
        [subjectId, parentName]
      );
      if (parent) {
        await db.runAsync(
          'UPDATE topics SET parent_topic_id = ? WHERE subject_id = ? AND name = ?',
          [parent.id, subjectId, name]
        );
      }
    }
  }
}

async function seedVaultTopics(db: SQLite.SQLiteDatabase): Promise<void> {
  let inserted = 0;
  let ignored = 0;
  const vaultTopicIds: number[] = [];

  for (const [subjectId, name, priority, minutes] of VAULT_TOPICS_SEED) {
    const topicResult = await db.runAsync(
      `INSERT OR IGNORE INTO topics (subject_id, name, inicet_priority, estimated_minutes) VALUES (?, ?, ?, ?)`,
      [subjectId, name, priority, minutes],
    );

    let topicId = topicResult.lastInsertRowId;
    if (topicResult.changes === 0) {
      // Topic already exists, retrieve its ID
      const existingTopic = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM topics WHERE subject_id = ? AND name = ?`,
        [subjectId, name]
      );
      if (existingTopic) {
        topicId = existingTopic.id;
        ignored++;
      }
    } else {
      inserted++;
    }

    if (topicId) { // Ensure we have a topicId
      vaultTopicIds.push(topicId);
      // Ensure progress row exists for new or existing topic, initially 'unseen'
      await db.runAsync(
        `INSERT OR IGNORE INTO topic_progress (topic_id) VALUES (?)`,
        [topicId],
      );
    }
  }

  // LEVEL 1: Obsidian Import (BTR Finished)
  // Update vault topics to at least 'seen' and confidence 1 if they are below that level.
  if (vaultTopicIds.length > 0) {
    const placeholders = vaultTopicIds.map(() => '?').join(',');
    
    // 1. Mark as 'seen' if currently 'unseen'
    await db.runAsync(
      `UPDATE topic_progress SET status = 'seen' WHERE topic_id IN (${placeholders}) AND status = 'unseen'`,
      vaultTopicIds
    );

    // 2. Set Confidence to 1 (Level 1) if currently 0
    // This signifies "BTR Finished" / Imported
    await db.runAsync(
      `UPDATE topic_progress SET confidence = 1 WHERE topic_id IN (${placeholders}) AND confidence = 0`,
      vaultTopicIds
    );

    // 3. Ensure "watched once" baseline is reflected in study counts
    await db.runAsync(
      `UPDATE topic_progress SET times_studied = 1 WHERE topic_id IN (${placeholders}) AND times_studied = 0`,
      vaultTopicIds
    );

    // 4. Set SRS-based review date: vault topics (seen once) should be reviewed in 3 days
    const reviewDate = dateStr(new Date(Date.now() + 3 * 86400000));
    await db.runAsync(
      `UPDATE topic_progress SET next_review_date = ? WHERE topic_id IN (${placeholders}) AND next_review_date IS NULL`,
      [reviewDate, ...vaultTopicIds]
    );

    // 5. Set last_studied_at timestamp if not already set (so progress stats pick them up)
    await db.runAsync(
      `UPDATE topic_progress SET last_studied_at = ? WHERE topic_id IN (${placeholders}) AND last_studied_at IS NULL`,
      [Date.now(), ...vaultTopicIds]
    );
  }
  console.log(`[DB] Vault Seed: ${inserted} inserted, ${ignored} ignored`);
}

async function seedUserProfile(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO user_profile (id) VALUES (1)`,
  );
}

async function updateStreakOnOpen(db: SQLite.SQLiteDatabase): Promise<void> {
  const today = todayStr();
  const profile = await db.getFirstAsync<{ last_active_date: string | null; streak_current: number; streak_best: number }>(
    'SELECT last_active_date, streak_current, streak_best FROM user_profile WHERE id = 1',
  );
  if (!profile) return;

  const last = profile.last_active_date;
  if (last && last !== today) {
    const yesterday = dateStr(new Date(Date.now() - 86400000));
    if (last !== yesterday) {
      // Streak broken
      await db.runAsync('UPDATE user_profile SET streak_current = 0 WHERE id = 1');
    }
  }
}

export function todayStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function nowTs(): number {
  return Date.now();
}
