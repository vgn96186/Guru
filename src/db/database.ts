import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { ALL_SCHEMAS, DB_INDEXES } from './schema';
import { LATEST_VERSION, MIGRATIONS } from './migrations';
import { SUBJECTS_SEED, TOPICS_SEED } from '../constants/syllabus';
import { VAULT_TOPICS_SEED } from '../constants/vaultTopics';
import { generateEmbedding, embeddingToBlob } from '../services/ai/embeddingService';
import { MS_PER_DAY } from '../constants/time';

let _db: SQLite.SQLiteDatabase | null = null;

/** Typed access to the global DB slot (survives hot reloads in dev). */
const _globalDb = global as unknown as { __GURU_DB__?: SQLite.SQLiteDatabase };

export function getDb(): SQLite.SQLiteDatabase {
  const db = _db || _globalDb.__GURU_DB__;
  if (!db) throw new Error('DB not initialized — call initDatabase() first');
  return db;
}

/** Clear the DB singleton (used before re-importing a backup). */
export function resetDbSingleton(): void {
  _db = null;
  _globalDb.__GURU_DB__ = undefined;
}

/**
 * Inject a database instance for Node-based integration tests (see `src/db/testing/`).
 * Only available when `NODE_ENV === 'test'`.
 */
export function setDbForTests(db: SQLite.SQLiteDatabase | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setDbForTests is only available in test runs');
  }
  _db = db;
  _globalDb.__GURU_DB__ = db ?? undefined;
}

/**
 * Run multiple DB operations in a single transaction. On success commits; on throw rolls back.
 * Use for any multi-statement write that must be atomic.
 */
