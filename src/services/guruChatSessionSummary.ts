import { getChatHistory, getChatMessageCount } from '../db/queries/aiCache';
import { getSessionMemoryRow, upsertSessionMemory } from '../db/queries/guruChatMemory';
import { generateTextWithRouting } from './ai/generate';
import type { Message } from './ai/types';

/** Regenerate rolling summary after this many new chat_history rows since last summary. */
export const GURU_SESSION_SUMMARY_INTERVAL = 8;

const SUMMARY_SYSTEM = `You compress NEET-PG/INICET tutoring chats. Output 2–6 short bullet points.
Focus on topics covered, mistakes or gaps, and what to revisit. Plain text bullets only, no preamble.`;

export async function maybeSummarizeGuruSession(topicName: string): Promise<void> {
  const count = await getChatMessageCount(topicName);
  const row = await getSessionMemoryRow(topicName);
  const lastAt = row?.messagesAtLastSummary ?? 0;
  if (count - lastAt < GURU_SESSION_SUMMARY_INTERVAL) return;

  const history = await getChatHistory(topicName, 48);
  if (history.length === 0) return;

  const slice = history.slice(-24);
  const transcript = slice.map((m) => `${m.role === 'user' ? 'Student' : 'Guru'}: ${m.message}`).join('\n');
  const prev = (row?.summaryText ?? '').trim();

  const userContent = [
    prev ? `Previous summary (update and merge, do not repeat verbatim if outdated):\n${prev}\n` : '',
    `Recent messages:\n${transcript}`,
    '\nUpdated summary:',
  ].join('\n');

  const messages: Message[] = [
    { role: 'system', content: SUMMARY_SYSTEM },
    { role: 'user', content: userContent.slice(0, 12000) },
  ];

  try {
    const { text } = await generateTextWithRouting(messages);
    const summary = text.trim();
    if (!summary) return;
    await upsertSessionMemory(topicName, summary, count);
  } catch (e) {
    if (__DEV__) console.warn('[GuruChat] Session summary skipped:', e);
  }
}
