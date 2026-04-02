/**
 * In-app debug console — captures console.log/warn/error and displays them
 * in a floating overlay. Useful for debugging on-device without Metro/adb.
 *
 * Usage: wrap your app root with <DevConsoleProvider />, then call
 * devConsole.show() or triple-tap the version label in Settings.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Clipboard,
  Alert,
} from 'react-native';
import { linearTheme as n } from '../theme/linearTheme';

export interface LogEntry {
  id: number;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  timestamp: number;
}

const MAX_ENTRIES = 500;
let _entries: LogEntry[] = [];
let _nextId = 1;
let _listeners: Array<() => void> = [];
let _installed = false;

function addEntry(level: LogEntry['level'], args: unknown[]) {
  const message = args
    .map((a) => {
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a, null, 0);
      } catch {
        return String(a);
      }
    })
    .join(' ');

  const entry: LogEntry = { id: _nextId++, level, message, timestamp: Date.now() };
  _entries = [..._entries.slice(-(MAX_ENTRIES - 1)), entry];
  _listeners.forEach((fn) => fn());
}

/** Install console intercepts (safe to call multiple times). */
export function installDevConsoleInterceptors() {
  if (_installed) return;
  _installed = true;

  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  const origInfo = console.info;

  console.log = (...args: unknown[]) => {
    origLog(...args);
    addEntry('log', args);
  };
  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    addEntry('warn', args);
  };
  console.error = (...args: unknown[]) => {
    origError(...args);
    addEntry('error', args);
  };
  console.info = (...args: unknown[]) => {
    origInfo(...args);
    addEntry('info', args);
  };
}

function useLogEntries() {
  const [entries, setEntries] = useState<LogEntry[]>(_entries);
  useEffect(() => {
    const listener = () => setEntries([..._entries]);
    _listeners.push(listener);
    return () => {
      _listeners = _listeners.filter((l) => l !== listener);
    };
  }, []);
  return entries;
}

// Global visibility control
let _showConsole: (() => void) | null = null;

export const devConsole = {
  show: () => _showConsole?.(),
  clear: () => {
    _entries = [];
    _listeners.forEach((fn) => fn());
  },
};

const LEVEL_COLORS: Record<LogEntry['level'], string> = {
  log: '#8EC5FF',
  info: '#7ED6A7',
  warn: '#FFB74D',
  error: '#F44336',
};

const LEVEL_LABELS: Record<LogEntry['level'], string> = {
  log: 'LOG',
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
};

export default function DevConsole() {
  const [visible, setVisible] = useState(false);
  const [filter, setFilter] = useState<LogEntry['level'] | 'all'>('all');
  const entries = useLogEntries();
  const scrollRef = useRef<ScrollView>(null);

  _showConsole = useCallback(() => setVisible(true), []);

  const filtered =
    filter === 'all' ? entries : entries.filter((e) => e.level === filter);

  const handleCopy = () => {
    const text = filtered
      .map(
        (e) =>
          `[${new Date(e.timestamp).toLocaleTimeString()}] [${e.level.toUpperCase()}] ${e.message}`,
      )
      .join('\n');
    Clipboard.setString(text);
    Alert.alert('Copied', `${filtered.length} log entries copied to clipboard.`);
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => setVisible(false)}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Dev Console</Text>
          <View style={styles.filterRow}>
            {(['all', 'log', 'warn', 'error'] as const).map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
                onPress={() => setFilter(f)}
              >
                <Text
                  style={[styles.filterText, filter === f && styles.filterTextActive]}
                >
                  {f.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleCopy}>
              <Text style={styles.actionText}>Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                devConsole.clear();
              }}
            >
              <Text style={styles.actionText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: n.colors.error }]}
              onPress={() => setVisible(false)}
            >
              <Text style={[styles.actionText, { color: '#fff' }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.logScroll}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {filtered.length === 0 && (
            <Text style={styles.emptyText}>No log entries yet.</Text>
          )}
          {filtered.map((entry) => (
            <View key={entry.id} style={styles.logRow}>
              <Text style={[styles.logLevel, { color: LEVEL_COLORS[entry.level] }]}>
                {LEVEL_LABELS[entry.level]}
              </Text>
              <Text style={styles.logTime}>
                {new Date(entry.timestamp).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false,
                })}
              </Text>
              <Text style={styles.logMsg} selectable>
                {entry.message}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A10',
    paddingTop: 40,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A24',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1A1A24',
  },
  filterBtnActive: {
    backgroundColor: n.colors.accent,
  },
  filterText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
  },
  filterTextActive: {
    color: '#fff',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1A1A24',
  },
  actionText: {
    color: n.colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  logScroll: {
    flex: 1,
    padding: 8,
  },
  emptyText: {
    color: '#555',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
  logRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1A1A24',
  },
  logLevel: {
    width: 32,
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Inter_400Regular',
  },
  logTime: {
    width: 60,
    color: '#555',
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
  },
  logMsg: {
    flex: 1,
    color: '#CCC',
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    lineHeight: 16,
  },
});
