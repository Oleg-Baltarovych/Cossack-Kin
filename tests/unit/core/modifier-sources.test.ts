// `modifierSources` and the fold (plan M4-03, M4-05, ADR 013). M4-03 was a refactor without a change of behaviour,
// proven against the pre-M4-03 `modifiersUnder` as an oracle; M4-05 retired the oracle for a golden file of the field
// values of the same random states (`tests/fixtures/golden/modifier-fields-m4-03.json`, taken from the M4-03 code
// before culture and hero sources existed). These states have no culture and no heroes, so they must still fold to
// exactly those values: exact equality is the point (not a tolerance) — it is float-order-sensitive, so it also pins
// the source order (new kinds are appended last, `.claude/rules/core.md`).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARMY, OFFLINE } from '../../../src/content/economy.ts';
import { EFFECT_FLOORS, EFFECT_TARGETS } from '../../../src/content/effects.ts';
import { STORY_BEAT_IDS } from '../../../src/content/story.ts';
import { SICH_BUILDINGS } from '../../../src/content/sich.ts';
import { FARM_BUILDING_IDS } from '../../../src/content/villages/khortytsia.ts';
import {
  collectModifiers,
  foldSources,
  modifierSources,
  sichUnlocked,
  steadyModifiers,
  villageOf,
  type ModSource,
  type ModSourceRef,
  type Modifiers,
} from '../../../src/core/modifiers.ts';
import { createInitialState, type GameState } from '../../../src/core/state.ts';
import { windLookAt } from '../../../src/core/systems/village-mechanics/wind.ts';
import { DAY, GOLDEN_RELICS, randomState, SAMPLES, STATES, T0 } from './modifier-samples.ts';

interface GoldenRow {
  readonly now: number;
  readonly live: Modifiers;
  readonly steady: Modifiers;
}
const GOLDEN = JSON.parse(
  readFileSync(new URL('../../fixtures/golden/modifier-fields-m4-03.json', import.meta.url), 'utf8'),
) as readonly GoldenRow[];

describe('modifierSources: states without culture and heroes fold to the M4-03 values (golden)', () => {
  it('the random states do exercise the sources (unlocked Sich buildings, relics, locked levels)', () => {
    const unlockedChurch = SAMPLES.filter(({ state }) =>
      SICH_BUILDINGS.some((b) => b.id === 'church' && sichUnlocked(b, state)),
    );
    expect(unlockedChurch.length).toBeGreaterThan(5);
    expect(unlockedChurch.length).toBeLessThan(STATES - 5);
    expect(SAMPLES.filter(({ state }) => state.relics.length === GOLDEN_RELICS.length).length).toBeGreaterThan(5);
    expect(SAMPLES.filter(({ state }) => state.relics.length === 0).length).toBeGreaterThan(5);
    expect(GOLDEN).toHaveLength(STATES);
  });

  it.each(SAMPLES.map((x, i) => [i + 1, x, GOLDEN[i]] as const))(
    'state %i: collectModifiers and steadyModifiers = the golden values',
    (_, x, golden) => {
      expect(golden?.now).toBe(x.now);
      expect(collectModifiers(x.state, x.now)).toStrictEqual(golden?.live);
      expect(steadyModifiers(x.state)).toStrictEqual(golden?.steady);
    },
  );

  it('culture and hero sources come after every older source (append last)', () => {
    const { state } = SAMPLES[0] ?? randomState(1);
    const withCulture: GameState = {
      ...state,
      story: { seen: [...STORY_BEAT_IDS] },
      village: { ...state.village, levels: { ...state.village.levels, tavern: 1 } },
      culture: { 'music.dumy': 2, 'music.maidan': 1 },
      heroes: { otaman: 3 },
    };
    const old = modifierSources({ ...withCulture, culture: {}, heroes: {} });
    const all = modifierSources(withCulture);
    expect(all.length).toBeGreaterThan(old.length);
    expect(all.slice(0, old.length)).toStrictEqual(old);
    expect(all.slice(old.length).every((x) => x.source.kind === 'culture' || x.source.kind === 'hero')).toBe(true);
  });
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

const DEF: ModSourceRef = { kind: 'defence' };
const NONE = foldSources([], 1);

describe('foldSources: base ± shares, floors, the wind (M4-03)', () => {
  it('no source: every field at its base, the windmill at the wind', () => {
    expect(NONE).toStrictEqual({ ...BASE, buildingMult: Object.fromEntries(FARM_BUILDING_IDS.map((id) => [id, 1])) });
    expect(foldSources([], 1.5).buildingMult.windmill).toBe(1.5);
  });

  it('a bonus share raises its field only', () => {
    const m = foldSources(
      [
        { source: DEF, field: 'gloryMult', share: 0.25 },
        { source: DEF, field: 'gloryMult', share: 0.5 },
      ],
      1,
    );
    expect(m).toStrictEqual({ ...NONE, gloryMult: BASE.gloryMult + 0.75 });
  });

  it('a reduction share lowers its field (every reducing field)', () => {
    expect(REDUCING.size).toBeGreaterThan(0);
    for (const field of REDUCING) {
      if (field === 'buildingMult') throw new Error('content');
      const m = foldSources([{ source: DEF, field, share: 0.125 }], 1);
      expect(m, field).toStrictEqual({ ...NONE, [field]: BASE[field] - 0.125 });
    }
  });

  it('a reduction past its floor stops at the floor', () => {
    const floor = EFFECT_FLOORS.cost;
    const m = foldSources(
      [
        { source: DEF, field: 'costMult', share: 0.75 * (1 - floor) },
        { source: DEF, field: 'costMult', share: 1 - floor },
      ],
      1,
    );
    expect(m.costMult).toBe(floor);
  });

  it('a building share raises only that building, the wind multiplies the windmill after it', () => {
    const m = foldSources([{ source: DEF, field: 'buildingMult', building: 'garden', share: 0.5 }], 2);
    expect(m.buildingMult).toStrictEqual({ ...NONE.buildingMult, garden: 1.5, windmill: 2 });
    const w = foldSources([{ source: DEF, field: 'buildingMult', building: 'windmill', share: 0.5 }], 2);
    expect(w.buildingMult.windmill).toBe(3);
  });
});

// The M4-07 breakdown contract: what the UI lists (base ± Σ of a field's sources) is the number the economy uses.
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
