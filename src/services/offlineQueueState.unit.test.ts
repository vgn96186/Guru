import type { OfflineQueueItem } from './offlineQueue';
import {
  canRetryQueueItem,
  toCompletedState,
  toFailedState,
  toProcessingState,
} from './offlineQueueState';

function makeItem(overrides: Partial<OfflineQueueItem> = {}): OfflineQueueItem {
  return {
    id: 1,
    requestType: 'generate_text',
    payload: {},
    status: 'pending',
    attempts: 0,
    createdAt: 1,
    lastAttemptAt: null,
    errorMessage: null,
    ...overrides,
  };
}

describe('offlineQueueState', () => {
  it('checks retry eligibility', () => {
    expect(canRetryQueueItem(makeItem({ status: 'pending', attempts: 0 }), 5)).toBe(true);
    expect(canRetryQueueItem(makeItem({ status: 'failed', attempts: 4 }), 5)).toBe(true);
    expect(canRetryQueueItem(makeItem({ status: 'failed', attempts: 5 }), 5)).toBe(false);
    expect(canRetryQueueItem(makeItem({ status: 'completed', attempts: 1 }), 5)).toBe(false);
  });

  it('transitions states', () => {
    const pending = makeItem();
    const processing = toProcessingState(pending, 1000);
    expect(processing.status).toBe('processing');
    expect(processing.attempts).toBe(1);
    expect(processing.lastAttemptAt).toBe(1000);

    const failed = toFailedState(processing, 'timeout');
    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toBe('timeout');

    const completed = toCompletedState(failed);
    expect(completed.status).toBe('completed');
    expect(completed.errorMessage).toBeNull();
  });
});
