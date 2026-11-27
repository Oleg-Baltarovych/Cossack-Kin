// Balance report and corridor check (SPEC §2.3, §12.3; plan M1-14). Pure: simulation results in, checks and text out
// (byte-stable — no clock, no locale formatting).
import { CALENDAR_LAND1, PACING, type CalendarEntry } from '../../../src/content/pacing.ts';
import type { DayLog, SimResult } from './sim.ts';

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
  readonly s1MaxActions: number;
  readonly firstRaidMaxSec: number;
  readonly raidActionsMax: number;
  readonly raidLootShare: Range;
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

/** Novelties per session (1..n), of the kinds `include` lets through (all by default). */
export function noveltiesPerSession(
  r: SimResult,
  n: number,
  include: (kind: SimResult['novelties'][number]['kind']) => boolean = () => true,
): number[] {
  const counts = Array.from({ length: n }, () => 0);
  for (const nv of r.novelties)
    if (nv.session >= 1 && nv.session <= n && include(nv.kind))
      counts[nv.session - 1] = (counts[nv.session - 1] ?? 0) + 1;
  return counts;
}

/** Session in which each calendar entry first happened (null = never); an empty ref takes any ref of the kind. */
export function calendarSessions(r: SimResult, calendar: readonly CalendarEntry[]): (number | null)[] {
  return calendar.map(
    (c) => r.novelties.find((n) => n.kind === c.kind && (c.ref === '' || n.ref === c.ref))?.session ?? null,
  );
}

/**
 * Days of the land's life: up to the day of the bloom session (every day without bloom). Biased a little high: the
 * whole bloom day counts, so a bloom in its morning session brings that evening's (post-bloom) raids and income in too.
 */
function liveDays(r: SimResult): SimResult['dayLog'] {
  const last = r.bloomSession === null ? Infinity : Math.ceil(r.bloomSession / SESSIONS_PER_DAY);
  return r.dayLog.filter((d) => d.day <= last);
}

