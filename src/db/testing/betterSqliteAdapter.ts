import Database from 'better-sqlite3';
import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Wraps a synchronous better-sqlite3 Database into an async API compatible with
 * expo-sqlite's {@link SQLiteDatabase} (subset used by Guru query code).
 */
export function wrapBetterSqliteToAsync(db: InstanceType<typeof Database>): SQLiteDatabase {
  return {
    execAsync: async (sql: string) => {
      db.exec(sql);
    },
    runAsync: async (sql: string, params?: readonly unknown[]) => {
      const stmt = db.prepare(sql);
      const info = Array.isArray(params) ? stmt.run(...params) : stmt.run();
      return {
        lastInsertRowId: info.lastInsertRowid,
        changes: info.changes,
      };
    },
    getFirstAsync: async <T>(sql: string, params?: readonly unknown[]) => {
      const stmt = db.prepare(sql);
      const row = Array.isArray(params) ? stmt.get(...params) : stmt.get();
      return (row ?? null) as T | null;
    },
    getAllAsync: async <T>(sql: string, params?: readonly unknown[]) => {
      const stmt = db.prepare(sql);
      const rows = Array.isArray(params) ? stmt.all(...params) : stmt.all();
      return rows as T[];
    },
    isInTransactionAsync: async () => false,
    closeSync: () => {
      db.close();
    },
  } as unknown as SQLiteDatabase;
}
