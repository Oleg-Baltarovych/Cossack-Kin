import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

// M1-01 import rules: break_eternity.js only through src/core/big.ts; relative imports in core/content end in .ts.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const eslint = new ESLint({ cwd: root, overrideConfig: tseslint.configs.disableTypeChecked });

async function tags(code: string, file: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) });
  if (!result) throw new Error('ESLint returned no result');
  return result.messages.map((m) => /imports\[([a-z-]+)\]/.exec(m.message)?.[1] ?? `other:${m.ruleId ?? 'fatal'}`);
}

const BIG = "import Decimal from 'break_eternity.js';\nexport const d = new Decimal(1);\n";

describe('M1-01 import rules', () => {
  it('break_eternity.js: allowed in src/core/big.ts only', async () => {
    expect(await tags(BIG, 'src/core/big.ts')).toEqual([]);
    expect(await tags(BIG, 'src/core/__other__.ts')).toEqual(['big-only']);
    expect(await tags(BIG, 'src/content/__c__.ts')).toEqual(['big-only']);
    expect(await tags(BIG, 'src/render/__r__.ts')).toEqual(['big-only']);
    expect(await tags(BIG, 'tools/__t__.ts')).toEqual(['big-only']);
  });

  it('src/core/big.ts may import break_eternity.js but keeps the core boundary', async () => {
    const outer = "import { a } from '../render/x.ts';\nexport const b = a;\n";
    expect(await tags(outer, 'src/core/big.ts')).toEqual(['other:no-restricted-imports']);
    expect(await tags(outer, 'src/content/__c__.ts')).toEqual(['other:no-restricted-imports']);
  });

  it('render reads the game, never acts on it (M1-19): no actions/advance/offline/store values; types are fine', async () => {
    for (const mod of ['actions', 'advance', 'offline', 'store']) {
      const value = `import { x } from '../core/${mod}.ts';\nexport const y = x;\n`;
      expect(await tags(value, 'src/render/__r__.ts'), mod).toEqual(['render-actions']);
      expect(await tags(value.replace('../core', '../../core'), 'src/render/layers/__r__.ts'), mod).toEqual([
        'render-actions',
      ]);
    }
    const typeOnly = "import type { GameStore } from '../core/store.ts';\nexport type S = GameStore;\n";
    expect(await tags(typeOnly, 'src/render/__r__.ts')).toEqual([]);
    const selectors = "import { visualTiers } from '../core/selectors.ts';\nexport const v = visualTiers;\n";
    expect(await tags(selectors, 'src/render/__r__.ts')).toEqual([]);
  });

  it('e2e specs take `test` from the shared fixture (helpers/test.ts); Playwright types are fine', async () => {
    const direct = "import { test } from '@playwright/test';\ntest('t', () => {});\n";
    expect(await tags(direct, 'tests/e2e/specs/__s__.spec.ts')).toEqual(['test-fixture']);
    expect(await tags(direct, 'tests/e2e/__seed__.spec.ts')).toEqual(['test-fixture']);
    expect(await tags(direct, 'tests/e2e/helpers/__h__.ts')).toEqual([]);
    const shared =
      "import type { Page } from '@playwright/test';\nimport { test } from '../helpers/test.ts';\n" +
      'export const t = test;\nexport type P = Page;\n';
    expect(await tags(shared, 'tests/e2e/specs/__s__.spec.ts')).toEqual([]);
  });

  it('core and content: relative imports must end in .ts', async () => {
    const bare = "import { x } from './y';\nexport const z = x;\n";
    const withExt = "import { x } from './y.ts';\nexport const z = x;\n";
    for (const file of ['src/core/__a__.ts', 'src/content/__a__.ts']) {
      expect(await tags(bare, file), file).toEqual(['ts-ext']);
      expect(await tags(withExt, file), file).toEqual([]);
    }
    // Outside core/content the bundler resolves bare relative imports.
    expect(await tags(bare, 'src/render/__a__.ts')).toEqual([]);
  });
});
