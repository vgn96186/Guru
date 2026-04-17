import { getDb } from '../db/database';

export interface ErrorLogEntry {
  id?: number;
  error: string;
  stack?: string;
  componentStack?: string;
  timestamp: number;
  context?: string;
}

export async function logErrorToDatabase(entry: Omit<ErrorLogEntry, 'id'>): Promise<number> {
  const db = await getDb();
  
  // Create error_logs table if it doesn't exist
  await db.runAsync(
    `CREATE TABLE IF NOT EXISTS error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      error TEXT NOT NULL,
      stack TEXT,
      componentStack TEXT,
      timestamp INTEGER NOT NULL,
      context TEXT
    )`
  );
  
  // Insert the error log
  const result = await db.runAsync(
    `INSERT INTO error_logs (error, stack, componentStack, timestamp, context)
     VALUES (?, ?, ?, ?, ?)`,
    [entry.error, entry.stack ?? null, entry.componentStack ?? null, entry.timestamp, entry.context ?? null]
  );
  
  return result.lastInsertRowId;
}

export async function getErrorLogs(limit = 100): Promise<ErrorLogEntry[]> {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT * FROM error_logs ORDER BY timestamp DESC LIMIT ?`,
    [limit]
  ) as Promise<ErrorLogEntry[]>;
}

export async function clearErrorLogs(): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM error_logs`);
}
