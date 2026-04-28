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
