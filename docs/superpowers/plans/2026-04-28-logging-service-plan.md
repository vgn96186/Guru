# Unified Logging Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify disjointed logging code into a single `logger.ts` event bus with sources (console, network, state) and sinks (DevConsole, SQLite, Sentry).

**Architecture:** A central `Logger` singleton that accepts `LogEntry` objects. Interceptors (console, network) and listeners (navigation, Zustand) feed into the Logger. Sinks (DevConsole buffer, SQLite db, Sentry) register with the Logger to process entries based on their `level`.

**Tech Stack:** React Native, Expo, TypeScript, Zustand, React Navigation, Sentry, expo-sqlite.

---

### Task 1: Create Core Logger & DevConsole Sink

**Files:**

- Create: `src/services/logging/types.ts`
- Create: `src/services/logging/sinks/devConsoleSink.ts`
- Create: `src/services/logger.ts`
- Test: `src/services/logger.unit.test.ts`

- [x] **Step 1: Define types**
      Create `src/services/logging/types.ts`:

```typescript
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
```

- [x] **Step 2: Create DevConsole Sink**
      Create `src/services/logging/sinks/devConsoleSink.ts`:

```typescript
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
```

- [x] **Step 3: Create Logger Singleton**
      Create `src/services/logger.ts`:

```typescript
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
        if (__DEV__) console.warn(`[Logger] Sink ${sink.name} failed:`, e);
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
```

- [x] **Step 4: Commit**

```bash
git add src/services/logging src/services/logger.ts
git commit -m "feat: add core logger and devConsole sink"
```

### Task 2: Implement SQLite & Sentry Sinks

**Files:**

- Create: `src/services/logging/sinks/sqliteSink.ts`
- Create: `src/services/logging/sinks/sentrySink.ts`

- [x] **Step 1: Create SQLite Sink**
      Create `src/services/logging/sinks/sqliteSink.ts`:

```typescript
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
```

- [x] **Step 2: Create Sentry Sink**
      Create `src/services/logging/sinks/sentrySink.ts`:

```typescript
import * as Sentry from '@sentry/react-native';
import { SENTRY_DSN } from '../../../config/bundledEnv';
import { LogEntry, LogSink } from '../types';

let isInitialized = false;

export function initSentry() {
  if (isInitialized) return;
  if (!SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 1.0,
    _experiments: { profilesSampleRate: 1.0 },
    beforeSend(event) {
      // PII Scrubbing
      const scrubEvent = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const lowerKey = key.toLowerCase();
            if (
              lowerKey.includes('email') ||
              lowerKey.includes('key') ||
              lowerKey.includes('token')
            ) {
              obj[key] = '[REDACTED]';
            } else if (typeof obj[key] === 'object') {
              scrubEvent(obj[key]);
            }
          }
        }
      };
      scrubEvent(event);
      return event;
    },
  });
  isInitialized = true;
}

export const sentrySink: LogSink = {
  name: 'SentrySink',
  write: (entry: LogEntry) => {
    if (!isInitialized) return;

    if (entry.level === 'error') {
      Sentry.captureMessage(entry.message, {
        level: 'error',
        extra: { data: entry.data, metadata: entry.metadata },
      });
    } else if (entry.level === 'warn' || entry.level === 'info') {
      Sentry.addBreadcrumb({
        category: entry.metadata?.category || 'log',
        message: entry.message,
        level: entry.level as Sentry.SeverityLevel,
        data: { data: entry.data },
      });
    }
  },
};
```

- [x] **Step 3: Commit**

```bash
git add src/services/logging/sinks
git commit -m "feat: add Sentry and SQLite sinks"
```

### Task 3: Implement Interceptors

**Files:**

- Create: `src/services/logging/interceptors/consoleInterceptor.ts`
- Create: `src/services/logging/interceptors/networkInterceptor.ts`

- [ ] **Step 1: Create Console Interceptor**
      Create `src/services/logging/interceptors/consoleInterceptor.ts`:

```typescript
import { logger } from '../../logger';

let installed = false;

export function installConsoleInterceptor() {
  if (installed) return;
  installed = true;

  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  const origInfo = console.info;
  const origDebug = console.debug;

  console.log = (...args: any[]) => {
    origLog(...args);
    logger.log(
      args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
      args,
    );
  };
  console.warn = (...args: any[]) => {
    origWarn(...args);
    logger.warn(
      args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
      args,
    );
  };
  console.error = (...args: any[]) => {
    origError(...args);
    logger.error(
      args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
      args,
    );
  };
  console.info = (...args: any[]) => {
    origInfo(...args);
    logger.info(
      args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
      args,
    );
  };
  console.debug = (...args: any[]) => {
    if (origDebug) origDebug(...args);
    logger.debug(
      args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
      args,
    );
  };
}
```

