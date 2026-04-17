import { drizzle } from 'drizzle-orm/expo-sqlite';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { getDb, resetDbSingleton } from './database';
import * as schema from './drizzleSchema';

type DrizzleDb = ExpoSQLiteDatabase<typeof schema>;

let _drizzleDb: DrizzleDb | null = null;

/**
 * Returns the singleton Drizzle ORM instance backed by the same expo-sqlite
 * connection as the legacy raw-SQL layer. Must only be called after
 * initDatabase() has completed (throws otherwise via getDb()).
 *
 * Drizzle's expo-sqlite driver uses the synchronous SQLite API — queries
 * execute on the JS thread but are fast for local SQLite reads/writes.
 */
export function getDrizzleDb(): DrizzleDb {
  if (!_drizzleDb) {
    _drizzleDb = drizzle(getDb(), { schema });
  }
  return _drizzleDb;
}

/**
 * Clear the Drizzle singleton. Call alongside resetDbSingleton() before
 * re-importing a backup so the new connection is used.
 */
export function resetDrizzleDb(): void {
  _drizzleDb = null;
}

export { resetDbSingleton };
export type { DrizzleDb };
