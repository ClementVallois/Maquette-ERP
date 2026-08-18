import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Module boundaries are NOT here: dependency-cruiser owns them, so a violation fails its own
// CI job instead of hiding inside a lint run. See docs/adr/0001.

// `no-restricted-syntax` does not merge across config blocks — a later block replaces the whole
// list. Hence the constant, re-injected on both sides.
const NATIVE_ERROR_CTORS =
  '/^(Error|TypeError|RangeError|SyntaxError|ReferenceError|EvalError|URIError|AggregateError)$/';
// The wall clock, not the `Date` constructor. Domain code may not read time at all (the block
// below forbids both forms); a TEST may build a fixed instant — that is what a fake clock is —
// but reading `new Date()` or `Date.now()` in one makes the assertion depend on the day it runs.
const NO_WALL_CLOCK = [
  {
    selector: 'NewExpression[callee.name="Date"][arguments.length=0]',
    message:
      'No `new Date()` without an argument: a test that reads the wall clock passes today and fails on 29 February. Build a fixed instant.',
  },
  {
    selector: 'MemberExpression[object.name="Date"][property.name="now"]',
    message: 'No `Date.now()` in a test: build a fixed instant instead.',
  },
];

const NO_BARE_ERROR = [
  {
    selector: `ThrowStatement > :matches(NewExpression, CallExpression)[callee.name=${NATIVE_ERROR_CTORS}]`,
    message:
      'Throw a typed error: a business error (expected, part of the contract) or a technical failure (retryable). Never a bare `new Error()`.',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/*.d.ts',
      // Deliberate boundary violation, excluded from tsconfig. dependency-cruiser reads it.
      '**/__boundary-fixture__/**',
    ],
  },

  js.configs.recommended,

  // `projectService` is required: without it the type-aware rules below silently report nothing
  // while the config still looks like it enforces them.
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
      parserOptions: {
        projectService: { allowDefaultProject: ['*.js', '*.mjs', '*.cjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    settings: {
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: ['tsconfig.json', 'packages/*/tsconfig.json'],
          noWarnOnMultipleProjects: true,
        },
      },
    },
  },

  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { 'import-x': importX },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/only-throw-error': 'error',
      'no-restricted-syntax': ['error', ...NO_BARE_ERROR],

      // Not in strictTypeChecked: a missing `case` on a union has to break the build.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'error',
      'no-param-reassign': ['error', { props: true, ignorePropertyModificationsFor: ['acc'] }],
      'prefer-const': 'error',

      'import-x/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: [
            '**/*.test.ts',
            '**/*.int.test.ts',
            '**/testing/**',
            '**/*.config.ts',
            'eslint.config.js',
          ],
        },
      ],
      'import-x/no-cycle': ['error', { maxDepth: Infinity }],
      'import-x/no-default-export': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [{ pattern: '@erp/**', group: 'internal', position: 'before' }],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },

  {
    // The kernel is in this list for the reason ADR-0033 gives: it holds domain-grade code and
    // has no `domain/` directory to be matched by the first glob.
    files: ['packages/*/src/domain/**/*.ts', 'packages/platform/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...NO_BARE_ERROR,
        {
          selector: 'NewExpression[callee.name="Date"]',
          message: 'No `new Date()` in the domain: time comes from the injected `Clock` port.',
        },
        {
          selector: 'MemberExpression[object.name="Date"][property.name="now"]',
          message: 'No `Date.now()` in the domain: use the injected `Clock` port.',
        },
        {
          selector: 'MethodDefinition[kind="set"]',
          message:
            'No public setter: an object must not be able to exist in an invalid state. Invariants belong in the factory or the constructor.',
        },
      ],
    },
  },

  {
    files: ['**/*.test.ts', '**/*.int.test.ts', '**/testing/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      // Replaces the domain block's list for test files — `no-restricted-syntax` does not merge.
      // A fake clock is built from a literal instant, so the absolute ban on `new Date(...)` is
      // narrowed here to the wall clock, and the ban on bare errors is re-injected unchanged.
      'no-restricted-syntax': ['error', ...NO_BARE_ERROR, ...NO_WALL_CLOCK],
      // No `packageDir`: each test is judged against the package.json of ITS OWN package, so a
      // domain test importing an ORM fails here.
      'import-x/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  },

  {
    files: ['**/*.config.ts', '**/*.config.js', '**/*.cjs', 'eslint.config.js'],
    rules: {
      'import-x/no-default-export': 'off',
      'no-restricted-syntax': 'off',
    },
  },

  {
    // The console IS the expected output of repository tooling.
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    // dependency-cruiser loads its config through require().
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  // Always last: neutralises anything that would fight Prettier.
  prettier,
);
