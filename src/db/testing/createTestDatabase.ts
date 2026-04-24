import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
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
export function createTestDatabase(_seedWithData = false): SQLiteDatabase {
  const raw = new Database(':memory:');
  raw.pragma('journal_mode = DELETE');
  raw.pragma('foreign_keys = ON');
  const baselineSql = readFileSync(
    join(__dirname, '..', 'drizzle-migrations', '0000_baseline_v164.sql'),
    'utf8',
  )
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .join(';\n');
  raw.exec(baselineSql);
  raw.prepare('INSERT OR IGNORE INTO user_profile (id) VALUES (1)').run();
  const db = wrapBetterSqliteToAsync(raw);
  return db;
}
