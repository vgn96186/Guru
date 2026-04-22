# Runtime Logging and Error Capture for Guru App

This document describes the enhancements made to the Gurulauncher script and the Guru app to capture runtime logs and JavaScript errors while the app is running.

## Overview

The system now provides two complementary approaches for capturing runtime logs:

1. **In-app logging service** (`src/services/loggingService.ts`) - Captures JavaScript console logs, errors, and React Native errors within the app
2. **Enhanced Gurulauncher API** - New `/api/logs` endpoint to stream Android logcat output including ReactNativeJS logs

## Components

### 1. Logging Service (`src/services/loggingService.ts`)

A TypeScript service that intercepts console methods and global error handlers to capture logs in memory.

#### Features:

- Intercepts `console.log`, `console.info`, `console.warn`, `console.error`, `console.debug`
- Captures global JavaScript errors (`window.onerror`)
- Captures unhandled promise rejections (`window.onunhandledrejection`)
- Integrates with React Native ErrorUtils for fatal/non-fatal errors
- Stores logs in a circular buffer (max 1000 entries)
- Optional persistence to AsyncStorage in development mode
- Provides API to retrieve, export, and clear logs

#### Usage in the App:

```typescript
import { loggingService, logger } from '../services/loggingService';

// Initialize (automatically done in development)
loggingService.init();

// Programmatic logging
logger.info('User started session');
logger.error('API request failed', error);

// Get logs
const allLogs = loggingService.getLogs();
const errorLogs = loggingService.getLogs('error');

// Export logs
const textLogs = loggingService.exportAsText();
const jsonLogs = loggingService.exportAsJSON();

// Clear logs
loggingService.clearLogs();
```

#### Automatic Initialization:

The service automatically initializes in development mode (`__DEV__ === true`) with a 1-second delay to avoid interfering with app startup.

### 2. Enhanced Gurulauncher API

The Gurulauncher server (`scripts/launcher/server.js`) now includes a new endpoint for streaming Android logs.

#### New Endpoint: `/api/logs`

**GET** `http://localhost:3100/api/logs`

Streams ADB logcat output with filtering for the Guru app and ReactNativeJS logs.

##### Query Parameters:

- `level` (optional): Log level - `V` (verbose), `D` (debug), `I` (info), `W` (warn), `E` (error), `S` (silent). Default: `V`
- `package` (optional): Android package name. Default: Guru debug package
- `follow` (optional): `true` to stream continuously, `false` to dump and exit. Default: `true`

##### Examples:

```bash
# Stream all logs continuously
curl http://localhost:3100/api/logs

# Stream only error logs
curl http://localhost:3100/api/logs?level=E

# Dump recent logs and exit
curl http://localhost:3100/api/logs?follow=false
```

##### Browser Access:

Open `http://localhost:3100/api/logs` in a browser to see real-time log streaming.

#### Integration with Existing Launcher UI:

The launcher already has an "Android Logs" action in the UI that runs `adb logcat -d -t 200`. The new API endpoint provides a streaming alternative.

### 3. Existing `fetchLogs.js` Script

The existing `scripts/fetchLogs.js` script remains unchanged and can still be used for command-line log capture:

```bash
node scripts/fetchLogs.js
node scripts/fetchLogs.js --level E
```

## How It Works

### JavaScript Log Capture

1. When the logging service initializes, it replaces console methods with wrappers
2. Each console call is captured and stored with timestamp, level, message, and optional data
3. Global error handlers capture uncaught errors and promise rejections
4. Logs are stored in memory with circular buffer behavior to prevent memory leaks

### Android Log Streaming

1. The `/api/logs` endpoint spawns an `adb logcat` process
2. Filters are applied to show only relevant logs:
   - App package logs (e.g., `com.guru.debug`)
   - `ReactNativeJS` logs (JavaScript console output)
3. Output is streamed directly to the HTTP response
4. When client disconnects, the logcat process is terminated

## Privacy Considerations

- **Development Only**: The in-app logging service only persists logs to AsyncStorage in development mode (`__DEV__`)
- **Memory-Only in Production**: In production builds, logs are kept only in memory (circular buffer)
- **No Sensitive Data**: Console logs may contain sensitive data; users should be aware when sharing logs
- **Optional Persistence**: Persistence can be disabled by setting `ENABLE_PERSISTENCE = false` in the logging service

## Testing

### TypeScript Compilation

```bash
npx tsc --noEmit --skipLibCheck src/services/loggingService.ts
```

### Server Syntax Check

```bash
node -c scripts/launcher/server.js
```

### Manual Testing

1. Start the Gurulauncher: `node scripts/launcher/launch.js`
2. Open `http://localhost:3100/api/logs` in a browser
3. Run the Guru app on an Android device/emulator
4. Observe logs appearing in real-time
5. Trigger console logs in the app to see `ReactNativeJS` entries

## Future Enhancements

1. **WebSocket Support**: Real-time push of logs from app to launcher
2. **Log Filtering UI**: Web interface to filter logs by level, source, or keyword
3. **Log Export**: Download logs as text or JSON from the launcher UI
4. **Performance Metrics**: Capture and display performance data alongside logs
5. **Crash Reporting**: Automatic upload of error logs to analytics service

## Files Modified

1. `src/services/loggingService.ts` - New logging service
2. `scripts/launcher/server.js` - Added `/api/logs` endpoint

## Dependencies

- React Native AsyncStorage (already in project)
- Child process spawning (Node.js built-in)
- ADB command-line tool (required for Android log streaming)

## Troubleshooting

### No logs appearing

- Ensure Android device is connected and authorized for USB debugging
- Check that the app is running (not crashed)
- Verify package name matches the installed app

### ADB not found

- Install Android SDK Platform Tools
- Add `adb` to your PATH
- Restart terminal/launcher

### ReactNativeJS logs not appearing

- Ensure app is running in development mode
- Check that Metro bundler is running
- Restart the app if logs don't appear after initial launch

### Memory usage concerns

- Circular buffer limits logs to 1000 entries
- In production, persistence is disabled
- Logs are automatically pruned when buffer is full
