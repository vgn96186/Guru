import type { OfflineQueueItem } from './offlineQueue';

export function canRetryQueueItem(item: OfflineQueueItem, maxAttempts = 5): boolean {
  return item.attempts < maxAttempts && (item.status === 'pending' || item.status === 'failed');
}

export function toProcessingState(item: OfflineQueueItem, now = Date.now()): OfflineQueueItem {
  return {
    ...item,
    status: 'processing',
    attempts: item.attempts + 1,
    lastAttemptAt: now,
  };
}

export function toFailedState(item: OfflineQueueItem, errorMessage: string): OfflineQueueItem {
  return {
    ...item,
    status: 'failed',
    errorMessage,
  };
}

export function toCompletedState(item: OfflineQueueItem): OfflineQueueItem {
  return {
    ...item,
    status: 'completed',
    errorMessage: null,
  };
}
