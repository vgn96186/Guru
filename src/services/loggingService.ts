/**
 * Logging service for capturing runtime logs and errors in the Guru app.
 * Intercepts console methods and global error handlers to collect logs
 * that can be fetched by the Gurulauncher.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'log';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: any[];
  source?: string;
  stack?: string;
  metadata?: Record<string, any>;
}

// Configuration
const MAX_LOG_ENTRIES = 1000; // Circular buffer size
const LOG_STORAGE_KEY = '@guru_app_logs';
const ENABLE_PERSISTENCE = __DEV__; // Only persist in dev mode for privacy

class LoggingService {
  private logs: LogEntry[] = [];
  private originalConsoleMethods: Record<string, (...args: any[]) => void> = {};
  private isInitialized = false;
  private listeners: ((entry: LogEntry) => void)[] = [];

  /**
   * Initialize the logging service
   */
  init() {
    if (this.isInitialized) return;
    
    this.interceptConsole();
    this.setupGlobalErrorHandlers();
    this.loadPersistedLogs();
    
    this.isInitialized = true;
    this.log('info', 'LoggingService initialized');
  }

  /**
   * Intercept console methods (log, info, warn, error, debug)
   */
  private interceptConsole() {
    const methods: LogLevel[] = ['log', 'info', 'warn', 'error', 'debug'];
    
    methods.forEach((method) => {
      this.originalConsoleMethods[method] = (console as any)[method];
      
      (console as any)[method] = (...args: any[]) => {
        // Call original console method
        this.originalConsoleMethods[method].apply(console, args);
        
        // Capture the log
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        
        this.addLog(method === 'log' ? 'info' : method, message, args);
      };
    });
  }

  /**
   * Set up global error handlers
   */
  private setupGlobalErrorHandlers() {
    // JavaScript error handler
    if (typeof window !== 'undefined') {
      const originalOnError = window.onerror;
      window.onerror = (message, source, lineno, colno, error) => {
        this.addLog('error', `Uncaught error: ${message}`, [], {
          metadata: { source, lineno, colno, stack: error?.stack }
        });
        
        // Call original handler if exists
        if (originalOnError) {
          return originalOnError(message, source, lineno, colno, error);
        }
        return false;
      };

      // Unhandled promise rejection handler
      const originalOnUnhandledRejection = window.onunhandledrejection;
      window.onunhandledrejection = (event: PromiseRejectionEvent) => {
        const reason = event.reason;
        const message = reason instanceof Error ? reason.message : String(reason);
        const stack = reason instanceof Error ? reason.stack : undefined;
        
        this.addLog('error', `Unhandled promise rejection: ${message}`, [], {
          metadata: { stack }
        });
        
        // Call original handler if exists
        if (originalOnUnhandledRejection) {
          // Use call to preserve 'this' context
          return (originalOnUnhandledRejection as any).call(window, event);
        }
        return false;
      };
    }

    // React Native ErrorUtils handler
    const ErrorUtils = (global as any).ErrorUtils;
    if (ErrorUtils) {
      const originalErrorHandler = ErrorUtils.getGlobalHandler();
      ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
        this.addLog('error', `React Native ${isFatal ? 'fatal' : 'non-fatal'} error: ${error.message}`, [], {
          metadata: { stack: error.stack, isFatal }
        });
        
        // Call original handler
        originalErrorHandler(error, isFatal);
      });
    }
  }

  /**
   * Add a log entry
   */
  private addLog(level: LogLevel, message: string, data?: any[], metadata?: Partial<LogEntry>) {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      level,
      message,
      data,
      ...metadata
    };

    // Add to circular buffer
    this.logs.push(entry);
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs.shift();
    }

    // Notify listeners
    this.listeners.forEach(listener => listener(entry));

    // Persist if enabled
    if (ENABLE_PERSISTENCE) {
      this.persistLogs();
    }
  }

  /**
   * Log a message programmatically
   */
  log(level: LogLevel, message: string, ...data: any[]) {
    this.addLog(level, message, data);
  }

  /**
   * Get all logs (optionally filtered by level)
   */
  getLogs(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.logs.filter(log => log.level === level);
    }
    return [...this.logs];
  }

  /**
   * Get logs since a specific timestamp
   */
  getLogsSince(timestamp: number): LogEntry[] {
    return this.logs.filter(log => log.timestamp >= timestamp);
  }

  /**
   * Clear all logs
   */
  clearLogs() {
    this.logs = [];
    if (ENABLE_PERSISTENCE) {
      AsyncStorage.removeItem(LOG_STORAGE_KEY);
    }
  }

  /**
   * Add a listener for new log entries
   */
  addListener(listener: (entry: LogEntry) => void) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Remove all listeners
   */
  removeAllListeners() {
    this.listeners = [];
  }

  /**
   * Export logs as text
   */
  exportAsText(): string {
    return this.logs.map(log => {
      const date = new Date(log.timestamp).toISOString();
      return `[${date}] [${log.level.toUpperCase()}] ${log.message}${log.stack ? '\n' + log.stack : ''}`;
    }).join('\n');
  }

  /**
   * Export logs as JSON
   */
  exportAsJSON(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Persist logs to AsyncStorage
   */
  private async persistLogs() {
    try {
      await AsyncStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(this.logs.slice(-100))); // Only persist last 100
    } catch (error) {
      // Silently fail - logging shouldn't break the app
    }
  }

  /**
   * Load persisted logs from AsyncStorage
   */
  private async loadPersistedLogs() {
    if (!ENABLE_PERSISTENCE) return;
    
    try {
      const stored = await AsyncStorage.getItem(LOG_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.logs = parsed;
        }
      }
    } catch (error) {
      // Silently fail
    }
  }

  /**
   * Restore original console methods
   */
  destroy() {
    // Restore console methods
    Object.keys(this.originalConsoleMethods).forEach(method => {
      (console as any)[method] = this.originalConsoleMethods[method];
    });
    
    this.removeAllListeners();
    this.isInitialized = false;
  }
}

// Singleton instance
export const loggingService = new LoggingService();

// Convenience methods
export const logger = {
  debug: (message: string, ...data: any[]) => loggingService.log('debug', message, ...data),
  info: (message: string, ...data: any[]) => loggingService.log('info', message, ...data),
  warn: (message: string, ...data: any[]) => loggingService.log('warn', message, ...data),
  error: (message: string, ...data: any[]) => loggingService.log('error', message, ...data),
  log: (message: string, ...data: any[]) => loggingService.log('info', message, ...data),
};

// Initialize automatically in development
if (__DEV__) {
  // Delay initialization to avoid interfering with app startup
  setTimeout(() => {
    loggingService.init();
  }, 1000);
}