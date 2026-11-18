// @ts-check
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

// src/core boundary: 1:1 with .claude/hooks/core-purity.mjs (SPEC §0.2, §9). Each message carries a
// `core-purity[<rule>]` tag; tests/unit/lint/core-purity.test.ts checks every tag against a fixture.
const msg = (/** @type {string} */ rule, /** @type {string} */ text) => `core-purity[${rule}]: ${text}`;
const RENDER_PACKAGE = msg('render-package', 'src/core must not import render/UI/platform packages.');
const OUTER_LAYER = msg('outer-layer', 'src/core must not import from render/ui/platform/audio/i18n.');
const CLOCK = msg('clock', 'src/core must not read the clock — take `now` as a parameter.');
const RANDOM = msg('random', 'src/core must not use Math.random — use the seeded RNG from state (core/rng.ts).');
const BROWSER_GLOBAL = msg('browser-global', 'src/core must not touch browser globals.');
const TIMER = msg('timer', 'src/core must not schedule timers — the loop driver lives outside core.');

// Import rules of M1-01 (tagged `imports[<rule>]`, checked by tests/unit/lint/imports.test.ts).
/** break_eternity.js only through `Big` (SPEC §3.1): src/core/big.ts is its one importer. */
const BIG_LIB = {
  regex: '^break_eternity\\.js(/.*)?$',
  message: 'imports[big-only]: break_eternity.js is imported only by src/core/big.ts — use `Big`.',
};
/** Relative imports in core/content end in `.ts`: Node runs them without a bundler (balance-sim). */
const NO_TS_EXT = {
  regex: '^\\.{1,2}/(?!.*\\.ts$)',
  message: 'imports[ts-ext]: relative imports in src/core and src/content end in `.ts` (Node runs them directly).',
};
/**
 * Render reads the game and never changes it (rules/render.md, plan M1-19): no player actions, no offline/advance
 * reducers, no store factory. Selectors, state types and event types are fine.
 */
const RENDER_WRITES = {
  regex: '^(\\.\\./)+core/(actions|advance|offline|store)(\\.ts)?$',
  message:
    'imports[render-actions]: render must not import game actions or reducers — read state via core selectors and store events (render/bridge.ts).',
  allowTypeImports: true,
};
const CORE_PATTERNS = [
  { regex: '^(pixi\\.js|pixi-filters|react|react-dom|howler)(/.*)?$', message: RENDER_PACKAGE },
  { regex: '^@(pixi|capacitor)/', message: RENDER_PACKAGE },
  { regex: '^(\\.\\./)+(render|ui|platform|audio|i18n)(/|$)', message: OUTER_LAYER },
];

/** @type {import('eslint').Rule.RuleModule} */
const requireDisableReason = {
  meta: {
    type: 'problem',
    docs: { description: 'Allow only `eslint-disable-next-line <rule> -- <reason>` directives.' },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const text = comment.value.trim();
          if (!/^eslint-disable/.test(text)) continue;
          const nextLineWithReason = /^eslint-disable-next-line\s+\S.*\s--\s+\S/.test(text);
          if (!nextLineWithReason) {
            context.report({
              loc: comment.loc ?? { line: 1, column: 0 },
              message:
                'Use `eslint-disable-next-line <rule> -- <reason>`; file- and line-wide disables are not allowed.',
            });
          }
        }
      },
    };
  },
};

export default defineConfig(
  {
    ignores: [
      'dist/',
      'dist-test/',
      'coverage/',
      'reports/',
      'public/',
      'test-results/',
      'playwright-report/',
      '.claude/',
      'tests/fixtures/lint/',
    ],
  },
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { local: { rules: { 'require-disable-reason': requireDisableReason } } },
    rules: {
      'local/require-disable-reason': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      // Security backstop (M0-12 review, security.md): the strict CSP blocks these at runtime anyway.
      'no-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [BIG_LIB] }] },
  },
  {
    // Content is data: the same purity boundary as core (no render/UI/platform), plus the import rules.
    files: ['src/content/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [...CORE_PATTERNS, BIG_LIB, NO_TS_EXT] }] },
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...CORE_PATTERNS, BIG_LIB, NO_TS_EXT] }],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB'].map((name) => ({
          name,
          message: BROWSER_GLOBAL,
        })),
        ...['setTimeout', 'setInterval', 'requestAnimationFrame'].map((name) => ({ name, message: TIMER })),
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "MemberExpression[object.name='Date'][property.name='now']", message: CLOCK },
        { selector: "NewExpression[callee.name='Date']", message: CLOCK },
        { selector: "MemberExpression[object.name='performance'][property.name='now']", message: CLOCK },
        { selector: "MemberExpression[object.name='Math'][property.name='random']", message: RANDOM },
      ],
    },
  },
  {
    files: ['src/render/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [BIG_LIB, RENDER_WRITES] }] },
  },
  {
    // The one door to break_eternity.js (keeps the core boundary and the .ts rule).
    files: ['src/core/big.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [...CORE_PATTERNS, NO_TS_EXT] }] },
  },
);
