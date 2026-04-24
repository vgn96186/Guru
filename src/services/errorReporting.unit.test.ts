jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
}));

jest.mock('./errorLoggingService', () => ({
  logErrorToDatabase: jest.fn().mockResolvedValue(undefined),
}));

describe('errorReporting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes Sentry when DSN is present', () => {
    jest.isolateModules(() => {
      jest.mock('../config/bundledEnv', () => ({
        SENTRY_DSN: 'test-dsn',
      }));
      const { initErrorReporting } = require('./errorReporting');
      const SentryMock = require('@sentry/react-native');

      initErrorReporting();

      expect(SentryMock.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'test-dsn',
          tracesSampleRate: 1.0,
        }),
      );
    });
  });

  it('does not initialize Sentry when DSN is missing', () => {
    jest.isolateModules(() => {
      jest.mock('../config/bundledEnv', () => ({
        SENTRY_DSN: '',
      }));
      const { initErrorReporting } = require('./errorReporting');
      const SentryMock = require('@sentry/react-native');

      initErrorReporting();

      expect(SentryMock.init).not.toHaveBeenCalled();
    });
  });

  it('scrubs PII from events in beforeSend', () => {
    jest.isolateModules(() => {
      jest.mock('../config/bundledEnv', () => ({
        SENTRY_DSN: 'test-dsn',
      }));
      const { initErrorReporting } = require('./errorReporting');
      const SentryMock = require('@sentry/react-native');

      initErrorReporting();

      const initCall = SentryMock.init.mock.calls[0][0];
      const beforeSend = initCall.beforeSend;

      const event = {
        user: { email: 'test@example.com', name: 'Test' },
        request: { headers: { token: 'Bearer token123', apiKey: 'secret' } },
        extra: { groqApiKey: 'groq123', openRouterKey: 'or123' },
      };

      const scrubbedEvent = beforeSend(event);

      expect(scrubbedEvent.user.email).toBe('[REDACTED]');
      expect(scrubbedEvent.user.name).toBe('Test');
      expect(scrubbedEvent.request.headers.token).toBe('[REDACTED]');
      expect(scrubbedEvent.request.headers.apiKey).toBe('[REDACTED]');
      expect(scrubbedEvent.extra.groqApiKey).toBe('[REDACTED]');
      expect(scrubbedEvent.extra.openRouterKey).toBe('[REDACTED]');
    });
  });

  it('reports error to local DB and Sentry', () => {
    jest.isolateModules(() => {
      jest.mock('../config/bundledEnv', () => ({
        SENTRY_DSN: 'test-dsn',
      }));
      const { initErrorReporting, reportError } = require('./errorReporting');
      const SentryMock = require('@sentry/react-native');
      const { logErrorToDatabase } = require('./errorLoggingService');

      initErrorReporting();

      const error = new Error('Test error');
      reportError(error, { contextKey: 'contextValue' });

      expect(logErrorToDatabase).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Test error',
          context: JSON.stringify({ contextKey: 'contextValue' }),
        }),
      );

      expect(SentryMock.captureException).toHaveBeenCalledWith(error, {
        extra: { contextKey: 'contextValue' },
      });
    });
  });

  it('reports string error to local DB and Sentry', () => {
    jest.isolateModules(() => {
      jest.mock('../config/bundledEnv', () => ({
        SENTRY_DSN: 'test-dsn',
      }));
      const { initErrorReporting, reportError } = require('./errorReporting');
      const SentryMock = require('@sentry/react-native');
      const { logErrorToDatabase } = require('./errorLoggingService');

      initErrorReporting();

      reportError('String error', { contextKey: 'contextValue' });

      expect(logErrorToDatabase).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'String error',
        }),
      );

      expect(SentryMock.captureMessage).toHaveBeenCalledWith('String error', {
        extra: { contextKey: 'contextValue' },
      });
    });
  });

  it('sets user context', () => {
    jest.isolateModules(() => {
      jest.mock('../config/bundledEnv', () => ({
        SENTRY_DSN: 'test-dsn',
      }));
      const { initErrorReporting, setUserContext } = require('./errorReporting');
      const SentryMock = require('@sentry/react-native');

      initErrorReporting();
      setUserContext('user123');

      expect(SentryMock.setUser).toHaveBeenCalledWith({ id: 'user123' });
    });
  });
});
