const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const jest = require('eslint-plugin-jest');
const prettier = require('eslint-config-prettier');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/android/**',
      '**/ios/**',
      '**/artifacts/**',
      '**/e2e/**',
      '**/modules/**/android/**',
      '**/.claude/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-constant-condition': 'warn',
      'no-control-regex': 'warn',
      'no-empty': 'warn',
      'no-useless-assignment': 'off',
      'no-useless-escape': 'warn',
      'prefer-const': 'error',
      'preserve-caught-error': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: [
      'modules/app-launcher/withAppLauncher.js',
      'app.config.js',
      'metro.config.js',
      'babel.config.js',
      'eslint.config.js',
      'scripts/**/*.js',
      '__mocks__/**/*.js',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  {
    files: ['**/*.{test,spec}.{js,jsx,ts,tsx}', '**/*.unit.test.ts'],
    plugins: { jest },
    rules: {
      ...jest.configs.recommended.rules,
    },
  },

  // Tests lean heavily on partial mocks; typing every mock is low ROI vs app code.
  {
    files: ['**/*.{test,spec}.{ts,tsx}', '**/*.unit.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  prettier,
];
