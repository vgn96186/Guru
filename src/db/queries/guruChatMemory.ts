import { getDb, nowTs } from '../database';

export interface GuruChatSessionMemoryRow {
  threadId: number;
  topicName: string;
  summaryText: string;
  updatedAt: number;
  messagesAtLastSummary: number;
}

export async function getSessionMemoryRow(
  threadId: number,
): Promise<GuruChatSessionMemoryRow | null> {
  const db = getDb();
  const r = await db.getFirstAsync<{
    thread_id: number;
    topic_name: string;
    summary_text: string;
    updated_at: number;
    messages_at_last_summary: number;
  }>('SELECT * FROM guru_chat_session_memory WHERE thread_id = ?', [threadId]);
  if (!r) return null;
  return {
    threadId: r.thread_id,
    topicName: r.topic_name,
    summaryText: r.summary_text,
    updatedAt: r.updated_at,
    messagesAtLastSummary: r.messages_at_last_summary,
  };
}

export async function upsertSessionMemory(
  threadId: number,
  topicName: string,
  summaryText: string,
  messagesAtLastSummary: number,
): Promise<void> {
  const db = getDb();
  const t = nowTs();
  await db.runAsync(
    `INSERT INTO guru_chat_session_memory
      (thread_id, topic_name, summary_text, updated_at, messages_at_last_summary)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(thread_id) DO UPDATE SET
       topic_name = excluded.topic_name,
       summary_text = excluded.summary_text,
       updated_at = excluded.updated_at,
       messages_at_last_summary = excluded.messages_at_last_summary`,
    [threadId, topicName, summaryText, t, messagesAtLastSummary],
  );
}

export async function deleteSessionMemory(threadId: number): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM guru_chat_session_memory WHERE thread_id = ?', [threadId]);
}
