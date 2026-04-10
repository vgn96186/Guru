const React = require('react');

const navigationIntegration = {
  registerNavigationContainer: jest.fn(),
  options: {},
};

module.exports = {
  __esModule: true,
  init: jest.fn(),
  wrap: (Component) => Component,
  setTag: jest.fn(),
  reactNavigationIntegration: jest.fn(() => navigationIntegration),
  reactNativeTracingIntegration: jest.fn(() => ({ name: 'ReactNativeTracing' })),
  withScope: (callback) =>
    callback({
      setTag: jest.fn(),
      setExtra: jest.fn(),
    }),
  captureException: jest.fn(),
  ErrorBoundary: ({ children }) => React.createElement(React.Fragment, null, children),
};
