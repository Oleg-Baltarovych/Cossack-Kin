// `modifierSources` and the fold (plan M4-03, ADR 013): a refactor without a change of behaviour. The oracle is the
// pre-M4-03 `modifiersUnder`, kept verbatim below (only here) and compared to the fold field by field with exact
// equality on random states — random farm/Sich levels around the unlock thresholds (crafted saves with locked levels
// too), random relics and random moments for the wind, drawn from the seeded core RNG like the raid sequences.
import { describe, expect, it } from 'vitest';
import { ARMY, DEFENCE, OFFLINE } from '../../../src/content/economy.ts';
import { EFFECT_FLOORS, EFFECT_TARGETS } from '../../../src/content/effects.ts';
import { RELIC_DEFS, RELIC_IDS, type RelicEffect } from '../../../src/content/relics.ts';
import { SICH_BUILDING_IDS, SICH_BUILDINGS, type SichBuilding } from '../../../src/content/sich.ts';
import { FARM_BUILDING_IDS, type FarmBuildingId } from '../../../src/content/villages/khortytsia.ts';
import {
  collectModifiers,
  defence,
  modifierSources,
  sichUnlocked,
  steadyModifiers,
  villageOf,
  type ModSource,
  type Modifiers,
} from '../../../src/core/modifiers.ts';
import { createRng, next, type Rng } from '../../../src/core/rng.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { windLookAt } from '../../../src/core/systems/village-mechanics/wind.ts';

const T0 = 1_763_400_000_000;
const DAY = 24 * 3600 * 1000;
const STATES = 50;

// ---- the oracle: modifiers.ts before M4-03 ----
function oracleSichSum(state: GameState, perLevel: (b: SichBuilding) => number | undefined): number {
  let sum = 0;
  for (const b of SICH_BUILDINGS) {
    const p = perLevel(b);
    if (p !== undefined && sichUnlocked(b, state)) sum += p * state.village.sichLevels[b.id];
  }
  return sum;
}
function oracleFarmEffect(state: GameState, kind: 'armyPower' | 'glory'): number {
  let sum = 0;
  for (const b of villageOf(state).buildings) {
    if (b.effect?.kind === kind) sum += b.effect.perLevel * state.village.levels[b.id];
  }
  return sum;
}
function oracleRelicShare(state: GameState, kind: RelicEffect['kind']): number {
  let sum = 0;
  for (const r of RELIC_DEFS) {
    if (r.effect.kind === kind && state.relics.includes(r.id)) sum += r.effect.share;
  }
  return sum;
}
function oracle(state: GameState, windmillMult: number): Omit<Modifiers, 'cultureCostMult'> {
  const village = villageOf(state);
  const buildingMult = Object.fromEntries(FARM_BUILDING_IDS.map((id) => [id, 1])) as Record<FarmBuildingId, number>;
  buildingMult.windmill *= village.passive.mult * windmillMult;
  return {
    incomeMult: 1 + defence(state) * DEFENCE.incomePerPoint,
    buildingMult,
    costMult: 1,
    gloryMult: 1 + oracleFarmEffect(state, 'glory') + oracleSichSum(state, (b) => b.effects.gloryPerLevel),
    powerMult:
      1 +
      oracleFarmEffect(state, 'armyPower') +
      oracleSichSum(state, (b) => b.effects.powerPerLevel) +
      oracleRelicShare(state, 'power'),
    offlineMult: OFFLINE.mult,
    offlineCapSec: OFFLINE.capSec,
    gloryCapSec: ARMY.gloryCapSec + oracleSichSum(state, (b) => b.effects.gloryCapSecPerLevel),
    lootMult: 1 + oracleSichSum(state, (b) => b.effects.lootPerLevel) + oracleRelicShare(state, 'loot'),
    relicChanceMult: 1,
    raidTimeMult: 1,
  };
}

// ---- random states ----
/** Integers 0…max drawn from the seeded core RNG. */
function draws(seed: number): (max: number) => number {
  let rng: Rng = createRng(seed * 7919);
  return (max) => {
    const [u, r] = next(rng);
    rng = r;
    return Math.floor(u * (max + 1));
  };
}
/** Farm levels spread around the «all farm ≥ 25» Sich unlock; every Sich level random, locked ones too. */
function randomState(seed: number): { state: GameState; now: number } {
  const int = draws(seed);
  const s = createInitialState({ seed, now: T0 });
  const floor = int(40);
  const levels = { ...s.village.levels };
  for (const id of FARM_BUILDING_IDS) levels[id] = floor + int(60);
  const sichLevels = { ...s.village.sichLevels };
  for (const id of SICH_BUILDING_IDS) sichLevels[id] = int(50);
  const relics = RELIC_IDS.filter((_, i) => (seed >> i) % 2 === 1);
  return { state: { ...s, relics, village: { ...s.village, levels, sichLevels } }, now: T0 + int(30 * DAY) };
}