export async function runInTransaction<T>(
  fn: (db: SQLite.SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const db = getDb();
  const inTx = await db.isInTransactionAsync();
  if (inTx) {
    return fn(db);
  }
  await db.execAsync('BEGIN TRANSACTION');
  try {
    const result = await fn(db);
    await db.execAsync('COMMIT TRANSACTION');
    return result;
  } catch (e) {
    try {
      await db.execAsync('ROLLBACK TRANSACTION');
    } catch (rollbackErr) {
      if (__DEV__) console.warn('[DB] Rollback failed:', rollbackErr);
    }
    throw e;
  }
}

export async function initDatabase(forceSeed = false): Promise<void> {
  if (!_globalDb.__GURU_DB__ || forceSeed) {
    // ─── Database File Migration (Stale Filenames) ───────────────────────────
    const dbDir = FileSystem.documentDirectory + 'SQLite/';
    const oldDbPath = dbDir + 'study_guru.db';
    const newDbPath = dbDir + 'neet_study.db';

    try {
      const oldInfo = await FileSystem.getInfoAsync(oldDbPath);
      const newInfo = await FileSystem.getInfoAsync(newDbPath);

      if (oldInfo?.exists && !newInfo?.exists) {
        if (__DEV__) console.log('[DB] Migrating legacy study_guru.db to neet_study.db...');
        await FileSystem.makeDirectoryAsync(dbDir, { intermediates: true });
        await FileSystem.copyAsync({ from: oldDbPath, to: newDbPath });
      }
    } catch (err) {
      console.warn('[DB] Migration check failed:', err);
    }

    _db = await SQLite.openDatabaseAsync('neet_study.db');
    // Enable WAL mode for better concurrency (simultaneous reads and writes)
    await _db.execAsync('PRAGMA journal_mode = WAL');
    _globalDb.__GURU_DB__ = _db;

    // Migrate legacy public files to private storage on startup
    // DEPRECATED: Handled by lectureSessionMonitor scanAndRecoverOrphanedTranscripts
  } else {
    _db = _globalDb.__GURU_DB__;
  }

  const db = _db!;

  // Enable Foreign Key constraints
  await db.execAsync('PRAGMA foreign_keys = ON');

  // Create all tables
  for (const sql of ALL_SCHEMAS) {
    await db.execAsync(sql);
  }

  // Create performance indexes (IF NOT EXISTS — safe for existing installs)
  const staleIndexes = [
    'DROP INDEX IF EXISTS idx_tp_status_review',
    'DROP INDEX IF EXISTS idx_sessions_date',
  ];
  for (const sql of staleIndexes) {
    try {
      await db.execAsync(sql);
    } catch (err) {
      if (__DEV__) console.warn('[DB] Failed to drop stale index:', sql, err);
    }
  }

  for (const sql of DB_INDEXES) {
    try {
      await db.execAsync(sql);
    } catch (err) {
      if (__DEV__) console.warn('[DB] Failed to create index:', sql, err);
    }
  }

  // Check topic count BEFORE seeding subjects (to detect fresh install)
  const topicCountRes = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM topics',
  );
  const topicCount = topicCountRes?.count ?? 0;

  // Ensure all subjects exist on every boot (safe due to INSERT OR IGNORE)
  await seedSubjects(db);

  if (topicCount === 0 || forceSeed) {
    if (forceSeed) {
      await db.execAsync('DELETE FROM topic_progress');
      await db.execAsync('DELETE FROM topics');
      await db.execAsync('DELETE FROM subjects');
      await seedSubjects(db);
    }
    await seedTopics(db);
    await seedUserProfile(db);
  }

  // Always seed vault topics (idempotent — INSERT OR IGNORE)
  await seedVaultTopics(db);
  const topicCountAfterRes = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM topics',
  );

  // Versioned migrations — only run pending ones; fresh installs skip entirely
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = versionRow?.user_version ?? 0;

  if (topicCount === 0) {
    // Fresh install: schema already complete from CREATE TABLE; mark as up-to-date
    await db.execAsync(`PRAGMA user_version = ${LATEST_VERSION}`);
  } else {
    for (const m of MIGRATIONS) {
      if (m.version > currentVersion) {
        try {
          await db.execAsync(m.sql);
        } catch (err: any) {
          // Some migrations can be safely skipped when re-applying on partially-migrated DBs.
          const msg = err?.message || '';

          // If the column already exists, we can safely skip this migration step.
          if (msg.includes('duplicate column name')) {
            if (__DEV__)
              console.log(`[DB] Migration ${m.version} column already exists, skipping.`);
          }
          // v76: `daily_plan` → `daily_agenda` rename. If `daily_agenda` already exists,
          // the rename fails with "already another table or index with this name" but the
          // desired end-state is already present, so we treat it as applied.
          else if (
            m.version === 76 &&
            m.sql.includes('RENAME TO daily_agenda') &&
            msg.includes('already another table or index with this name')
          ) {
            if (__DEV__)
              console.log(
                `[DB] Migration ${m.version} already applied (daily_agenda exists), skipping.`,
              );
          } else {
            if (__DEV__) console.error('[DB] Migration failed:', m.version, m.sql, err);
            throw err;
          }
        }
        await db.execAsync(`PRAGMA user_version = ${m.version}`);
        try {
          await db.runAsync(
            'INSERT INTO migration_history (version, applied_at, description) VALUES (?, ?, ?)',
            [m.version, Math.floor(nowTs() / 1000), m.description ?? ''],
          );
        } catch {
          // migration_history exists only from v59 onward
        }
      }
    }
  }

  // Repair legacy rows before enforcing foreign keys on the shared connection.
  const integrityRepairs = [
    `DELETE FROM topic_progress WHERE topic_id NOT IN (SELECT id FROM topics)`,
    `DELETE FROM ai_cache WHERE topic_id NOT IN (SELECT id FROM topics)`,
    `UPDATE lecture_notes SET subject_id = NULL WHERE subject_id IS NOT NULL AND subject_id NOT IN (SELECT id FROM subjects)`,
    `UPDATE external_app_logs
       SET lecture_note_id = NULL
     WHERE lecture_note_id IS NOT NULL
       AND lecture_note_id NOT IN (SELECT id FROM lecture_notes)`,
    `UPDATE generated_study_images SET topic_id = NULL WHERE topic_id IS NOT NULL AND topic_id NOT IN (SELECT id FROM topics)`,
    `DELETE FROM generated_study_images WHERE lecture_note_id IS NOT NULL AND lecture_note_id NOT IN (SELECT id FROM lecture_notes)`,
    `DELETE FROM lecture_learned_topics WHERE topic_id NOT IN (SELECT id FROM topics) OR lecture_note_id NOT IN (SELECT id FROM lecture_notes)`,
    `UPDATE topic_suggestions SET approved_topic_id = NULL WHERE approved_topic_id IS NOT NULL AND approved_topic_id NOT IN (SELECT id FROM topics)`,
    `DELETE FROM topic_suggestions WHERE subject_id NOT IN (SELECT id FROM subjects)`,
  ];
  for (const sql of integrityRepairs) {
    try {
      await db.execAsync(sql);
    } catch (err) {
      if (__DEV__) console.warn('[DB] Integrity repair failed:', sql, err);
    }
  }

  // Ensure all topics (including vault seeds) have a progress row
  await db.execAsync('INSERT OR IGNORE INTO topic_progress (topic_id) SELECT id FROM topics');

  await db.execAsync('PRAGMA foreign_keys = ON');

  // Ensure user_profile row exists
  const profile = await db.getFirstAsync<{ id: number; groq_api_key: string | null }>(
    'SELECT id, groq_api_key FROM user_profile WHERE id = 1',
  );
  if (!profile) {
    await seedUserProfile(db);
  }

  // Update streak on open
  await updateStreakOnOpen(db);

  // Pre-seed missing topic embeddings in background
  seedMissingTopicEmbeddings(db).catch((e) => {
    if (__DEV__) console.warn('[DB] Embedding pre-seed failed:', e);
  });
}

