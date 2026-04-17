import { getDb } from '../db/database';
import { showToast } from '../components/notificationService';

export interface OfflineQueueItem {
  id?: number;
  type: string;
  payload: any;
  createdAt: number;
  attempts: number;
  lastAttempt?: number;
}

export async function enqueueOfflineOperation(
  type: string,
  payload: any,
  maxAttempts = 3
): Promise<number> {
  const db = await getDb();
  
  // Create offline_queue table if it doesn't exist
  await db.runAsync(
    `CREATE TABLE IF NOT EXISTS offline_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      attempts INTEGER DEFAULT 0,
      lastAttempt INTEGER
    )`
  );
  
  // Insert the operation
  const result = await db.runAsync(
    `INSERT INTO offline_queue (type, payload, createdAt, attempts)
     VALUES (?, ?, ?, ?)`,
    [type, JSON.stringify(payload), Date.now(), 0]
  );
  
  showToast({
    message: `Operation queued for offline processing`,
    variant: 'info',
  });
  
  return result.lastInsertRowId;
}

export async function processOfflineQueue(): Promise<number> {
  const db = await getDb();
  
  // Get pending operations (not yet attempted or with attempts < max)
  const pending = (await db.getAllAsync(
    `SELECT * FROM offline_queue WHERE attempts < 3 ORDER BY createdAt ASC`
  )) as OfflineQueueItem[];

  let processedCount = 0;

  for (const item of pending) {
    try {
      const payload = JSON.parse(item.payload);
      
      // Here you would implement the actual processing logic
      // based on the operation type
      console.log(`Processing offline operation: ${item.type}`, payload);
      
      // Simulate processing different operation types
      switch (item.type) {
        case 'ai_call':
          // Retry AI call
          break;
        case 'sync':
          // Retry sync operation
          break;
        default:
          console.warn(`Unknown offline operation type: ${item.type}`);
      }
      
      // Mark as processed
      await db.runAsync(
        `DELETE FROM offline_queue WHERE id = ?`,
        [item.id ?? null]
      );
      processedCount++;
      
    } catch (error) {
      console.error(`Failed to process offline operation ${item.id}:`, error);
      
      // Increment attempt count
      await db.runAsync(
        `UPDATE offline_queue SET attempts = attempts + 1, lastAttempt = ? WHERE id = ?`,
        [Date.now(), item.id ?? null]
      );
    }
  }
  
  if (processedCount > 0) {
    showToast({
      message: `Processed ${processedCount} offline operation(s)`,
      variant: 'success',
    });
  }
  
  return processedCount;
}

export async function getOfflineQueue(): Promise<OfflineQueueItem[]> {
  const db = await getDb();
  const items = (await db.getAllAsync(
    `SELECT * FROM offline_queue ORDER BY createdAt ASC`
  )) as OfflineQueueItem[];

  return items.map((item) => ({
    ...item,
    payload: JSON.parse(item.payload as string),
  }));
}

export async function clearOfflineQueue(): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM offline_queue`);
}
