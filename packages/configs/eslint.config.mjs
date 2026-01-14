import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import ts from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default defineConfig(
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    plugins: {
      import: importPlugin,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      // TypeScript rules
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: false,
        },
      ],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',

      // Import rules
      'import/no-unresolved': 'off',
      'import/no-named-as-default': 'off',
      'import/no-named-as-default-member': 'off',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      // General rules
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: 'error',
      'no-undef': 'off',
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'return' },
      ],
    },
  },
  prettier,
  {
    ignores: ['node_modules/', 'dist/', 'out/', '.next/', '__generated__/'],
  },
);
