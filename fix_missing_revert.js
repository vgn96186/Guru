const fs = require('fs');

let content = fs.readFileSync('src/services/offlineQueue.ts', 'utf-8');

// markProcessing
content = content.replace(/async function markProcessing.*?\[OfflineQueue\] markProcessing failed:',\s*\);/s, `async function markProcessing(id: number): Promise<boolean> {
  return runQueueStatusUpdate(
    "UPDATE offline_ai_queue SET status = 'processing', last_attempt_at = ?, attempts = attempts + 1 WHERE id = ? AND status IN ('pending', 'failed')",
    [nowTs(), id],
    '[OfflineQueue] markProcessing failed:',
  );`);

// markCompleted
content = content.replace(/async function markCompleted.*?\[OfflineQueue\] markCompleted failed:',\s*\);/s, `async function markCompleted(id: number): Promise<void> {
  await runQueueStatusUpdate(
    "UPDATE offline_ai_queue SET status = 'completed' WHERE id = ?",
    [id],
    '[OfflineQueue] markCompleted failed:',
  );`);

// markFailed
content = content.replace(/export async function markFailed.*?\[OfflineQueue\] markFailed failed:',\s*\);/s, `export async function markFailed(id: number, errorMessage: string): Promise<void> {
  await runQueueStatusUpdate(
    "UPDATE offline_ai_queue SET status = 'failed', error_message = ? WHERE id = ?",
    [errorMessage, id],
    '[OfflineQueue] markFailed failed:',
  );`);

fs.writeFileSync('src/services/offlineQueue.ts', content);
