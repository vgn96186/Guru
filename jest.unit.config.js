/* global module */
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
  maxWorkers: 1,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.unit.test.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/*.d.ts',
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '/e2e/'],
  /** CI gates use `jest.unit.logic.config.js` (logic allowlist). Full-tree runs are informational. */
  moduleNameMapper: {
    '^expo-updates$': '<rootDir>/__mocks__/expo-updates.js',
    '^expo-asset$': '<rootDir>/__mocks__/expo-asset.js',
    '^whisper.rn$': '<rootDir>/__mocks__/whisper.rn.js',
    '^whisper\\.rn/index\\.js$': '<rootDir>/__mocks__/whisper.rn.js',
    '^llama.rn$': '<rootDir>/__mocks__/llama.rn.js',
    '^expo-sqlite$': '<rootDir>/__mocks__/expo-sqlite.js',
    '^react-native-worklets$': '<rootDir>/__mocks__/react-native-worklets.js',
    '^react-native-worklets-core$': '<rootDir>/__mocks__/react-native-worklets.js',
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: { module: 'commonjs', jsx: 'react' } }],
    '^.+\\.(js|jsx)$': 'babel-jest',
    'node_modules/.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(jest-runner|@react-native|react-native|react-native-reanimated|@react-navigation|expo/.*|expo-.*|@expo/.*|@unimodules/.*|unimodules|sentry-expo|native-base|@sentry/.*)/)',
  ],
};
