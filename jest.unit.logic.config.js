/* global module, require */
/**
 * Option-1 "logic layer" coverage: only agreed paths count toward thresholds.
 * Screens / most components are validated with Detox, not Jest gates.
 */
const base = require('./jest.unit.config.js');

/** Paths where unit/integration tests are the source of truth for CI gates */
const LOGIC_GLOBS = [
  'src/services/**/*.{ts,tsx}',
  'src/db/**/*.{ts,tsx}',
  'src/hooks/**/*.{ts,tsx}',
  'src/store/**/*.{ts,tsx}',
  'src/schemas/**/*.{ts,tsx}',
  'src/config/**/*.{ts,tsx}',
  'src/navigation/**/*.{ts,tsx}',
  'src/constants/**/*.{ts,tsx}',
  'modules/**/*.{ts,tsx}',
  '!src/**/*.unit.test.{ts,tsx}',
  '!src/**/*.db.test.ts',
  '!src/db/testing/**',
  '!src/**/*.d.ts',
  '!src/services/webSearch/providers/**',
  '!modules/**/*.unit.test.{ts,tsx}',
];

module.exports = {
  ...base,
  collectCoverageFrom: LOGIC_GLOBS,
  /**
   * Thresholds apply only to LOGIC_GLOBS. Tune upward over time.
   * Run: npm run test:unit:coverage:logic
   */
  coverageThreshold: {
    global: {
      statements: 44,
      branches: 33,
      functions: 39,
      lines: 45,
    },
  },
};
