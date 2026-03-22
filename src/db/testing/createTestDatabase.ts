import Database from 'better-sqlite3';
import { ALL_SCHEMAS, DB_INDEXES } from '../schema';
import { LATEST_VERSION } from '../migrations';
import { wrapBetterSqliteToAsync } from './betterSqliteAdapter';
import type { SQLiteDatabase } from 'expo-sqlite';

export type TestDatabaseHandle = {
  /** Async API compatible with expo-sqlite (injected via `setDbForTests`). */
  sqlite: SQLiteDatabase;
  /** Close the underlying :memory: database. */
  dispose: () => void;
};

/**
 * Creates an in-memory SQLite DB with the same schema/indexes as the app, PRAGMA user_version
 * set to {@link LATEST_VERSION}, and a minimal `user_profile` row. Use with {@link setDbForTests}.
 */
export function createTestDatabase(): TestDatabaseHandle {
  const raw = new Database(':memory:');
  raw.pragma('journal_mode = DELETE');
  raw.pragma('foreign_keys = ON');

  for (const sql of ALL_SCHEMAS) {
    raw.exec(sql);
  }
  for (const sql of DB_INDEXES) {
    try {
      raw.exec(sql);
    } catch (e) {
      if (__DEV__) console.warn('[createTestDatabase] index skipped:', e);
    }
  }

  raw.exec(`PRAGMA user_version = ${LATEST_VERSION}`);
  raw.prepare(`INSERT OR IGNORE INTO user_profile (id) VALUES (1)`).run();

  const sqlite = wrapBetterSqliteToAsync(raw);
  return {
    sqlite,
    dispose: () => {
      try {
        raw.close();
      } catch {
        /* ignore */
      }
    },
  };
}
