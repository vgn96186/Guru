import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from './drizzle-migrations/migrations';
import { SUBJECTS_SEED } from '../constants/syllabus';
import { VAULT_TOPICS_SEED } from '../constants/vaultTopics';
import { MS_PER_DAY } from '../constants/time';
import { DEFAULT_INICET_DATE, DEFAULT_NEET_DATE } from '../config/appConfig';

export const DB_NAME = 'neet_study.db';
export const DB_DIR = `${FileSystem.documentDirectory}SQLite`;
export const DB_PATH = `${DB_DIR}/${DB_NAME}`;

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

/**
 * Flush WAL journal into the main DB file. Call before copying the .db file
 * to ensure all committed writes are in the main file, not stranded in -wal.
 *
 * Retries on SQLITE_BUSY / "database is locked" — startup can overlap this
 * with notification refresh, AI prefetch, and other readers/writers.
 */
export async function walCheckpoint(): Promise<void> {
  const db = getDb();
  const maxAttempts = 6;
  const baseDelayMs = 350;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
      return;
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
      const retryable = msg.includes('locked') || msg.includes('busy');
      if (!retryable || attempt === maxAttempts) throw e;
      await new Promise<void>((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    }
  }
}

/**
 * Gracefully close the DB. Prefers async close (lets pending statements finalize)
 * over sync close (which throws if statements are in-flight).
 */
export async function closeDbGracefully(): Promise<void> {
  const db = getDb();
  if (typeof db.closeAsync === 'function') {
    await db.closeAsync();
  } else {
    db.closeSync();
  }
}

/** Clear the DB singleton (used before re-importing a backup). */
export function resetDbSingleton(): void {
  _db = null;
  _globalDb.__GURU_DB__ = undefined;
  _globalDb.__GURU_DB_INIT_QUEUE__ = Promise.resolve();
  // Also reset the Drizzle singleton so it doesn't hold a stale connection
  // Lazy import to avoid circular dependency at module load time
  require('./drizzle').resetDrizzleDb();
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
    const dbDir = DB_DIR + '/';
    const oldDbPath = dbDir + 'study_guru.db';
    const newDbPath = DB_PATH;

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

    _db = await SQLite.openDatabaseAsync(DB_NAME);
    // Enable WAL mode for better concurrency (simultaneous reads and writes)
    await _db.execAsync('PRAGMA journal_mode = WAL');
    await _db.execAsync('PRAGMA busy_timeout = 5000');
    _globalDb.__GURU_DB__ = _db;
  } else {
    _db = _globalDb.__GURU_DB__;
  }

  const db = _db!;

  // Enable Foreign Key constraints
  await db.execAsync('PRAGMA foreign_keys = ON');

  // Check topic count BEFORE seeding subjects (to detect fresh install)
  const topicCountRes = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='topics'",
  );
  const _isFresh = topicCountRes?.count === 0;

  // Run Drizzle migrations
  try {
    const { getDrizzleDb } = require('./drizzle');
    await migrate(getDrizzleDb(), migrations);
  } catch (migErr) {
    console.error('[DB] Drizzle migration failed:', migErr);
  }

  // Ensure all subjects exist on every boot (safe due to INSERT OR IGNORE)
  await seedSubjects(db);

  const topicCountValRes = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM topics',
  );
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

  // Always seed vault topics (idempotent — INSERT OR IGNORE)
  await seedVaultTopics(db);

  // Defensive column check for edge cases (only when DB version is older than expected)
  const currentVersion = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const DRIZZLE_MIGRATION_VERSION = 7;
  if ((currentVersion?.user_version ?? 0) < DRIZZLE_MIGRATION_VERSION) {
    await ensureCriticalColumns(db);
  }

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

