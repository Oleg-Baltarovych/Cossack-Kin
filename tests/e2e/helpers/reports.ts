// Where e2e shots for review go: `reports/screens/<local date>/` (not baselines; see screens.spec.ts for those).
import { join } from 'node:path';

/** Local calendar date as YYYY-MM-DD. */
export function today(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's review-shot folder. */
export function screensDir(): string {
  return join('reports', 'screens', today());
}
