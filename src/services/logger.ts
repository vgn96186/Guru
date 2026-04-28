import { LogEntry, LogLevel, LogSink } from './logging/types';

class Logger {
  private sinks: LogSink[] = [];

  addSink(sink: LogSink) {
    this.sinks.push(sink);
  }

  private dispatch(level: LogLevel, message: string, data?: any[], metadata?: Record<string, any>) {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      level,
      message,
      data,
      metadata,
    };
    this.sinks.forEach((sink) => {
      try {
        sink.write(entry);
      } catch (e) {
        // Silently catch sink errors
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn(`[Logger] Sink ${sink.name} failed:`, e);
        }
      }
    });
  }

  debug = (msg: string, ...data: any[]) => this.dispatch('debug', msg, data);
  info = (msg: string, ...data: any[]) => this.dispatch('info', msg, data);
  warn = (msg: string, ...data: any[]) => this.dispatch('warn', msg, data);
  error = (msg: string, ...data: any[]) => this.dispatch('error', msg, data);
  log = (msg: string, ...data: any[]) => this.dispatch('log', msg, data);
}

export const logger = new Logger();
