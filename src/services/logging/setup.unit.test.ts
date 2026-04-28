import { setupLogging } from './setup';

jest.mock('../logger', () => ({
  logger: {
    addSink: jest.fn(),
  },
}));

jest.mock('./sinks/devConsoleSink', () => ({
  devConsoleSink: { name: 'devConsoleSink' },
}));

jest.mock('./sinks/sqliteSink', () => ({
  sqliteSink: { name: 'sqliteSink' },
}));

jest.mock('./sinks/sentrySink', () => ({
  sentrySink: { name: 'sentrySink' },
  initSentry: jest.fn(),
}));

jest.mock('./interceptors/consoleInterceptor', () => ({
  installConsoleInterceptor: jest.fn(),
}));

jest.mock('./interceptors/networkInterceptor', () => ({
  installNetworkInterceptor: jest.fn(),
}));

describe('setupLogging', () => {
  it('registers sinks and installs interceptors', () => {
    const { logger } = require('../logger');
    const { devConsoleSink } = require('./sinks/devConsoleSink');
    const { sqliteSink } = require('./sinks/sqliteSink');
    const { sentrySink, initSentry } = require('./sinks/sentrySink');
    const { installConsoleInterceptor } = require('./interceptors/consoleInterceptor');
    const { installNetworkInterceptor } = require('./interceptors/networkInterceptor');

    setupLogging();

    expect(logger.addSink).toHaveBeenCalledWith(devConsoleSink);
    expect(logger.addSink).toHaveBeenCalledWith(sqliteSink);
    expect(logger.addSink).toHaveBeenCalledWith(sentrySink);
    expect(initSentry).toHaveBeenCalled();
    expect(installConsoleInterceptor).toHaveBeenCalled();
    expect(installNetworkInterceptor).toHaveBeenCalled();
  });
});
