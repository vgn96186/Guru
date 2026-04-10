import { Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { SENTRY_DSN } from '../../config/appConfig';

const sentryEnabled = SENTRY_DSN.length > 0;
const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
  ignoreEmptyBackNavigationTransactions: true,
});

let initialized = false;

export function initializeSentry(): void {
  if (initialized || !sentryEnabled) {
    initialized = true;
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: !__DEV__,
    integrations: [navigationIntegration, Sentry.reactNativeTracingIntegration()],
    tracesSampleRate: __DEV__ ? 1 : 0.2,
    attachStacktrace: true,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.Authorization;
        delete event.request.headers['x-api-key'];
        delete event.request.headers['X-API-Key'];
      }
      return event;
    },
  });

  Sentry.setTag('platform', Platform.OS);
  initialized = true;
}

export function registerNavigationContainer(navigationContainerRef: unknown): void {
  if (!sentryEnabled) return;
  navigationIntegration.registerNavigationContainer(navigationContainerRef);
}

export function captureException(
  error: unknown,
  context?: {
    component?: string;
    extras?: Record<string, unknown>;
  },
): void {
  if (!sentryEnabled) return;
  Sentry.withScope((scope) => {
    if (context?.component) {
      scope.setTag('guru.component', context.component);
    }
    if (context?.extras) {
      Object.entries(context.extras).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }
    Sentry.captureException(error);
  });
}

export function isSentryEnabled(): boolean {
  return sentryEnabled;
}
