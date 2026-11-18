// Balance report and corridor check (SPEC §2.3, §12.3; plan M1-14). Pure: simulation results in, checks and text out
// (byte-stable — no clock, no locale formatting).
import { CALENDAR_LAND1, PACING, type CalendarEntry } from '../../../src/content/pacing.ts';
import type { SimResult } from './sim.ts';

const DAY_SEC = 86_400;
const SESSIONS_PER_DAY = PACING.sessionsPerDay;
const DIGITS = 2;

interface Range {
  readonly min: number;
  readonly max: number;
}

/** The corridor the check holds the run to: src/content/pacing.ts by default (a test can pass a harder one). */
export interface Corridor {
  readonly firstPurchaseMaxSec: number;
  readonly bloomDays: Range;
  readonly sessionActions: Range;
  readonly offline8hNoticeable: Range;
  readonly novelty: {
    readonly week1Sessions: number;
    readonly maxSessionsWithoutNovelty: number;
    readonly maxDaysWithoutNovelty: number;
  };
}

export interface Check {
  readonly seed: number;
  readonly id: string;
  readonly target: string;
  readonly actual: string;
  readonly ok: boolean;
  /** Report-only checks never fail `--check` (SPEC §12.3: days 8–60 of novelty). */
  readonly gate: boolean;
}

