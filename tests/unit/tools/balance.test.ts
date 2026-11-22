import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FARM } from '../../../src/content/economy.ts';
import { CALENDAR_LAND1, PACING } from '../../../src/content/pacing.ts';
import { CHORES, QUEST_CHAIN } from '../../../src/content/quests.ts';
import { STORY_BEATS } from '../../../src/content/story.ts';
import { KHORTYTSIA } from '../../../src/content/villages/khortytsia.ts';
import { Big } from '../../../src/core/big.ts';
import { cost, prod } from '../../../src/core/economy.ts';
import { createInitialState } from '../../../src/core/state.ts';
import { chainQuest, choreQuest } from '../../../src/core/systems/quests.ts';
import { windLookAt } from '../../../src/core/systems/village-mechanics/wind.ts';
import { evaluate, longestZeroRun, renderReport, type Corridor } from '../../../tools/lib/balance/report.ts';
import {
  crossedTiers,
  DEFAULT_EPOCH,
  sessionOf,
  sessionStarts,
  simulate,
  type SimResult,
} from '../../../tools/lib/balance/sim.ts';

const HOUR = 3600_000;

describe('simulate (M1-14, SPEC §12.3)', () => {
  it('known time: field level 1, no ducats, no taps → the next field level is bought at the first step it is paid for', () => {
    // Level 1 → 2 costs cost(field, 1); one field earns prod(field, 1) a second; the bot looks every tapEverySec.
    const field = KHORTYTSIA.buildings.find((b) => b.id === 'field');
    if (!field) throw new Error('no field');
    const paidAfter = cost(field, 1, KHORTYTSIA.scale).toNumber() / prod(field, 1, KHORTYTSIA.scale).toNumber();
    const s = createInitialState({ seed: 1, now: DEFAULT_EPOCH + 8 * HOUR });
    // The chain is out of the way (a claimed step would pay for the level at once, M2-27).
    const initial = {
      ...s,
      currencies: { ...s.currencies, ducats: Big.ZERO },
      village: { ...s.village, levels: { ...s.village.levels, field: 1 } },
      quests: { ...s.quests, chain: { kind: 'done' as const } },
    };
    const r = simulate({ seed: 1, days: 1, taps: false, initial });
    expect(r.firstPurchaseSec).toBe(Math.ceil(paidAfter / PACING.tapEverySec) * PACING.tapEverySec);
  });

  it('two runs are identical, byte for byte (report included)', () => {
    const a = simulate({ seed: 2, days: 3 });
    const b = simulate({ seed: 2, days: 3 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(renderReport([a], evaluate([a]))).toBe(renderReport([b], evaluate([b])));
  });

  it('60 days of play simulate in a child node, with every session (order-of-magnitude speed guard)', () => {
    // The real speed budget (10 s of thread CPU) is a gate of `pnpm balance --check`, which runs alone (also in CI):
    // under a parallel `pnpm test` on a throttled laptop the same run measured 11–14 s (M2-22 review). Here only a
    // 30 s guard catches an order-of-magnitude slowdown. Measured in a child `node`, not in this worker: Vitest's
    // module runner makes the hot core calls ~2.5× slower.
    const sim = pathToFileURL(resolve('tools/lib/balance/sim.ts')).href;
    const code = [
      `const { simulate } = await import(${JSON.stringify(sim)});`,
      'const t = process.threadCpuUsage();',
      'const r = simulate({ seed: 3, days: 60 });',
      'const { user, system } = process.threadCpuUsage(t);',
      'console.log(JSON.stringify({ ms: (user + system) / 1000, sessions: r.sessions.length }));',
    ].join('\n');
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
    const run = JSON.parse(out.trim().split('\n').at(-1) ?? '{}') as { ms?: unknown; sessions?: unknown };
    expect(run.sessions).toBe(60 * PACING.sessionsPerDay);
    expect(typeof run.ms).toBe('number');
    expect(run.ms).toBeLessThan(30_000);
  }, 60_000);
});

describe('sessions and novelty (M1-14, SPEC §2.3–2.4)', () => {
  it('an event between sessions (an offline storm) belongs to the session the player comes back in', () => {
    const starts = sessionStarts(DEFAULT_EPOCH, 2);
    const first = starts[0] ?? 0;
    expect(sessionOf(first + 60_000, starts)).toBe(1);
    // 08:07 → 20:00 is offline: a storm at 13:00 is seen in the evening session.
    expect(sessionOf(first + 5 * HOUR, starts)).toBe(2);
  });

  it('longest run of empty sessions', () => {
    expect(longestZeroRun([1, 0, 2, 0, 0, 3])).toBe(2);
    expect(longestZeroRun([1, 1])).toBe(0);
  });

  it('empty sessions before bloom count (and fail the target, 0 since M2); after bloom they do not', () => {
    const sessions = Array.from({ length: 14 }, (_, i) => ({
      index: i + 1,
      start: i,
      actions: 8,
      noticeable: 3,
      noticeableAtOpen: 3,
      claims: { chain: 0, chore: 0 },
      choreRewards: 0,
    }));
    const run = (empty: readonly number[]): SimResult => ({
      seed: 9,
      days: 7,
      firstPurchaseSec: 0,
      bloomSec: 5 * 86_400,
      bloomSession: 10,
      sessions,
      novelties: sessions
        .filter((s) => !empty.includes(s.index))
        .map((s) => ({ session: s.index, t: s.start, kind: 'building', ref: `b${String(s.index)}` })),
      milestones: {},
      offlineShare: 0.5,
      final: createInitialState({ seed: 9, now: DEFAULT_EPOCH }),
    });
    const gate = (r: SimResult) => evaluate([r]).find((x) => x.id.startsWith('maxSessionsWithoutNovelty'));
    // M2 (SPEC §2.3, M2-27): the content target is back to 0 — one empty week-1 session fails `--check`.
    expect(gate(run([5]))).toMatchObject({ actual: '1', ok: false, gate: true });
    expect(gate(run([5, 6]))).toMatchObject({ actual: '2', ok: false });
    // After the bloom session (S10) the move is the novelty: empty S11–S14 do not count.
    expect(gate(run([11, 12, 13]))).toMatchObject({ actual: '0', ok: true });
  });

  it('--check fails on a corridor the content cannot meet (a deliberately bad target)', () => {
    const r = simulate({ seed: 1, days: 2 });
    const bad: Corridor = { ...PACING, bloomDays: { min: 100, max: 200 }, firstPurchaseMaxSec: -1 };
    const failed = evaluate([r], bad)
      .filter((c) => c.gate && !c.ok)
      .map((c) => c.id);
    expect(failed).toContain('bloomDays');
    expect(failed).toContain('firstPurchaseSec');
  });
});

describe('story beats, «Наказ кошового» and chores in the sim (M2-27, SPEC §2.4–2.5, §3.10, plan Q6)', () => {
  it('S1 of a new game: the start beat and the first chain steps are novelties of session 1', () => {
    const r = simulate({ seed: 1, days: 1 });
    const s1 = r.novelties.filter((n) => n.session === 1).map((n) => `${n.kind}:${n.ref}`);
    expect(s1).toContain('storyBeat:khortytsia.shore');
    expect(s1).toContain('chainStep:khortytsia.field1');
    expect(s1).toContain('chainStep:khortytsia.garden1');
  });

  it('the bot claims every finished quest through claimQuest, within the session it finished in', () => {
    const r = simulate({ seed: 2, days: 3 });
    // One claim per passed step, each one a novelty (Q6: a chain step is new; a chore is not), the list in its order.
    const steps = r.novelties.filter((n) => n.kind === 'chainStep').map((n) => n.ref);
    expect(r.sessions.reduce((a, s) => a + s.claims.chain, 0)).toBe(steps.length);
    expect(steps.length).toBeGreaterThan(5);
    const listed = QUEST_CHAIN.map((q) => q.id).slice(0, steps.length);
    expect(steps.slice(0, listed.length)).toEqual(listed);
    const chain = r.final.quests.chain;
    if (chain.kind === 'listed') expect(chain.index).toBe(steps.length);
    expect(r.sessions.reduce((a, s) => a + s.claims.chore, 0)).toBe(r.final.quests.chores.n);
    expect(r.final.quests.chores.n).toBeGreaterThan(0);
    // The last press of the last session left nothing finished behind.
    expect(chainQuest(r.final)?.done).toBe(false);
    expect(choreQuest(r.final).done).toBe(false);
    // A chain step is claimed during a session, never logged into a later one.
    const starts = sessionStarts(DEFAULT_EPOCH, 3);
    const t0 = starts[0] ?? 0;
    for (const n of r.novelties.filter((x) => x.kind === 'chainStep')) {
      const start = (starts[n.session - 1] ?? 0) - t0;
      expect(n.t * 1000).toBeGreaterThanOrEqual(start);
      expect(n.t * 1000).toBeLessThan(start + PACING.sessionSec * 1000);
    }
  });

  it('a chain step already finished when the session opens is claimed at its first step, apart from the actions', () => {
    const s = createInitialState({ seed: 1, now: DEFAULT_EPOCH + 8 * HOUR });
    // field 1 = the first chain step is done; no ducats, no taps: only the claim can happen at t = 0.
    const initial = {
      ...s,
      currencies: { ...s.currencies, ducats: Big.ZERO },
      village: { ...s.village, levels: { ...s.village.levels, field: 1 } },
    };
    const r = simulate({ seed: 1, days: 1, taps: false, initial });
    expect(r.novelties.find((n) => n.kind === 'chainStep')).toMatchObject({
      session: 1,
      t: 0,
      ref: 'khortytsia.field1',
    });
    // A claim is not a purchase press (SPEC §12.3 «дія»): it is counted apart.
    expect(r.sessions[0]?.claims.chain).toBeGreaterThanOrEqual(1);
  });

  it('chore rewards a day stay within CHORES.maxClaimsPerDay; the bot still counts the rest', () => {
    const r = simulate({ seed: 3, days: 2 });
    for (const day of [0, 1]) {
      const day_ = r.sessions.slice(day * PACING.sessionsPerDay, (day + 1) * PACING.sessionsPerDay);
      expect(day_.reduce((a, s) => a + s.choreRewards, 0)).toBeLessThanOrEqual(CHORES.maxClaimsPerDay);
      expect(day_.reduce((a, s) => a + s.claims.chore, 0)).toBeGreaterThanOrEqual(
        day_.reduce((a, s) => a + s.choreRewards, 0),
      );
    }
  });

  it('the calendar has an entry for every story beat of land 1, each seen in its window on seed 1', () => {
    const r = simulate({ seed: 1, days: 7 });
    for (const b of STORY_BEATS) {
      const c = CALENDAR_LAND1.find((e) => e.kind === 'storyBeat' && e.ref === b.id);
      expect(c, b.id).toBeDefined();
      const seen = r.novelties.find((n) => n.kind === 'storyBeat' && n.ref === b.id)?.session;
      expect(seen, b.id).toBeGreaterThanOrEqual(c?.sessions.min ?? Infinity);
      expect(seen, b.id).toBeLessThanOrEqual(c?.sessions.max ?? -Infinity);
    }
  });
});

describe('tiers crossed in one press (M2-27: the calendar measures a tier, not the event of the top one)', () => {
  const farm = FARM.milestones.map((m) => m.level);

  it('crossedTiers: every milestone level a press passed, once each, through the core tier rule', () => {
    expect(crossedTiers(10, 11, farm)).toEqual([]);
    expect(crossedTiers(9, 26, farm)).toEqual([10, 25]);
    expect(crossedTiers(24, 25, farm)).toEqual([25]);
    expect(crossedTiers(0, 1, farm)).toEqual([]);
  });

  it('a MAX press from 0 past 10 and 25 logs every Sich tier it crossed', () => {
    const s = createInitialState({ seed: 1, now: DEFAULT_EPOCH + 8 * HOUR });
    // Glory for kurins 0 → 25+ in one press; no ducats, no taps: nothing else moves at t = 0.
    const initial = { ...s, currencies: { ...s.currencies, ducats: Big.ZERO, glory: Big.from(1e5) } };
    const r = simulate({ seed: 1, days: 1, taps: false, initial });
    expect(r.final.village.sichLevels.kurins).toBeGreaterThanOrEqual(25);
    expect(r.final.village.sichLevels.kurins).toBeLessThan(50);
    const kurins = r.novelties.filter((n) => n.t === 0 && n.kind === 'sichTier' && n.ref.startsWith('kurins@'));
    expect(kurins.map((n) => n.ref)).toEqual(['kurins@10', 'kurins@25']);
  });
});

describe('report-only pacing lines (M2-27)', () => {
  const sessions = Array.from({ length: 14 }, (_, i) => ({
    index: i + 1,
    start: i,
    actions: i === 0 ? PACING.s1MaxActions + 5 : 8,
    noticeable: 3,
    noticeableAtOpen: 3,
    claims: { chain: 0, chore: 0 },
    choreRewards: 0,
  }));
  // S5 has only a chain step: new for the gate (Q6), empty without chain steps.
  const fake: SimResult = {
    seed: 9,
    days: 7,
    firstPurchaseSec: 0,
    bloomSec: 5 * 86_400,
    bloomSession: 10,
    sessions,
    novelties: sessions.map((s) =>
      s.index === 5
        ? { session: 5, t: s.start, kind: 'chainStep', ref: 'khortytsia.field10' }
        : { session: s.index, t: s.start, kind: 'building', ref: `b${String(s.index)}` },
    ),
    milestones: {},
    offlineShare: 0.5,
    final: createInitialState({ seed: 9, now: DEFAULT_EPOCH }),
  };
  const checks = evaluate([fake]);
  const find = (prefix: string) => checks.find((c) => c.id.startsWith(prefix));

  it('S1 actions against PACING.s1MaxActions: reported, never gated', () => {
    expect(find('s1Actions')).toMatchObject({ actual: String(PACING.s1MaxActions + 5), ok: false, gate: false });
  });

  it('sessions without novelty when chain steps are left out: reported next to the gated line', () => {
    expect(find('maxSessionsWithoutNovelty (week 1)')).toMatchObject({ actual: '0', ok: true, gate: true });
    expect(find('maxSessionsWithoutNovelty without chainStep')).toMatchObject({ actual: '1', ok: false, gate: false });
  });
});

describe('the bot ranks by steady income, not the wind of the moment (M2-27)', () => {
  it('a new game that opens in a storm still buys fields at once and keeps playing its first session', () => {
    const t0 = DEFAULT_EPOCH + PACING.sessionStartHours[0] * HOUR;
    // The first seed whose game opens in a storm (×3 windmill: a 13K windmill looked better than a 10-ducat field).
    const seed = Array.from({ length: 200 }, (_, i) => i + 1).find((x) => windLookAt(x, t0).id === 'storm');
    if (seed === undefined) throw new Error('no storm opening in 200 seeds');
    const r = simulate({ seed, days: 1 });
    expect(r.firstPurchaseSec).not.toBeNull();
    expect(r.firstPurchaseSec ?? Infinity).toBeLessThanOrEqual(PACING.firstPurchaseMaxSec);
    expect(r.sessions[0]?.actions ?? 0).toBeGreaterThanOrEqual(PACING.sessionActions.min);
  });
});

describe('S1 is onboarding (owner 2026-11-22, SPEC §2.3): the 5–15 corridor counts from S2', () => {
  it('a busy S1 does not move the gated median; it is reported against s1MaxActions', () => {
    const actions = [PACING.s1MaxActions + 10, 8, 20];
    const r: SimResult = {
      seed: 9,
      days: 2,
      firstPurchaseSec: 0,
      bloomSec: null,
      bloomSession: null,
      sessions: actions.map((a, i) => ({
        index: i + 1,
        start: i,
        actions: a,
        noticeable: 1,
        noticeableAtOpen: 1,
        claims: { chain: 0, chore: 0 },
        choreRewards: 0,
      })),
      novelties: [],
      milestones: {},
      offlineShare: 0.5,
      final: createInitialState({ seed: 9, now: DEFAULT_EPOCH }),
    };
    const checks = evaluate([r]);
    // S2–S3: median of 8 and 20 = 14 (with S1 it would be 20, out of the corridor).
    expect(checks.find((c) => c.id.startsWith('sessionActions'))).toMatchObject({ actual: '14', ok: true, gate: true });
    expect(checks.find((c) => c.id === 's1Actions')).toMatchObject({ ok: false, gate: false });
  });
});
