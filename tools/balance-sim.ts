// `pnpm balance [--check] [--days N] [--seeds 1,2,3]` (SPEC §12.3; plan M1-14). Runs the greedy bot on the real core for
// each seed, writes reports/balance/<date>/{report.md,metrics.csv} and reports/balance/latest.md, prints the corridor
// verdict. `--check` exits 1 when a gated metric is outside src/content/pacing.ts, or when 60 days of play take more
// than SIM_BUDGET_MS of this thread's CPU (the simulator must stay fast enough to tune with; measured here, alone,
// because a parallel `pnpm test` on a throttled laptop inflates it — M2-22 review).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluate, renderCsv, renderReport } from './lib/balance/report.ts';
import { simulate } from './lib/balance/sim.ts';

const DEFAULT_DAYS = 14;
const DEFAULT_SEEDS = [1, 2, 3];
/** The speed gate of `--check`: 60 days of one seed in at most this much thread CPU (ms). */
const SIM_BUDGET_MS = 10_000;
const SIM_BUDGET_DAYS = 60;
const SIM_BUDGET_SEED = 3;
const US_PER_MS = 1000;

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
let slow = false;
if (check) {
  const t = process.threadCpuUsage();
  simulate({ seed: SIM_BUDGET_SEED, days: SIM_BUDGET_DAYS });
  const { user, system } = process.threadCpuUsage(t);
  const ms = Math.round((user + system) / US_PER_MS);
  slow = ms > SIM_BUDGET_MS;
  console.log(
    `${slow ? '✗' : '✓'} ${String(SIM_BUDGET_DAYS)} days simulate in ${String(ms)} ms CPU (budget ${String(SIM_BUDGET_MS)} ms)`,
  );
}
if (check && (failed.length > 0 || slow)) process.exit(1);