/** Longest run of zeros in `counts`. */
export function longestZeroRun(counts: readonly number[]): number {
  let best = 0;
  let run = 0;
  for (const c of counts) {
    run = c === 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

const fmt = (n: number | null): string => (n === null ? '—' : String(Number(n.toFixed(DIGITS))));

/** Novelties per session (1..n). */
export function noveltiesPerSession(r: SimResult, n: number): number[] {
  const counts = Array.from({ length: n }, () => 0);
  for (const nv of r.novelties)
    if (nv.session >= 1 && nv.session <= n) counts[nv.session - 1] = (counts[nv.session - 1] ?? 0) + 1;
  return counts;
}

/** Session in which each calendar entry first happened (null = never). */
export function calendarSessions(r: SimResult, calendar: readonly CalendarEntry[]): (number | null)[] {
  return calendar.map((c) => r.novelties.find((n) => n.kind === c.kind && n.ref === c.ref)?.session ?? null);
}

export function evaluate(
  results: readonly SimResult[],
  pacing: Corridor = PACING,
  calendar: readonly CalendarEntry[] = CALENDAR_LAND1,
): Check[] {
  const checks: Check[] = [];
  for (const r of results) {
    const add = (id: string, target: string, actual: string, ok: boolean, gate = true): void => {
      checks.push({ seed: r.seed, id, target, actual, ok, gate });
    };
    add(
      'firstPurchaseSec',
      `≤ ${String(pacing.firstPurchaseMaxSec)}`,
      fmt(r.firstPurchaseSec),
      r.firstPurchaseSec !== null && r.firstPurchaseSec <= pacing.firstPurchaseMaxSec,
    );
    const bloomDays = r.bloomSec === null ? null : r.bloomSec / DAY_SEC;
    add(
      'bloomDays',
      `${String(pacing.bloomDays.min)}–${String(pacing.bloomDays.max)}`,
      fmt(bloomDays),
      bloomDays !== null && bloomDays >= pacing.bloomDays.min && bloomDays <= pacing.bloomDays.max,
    );
    // Session metrics over the land's life: up to the bloom session (or every session without bloom).
    const upTo = r.bloomSession ?? r.sessions.length;
    const live = r.sessions.filter((s) => s.index <= upTo);
    const actions = median(live.map((s) => s.actions));
    add(
      'sessionActions (median)',
      `${String(pacing.sessionActions.min)}–${String(pacing.sessionActions.max)}`,
      fmt(actions),
      actions !== null && actions >= pacing.sessionActions.min && actions <= pacing.sessionActions.max,
    );
    const atOpen = median(live.filter((s) => s.index > 1).map((s) => s.noticeableAtOpen));
    add(
      'offline8hNoticeable (median)',
      `${String(pacing.offline8hNoticeable.min)}–${String(pacing.offline8hNoticeable.max)}`,
      fmt(atOpen),
      atOpen !== null && atOpen >= pacing.offline8hNoticeable.min && atOpen <= pacing.offline8hNoticeable.max,
    );
    const week1 = noveltiesPerSession(r, pacing.novelty.week1Sessions);
    const emptyRun = longestZeroRun(week1);
    add(
      'maxSessionsWithoutNovelty (week 1)',
      `≤ ${String(pacing.novelty.maxSessionsWithoutNovelty)}`,
      String(emptyRun),
      emptyRun <= pacing.novelty.maxSessionsWithoutNovelty,
    );
    // Days 8+: report only (M1 content runs out after the 75/100 tiers, SPEC §12.3).
    const firstLater = pacing.novelty.week1Sessions + 1;
    const later = noveltiesPerSession(r, r.sessions.length).slice(firstLater - 1);
    const perDay: number[] = [];
    for (let i = 0; i < later.length; i += SESSIONS_PER_DAY)
      perDay.push(later.slice(i, i + SESSIONS_PER_DAY).reduce((a, b) => a + b, 0));
    const emptyDays = longestZeroRun(perDay);
    add(
      'maxDaysWithoutNovelty (days 8+)',
      `≤ ${String(pacing.novelty.maxDaysWithoutNovelty)}`,
      String(emptyDays),
      emptyDays <= pacing.novelty.maxDaysWithoutNovelty,
      false,
    );
    calendarSessions(r, calendar).forEach((s, i) => {
      const c = calendar[i];
      if (!c) return;
      add(
        `calendar ${c.id}`,
        `S${String(c.sessions.min)}–S${String(c.sessions.max)}`,
        s === null ? 'never' : `S${String(s)}`,
        s !== null && s >= c.sessions.min && s <= c.sessions.max,
      );
    });
  }
  return checks;
}

/** The markdown report (SPEC §12.3). */
export function renderReport(
  results: readonly SimResult[],
  checks: readonly Check[],
  calendar: readonly CalendarEntry[] = CALENDAR_LAND1,
): string {
  const lines: string[] = [
    '# Balance — land 1 (Хортиця)',
    '',
    `Bot: greedy MAX (plan Q10), ${String(PACING.sessionsPerDay)} sessions/day × ${String(PACING.sessionSec / 60)} min, tap every ${String(PACING.tapEverySec)} s, free profile.`,
    '',
  ];
  const failed = checks.filter((c) => c.gate && !c.ok).length;
  lines.push(
    `**Corridor: ${failed === 0 ? '✅ all gated checks pass' : `❌ ${String(failed)} gated check(s) out of the corridor`}**`,
    '',
  );
  lines.push('| seed | metric | target | actual | |', '|---|---|---|---|---|');
  for (const c of checks)
    lines.push(
      `| ${String(c.seed)} | ${c.id} | ${c.target} | ${c.actual} | ${c.ok ? '✅' : c.gate ? '❌' : '⚠️ report'} |`,
    );
  for (const r of results) {
    lines.push('', `## Seed ${String(r.seed)}`, '');
    lines.push(
      `Bloom: ${r.bloomSec === null ? 'not reached' : `day ${fmt(r.bloomSec / DAY_SEC)} (session ${String(r.bloomSession)})`} · first purchase ${fmt(r.firstPurchaseSec)} s · offline share of income ${fmt(r.offlineShare * 100)} %`,
      '',
    );
    lines.push(
      '### Novelty timeline, week 1',
      '',
      '| session | actions | noticeable | at open | novelties |',
      '|---|---|---|---|---|',
    );
    for (const s of r.sessions.slice(0, PACING.novelty.week1Sessions)) {
      const list = r.novelties.filter((n) => n.session === s.index).map((n) => (n.ref ? `${n.kind}:${n.ref}` : n.kind));
      lines.push(
        `| S${String(s.index)} | ${String(s.actions)} | ${String(s.noticeable)} | ${String(s.noticeableAtOpen)} | ${list.join(', ') || '—'} |`,
      );
    }
    lines.push('', '### Calendar (SPEC §2.4)', '', '| entry | window | seen |', '|---|---|---|');
    calendarSessions(r, calendar).forEach((s, i) => {
      const c = calendar[i];
      if (c)
        lines.push(
          `| ${c.id} | S${String(c.sessions.min)}–S${String(c.sessions.max)} | ${s === null ? 'never' : `S${String(s)}`} |`,
        );
    });
    lines.push('', '### Milestones (day reached)', '', '| milestone | day |', '|---|---|');
    for (const [k, v] of Object.entries(r.milestones).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])))
      lines.push(`| ${k} | ${fmt(v / DAY_SEC)} |`);
  }
  return `${lines.join('\n')}\n`;
}

/** One CSV row per seed × session (for spreadsheets). */
export function renderCsv(results: readonly SimResult[]): string {
  const rows = ['seed,session,startSec,actions,noticeable,noticeableAtOpen,novelties'];
  for (const r of results) {
    const counts = noveltiesPerSession(r, r.sessions.length);
    for (const s of r.sessions)
      rows.push(
        [r.seed, s.index, s.start, s.actions, s.noticeable, s.noticeableAtOpen, counts[s.index - 1] ?? 0].join(','),
      );
  }
  return `${rows.join('\n')}\n`;
}