- [ ] **Step 2: Create Network Interceptor**
      Create `src/services/logging/interceptors/networkInterceptor.ts`:

```typescript
import { logger } from '../../logger';

let installed = false;

export function installNetworkInterceptor() {
  if (installed) return;
  installed = true;

  const originalFetch = global.fetch;

  global.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
    const method = (args[1]?.method || 'GET').toUpperCase();
    const startTime = Date.now();

    try {
      const response = await originalFetch.apply(this, args);
      const duration = Date.now() - startTime;
      logger.info(`[Network] ${method} ${url} - ${response.status} (${duration}ms)`, [], {
        category: 'network',
      });
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[Network] ${method} ${url} - FAILED (${duration}ms)`, [error], {
        category: 'network',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/services/logging/interceptors
git commit -m "feat: add console and network interceptors"
```

### Task 4: Wire up Logger and Cleanup Unused Files

**Files:**

- Modify: `App.tsx`
- Modify: `src/components/DevConsole.tsx`
- Delete: `src/services/loggingService.ts`
- Delete: `src/services/errorReporting.ts`

- [ ] **Step 1: Setup Logging Boot**
      Create `src/services/logging/setup.ts`:

```typescript
import { logger } from '../logger';
import { devConsoleSink } from './sinks/devConsoleSink';
import { sqliteSink } from './sinks/sqliteSink';
import { sentrySink, initSentry } from './sinks/sentrySink';
import { installConsoleInterceptor } from './interceptors/consoleInterceptor';
import { installNetworkInterceptor } from './interceptors/networkInterceptor';

export function setupLogging() {
  // Register sinks
  logger.addSink(devConsoleSink);
  logger.addSink(sqliteSink);
  logger.addSink(sentrySink);

  // Initialize third-party
  initSentry();

  // Install interceptors
  installConsoleInterceptor();
  installNetworkInterceptor();
}
```

- [ ] **Step 2: Wire up App.tsx**
      In `App.tsx`:
      Add imports:

```typescript
import { setupLogging } from './src/services/logging/setup';
import { logger } from './src/services/logger';
```

Replace `installDevConsoleInterceptors();` with `setupLogging();`.
Update `<NavigationContainer>` to log state changes:

```tsx
<NavigationContainer
  ref={navigationRef}
  linking={linking}
  theme={{ ...DarkTheme, colors: { ...DarkTheme.colors, background: '#000000', card: '#000000' } }}
  onStateChange={(state) => {
    const currentRoute = navigationRef.getCurrentRoute();
    logger.info(`[Navigation] Navigated to ${currentRoute?.name}`, [], { category: 'navigation' });
  }}
>
```

- [ ] **Step 3: Update DevConsole.tsx**
      In `src/components/DevConsole.tsx`:
      Change imports:

```typescript
import { devConsoleSink } from '../services/logging/sinks/devConsoleSink';
import { LogEntry } from '../services/logging/types';
```

Replace the local `addEntry`, `_entries`, `_listeners`, `installDevConsoleInterceptors` logic with:

```typescript
function useLogEntries() {
  const [entries, setEntries] = useState<LogEntry[]>(devConsoleSink.getEntries());
  useEffect(() => {
    return devConsoleSink.addListener(() => {
      setEntries(devConsoleSink.getEntries());
    });
  }, []);
  return entries;
}

export const devConsole = {
  show: () => _showConsole?.(),
  clear: () => devConsoleSink.clear?.(),
};
```

_(Remove the local interceptor and queueMicrotask implementations inside DevConsole)_

- [ ] **Step 4: Update useAppStore.ts for State Logging**
      In `src/store/useAppStore.ts`:
      Add a basic subscription at the bottom of the file (or middleware):

```typescript
import { logger } from '../services/logger';

useAppStore.subscribe((state, prevState) => {
  if (state.totalXp !== prevState.totalXp) {
    logger.info(`[State] totalXp changed to ${state.totalXp}`, [], { category: 'state' });
  }
  if (state.bootPhase !== prevState.bootPhase) {
    logger.info(`[State] bootPhase changed to ${state.bootPhase}`, [], { category: 'state' });
  }
});
```

- [ ] **Step 5: Cleanup Dead Code**

```bash
rm src/services/loggingService.ts
rm src/services/errorReporting.ts
git add App.tsx src/components/DevConsole.tsx src/store/useAppStore.ts src/services/logging/setup.ts
git rm src/services/loggingService.ts src/services/errorReporting.ts
git commit -m "refactor: wire up unified logger and remove redundant files"
```
