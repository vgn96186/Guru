import { LogEntry, LogSink } from '../types';

const MAX_ENTRIES = 500;
let entries: LogEntry[] = [];
let listeners: Array<() => void> = [];

export const devConsoleSink: LogSink & {
  getEntries: () => LogEntry[];
  addListener: (fn: () => void) => () => void;
} = {
  name: 'DevConsoleSink',
  write: (entry: LogEntry) => {
    entries = [...entries.slice(-(MAX_ENTRIES - 1)), entry];
    queueMicrotask(() => {
      listeners.forEach((fn) => fn());
    });
  },
  clear: () => {
    entries = [];
    queueMicrotask(() => {
      listeners.forEach((fn) => fn());
    });
  },
  getEntries: () => entries,
  addListener: (fn: () => void) => {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  },
};
