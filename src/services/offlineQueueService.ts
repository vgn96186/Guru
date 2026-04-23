import { getDrizzleDb } from '../db/drizzle';
import { offlineAiQueue } from '../db/drizzleSchema';
import { eq, lt, asc } from 'drizzle-orm';
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
  maxAttempts = 3,
): Promise<number> {
  const db = getDrizzleDb();

  // Insert the operation
  const result = await db
    .insert(offlineAiQueue)
    .values({
      requestType: type,
      payload: JSON.stringify(payload),
      createdAt: Date.now(),
      attempts: 0,
      status: 'pending',
    })
    .returning({ id: offlineAiQueue.id });

  showToast({
    message: `Operation queued for offline processing`,
    variant: 'info',
  });

  return result[0].id;
}

export async function processOfflineQueue(): Promise<number> {
  const db = getDrizzleDb();

  // Get pending operations (not yet attempted or with attempts < max)
  const pending = await db
    .select()
    .from(offlineAiQueue)
    .where(lt(offlineAiQueue.attempts, 3))
    .orderBy(asc(offlineAiQueue.createdAt));

  let processedCount = 0;

  for (const item of pending) {
    if (!item.id) continue;
    try {
      const payload = JSON.parse(item.payload);
      console.log(`Processing offline operation: ${item.requestType}`, payload);

      // --- Dispatch based on operation requestType ---
      switch (item.requestType) {
        case 'CREATE_CHAT_THREAD': {
          const sessionManager = require('../hooks/useGuruChatSession');
          await sessionManager.createThread(payload.threadId, payload.title, payload.createdAt);
          break;
        }
        case 'RENAME_CHAT_THREAD': {
          const sessionManagerRename = require('../hooks/useGuruChatSession');
          await sessionManagerRename.renameThread(payload.threadId, payload.newTitle);
          break;
        }
        case 'DELETE_CHAT_THREAD': {
          const sessionManagerDelete = require('../hooks/useGuruChatSession');
          await sessionManagerDelete.deleteThread(payload.threadId);
          break;
        }
        default:
          console.warn(`Unknown offline operation requestType: ${item.requestType}`);
      }

      // Success: delete from queue
      await db.delete(offlineAiQueue).where(eq(offlineAiQueue.id, item.id));
      processedCount++;
    } catch (error) {
      console.error(`Failed to process offline operation ${item.id}:`, error);

      // Increment attempt count
      await db
        .update(offlineAiQueue)
        .set({
          attempts: (item.attempts || 0) + 1,
          lastAttemptAt: Date.now(),
        })
        .where(eq(offlineAiQueue.id, item.id));
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
  const db = getDb();
  const items = (await db.getAllAsync(
    `SELECT * FROM offline_queue ORDER BY createdAt ASC`
  )) as OfflineQueueItem[];

  return items.map((item) => ({
    ...item,
    payload: JSON.parse(item.payload as string),
  }));
}

export async function clearOfflineQueue(): Promise<void> {
  const db = getDb();
  await db.runAsync(`DELETE FROM offline_queue`);
}
