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
      'coverage/',
      'reports/',
      'public/',
      'test-results/',
      'playwright-report/',
      '.claude/',
      'tests/fixtures/lint/',
      // Playwright is installed in M0-07; un-ignore (and add to tsconfig.tests.json) then.
      'tests/e2e/',
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
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^(pixi\\.js|pixi-filters|react|react-dom|howler)(/.*)?$', message: RENDER_PACKAGE },
            { regex: '^@(pixi|capacitor)/', message: RENDER_PACKAGE },
            { regex: '^(\\.\\./)+(render|ui|platform|audio|i18n)(/|$)', message: OUTER_LAYER },
          ],
        },
      ],
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
);
