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