const SAMPLES = Array.from({ length: STATES }, (_, i) => i + 1).map(randomState);

describe('modifierSources: the fold equals the pre-M4-03 modifiers (M4-03)', () => {
  it('the random states do exercise the sources (unlocked Sich buildings, relics, locked levels)', () => {
    const unlockedChurch = SAMPLES.filter(({ state }) =>
      SICH_BUILDINGS.some((b) => b.id === 'church' && sichUnlocked(b, state)),
    );
    expect(unlockedChurch.length).toBeGreaterThan(5);
    expect(unlockedChurch.length).toBeLessThan(STATES - 5);
    expect(SAMPLES.filter(({ state }) => state.relics.length === RELIC_IDS.length).length).toBeGreaterThan(5);
    expect(SAMPLES.filter(({ state }) => state.relics.length === 0).length).toBeGreaterThan(5);
  });

  it.each(SAMPLES.map((x, i) => [i + 1, x] as const))(
    'state %i: collectModifiers and steadyModifiers = the oracle',
    (_, x) => {
      const wind = windLookAt(x.state.seed, x.now, villageOf(x.state)).windmillMult;
      expect(collectModifiers(x.state, x.now)).toStrictEqual({ ...oracle(x.state, wind), cultureCostMult: 1 });
      expect(steadyModifiers(x.state)).toStrictEqual({ ...oracle(x.state, 1), cultureCostMult: 1 });
    },
  );
});

/** The base of each scalar field and whether it is a reduction (`EFFECT_FLOORS` via `EFFECT_TARGETS`). */
const BASE: Readonly<Record<Exclude<keyof Modifiers, 'buildingMult'>, number>> = {
  incomeMult: 1,
  costMult: 1,
  cultureCostMult: 1,
  gloryMult: 1,
  powerMult: 1,
  offlineMult: OFFLINE.mult,
  offlineCapSec: OFFLINE.capSec,
  gloryCapSec: ARMY.gloryCapSec,
  lootMult: 1,
  relicChanceMult: 1,
  raidTimeMult: 1,
};
const REDUCING = new Set(
  Object.keys(EFFECT_FLOORS).map((k) => {
    const t = EFFECT_TARGETS[k as keyof typeof EFFECT_FLOORS];
    return t.to === 'field' ? t.field : 'buildingMult';
  }),
);
const close = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b));

describe('the sources add up to each field (the UI breakdown, M4-07)', () => {
  it.each(SAMPLES.map((x, i) => [i + 1, x] as const))('state %i: base ± Σ share = the steady field', (_, x) => {
    const sources = modifierSources(x.state);
    const mods = steadyModifiers(x.state);
    for (const field of Object.keys(BASE) as (keyof typeof BASE)[]) {
      const sum = sources.reduce((acc, s) => (s.field === field ? acc + s.share : acc), 0);
      const want = REDUCING.has(field) ? BASE[field] - sum : BASE[field] + sum;
      expect(close(mods[field], want), `${field}: ${String(mods[field])} vs ${String(want)}`).toBe(true);
    }
    for (const id of FARM_BUILDING_IDS) {
      const sum = sources.reduce(
        (acc, s) => (s.field === 'buildingMult' && s.building === id ? acc + s.share : acc),
        0,
      );
      expect(close(mods.buildingMult[id], 1 + sum), id).toBe(true);
    }
  });

  it('no source has a zero share (the breakdown lists only what acts)', () => {
    for (const { state } of SAMPLES) {
      for (const s of modifierSources(state)) expect(s.share).not.toBe(0);
    }
  });

  it('a source counts once: a locked Sich building and an unfound relic are not in the list', () => {
    const s0 = createInitialState({ seed: 3, now: T0 });
    const crafted: GameState = {
      ...s0,
      village: { ...s0.village, sichLevels: { ...s0.village.sichLevels, church: 9, cannonry: 9 } },
    };
    const refs = modifierSources(crafted).map((s: ModSource) => s.source);
    expect(refs).not.toContainEqual({ kind: 'sich', id: 'church' });
    expect(refs).not.toContainEqual({ kind: 'sich', id: 'cannonry' });
    expect(refs.some((r) => r.kind === 'relic')).toBe(false);
    // The land passive is always in force; a new game has no other source.
    expect(refs).toEqual([{ kind: 'land', id: 'khortytsia' }]);
  });

  it('the wind of the moment acts on the windmill only, on top of the fold', () => {
    const { state } = SAMPLES[0] ?? randomState(1);
    for (const now of [T0, T0 + DAY / 3, T0 + 5 * DAY]) {
      const wind = windLookAt(state.seed, now, villageOf(state)).windmillMult;
      const live = collectModifiers(state, now);
      const steady = steadyModifiers(state);
      expect(live.buildingMult.windmill).toBe(steady.buildingMult.windmill * wind);
      expect({ ...live, buildingMult: null }).toStrictEqual({ ...steady, buildingMult: null });
    }
  });
});