/** Exported for `src/db/seedTopics.db.test.ts`. Not part of the app API. */
export async function seedSubjects(db: SQLite.SQLiteDatabase): Promise<void> {
  for (const s of SUBJECTS_SEED) {
    await db.runAsync(
      `INSERT OR IGNORE INTO subjects (id, name, short_code, color_hex, inicet_weight, neet_weight, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.name, s.shortCode, s.colorHex, s.inicetWeight, s.neetWeight, s.displayOrder],
    );
  }
}

/**
 * Batch size for multi-VALUES INSERTs. SQLite's default SQLITE_MAX_VARIABLE_NUMBER
 * is 999; a topic row binds 4 params, so the upper bound is 249. We use 200
 * for headroom and to keep SQL text size modest.
 */
const SEED_INSERT_CHUNK = 200;

/** Exported for `src/db/seedTopics.db.test.ts`. Not part of the app API. */
export async function seedTopics(_db: SQLite.SQLiteDatabase): Promise<void> {
  // Lazy import: TOPICS_SEED (~14,780 rows, loaded from 19 JSON assets) is
  // only needed here. On normal cold starts (topicCount > 0) this module
  // never loads, keeping the JS heap smaller.
  const { TOPICS_SEED } = await import('../constants/syllabus/topics');
  await runInTransaction(async (db) => {
    // Pass 1: Insert all topics without parent links (ensures parents exist).
    // Batched multi-VALUES INSERTs to minimize JS↔native bridge crossings.
    for (let i = 0; i < TOPICS_SEED.length; i += SEED_INSERT_CHUNK) {
      const chunk = TOPICS_SEED.slice(i, i + SEED_INSERT_CHUNK);
      const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
      const params: (string | number)[] = [];
      for (const [subjectId, name, priority, minutes] of chunk) {
        params.push(subjectId, name, priority, minutes);
      }
      await db.runAsync(
        `INSERT OR IGNORE INTO topics (subject_id, name, inicet_priority, estimated_minutes) VALUES ${placeholders}`,
        params,
      );
    }

    // Bulk-insert progress rows for any topic that doesn't already have one.
    // Equivalent to the previous per-row `INSERT OR IGNORE` inside pass 1,
    // but in a single statement. (Same pattern `syncVaultSeedTopics` uses.)
    await db.execAsync(`INSERT OR IGNORE INTO topic_progress (topic_id) SELECT id FROM topics`);

    // Pass 2: Optimized parent linking (bulk repair).
    // A temp table maps (subject_id, name) → parent_name so the final UPDATE
    // can resolve every parent_topic_id in one query.
    await db.execAsync(
      'CREATE TEMP TABLE IF NOT EXISTS tmp_parent_mapping (subject_id INTEGER, name TEXT, parent_name TEXT)',
    );
    await db.execAsync('DELETE FROM tmp_parent_mapping');

    // Batched multi-VALUES INSERTs for the parent mapping.
    const withParent = TOPICS_SEED.filter((t) => t[4] !== undefined) as Array<
      [number, string, number, number, string]
    >;
    for (let i = 0; i < withParent.length; i += SEED_INSERT_CHUNK) {
      const chunk = withParent.slice(i, i + SEED_INSERT_CHUNK);
      const placeholders = chunk.map(() => '(?, ?, ?)').join(', ');
      const params: (string | number)[] = [];
      for (const [sid, name, , , pName] of chunk) {
        params.push(sid, name, pName);
      }
      await db.runAsync(
        `INSERT INTO tmp_parent_mapping (subject_id, name, parent_name) VALUES ${placeholders}`,
        params,
      );
    }

    // Single-query bulk update: sets parent_topic_id for all unlinked children in one shot
    await db.execAsync(`
      UPDATE topics
      SET parent_topic_id = (
        SELECT p.id 
        FROM topics p
        JOIN tmp_parent_mapping m ON p.name = m.parent_name AND p.subject_id = m.subject_id
        WHERE m.name = topics.name AND m.subject_id = topics.subject_id
      )
      WHERE parent_topic_id IS NULL 
        AND EXISTS (SELECT 1 FROM tmp_parent_mapping m WHERE m.name = topics.name AND m.subject_id = topics.subject_id)
    `);

    await db.execAsync('DROP TABLE tmp_parent_mapping');
  });
}

async function seedVaultTopics(_db: SQLite.SQLiteDatabase): Promise<void> {
  await runInTransaction(async (db) => {
    // Batch insert all vault topics in one statement
    if (VAULT_TOPICS_SEED.length === 0) return;

    const placeholders = VAULT_TOPICS_SEED.map(() => '(?, ?, ?, ?)').join(',');
    const values = VAULT_TOPICS_SEED.flatMap(([subjectId, name, priority, minutes]) => [
      subjectId,
      name,
      priority,
      minutes,
    ]);
    await db.runAsync(
      `INSERT OR IGNORE INTO topics (subject_id, name, inicet_priority, estimated_minutes) VALUES ${placeholders}`,
      values,
    );

    // Create topic_progress rows for vault topics that don't have one yet.
    // Use a temp table of (subject_id, name) pairs to match exactly.
    await db.execAsync(
      `CREATE TEMP TABLE IF NOT EXISTS tmp_vault_keys (subject_id INTEGER NOT NULL, name TEXT NOT NULL)`,
    );
    await db.execAsync(`DELETE FROM tmp_vault_keys`);
    const keyPlaceholders = VAULT_TOPICS_SEED.map(() => '(?, ?)').join(',');
    const keyValues = VAULT_TOPICS_SEED.flatMap(([subjectId, name]) => [subjectId, name]);
    await db.runAsync(
      `INSERT INTO tmp_vault_keys (subject_id, name) VALUES ${keyPlaceholders}`,
      keyValues,
    );
    await db.runAsync(
      `INSERT OR IGNORE INTO topic_progress (topic_id, status, confidence)
       SELECT t.id, 'seen', 1
       FROM topics t
       INNER JOIN tmp_vault_keys vk ON vk.subject_id = t.subject_id AND vk.name = t.name
       WHERE NOT EXISTS (SELECT 1 FROM topic_progress tp WHERE tp.topic_id = t.id)`,
    );
    await db.execAsync(`DROP TABLE tmp_vault_keys`);
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
export async function ensureCriticalColumns(db: SQLite.SQLiteDatabase): Promise<void> {
  // Every column that migrations or schema.ts adds to critical tables
  // Format: [columnName, "TYPE DEFAULT ..."]
  const tables: Record<string, [string, string][]> = {
    user_profile: [
      ['strict_mode_enabled', 'INTEGER DEFAULT 0'],
      ['doomscroll_shield_enabled', 'INTEGER NOT NULL DEFAULT 1'],
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
      ['use_nano', 'INTEGER NOT NULL DEFAULT 1'],
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
      ['google_custom_search_api_key', "TEXT NOT NULL DEFAULT ''"],
      ['qwen_connected', 'INTEGER NOT NULL DEFAULT 0'],
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
      ['deepgram_api_key', "TEXT NOT NULL DEFAULT ''"],
      ['api_validation_json', "TEXT NOT NULL DEFAULT '{}'"],
      ['chatgpt_connected', 'INTEGER NOT NULL DEFAULT 0'],
      [
        'chatgpt_accounts_json',
        `TEXT NOT NULL DEFAULT '{"primary":{"enabled":true,"connected":false},"secondary":{"enabled":false,"connected":false}}'`,
      ],
      ['auto_backup_frequency', "TEXT NOT NULL DEFAULT 'off'"],
      ['last_auto_backup_at', 'TEXT'],
      ['jina_api_key', "TEXT NOT NULL DEFAULT ''"],
      ['github_copilot_connected', 'INTEGER NOT NULL DEFAULT 0'],
      ['github_copilot_preferred_model', "TEXT NOT NULL DEFAULT ''"],
      ['gitlab_duo_connected', 'INTEGER NOT NULL DEFAULT 0'],
      ['gitlab_oauth_client_id', "TEXT NOT NULL DEFAULT ''"],
      ['gitlab_duo_preferred_model', "TEXT NOT NULL DEFAULT ''"],
      ['poe_connected', 'INTEGER NOT NULL DEFAULT 0'],
      ['gdrive_web_client_id', "TEXT NOT NULL DEFAULT ''"],
      ['gdrive_connected', 'INTEGER NOT NULL DEFAULT 0'],
      ['gdrive_email', "TEXT NOT NULL DEFAULT ''"],
      ['gdrive_last_sync_at', 'TEXT'],
      ['last_backup_device_id', "TEXT NOT NULL DEFAULT ''"],
      ['dbmci_class_start_date', 'TEXT'],
      ['btr_start_date', 'TEXT'],
      ['home_novelty_cooldown_hours', 'INTEGER NOT NULL DEFAULT 6'],
      ['disabled_providers', "TEXT NOT NULL DEFAULT '[]'"],
      ['loading_orb_style', "TEXT NOT NULL DEFAULT 'turbulent'"],
      ['vertex_ai_project', "TEXT NOT NULL DEFAULT ''"],
      ['vertex_ai_location', "TEXT NOT NULL DEFAULT ''"],
      ['vertex_ai_token', "TEXT NOT NULL DEFAULT ''"],
      ['auto_repair_legacy_notes_enabled', 'INTEGER NOT NULL DEFAULT 0'],
      ['scan_orphaned_transcripts_enabled', 'INTEGER NOT NULL DEFAULT 0'],
      ['samsungBatteryPromptShownAt', 'INTEGER DEFAULT 0'],
      ['orb_effect', "TEXT NOT NULL DEFAULT 'ripple'"],
    ],
    topics: [
      ['parent_topic_id', 'INTEGER REFERENCES topics(id) ON DELETE SET NULL'],
      ['embedding', 'BLOB'],
      // Virtual index for search optimization — created at boot via ensureCriticalColumns
      // (SQLite FTS is overkill for 15K rows; a simple computed index on LOWER(name) suffices)
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
    sessions: [
      ['cards_created', 'INTEGER DEFAULT 0'],
      ['nodes_created', 'INTEGER DEFAULT 0'],
    ],
    mind_map_nodes: [['explanation', 'TEXT']],
    mind_map_edges: [['is_cross_link', 'INTEGER NOT NULL DEFAULT 0']],
    chat_history: [
      ['sources_json', 'TEXT'],
      ['model_used', 'TEXT'],
      ['thread_id', 'INTEGER'],
    ],
    guru_chat_session_memory: [
      ['thread_id', 'INTEGER'],
      ['state_json', "TEXT NOT NULL DEFAULT '{}'"],
    ],
  };

  let totalAdded = 0;

  for (const [tableName, expectedCols] of Object.entries(tables)) {
    try {
      // Check if table exists before adding columns
      const tableCheck = await db.getFirstAsync<{ count: number }>(
        `SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name=?`,
        [tableName],
      );
      if (!tableCheck || tableCheck.count === 0) continue;

      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) continue;
      const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
      const existing = new Set(cols.map((c) => c.name));

      for (const [col, def] of expectedCols) {
        if (!existing.has(col)) {
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) continue;
          try {
            await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${col} ${def}`);
            totalAdded++;
            if (__DEV__) console.log(`[DB] Recovered missing column: ${tableName}.${col}`);
          } catch (err: unknown) {
            if (
              !(err instanceof Error ? err.message : String(err))?.includes('duplicate column name')
            ) {
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

  // ─── Search Optimization Indexes ─────────────────────────────────────────────
  // topics.name is queried with LOWER() LIKE — an index on subject_id+inicet_priority
  // speeds the JOIN + ORDER BY in SyllabusScreen search queries.
  // topics_search_subject_priority index covers:
  //   WHERE LOWER(name) LIKE ? → subject_id filter (idx_topics_subject)
  //   ORDER BY inicet_priority DESC → idx_topics_subject covers the subject scan
  // We add the composite index on (subject_id, inicet_priority) if not present.
  try {
    const db = _db!;
    const existingIndexes = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='topics'",
    );
    const existingSet = new Set(existingIndexes.map((r) => r.name));
    if (!existingSet.has('idx_topics_subject_priority')) {
      await db.execAsync(
        'CREATE INDEX IF NOT EXISTS idx_topics_subject_priority ON topics (subject_id, inicet_priority)',
      );
      if (__DEV__) console.log('[DB] Added idx_topics_subject_priority for search optimization');
    }
  } catch (err) {
    if (__DEV__) console.warn('[DB] Failed to add search index:', err);
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
