// `pnpm balance [--check] [--days N] [--seeds 1,2,3]` (SPEC §12.3; plan M1-14). Runs the greedy bot on the real core for
// each seed, writes reports/balance/<date>/{report.md,metrics.csv} and reports/balance/latest.md, prints the corridor
// verdict. `--check` exits 1 when a gated metric is outside src/content/pacing.ts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluate, renderCsv, renderReport } from './lib/balance/report.ts';
import { simulate } from './lib/balance/sim.ts';

const DEFAULT_DAYS = 14;
const DEFAULT_SEEDS = [1, 2, 3];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const check = process.argv.includes('--check');
const days = Number(arg('--days') ?? DEFAULT_DAYS);
const seeds = (arg('--seeds') ?? DEFAULT_SEEDS.join(',')).split(',').map(Number);
if (!Number.isInteger(days) || days < 1 || seeds.some((s) => !Number.isInteger(s))) {
  console.error('usage: pnpm balance [--check] [--days N] [--seeds 1,2,3]');
  process.exit(2);
}

const results = seeds.map((seed) => simulate({ seed, days }));
const checks = evaluate(results);
const report = renderReport(results, checks);

const dir = join('reports', 'balance', new Date().toISOString().slice(0, 10));
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'report.md'), report);
writeFileSync(join(dir, 'metrics.csv'), renderCsv(results));
writeFileSync(join('reports', 'balance', 'latest.md'), report);

const failed = checks.filter((c) => c.gate && !c.ok);
for (const c of failed) console.log(`✗ seed ${String(c.seed)} ${c.id}: ${c.actual} (target ${c.target})`);
console.log(
  `${failed.length === 0 ? '✓ balance in corridor' : `✗ ${String(failed.length)} check(s) out of corridor`} — ${join(dir, 'report.md')}`,
);
if (check && failed.length > 0) process.exit(1);
