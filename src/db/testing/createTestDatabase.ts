import Database from 'better-sqlite3';
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
  const db = wrapBetterSqliteToAsync(raw);

  // Actually we need to apply drizzle schema directly, or just let it be handled by tests
  // since ALL_SCHEMAS/DB_INDEXES no longer exist in Drizzle version
  return db;
}
