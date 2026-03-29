import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { ALL_SCHEMAS, DB_INDEXES } from './schema';
import { LATEST_VERSION, MIGRATIONS } from './migrations';
import { SUBJECTS_SEED, TOPICS_SEED } from '../constants/syllabus';
import { VAULT_TOPICS_SEED } from '../constants/vaultTopics';
import { MS_PER_DAY } from '../constants/time';
import { DEFAULT_INICET_DATE, DEFAULT_NEET_DATE } from '../config/appConfig';

let _db: SQLite.SQLiteDatabase | null = null;

/** Typed access to the global DB slot and init queue (survives hot reloads in dev). */
const _globalDb = global as unknown as {
  __GURU_DB__?: SQLite.SQLiteDatabase;
  __GURU_DB_INIT_QUEUE__?: Promise<void>;
};

if (!_globalDb.__GURU_DB_INIT_QUEUE__) {
  _globalDb.__GURU_DB_INIT_QUEUE__ = Promise.resolve();
}

export function getDb(): SQLite.SQLiteDatabase {
  const db = _db || _globalDb.__GURU_DB__;
  if (!db) throw new Error('DB not initialized — call initDatabase() first');
  return db;
}

/** Table name for AI cache (lives in main DB to avoid ATTACH issues on Android). */
export const SQL_AI_CACHE = 'ai_cache';

export function getAiCacheDb(): SQLite.SQLiteDatabase {
  return getDb();
}

export function resetAiCacheDbSingleton(): void {
  // No-op: AI cache now lives in the main DB. Kept for backward compatibility.
}

/** Clear the DB singleton (used before re-importing a backup). */
export function resetDbSingleton(): void {
  _db = null;
  _globalDb.__GURU_DB__ = undefined;
  _globalDb.__GURU_DB_INIT_QUEUE__ = Promise.resolve();
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

  if (typeof db.withExclusiveTransactionAsync === 'function') {
    let result!: T;
    await db.withExclusiveTransactionAsync(async () => {
      result = await fn(db);
    });
    return result;
  }

  // Fallback for older test environments
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
  const run = _globalDb.__GURU_DB_INIT_QUEUE__!.then(() => initDatabaseInternal(forceSeed));
  // Keep queue alive even if one init fails; callers still receive original rejection via `run`.
  _globalDb.__GURU_DB_INIT_QUEUE__ = run.catch(() => {});
  return run;
}

