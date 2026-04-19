/* global module */
/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.unit.test.ts', '**/*.unit.test.tsx', '**/*.db.test.ts'],
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
    '!src/**/*.db.test.ts',
    '!src/**/__tests__/**',
    '!src/db/testing/**',
    '!src/**/*.d.ts',
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '/e2e/'],
  /** CI gates use `jest.unit.logic.config.js` (logic allowlist). Full-tree runs are informational. */
  moduleNameMapper: {
    '^expo-updates$': '<rootDir>/__mocks__/expo-updates.js',
    '^expo-asset$': '<rootDir>/__mocks__/expo-asset.js',
    '^expo-image$': '<rootDir>/__mocks__/expo-image.js',
    '^expo-network$': '<rootDir>/__mocks__/expo-network.js',
    '^whisper.rn$': '<rootDir>/__mocks__/whisper.rn.js',
    '^whisper\\.rn/index\\.js$': '<rootDir>/__mocks__/whisper.rn.js',
    '^expo-sqlite$': '<rootDir>/__mocks__/expo-sqlite.js',
    '^react-native-worklets$': '<rootDir>/__mocks__/react-native-worklets.js',
    '^react-native-worklets-core$': '<rootDir>/__mocks__/react-native-worklets.js',
    '^@sentry/react-native$': '<rootDir>/__mocks__/sentry-react-native.js',
    '^react-native-keyboard-controller$': '<rootDir>/__mocks__/react-native-keyboard-controller.js',
    '^@gorhom/bottom-sheet$': '<rootDir>/__mocks__/gorhom-bottom-sheet.js',
    '^@shopify/flash-list$': '<rootDir>/__mocks__/shopify-flash-list.js',
  },
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          jsx: 'react',
          rootDir: '.',
          ignoreDeprecations: '5.0',
        },
      },
    ],
    '^.+\\.(js|jsx)$': 'babel-jest',
    'node_modules/.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(jest-runner|@react-native|react-native|react-native-reanimated|react-native-markdown-display|@react-navigation|expo/.*|expo-.*|@expo/.*|@unimodules/.*|unimodules|sentry-expo|native-base|@sentry/.*|jsonrepair)/)',
  ],
};
