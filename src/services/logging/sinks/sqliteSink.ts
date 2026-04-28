import { LogEntry, LogSink } from '../types';
import { logErrorToDatabase } from '../../errorLoggingService';

export const sqliteSink: LogSink = {
  name: 'SQLiteSink',
  write: (entry: LogEntry) => {
    // Only persist errors to DB
    if (entry.level === 'error') {
      const errorMsg = entry.message;
      const stack = entry.metadata?.stack;
      logErrorToDatabase({
        error: errorMsg,
        stack,
        timestamp: entry.timestamp,
        context: JSON.stringify(entry.data),
      }).catch((e) => {
        if (__DEV__) console.warn('[SQLiteSink] Failed to write:', e);
      });
    }
  },
};