async function initDatabaseInternal(forceSeed = false): Promise<void> {
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

  // Always seed vault topics (idempotent — INSERT OR IGNORE)
  await seedVaultTopics(db);

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
          const msg = err?.message || '';
          if (msg.includes('duplicate column name')) {
            if (__DEV__)
              console.log(`[DB] Migration ${m.version} column already exists, skipping.`);
          } else if (
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

  // ── Defensive column verification ──────────────────────────────────────────
  // Handles desync caused by backup restores: the PRAGMA user_version may be
  // up-to-date while the actual schema is missing columns that the migration
  // runner would have added. We introspect all critical tables and add any
  // missing columns that the current schema expects.
  await ensureCriticalColumns(db);

  // Repair legacy rows before enforcing foreign keys on the shared connection.
  const integrityRepairs = [
    `DELETE FROM topic_progress WHERE topic_id NOT IN (SELECT id FROM topics)`,
    `DELETE FROM ${SQL_AI_CACHE} WHERE topic_id NOT IN (SELECT id FROM topics)`,
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

/**
 * Defensive schema verification for user_profile.
 * After migrations run, we introspect the actual table and add any columns
 * that the current code expects but that are missing — e.g. after restoring
 * a backup whose PRAGMA user_version was already high enough to skip the
 * ALTER TABLE migration.
 */
async function ensureCriticalColumns(db: SQLite.SQLiteDatabase): Promise<void> {
  // Every column that migrations or schema.ts adds to critical tables
  // Format: [columnName, "TYPE DEFAULT ..."]
  const tables: Record<string, [string, string][]> = {
    user_profile: [
      ['strict_mode_enabled', 'INTEGER DEFAULT 0'],
      ['streak_shield_available', 'INTEGER DEFAULT 1'],
      ['openrouter_key', "TEXT NOT NULL DEFAULT ''"],
      ['body_doubling_enabled', 'INTEGER NOT NULL DEFAULT 1'],
      ['blocked_content_types', "TEXT NOT NULL DEFAULT '[]'"],
      ['idle_timeout_minutes', 'INTEGER NOT NULL DEFAULT 2'],
      ['break_duration_minutes', 'INTEGER NOT NULL DEFAULT 5'],
      ['notification_hour', 'INTEGER NOT NULL DEFAULT 7'],
      ['focus_subject_ids', "TEXT NOT NULL DEFAULT '[]'"],
      ['focus_audio_enabled', 'INTEGER NOT NULL DEFAULT 0'],
      ['visual_timers_enabled', 'INTEGER NOT NULL DEFAULT 0'],
      ['face_tracking_enabled', 'INTEGER NOT NULL DEFAULT 0'],
      ['quiz_correct_count', 'INTEGER NOT NULL DEFAULT 0'],
      ['last_backup_date', 'TEXT'],
      ['guru_frequency', "TEXT NOT NULL DEFAULT 'normal'"],
      ['use_local_model', 'INTEGER NOT NULL DEFAULT 1'],
      ['local_model_path', 'TEXT'],
      ['use_local_whisper', 'INTEGER NOT NULL DEFAULT 1'],
      ['local_whisper_path', 'TEXT'],
      ['quick_start_streak', 'INTEGER NOT NULL DEFAULT 0'],
      ['groq_api_key', "TEXT NOT NULL DEFAULT ''"],
      ['study_resource_mode', "TEXT NOT NULL DEFAULT 'hybrid'"],
      ['subject_load_overrides_json', "TEXT NOT NULL DEFAULT '{}'"],
      ['inicet_date', `TEXT NOT NULL DEFAULT '${DEFAULT_INICET_DATE}'`],
      ['neet_date', `TEXT NOT NULL DEFAULT '${DEFAULT_NEET_DATE}'`],
      ['harassment_tone', "TEXT NOT NULL DEFAULT 'shame'"],
      ['backup_directory_uri', 'TEXT'],
      ['pomodoro_enabled', 'INTEGER NOT NULL DEFAULT 1'],
      ['pomodoro_interval_minutes', 'INTEGER NOT NULL DEFAULT 20'],
      ['huggingface_token', "TEXT NOT NULL DEFAULT ''"],
      ['huggingface_transcription_model', "TEXT NOT NULL DEFAULT 'openai/whisper-large-v3'"],
      ['transcription_provider', "TEXT NOT NULL DEFAULT 'auto'"],
      ['cloudflare_account_id', "TEXT NOT NULL DEFAULT ''"],
      ['cloudflare_api_token', "TEXT NOT NULL DEFAULT ''"],
      ['fal_api_key', "TEXT NOT NULL DEFAULT ''"],
      ['brave_search_api_key', "TEXT NOT NULL DEFAULT ''"],
      ['gemini_key', "TEXT NOT NULL DEFAULT ''"],
      ['guru_chat_default_model', "TEXT NOT NULL DEFAULT 'auto'"],
      ['guru_memory_notes', "TEXT NOT NULL DEFAULT ''"],
      ['image_generation_model', "TEXT NOT NULL DEFAULT 'auto'"],
      ['exam_type', "TEXT NOT NULL DEFAULT 'INICET'"],
      ['prefer_gemini_structured_json', 'INTEGER NOT NULL DEFAULT 1'],
      ['github_models_pat', "TEXT NOT NULL DEFAULT ''"],
      ['kilo_api_key', "TEXT NOT NULL DEFAULT ''"],
      ['deepseek_key', "TEXT NOT NULL DEFAULT ''"],
      ['agentrouter_key', "TEXT NOT NULL DEFAULT ''"],
      ['provider_order', "TEXT NOT NULL DEFAULT '[]'"],
    ],
    topics: [
      ['parent_topic_id', 'INTEGER REFERENCES topics(id) ON DELETE SET NULL'],
      ['embedding', 'BLOB'],
    ],
    topic_progress: [
      ['next_review_date', 'TEXT'],
      ['user_notes', "TEXT NOT NULL DEFAULT ''"],
      ['wrong_count', 'INTEGER NOT NULL DEFAULT 0'],
      ['is_nemesis', 'INTEGER NOT NULL DEFAULT 0'],
      ['fsrs_due', 'TEXT'],
      ['fsrs_stability', 'REAL DEFAULT 0'],
      ['fsrs_difficulty', 'REAL DEFAULT 0'],
      ['fsrs_elapsed_days', 'INTEGER DEFAULT 0'],
      ['fsrs_scheduled_days', 'INTEGER DEFAULT 0'],
      ['fsrs_reps', 'INTEGER DEFAULT 0'],
      ['fsrs_lapses', 'INTEGER DEFAULT 0'],
      ['fsrs_state', 'INTEGER DEFAULT 0'],
      ['fsrs_last_review', 'TEXT'],
    ],
    lecture_notes: [
      ['transcript', 'TEXT'],
      ['summary', 'TEXT'],
      ['topics_json', 'TEXT'],
      ['app_name', 'TEXT'],
      ['duration_minutes', 'INTEGER'],
      ['confidence', 'INTEGER DEFAULT 2'],
      ['embedding', 'BLOB'],
      ['recording_path', 'TEXT'],
      ['recording_duration_seconds', 'INTEGER'],
      ['transcription_confidence', 'REAL'],
      ['processing_metrics_json', 'TEXT'],
      ['retry_count', 'INTEGER DEFAULT 0'],
      ['last_error', 'TEXT'],
    ],
    external_app_logs: [
      ['recording_path', 'TEXT'],
      ['transcription_status', "TEXT DEFAULT 'pending'"],
      ['transcription_error', 'TEXT'],
      ['lecture_note_id', 'INTEGER REFERENCES lecture_notes(id) ON DELETE SET NULL'],
      ['note_enhancement_status', "TEXT DEFAULT 'pending'"],
      ['pipeline_metrics_json', 'TEXT'],
    ],
    chat_history: [
      ['sources_json', 'TEXT'],
      ['model_used', 'TEXT'],
      ['thread_id', 'INTEGER'],
    ],
    guru_chat_session_memory: [['thread_id', 'INTEGER']],
  };

  let totalAdded = 0;

  for (const [tableName, expectedCols] of Object.entries(tables)) {
    try {
      // Check if table exists before adding columns
      const tableCheck = await db.getFirstAsync<{ count: number }>(
        `SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='${tableName}'`,
      );
      if (!tableCheck || tableCheck.count === 0) continue;

      const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
      const existing = new Set(cols.map((c) => c.name));

      for (const [col, def] of expectedCols) {
        if (!existing.has(col)) {
          try {
            await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${col} ${def}`);
            totalAdded++;
            if (__DEV__) console.log(`[DB] Recovered missing column: ${tableName}.${col}`);
          } catch (err: any) {
            if (!err?.message?.includes('duplicate column name')) {
              if (__DEV__) console.error(`[DB] Failed to add column ${tableName}.${col}:`, err);
            }
          }
        }
      }
    } catch (err) {
      if (__DEV__) console.error(`[DB] Error ensuring columns for ${tableName}:`, err);
    }
  }

  if (totalAdded > 0 && !__DEV__) {
    console.log(`[DB] Recovered ${totalAdded} missing column(s) across standard tables`);
  }
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
