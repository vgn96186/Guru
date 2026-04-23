import {
  guruChatSessionMemoryRepositoryDrizzle,
  type GuruChatSessionMemoryRow,
} from '../repositories/guruChatSessionMemoryRepository.drizzle';

export type { GuruChatSessionMemoryRow };

export async function getSessionMemoryRow(
  threadId: number,
): Promise<GuruChatSessionMemoryRow | null> {
  return guruChatSessionMemoryRepositoryDrizzle.getSessionMemoryRow(threadId);
}

export async function upsertSessionMemory(
  threadId: number,
  topicName: string,
  summaryText: string,
  messagesAtLastSummary: number,
  stateJson = '{}',
): Promise<void> {
  return guruChatSessionMemoryRepositoryDrizzle.upsertSessionMemory(
    threadId,
    topicName,
    summaryText,
    messagesAtLastSummary,
    stateJson,
  );
}

export async function deleteSessionMemory(threadId: number): Promise<void> {
  return guruChatSessionMemoryRepositoryDrizzle.deleteSessionMemory(threadId);
}
