/* eslint-env node */
/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.unit.test.ts', '**/*.unit.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  globals: {
    __DEV__: true,
  },
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: { module: 'commonjs', jsx: 'react' }, isolatedModules: true }],
    '^.+\\.(js|jsx)$': 'babel-jest',
    'node_modules/.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    "node_modules/(?!(jest-runner|@react-native|react-native|react-native-reanimated|@react-navigation|expo/.*|expo-.*|@expo/.*|@unimodules/.*|unimodules|sentry-expo|native-base|@sentry/.*)/)"
  ],
};
