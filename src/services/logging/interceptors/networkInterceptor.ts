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
