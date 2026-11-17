import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// M1-01 AC: Node runs the pure core directly (type stripping + `.ts` imports) — what balance-sim relies on.
describe('node tools/hello-core.ts', () => {
  it('imports src/core/big.ts under plain Node and computes with Big', () => {
    const out = execFileSync(process.execPath, ['tools/hello-core.ts'], { encoding: 'utf8' });
    expect(out).toMatch(/^core ok: 1\.15\^100 = 1174313\.\d+/);
  });
});
