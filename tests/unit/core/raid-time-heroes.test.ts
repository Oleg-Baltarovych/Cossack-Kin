// The Характерник on raids (plan M4-06, SPEC §3.4 «Час походу», ADR 013, Q8): `raidTimeMult` (steady) shortens a raid
// at its start — `returnAt = startedAt + ceil(durMs × raidTimeMult)`, stored, inside the v5 gate's window
// [ceil(durMs × RAIDS.minTimeMult), durMs]; a raid on the road never changes when he levels up; the card shows the
// roll's time and relic chance; a shortened raid returns alike by ticks, one advance and applyOffline. The state has
// his beat seen and stores his level after it, as a save would.
import { describe, expect, it } from 'vitest';
import { HEROES, type HeroDef } from '../../../src/content/heroes.ts';
import { RAID_TIER_IDS, RAID_TIERS, RAIDS, type RaidTierId } from '../../../src/content/raids.ts';
import { STORY_BEAT_IDS } from '../../../src/content/story.ts';
import { applyAction } from '../../../src/core/actions.ts';
import { advance } from '../../../src/core/advance.ts';
import { Big } from '../../../src/core/big.ts';
import type { GameEvent } from '../../../src/core/events.ts';
import { heroLevel, steadyModifiers } from '../../../src/core/modifiers.ts';
import { applyOffline, tick } from '../../../src/core/offline.ts';
import { createRng } from '../../../src/core/rng.ts';
import { createInitialState, validateState, type GameState } from '../../../src/core/state.ts';
import { previewRaid, rollRaid, type RaidRoll } from '../../../src/core/systems/raids.ts';

const T0 = 1_763_400_000_000;
const SEC = 1000;
const MIN = 60 * SEC;

const KH: HeroDef = HEROES.find((h) => h.id === 'kharakternyk') ?? fail('content: kharakternyk');
const perRank = (kind: 'raidTime' | 'relicChance'): number =>
  KH.effects.find((e) => e.kind === kind)?.perRank ?? fail(`content: kharakternyk ${kind}`);
const durMs = (tier: RaidTierId): number =>
  (RAID_TIERS.find((t) => t.id === tier)?.durationSec ?? fail(`content: ${tier}`)) * SEC;

function fail(why: string): never {
  throw new Error(why);
}

/** A late game with every beat seen (his stand-in too), an army that can start every tier, the Характерник at `level`. */
function game(level: number, rngSeed = 3, at = T0): GameState {
  const s = createInitialState({ seed: 5, now: T0 });
  return {
    ...s,
    rng: createRng(rngSeed),
    time: { created: T0, lastSeen: at, maxSeen: at },
    story: { seen: [...STORY_BEAT_IDS] },
    village: { ...s.village, levels: { ...s.village.levels, field: 30, garden: 12, windmill: 8 } },
    currencies: { ...s.currencies, glory: Big.from(1e15) },
    army: { infantry: 2000 },
    stats: { ...s.stats, hires: 2000, heroLevels: Math.max(0, level - 1) },
    heroes: level > 0 ? { otaman: 1, kharakternyk: level } : { otaman: 1 },
  };
}
const start = (s: GameState, tier: RaidTierId, at: number, slot = 0) =>
  applyAction(s, { type: 'startRaid', slot, tier }, at);
const rollIn = (s: GameState, slot: number): RaidRoll => {
  const x = s.raids.slots[slot];
  if (!x || x.kind === 'idle') throw new Error(`slot ${String(slot)} is idle`);
  return x.raid;
};
const of = <T extends GameEvent['type']>(events: readonly GameEvent[], type: T): Extract<GameEvent, { type: T }>[] =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const gate = (s: GameState): string => {
  const r = validateState(JSON.parse(JSON.stringify(s)));
  return r.ok ? 'ok' : `${r.error.reason} at ${r.error.path}`;
};

describe('the Характерник shortens raids started after his level (Q8)', () => {
  it('the crafted state has him: his level counts and lowers raidTimeMult by perRank a level', () => {
    expect(heroLevel('kharakternyk', game(7))).toBe(7);
    expect(steadyModifiers(game(7)).raidTimeMult).toBeCloseTo(1 - 7 * perRank('raidTime'), 12);
    expect(gate(game(7))).toBe('ok');
  });

  it.each(RAID_TIER_IDS)('%s: returnAt = startedAt + ceil(durMs × raidTimeMult), at every level', (tier) => {
    for (let level = 0; level <= KH.levelMax; level++) {
      const s = game(level);
      const r = rollRaid(s, tier, T0 + 7).roll;
      const mult = steadyModifiers(s).raidTimeMult;
      expect(r.startedAt).toBe(T0 + 7);
      expect(r.returnAt - r.startedAt, `level ${String(level)}`).toBe(Math.ceil(durMs(tier) * mult));
    }
  });

  it('a raid started after a level is shorter by exactly the multiplier', () => {
    for (const tier of RAID_TIER_IDS) {
      const plain = rollIn(start(game(0), tier, T0).state, 0);
      const quick = rollIn(start(game(10), tier, T0).state, 0);
      expect(plain.returnAt - plain.startedAt).toBe(durMs(tier));
      expect(quick.returnAt - quick.startedAt, tier).toBe(Math.ceil(durMs(tier) * (1 - 10 * perRank('raidTime'))));
      // Loot does not depend on the duration (ADR 013): the same roll otherwise.
      expect({ ...quick, returnAt: 0 }).toEqual({ ...plain, returnAt: 0 });
    }
  });

  it('a raid on the road does not change when he levels up; the next one is shorter', () => {
    const sent = start(game(5), 'h4', T0).state;
    const before = rollIn(sent, 0);
    const levelled = applyAction(sent, { type: 'levelHero', id: 'kharakternyk', mode: 10 }, T0 + MIN);
    expect(of(levelled.events, 'HeroLevelled')).toHaveLength(1);
    expect(heroLevel('kharakternyk', levelled.state)).toBe(15);
    expect(levelled.state.raids.slots[0]).toEqual({ kind: 'running', raid: before });
    const next = rollIn(start(levelled.state, 'h4', T0 + MIN, 1).state, 1);
    expect(next.returnAt - next.startedAt).toBeLessThan(before.returnAt - before.startedAt);
    expect(next.returnAt - next.startedAt).toBe(Math.ceil(durMs('h4') * steadyModifiers(levelled.state).raidTimeMult));
  });
});