/** Share of the ducats earned over the land's life that came from raid loot (null: nothing earned). */
export function raidLootShare(r: SimResult): number | null {
  const days = liveDays(r);
  const earned = days.reduce((a, d) => a + d.earnedDucats, 0);
  return earned > 0 ? days.reduce((a, d) => a + d.raidDucats, 0) / earned : null;
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
    add(
      'firstRaidSec',
      `≤ ${String(pacing.firstRaidMaxSec)}`,
      fmt(r.firstRaidSec),
      r.firstRaidSec !== null && r.firstRaidSec <= pacing.firstRaidMaxSec,
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
    // S1 is onboarding (owner 2026-11-22, SPEC §2.3): the corridor counts from S2; S1 is reported on its own.
    const actions = median(live.filter((s) => s.index > 1).map((s) => s.actions));
    add(
      'sessionActions (median, S2+)',
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
    const s1 = r.sessions[0]?.actions ?? null;
    add('s1Actions', `≤ ${String(pacing.s1MaxActions)}`, fmt(s1), s1 !== null && s1 <= pacing.s1MaxActions, false);
    // Gated (owner 2026-11-24, SPEC §2.3): raid starts + claims of every session from S2, apart from the economy's
    // 5–15 (S1 is onboarding: the scouting may come back inside it).
    const raidActs = Math.max(0, ...live.filter((s) => s.index > 1).map((s) => s.raids.starts + s.raids.claims));
    add(
      'raidActions (max, S2+)',
      `≤ ${String(pacing.raidActionsMax)}`,
      String(raidActs),
      raidActs <= pacing.raidActionsMax,
    );
    const share = raidLootShare(r);
    add(
      'raidLootShare (to bloom)',
      `${fmt(pacing.raidLootShare.min * 100)}–${fmt(pacing.raidLootShare.max * 100)} %`,
      share === null ? '—' : `${fmt(share * 100)} %`,
      share !== null && share >= pacing.raidLootShare.min && share <= pacing.raidLootShare.max,
      false,
    );
    // Up to bloom only: after bloom the move to the next land is the novelty (M5).
    const week1Len = Math.min(pacing.novelty.week1Sessions, r.bloomSession ?? pacing.novelty.week1Sessions);
    const emptyRun = longestZeroRun(noveltiesPerSession(r, week1Len));
    add(
      'maxSessionsWithoutNovelty (week 1)',
      `≤ ${String(pacing.novelty.maxSessionsWithoutNovelty)}`,
      String(emptyRun),
      emptyRun <= pacing.novelty.maxSessionsWithoutNovelty,
    );
    // Report only: the same without chain steps (Q6 made them novelties), so a chain that only papers over a dull
    // session shows here (M2-27).
    const emptyNoChain = longestZeroRun(noveltiesPerSession(r, week1Len, (k) => k !== 'chainStep'));
    add(
      'maxSessionsWithoutNovelty without chainStep (week 1)',
      `≤ ${String(pacing.novelty.maxSessionsWithoutNovelty)}`,
      String(emptyNoChain),
      emptyNoChain <= pacing.novelty.maxSessionsWithoutNovelty,
      false,
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
    `Bot: greedy MAX (plan Q10), ${String(PACING.sessionsPerDay)} sessions/day × ${String(PACING.sessionSec / 60)} min, tap every ${String(PACING.tapEverySec)} s, claims every finished quest (not an action), buys the culture rank / hero level of the best payback in glory minutes within a day (asked ones at once; M4-09), claims returned raids and sends the best expected loot into each free slot (raid actions, counted apart from the economy actions; M3-08), free profile.`,
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
      '| session | actions | raid actions | noticeable | at open | claims (chain/chore) | novelties |',
      '|---|---|---|---|---|---|---|',
    );
    for (const s of r.sessions.slice(0, PACING.novelty.week1Sessions)) {
      const list = r.novelties.filter((n) => n.session === s.index).map((n) => (n.ref ? `${n.kind}:${n.ref}` : n.kind));
      lines.push(
        `| S${String(s.index)} | ${String(s.actions)} | ${String(s.raids.starts + s.raids.claims)} | ${String(s.noticeable)} | ${String(s.noticeableAtOpen)} | ${String(s.claims.chain)}/${String(s.claims.chore)} | ${list.join(', ') || '—'} |`,
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
    lines.push('', '### Raids', '');
    const relics = r.raidClaims.filter((c) => c.relic !== null);
    lines.push(
      `Relics: ${relics.map((c) => `${String(c.relic)} S${String(c.session)} (day ${fmt(c.t / DAY_SEC)}, ${c.tier})`).join(', ') || 'none'} · «Ще раз» ${String(r.sessions.reduce((a, s) => a + s.raids.again, 0))} · «Забрати все» ${String(r.sessions.reduce((a, s) => a + s.raids.claimAll, 0))}`,
      '',
      '| day | raids | won % | loot share of ducats | pysanky | lootMult | incomeMult | lootMult × incomeMult |',
      '|---|---|---|---|---|---|---|---|',
    );
    for (const d of r.dayLog)
      lines.push(
        `| ${String(d.day)} | ${String(d.raidsClaimed)} | ${d.raidsClaimed > 0 ? fmt((d.raidsWon / d.raidsClaimed) * 100) : '—'} | ${d.earnedDucats > 0 ? `${fmt((d.raidDucats / d.earnedDucats) * 100)} %` : '—'} | ${String(d.pysanky)} | ${fmt(d.lootMult)} | ${fmt(d.incomeMult)} | ${fmt(d.lootMult * d.incomeMult)} |`,
      );
    const spent = liveDays(r).reduce(
      (a, d) => ({
        culture: a.culture + d.glorySpent.culture,
        heroes: a.heroes + d.glorySpent.heroes,
        sich: a.sich + d.glorySpent.sich,
      }),
      { culture: 0, heroes: 0, sich: 0 },
    );
    const total = spent.culture + spent.heroes + spent.sich;
    const pct = (n: number): string => (total > 0 ? `${fmt((n / total) * 100)} %` : '—');
    lines.push(
      '',
      '### Glory spent (to bloom)',
      '',
      `Culture ${pct(spent.culture)} · heroes ${pct(spent.heroes)} · Sich ${pct(spent.sich)} (of ${fmt(total)} glory)`,
      '',
      '| day | culture | heroes | Sich |',
      '|---|---|---|---|',
    );
    for (const d of r.dayLog)
      lines.push(
        `| ${String(d.day)} | ${fmt(d.glorySpent.culture)} | ${fmt(d.glorySpent.heroes)} | ${fmt(d.glorySpent.sich)} |`,
      );
    const fields = Object.keys(r.dayLog[0]?.modifiers ?? {}) as (keyof DayLog['modifiers'])[];
    lines.push(
      '',
      '### Modifiers by day (steady, end of day)',
      '',
      `| day | ${fields.join(' | ')} |`,
      `|---|${fields.map(() => '---|').join('')}`,
    );
    for (const d of r.dayLog)
      lines.push(`| ${String(d.day)} | ${fields.map((f) => fmt(d.modifiers[f])).join(' | ')} |`);
    lines.push('', '### Milestones (day reached)', '', '| milestone | day |', '|---|---|');
    for (const [k, v] of Object.entries(r.milestones).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])))
      lines.push(`| ${k} | ${fmt(v / DAY_SEC)} |`);
  }
  return `${lines.join('\n')}\n`;
}

/** One CSV row per seed × session (for spreadsheets). */
export function renderCsv(results: readonly SimResult[]): string {
  const rows = [
    'seed,session,startSec,actions,noticeable,noticeableAtOpen,chainClaims,choreClaims,choreRewards,raidStarts,raidClaims,novelties',
  ];
  for (const r of results) {
    const counts = noveltiesPerSession(r, r.sessions.length);
    for (const s of r.sessions)
      rows.push(
        [
          r.seed,
          s.index,
          s.start,
          s.actions,
          s.noticeable,
          s.noticeableAtOpen,
          s.claims.chain,
          s.claims.chore,
          s.choreRewards,
          s.raids.starts,
          s.raids.claims,
          counts[s.index - 1] ?? 0,
        ].join(','),
      );
  }
  return `${rows.join('\n')}\n`;
}
