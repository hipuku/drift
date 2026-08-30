import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * drift is two programs in one repo: a Node service under `src/` and a browser
 * client under `client/src/`. They need different globals, and the crawler needs
 * both — its extraction functions are authored against the DOM but shipped to
 * the page by Playwright from Node.
 */
export default defineConfig([
  globalIgnores([
    'dist',
    'client/dist',
    'node_modules',
    'appendonlydir',
    '**/*.rdb',
  ]),

  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // The service.
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  {
    // In-page extraction: serialised by page.evaluate and run in the browser,
    // so it is authored against the DOM even though it lives in the Node half.
    files: ['src/crawler/extract.ts', 'src/crawler/discover.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  {
    files: ['client/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
    rules: {
      // Errors, not warnings. A warning does not fail CI, so a count of them
      // only ever grows — and both of the two this repo carried turned out to
      // be real: each was a type declaring a field optional that is always
      // present, so `?? []` built a new array every render and defeated the
      // memo below it. A dependency warning is worth reading, which means it is
      // worth being unable to ignore. Suppress a specific one at its own site,
      // with a comment saying why, as AuditFlow.tsx does.
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  {
    files: ['**/*.test.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser, ...globals.vitest } },
  },

  {
    files: ['**/*.config.{ts,js,mjs}'],
    languageOptions: { globals: globals.node },
  },
])
