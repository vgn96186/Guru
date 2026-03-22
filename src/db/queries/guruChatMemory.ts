import { getDb, nowTs } from '../database';

export interface GuruChatSessionMemoryRow {
  topicName: string;
  summaryText: string;
  updatedAt: number;
  messagesAtLastSummary: number;
}

export async function getSessionMemoryRow(
  topicName: string,
): Promise<GuruChatSessionMemoryRow | null> {
  const db = getDb();
  const r = await db.getFirstAsync<{
    topic_name: string;
    summary_text: string;
    updated_at: number;
    messages_at_last_summary: number;
  }>('SELECT * FROM guru_chat_session_memory WHERE topic_name = ?', [topicName]);
  if (!r) return null;
  return {
    topicName: r.topic_name,
    summaryText: r.summary_text,
    updatedAt: r.updated_at,
    messagesAtLastSummary: r.messages_at_last_summary,
  };
}

export async function upsertSessionMemory(
  topicName: string,
  summaryText: string,
  messagesAtLastSummary: number,
): Promise<void> {
  const db = getDb();
  const t = nowTs();
  await db.runAsync(
    `INSERT INTO guru_chat_session_memory (topic_name, summary_text, updated_at, messages_at_last_summary)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(topic_name) DO UPDATE SET
       summary_text = excluded.summary_text,
       updated_at = excluded.updated_at,
       messages_at_last_summary = excluded.messages_at_last_summary`,
    [topicName, summaryText, t, messagesAtLastSummary],
  );
}

export async function deleteSessionMemory(topicName: string): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM guru_chat_session_memory WHERE topic_name = ?', [topicName]);
}