/**
 * Background task to fill in missing embeddings for syllabus topics.
 * Processes in small batches to avoid blocking.
 */
async function seedMissingTopicEmbeddings(db: SQLite.SQLiteDatabase) {
  const rows = await db.getAllAsync<{ id: number; name: string }>(
    'SELECT id, name FROM topics WHERE embedding IS NULL LIMIT 20',
  );
  if (rows.length === 0) return;

  if (__DEV__) console.log(`[DB] Pre-seeding ${rows.length} topic embeddings...`);

  for (const row of rows) {
    try {
      const vec = await generateEmbedding(row.name);
      if (!vec) continue;
      await db.runAsync('UPDATE topics SET embedding = ? WHERE id = ?', [
        embeddingToBlob(vec),
        row.id,
      ]);
    } catch (e) {
      if (__DEV__) console.warn(`[DB] Failed to embed topic ${row.name}:`, e);
    }
  }
}

/**
 * Re-run vault topic seeding without destructive wipes.
 * Safe for manual "sync" actions from the UI.
 */
export async function syncVaultSeedTopics(): Promise<void> {
  const db = getDb();
  await seedTopics(db);
  await seedVaultTopics(db);
  await db.execAsync('INSERT OR IGNORE INTO topic_progress (topic_id) SELECT id FROM topics');
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
  await runInTransaction(async (db) => {
    // Pass 1: Insert all topics without parent links (ensures parents exist)
    for (const [subjectId, name, priority, minutes] of TOPICS_SEED) {
      const result = await db.runAsync(
        `INSERT OR IGNORE INTO topics (subject_id, name, inicet_priority, estimated_minutes) VALUES (?, ?, ?, ?)`,
        [subjectId, name, priority, minutes],
      );
      if (result.lastInsertRowId > 0) {
        await db.runAsync(`INSERT OR IGNORE INTO topic_progress (topic_id) VALUES (?)`, [
          result.lastInsertRowId,
        ]);
      }
    }

    // Pass 2: Update parent links
    for (const [subjectId, name, priority, minutes, parentName] of TOPICS_SEED) {
      if (parentName) {
        const parent = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM topics WHERE subject_id = ? AND name = ?',
          [subjectId, parentName],
        );
        if (parent) {
          await db.runAsync(
            'UPDATE topics SET parent_topic_id = ? WHERE subject_id = ? AND name = ?',
            [parent.id, subjectId, name],
          );
        }
      }
    }
  });
}

async function seedVaultTopics(db: SQLite.SQLiteDatabase): Promise<void> {
  await runInTransaction(async (db) => {
    const vaultTopicIds: number[] = [];

    for (const [subjectId, name, priority, minutes] of VAULT_TOPICS_SEED) {
      const topicResult = await db.runAsync(
        `INSERT OR IGNORE INTO topics (subject_id, name, inicet_priority, estimated_minutes) VALUES (?, ?, ?, ?)`,
        [subjectId, name, priority, minutes],
      );

      let topicId = topicResult.lastInsertRowId;
      if (topicResult.changes === 0) {
        const existingTopic = await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM topics WHERE subject_id = ? AND name = ?`,
          [subjectId, name],
        );
        if (existingTopic) {
          topicId = existingTopic.id;
        }
      }

      if (topicId) {
        vaultTopicIds.push(topicId);
        await db.runAsync(`INSERT OR IGNORE INTO topic_progress (topic_id) VALUES (?)`, [topicId]);
      }
    }

    if (vaultTopicIds.length > 0) {
      const placeholders = vaultTopicIds.map(() => '?').join(',');
      await db.runAsync(
        `UPDATE topic_progress SET status = 'seen' WHERE topic_id IN (${placeholders}) AND status = 'unseen'`,
        vaultTopicIds,
      );
      await db.runAsync(
        `UPDATE topic_progress SET confidence = 1 WHERE topic_id IN (${placeholders}) AND confidence = 0`,
        vaultTopicIds,
      );
    }
  });
}

async function seedUserProfile(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.runAsync(`INSERT OR IGNORE INTO user_profile (id) VALUES (1)`);
}

async function updateStreakOnOpen(db: SQLite.SQLiteDatabase): Promise<void> {
  const today = todayStr();
  const profile = await db.getFirstAsync<{
    last_active_date: string | null;
    streak_current: number;
    streak_best: number;
  }>('SELECT last_active_date, streak_current, streak_best FROM user_profile WHERE id = 1');
  if (!profile) return;

  const last = profile.last_active_date;
  if (last && last !== today) {
    const yesterday = dateStr(new Date(Date.now() - MS_PER_DAY));
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
