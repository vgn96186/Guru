# Unified Logging Service Design

## 1. Overview

The Guru app currently has disjointed and unused logging logic (`loggingService.ts`, `errorReporting.ts`, `errorLoggingService.ts`), while `DevConsole.tsx` handles in-app log overlay. This design unifies them into a single `logger.ts` singleton that acts as an event bus. It collects logs from multiple sources (console, network, navigation, state) and dispatches them to multiple sinks (DevConsole memory, Sentry, SQLite).

## 2. Core Architecture

- **Sources**:
  - `console` methods interceptor.
  - Network request interceptor (`fetch` and `XMLHttpRequest`).
  - React Navigation `onStateChange` listener.
  - Zustand state subscriber.
- **Sinks**:
  - `DevConsole` memory buffer (retained for UI viewing).
  - Sentry (breadcrumbs for `info`/`warn`, exceptions for `error`).
  - SQLite `error_logs` table (persists `error` and optionally `warn` logs).

## 3. Components & Data Flow

### `src/services/logger.ts`

- A singleton replacing `loggingService.ts`.
- Exports methods: `debug`, `info`, `warn`, `error`, `log`.
- Maintains a list of registered sinks.
- Each sink implements an interface `LogSink` with a `write(entry: LogEntry)` method.

### Sinks

- **`DevConsoleSink`**: Replaces the local array in `DevConsole.tsx`. Keeps a circular buffer of the last 500 logs for UI display.
- **`SentrySink`**: Wraps `@sentry/react-native`.
  - On `info`/`warn`, calls `Sentry.addBreadcrumb()`.
  - On `error`, calls `Sentry.captureException()`.
- **`SQLiteSink`**: Wraps `errorLoggingService.ts`. Writes `error` level logs to the local SQLite database to ensure offline persistence.

### Interceptors

- **`consoleInterceptor.ts`**: Overrides `console.log`, `console.warn`, etc., to pipe into `logger`.
- **`networkInterceptor.ts`**: Overrides `global.fetch` and `XMLHttpRequest` to capture request method, URL, status code, and duration.
- **Navigation & State**:
  - In `App.tsx`, `<NavigationContainer onStateChange={...}>` will call `logger.info('Navigation: ...')`.
  - In `src/store/useAppStore.ts`, a subscriber or middleware will log key state transitions.

## 4. Error Handling & Performance

- The logger must never throw synchronous errors that crash the app. Sinks should catch their own errors (e.g., SQLite write failures).
- Heavy objects passed to `logger` will be stringified or sanitized to prevent memory leaks and circular references.
- Network interceptor will only log metadata (URL, status, timing) and will not buffer large request/response bodies to save memory.

## 5. Testing Strategy

- Unit tests for `logger.ts` to verify sink registration and dispatching.
- Unit tests for network interceptors to verify fetch override works transparently.

## 6. Migration Plan

- Delete the unused `loggingService.ts`.
- Refactor `errorReporting.ts` to become `SentrySink` or remove it and integrate directly into `logger.ts` configuration.
- Update `DevConsole.tsx` to read from the new `DevConsoleSink` buffer instead of its own interceptor.
- Wire up interceptors in `App.tsx` early during boot.
