import { logger } from './logger';
import { LogSink, LogEntry } from './logging/types';

describe('Logger', () => {
  let mockSink: LogSink & { write: jest.Mock };

  beforeEach(() => {
    mockSink = {
      name: 'MockSink',
      write: jest.fn(),
    };
    // @ts-ignore - accessing private sinks for testing
    logger.sinks = [];
    logger.addSink(mockSink);
  });

  it('should dispatch info messages to sinks', () => {
    logger.info('Test info message', { key: 'value' });

    expect(mockSink.write).toHaveBeenCalledTimes(1);
    const entry = mockSink.write.mock.calls[0][0] as LogEntry;
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('Test info message');
    expect(entry.data).toEqual([{ key: 'value' }]);
    expect(entry.id).toBeDefined();
    expect(entry.timestamp).toBeDefined();
  });

  it('should handle errors in sinks gracefully', () => {
    const errorSink: LogSink = {
      name: 'ErrorSink',
      write: () => {
        throw new Error('Sink error');
      },
    };
    logger.addSink(errorSink);

    // Should not throw
    expect(() => logger.error('Test error')).not.toThrow();

    // Original sink should still be called
    expect(mockSink.write).toHaveBeenCalledTimes(1);
  });
});