describe('the v5 gate takes every raid the game starts (review M4-04)', () => {
  it('every tier, every level up to the max Σ raidTime, odd start times: the fresh save passes the gate', () => {
    // The max Σ of the raidTime sources is his level max (content test: ≤ 1 − minTimeMult).
    expect(1 - steadyModifiers(game(KH.levelMax)).raidTimeMult).toBeCloseTo(1 - RAIDS.minTimeMult, 12);
    for (let level = 0; level <= KH.levelMax; level++) {
      for (const tier of RAID_TIER_IDS) {
        for (const dt of [0, 1, 333, 7 * MIN + 1]) {
          const at = T0 + dt;
          const s = start(game(level, level * 31 + dt, at), tier, at).state;
          const r = rollIn(s, 0);
          const where = `${tier} level ${String(level)} +${String(dt)} ms`;
          expect(r.returnAt - r.startedAt, where).toBeGreaterThanOrEqual(Math.ceil(durMs(tier) * RAIDS.minTimeMult));
          expect(r.returnAt - r.startedAt, where).toBeLessThanOrEqual(durMs(tier));
          expect(gate(s), where).toBe('ok');
        }
      }
    }
  });
});

describe('the card is the roll: time and relic chance (П6, ADR 012)', () => {
  it.each(RAID_TIER_IDS)('%s: the preview duration is the rolled one', (tier) => {
    for (const level of [0, 1, 12, KH.levelMax]) {
      const s = game(level);
      const r = rollRaid(s, tier, T0).roll;
      expect(previewRaid(s, tier).durationMs, `level ${String(level)}`).toBe(r.returnAt - r.startedAt);
    }
  });

  it('his relicChance share raises the card’s relic chance, and the roll draws with that chance', () => {
    const tier: RaidTierId = 'h8';
    const base = RAID_TIERS.find((t) => t.id === tier)?.relicChance ?? fail('content: h8');
    const level = 20;
    const card = previewRaid(game(level), tier).relicChance;
    expect(card).toBeCloseTo(Math.min(1, base * (1 + level * perRank('relicChance'))), 12);
    expect(card).toBeGreaterThan(previewRaid(game(0), tier).relicChance);
    // Same draws, a higher chance: every seed that finds a relic without him finds one with him, and some more do.
    let more = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const plain = rollRaid(game(0, seed), tier, T0).roll.loot.relic;
      const withHim = rollRaid(game(level, seed), tier, T0).roll.loot.relic;
      if (plain !== null) expect(withHim, `seed ${String(seed)}`).not.toBeNull();
      if (plain === null && withHim !== null) more++;
    }
    expect(more).toBeGreaterThan(0);
  });
});

describe('a shortened raid: 0.1-s ticks = one advance = applyOffline', () => {
  it('m5 and m30 at his max level come back at the same moment by every path', () => {
    let s = start(game(KH.levelMax), 'm30', T0).state;
    s = start(s, 'm5', T0, 1).state;
    const end = T0 + 30 * MIN;
    expect(rollIn(s, 0).returnAt).toBeLessThan(end);
    let stepped = s;
    const ticked: GameEvent[] = [];
    for (let t = T0 + 100; t <= end; t += 100) {
      const r = tick(stepped, t);
      stepped = r.state;
      ticked.push(...r.events);
    }
    const once = advance(s, end);
    const away = applyOffline(s, end);
    expect(stepped.raids).toEqual(once.state.raids);
    expect(away.state.raids).toEqual(once.state.raids);
    const returned = of(once.events, 'RaidReturned');
    expect(returned.map((e) => e.slot)).toEqual([1, 0]);
    expect(of(ticked, 'RaidReturned')).toEqual(returned);
    expect(of(away.events, 'RaidReturned')).toEqual(returned);
    // Not a moment earlier: 1 ms before its returnAt the 30-min raid still runs.
    expect(advance(s, rollIn(s, 0).returnAt - 1).state.raids.slots[0]?.kind).toBe('running');
  });
});
