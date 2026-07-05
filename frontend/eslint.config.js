import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'lib', 'build', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
    ],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // `rules-of-hooks` is a correctness rule (hooks must run in the same
      // order every render). The former violations — hooks after an early
      // return in AuthButton/AuthModal — were fixed in Faza 7, so it's now an
      // error to keep the tree honest. The aggressive react-compiler rules
      // shipped in eslint-plugin-react-hooks v7 (set-state-in-effect, purity,
      // immutability, refs, …) are intentionally NOT enabled on this legacy
      // codebase.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'warn',
      // The codebase leans on `any` in many places; surface it as a warning
      // so new code is nudged toward real types without blocking CI on the
      // existing backlog. Tightening to error is Faza 7 cleanup.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
]);
