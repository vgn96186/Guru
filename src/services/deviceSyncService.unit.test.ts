async function waitFor(condition: () => boolean, timeoutMs = 15000, stepMs = 10): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: condition not met within timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
}

describe('deviceSyncService', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('normalizes sync codes before connecting', async () => {
    const handlers: Record<string, (...args: any[]) => void> = {};
    const mockClient: {
      on: jest.Mock;
      subscribe: jest.Mock;
      publish: jest.Mock;
      end: jest.Mock;
    } = {
      on: jest.fn((event: string, callback: (...args: any[]) => void) => {
        handlers[event] = callback;
        return mockClient;
      }),
      subscribe: jest.fn(),
      publish: jest.fn(),
      end: jest.fn(),
    };
    const connectMock = jest.fn(() => mockClient);

    jest.doMock('mqtt/dist/mqtt', () => ({
      connect: connectMock,
    }));

    jest.doMock('./syncCrypto', () => ({
      encryptPayload: jest.fn(async (_code: string, msg: unknown) =>
        JSON.stringify({
          payload: msg,
          ts: Date.now(),
          msgId: `enc-${Date.now()}`,
        }),
      ),
      decryptPayload: jest.fn(async (_code: string, raw: string) => JSON.parse(raw)),
      clearKeyCache: jest.fn(),
    }));

    const { connectToRoom, normalizeSyncCode } = await import('./deviceSyncService');

    expect(normalizeSyncCode(' neet-2026 ')).toBe('NEET2026');

    const unsubscribeA = connectToRoom('ne-et12', jest.fn());
    const unsubscribeB = connectToRoom('NEET12', jest.fn());

    await waitFor(() => !!handlers.connect);
    expect(connectMock).toHaveBeenCalledTimes(1);

    unsubscribeA();
    unsubscribeB();
  });

  it('keeps one shared connection for multiple listeners', async () => {
    const handlers: Record<string, (...args: any[]) => void> = {};
    const mockClient: {
      on: jest.Mock;
      subscribe: jest.Mock;
      publish: jest.Mock;
      end: jest.Mock;
    } = {
      on: jest.fn((event: string, callback: (...args: any[]) => void) => {
        handlers[event] = callback;
        return mockClient;
      }),
      subscribe: jest.fn(),
      publish: jest.fn(),
      end: jest.fn(),
    };
    const connectMock = jest.fn(() => mockClient);
    const decryptPayloadMock = jest.fn(async (_code: string, raw: string) => JSON.parse(raw));
    const clearKeyCacheMock = jest.fn();

    jest.doMock('mqtt/dist/mqtt', () => ({
      connect: connectMock,
    }));

    jest.doMock('./syncCrypto', () => ({
      encryptPayload: jest.fn(async (_code: string, msg: unknown) =>
        JSON.stringify({
          payload: msg,
          ts: Date.now(),
          msgId: `enc-${Date.now()}`,
        }),
      ),
      decryptPayload: decryptPayloadMock,
      clearKeyCache: clearKeyCacheMock,
    }));

    const { connectToRoom } = await import('./deviceSyncService');
    const listenerA = jest.fn();
    const listenerB = jest.fn();

    const unsubscribeA = connectToRoom('room-123', listenerA);
    const unsubscribeB = connectToRoom('room-123', listenerB);

    // ensureConnected runs async (microtasks); avoid infinite spin under --coverage
    await waitFor(() => !!handlers.connect);

    expect(connectMock).toHaveBeenCalledTimes(1);

    // Simulate connection success and topic subscription
    handlers.connect();

    await waitFor(() => mockClient.subscribe.mock.calls.length > 0);

    const subscribedTopic = mockClient.subscribe.mock.calls[0][0];

    handlers.message?.(subscribedTopic, {
      toString: () =>
        JSON.stringify({
          payload: { type: 'BREAK_STARTED', durationSeconds: 90 },
          ts: Date.now(),
          msgId: 'm1',
        }),
    });
    await Promise.resolve(); // allow decryptPayload to resolve

    expect(listenerA).toHaveBeenCalledWith({ type: 'BREAK_STARTED', durationSeconds: 90 });
    expect(listenerB).toHaveBeenCalledWith({ type: 'BREAK_STARTED', durationSeconds: 90 });

    unsubscribeA();
    handlers.message?.(subscribedTopic, {
      toString: () =>
        JSON.stringify({ payload: { type: 'LECTURE_RESUMED' }, ts: Date.now(), msgId: 'm2' }),
    });
    await Promise.resolve();

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(2);
    expect(mockClient.end).not.toHaveBeenCalled();

    unsubscribeB();
    expect(mockClient.end).toHaveBeenCalledTimes(1);
  }, 30000);
});
