import * as Sentry from '@sentry/react-native';
import { SENTRY_DSN } from '../config/bundledEnv';
import { logErrorToDatabase } from './errorLoggingService';

let isInitialized = false;

export function initErrorReporting() {
  if (isInitialized) return;

  if (!SENTRY_DSN) {
    if (__DEV__) {
      console.log('[Sentry] DSN not found, skipping initialization.');
    }
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
    // We recommend adjusting this value in production.
    tracesSampleRate: 1.0,
    _experiments: {
      // profilesSampleRate is relative to tracesSampleRate.
      // Here, we'll capture profiles for 100% of transactions.
      profilesSampleRate: 1.0,
    },
    beforeSend(event) {
      // PII Scrubbing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
      const scrubEvent = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const lowerKey = key.toLowerCase();
            if (
              lowerKey.includes('email') ||
              lowerKey.includes('apikey') ||
              lowerKey.includes('token') ||
              lowerKey.includes('groqapikey') ||
              lowerKey.includes('openrouterkey') ||
              lowerKey.includes('openrouterapikey')
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
  if (__DEV__) {
    console.log('[Sentry] Initialized successfully.');
  }
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  // 1. Always log to local SQLite database for offline capture
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  logErrorToDatabase({
    error: errorMessage,
    stack: errorStack,
    timestamp: Date.now(),
    context: context ? JSON.stringify(context) : undefined,
  }).catch((e) => {
    if (__DEV__) console.warn('[errorReporting] Failed to log to local DB:', e);
  });

  // 2. Forward to Sentry if initialized
  if (isInitialized) {
    if (error instanceof Error) {
      Sentry.captureException(error, { extra: context });
    } else {
      Sentry.captureMessage(String(error), { extra: context });
    }
  }
}

export function setUserContext(userId: string) {
  if (isInitialized) {
    Sentry.setUser({ id: userId });
  }
}
