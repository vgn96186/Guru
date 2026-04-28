export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'log';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: any[];
  metadata?: Record<string, any>;
}

export interface LogSink {
  name: string;
  write: (entry: LogEntry) => void;
  clear?: () => void;
}
