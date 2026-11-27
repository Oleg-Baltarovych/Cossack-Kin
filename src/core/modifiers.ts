// Food, defence and the single modifier collector (SPEC §3.0, §3.2, §3.2.1, §9.6; plan M1-06, M4-03; ADR 013). Every
// buff is a `ModSource` of `modifierSources(state)`, and `collectModifiers(state, now)` folds them — systems never read
// buff buildings, relics, culture or heroes directly. Sich effects count only for unlocked buildings, relics only once
// found (plan M3-06), culture ranks only in an open branch and heroes only once they came (M4-05): the save gate does
// not enforce unlocks, so a crafted save with a level on a locked building gains nothing from it (security review
// M1-04). No cache yet (measure first, plan §0).
import {
  CULTURE_BRANCHES,
  CULTURE_NODES,
  type CultureBranch,
  type CultureNode,
  type CultureNodeId,
} from '../content/culture.ts';
import { ARMY, DEFENCE, FOOD, OFFLINE } from '../content/economy.ts';
import {
  EFFECT_FLOORS,
  EFFECT_KINDS,
  EFFECT_TARGETS,
  type EffectField,
  type EffectKind,
  type RankedEffect,
} from '../content/effects.ts';
import { HEROES, type HeroId } from '../content/heroes.ts';
import { RELIC_DEFS, type RelicEffect, type RelicId } from '../content/relics.ts';
import { SICH_BUILDINGS, type SichBuilding, type SichBuildingId } from '../content/sich.ts';
import { STORY_BEATS, type StoryBeatId } from '../content/story.ts';
import {
  FARM_BUILDING_IDS,
  KHORTYTSIA,
  type FarmBuildingId,
  type FarmEffect,
  type Village,
} from '../content/villages/khortytsia.ts';
import type { Big } from './big.ts';
import { incomeRate } from './economy.ts';
import type { GameState, VillageState } from './state.ts';
import { windLookAt } from './systems/village-mechanics/wind.ts';

export interface Modifiers {
  /** Farm and suburb income (defence: «спокій на хуторах»). */
  readonly incomeMult: number;
  /** Per-building income multiplier (the land passive and the wind on the windmill). */
  readonly buildingMult: Readonly<Record<FarmBuildingId, number>>;
  readonly costMult: number;
  /** Culture prices (the Кобзар, «Кобза діда»). A reduction: 1 − Σ share, floored in content. */
  readonly cultureCostMult: number;
  readonly gloryMult: number;
  /** Army power (the smithy, the maidan, …). */
  readonly powerMult: number;
  readonly offlineMult: number;
  readonly offlineCapSec: number;
  /** How many seconds of glory income the store holds (the treasury raises it). */
  readonly gloryCapSec: number;
  /** Raid loot (the treasury, «Порохівниця»); a raid adds its rumour's share on top (systems/raids.ts). */
  readonly lootMult: number;
  /** Relic chance of a raid success (the Характерник, «Купальська ніч»; a relic rumour adds on top). */
  readonly relicChanceMult: number;
  /**
   * Raid duration (the Характерник). Applied once, at a raid's start (`rollRaid`, M4-06): floored at
   * `RAIDS.minTimeMult`, the bound of the v5 gate's `returnAt` window.
   */
  readonly raidTimeMult: number;
}

/** The scalar `Modifiers` fields (every one but the per-building `buildingMult`). */
export type ScalarField = Exclude<keyof Modifiers, 'buildingMult'>;

/** Content's effect fields are scalar `Modifiers` fields (ADR 013): a renamed field fails to compile here. */
const EFFECT_FIELD: Readonly<Record<EffectField, ScalarField>> = {
  incomeMult: 'incomeMult',
  gloryMult: 'gloryMult',
  powerMult: 'powerMult',
  lootMult: 'lootMult',
  relicChanceMult: 'relicChanceMult',
  offlineMult: 'offlineMult',
  offlineCapSec: 'offlineCapSec',
  gloryCapSec: 'gloryCapSec',
  costMult: 'costMult',
  cultureCostMult: 'cultureCostMult',
  raidTimeMult: 'raidTimeMult',
};

/**
 * Who gives a share. Culture nodes count only in an open branch, heroes only once they came (M4-05): each ranked
 * effect goes to its field through `EFFECT_TARGETS`.
 */
export type ModSourceRef =
  | { readonly kind: 'farm'; readonly id: FarmBuildingId }
  | { readonly kind: 'sich'; readonly id: SichBuildingId }
  | { readonly kind: 'defence' }
  | { readonly kind: 'relic'; readonly id: RelicId }
  | { readonly kind: 'land'; readonly id: Village['id'] }
  | { readonly kind: 'culture'; readonly id: CultureNodeId }
  | { readonly kind: 'hero'; readonly id: HeroId };

/** One contribution to one field: a share of a multiplier (0.03 = +3 %), seconds for the caps. Never 0. */
export type ModSource = (
  { readonly field: ScalarField } | { readonly field: 'buildingMult'; readonly building: FarmBuildingId }
) & { readonly source: ModSourceRef; readonly share: number };

const VILLAGES: Readonly<Record<GameState['village']['id'], Village>> = { khortytsia: KHORTYTSIA };

/** What each scalar field is before any source. */
const BASE: Readonly<Record<ScalarField, number>> = {
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

/** The reducing fields and their floors: `EFFECT_FLOORS` through `EFFECT_TARGETS` (content bounds Σ, ADR 013). */
const FLOOR_LIST: readonly (readonly [ScalarField, number])[] = (() => {
  const byKind: Partial<Record<EffectKind, number>> = EFFECT_FLOORS;
  const floors: [ScalarField, number][] = [];
  for (const kind of EFFECT_KINDS) {
    const floor = byKind[kind];
    if (floor === undefined) continue;
    const target = EFFECT_TARGETS[kind];
    switch (target.to) {
      case 'field':
        floors.push([EFFECT_FIELD[target.field], floor]);
        break;
      case 'foodBuildings':
        // A content error (content test `culture.test.ts`): a per-building multiplier only grows.
        throw new Error(`reducing effect ${kind} cannot target food buildings`);
      default:
        return unreachable(target);
    }
  }
  return floors;
})();
const REDUCING: ReadonlySet<ScalarField> = new Set(FLOOR_LIST.map(([field]) => field));

/** Whether a field is a reduction (`1 − Σ share`, floored): its sources subtract (the breakdown, M4-07). */
export function reducingField(field: ScalarField): boolean {
  return REDUCING.has(field);
}

function unreachable(x: never): never {
  throw new Error(`unexpected ${JSON.stringify(x)}`);
}

/** The field each ranked farm-building effect raises (`fairDay` is a scene event, no modifier). */
const FARM_EFFECT_FIELD: Readonly<Record<Exclude<FarmEffect['kind'], 'fairDay'>, ScalarField>> = {
  armyPower: 'powerMult',
  glory: 'gloryMult',
};

/** The field each relic effect moves (1:1, `content/relics.ts`); `cultureCostMult` is a reduction (FLOOR_LIST). */
const RELIC_FIELD: Readonly<Record<RelicEffect['kind'], ScalarField>> = {
  power: 'powerMult',
  loot: 'lootMult',
  cultureCost: 'cultureCostMult',
};

/** The building the wind of the moment multiplies (`collectModifiers`; the breakdown names it, M4-07). */
export const WIND_BUILDING: FarmBuildingId = 'windmill';

/** The farm building a land passive multiplies. */
const PASSIVE_BUILDING: Readonly<Record<Village['passive']['kind'], FarmBuildingId>> = { windmillMult: 'windmill' };

/** The content record of the state's land. */
export function villageOf(state: { readonly village: Pick<VillageState, 'id'> }): Village {
  return VILLAGES[state.village.id];
}

/** Whether a Sich building can be bought (and its effects count) in this state. */
export function sichUnlocked(
  b: SichBuilding,
  state: { readonly village: Pick<VillageState, 'id' | 'levels'> },
): boolean {
  const u = b.unlock;
  switch (u.kind) {
    case 'start':
      return true;
    case 'farmAll':
      return FARM_BUILDING_IDS.every((id) => state.village.levels[id] >= u.level);
    case 'land':
      return villageOf(state).number >= u.land;
  }
}

/**
 * Whether a culture branch is open (ADR 013: derived, never stored). A Sich condition also needs the building unlocked:
 * a crafted level on a locked church opens nothing (as it gives no Sich effect).
 */
export function cultureBranchOpen(
  branch: CultureBranch,
  state: { readonly village: Pick<VillageState, 'id' | 'levels' | 'sichLevels'> },
): boolean {
  const u = branch.unlock;
  switch (u.kind) {
    case 'building':
      return state.village.levels[u.id] >= u.level;
    case 'sich': {
      const b = SICH_BUILDINGS.find((x) => x.id === u.id);
      return b !== undefined && sichUnlocked(b, state) && state.village.sichLevels[u.id] >= u.level;
    }
  }
}

/** Each branch by id, built once (`modifierSources` runs on every tick). */
const BRANCH_BY_ID: ReadonlyMap<CultureBranch['id'], CultureBranch> = new Map(CULTURE_BRANCHES.map((b) => [b.id, b]));

/** The branch of `node` is open: its ranks count and it can be bought. */
export function cultureNodeOpen(node: CultureNode, state: GameState): boolean {
  const branch = BRANCH_BY_ID.get(node.branch);
  return branch !== undefined && cultureBranchOpen(branch, state);
}

/** The beat that brings each hero (its `unlock` reward), built once; a hero no beat brings is missing. */
const HERO_BEAT: ReadonlyMap<HeroId, StoryBeatId> = new Map(
  STORY_BEATS.flatMap((b) => (b.reward?.kind === 'unlock' ? [[b.reward.hero, b.id] as const] : [])),
);

/** The beat that brings `id` (undefined while none does): the «Прийде, коли…» condition of his card (M4-07). */
export function heroBeat(id: HeroId): StoryBeatId | undefined {
  return HERO_BEAT.get(id);
}

/**
 * A hero's level in force: 0 until he came — stored and his unlock beat seen (the gate checks it too, but formulas do
 * not rely on the gate, `.claude/rules/core.md`).
 */
export function heroLevel(id: HeroId, state: Pick<GameState, 'heroes' | 'story'>): number {
  const level = state.heroes[id];
  if (level === undefined) return 0;
  const beat = HERO_BEAT.get(id);
  return beat !== undefined && state.story.seen.includes(beat) ? level : 0;
}

/** Sum of `perLevel(b) × level` over the unlocked Sich buildings. */
function sichSum(state: GameState, perLevel: (b: SichBuilding) => number | undefined): number {
  let sum = 0;
  for (const b of SICH_BUILDINGS) {
    const p = perLevel(b);
    if (p !== undefined && sichUnlocked(b, state)) sum += p * state.village.sichLevels[b.id];
  }
  return sum;
}

/** «Харч» (SPEC §3.0): Σ level × kharchPerLevel over the food buildings. */
export function kharch(state: GameState): number {
  let sum = 0;
  for (const b of villageOf(state).buildings) {
    if (b.kharchPerLevel !== undefined) sum += state.village.levels[b.id] * b.kharchPerLevel;
  }
  return sum;
}

/** The Cossack limit: what the food feeds plus the kurins' places. */
export function maxCossacks(state: GameState): number {
  return Math.floor(kharch(state) / FOOD.kharchPerCossack) + sichSum(state, (b) => b.effects.cossacksPerLevel);
}

/** «Оборона» points (SPEC §3.0). */
export function defence(state: GameState): number {
  return sichSum(state, (b) => b.effects.defencePerLevel);
}

/**
 * Every share in force (SPEC §9.6, ADR 013) — the one list the engine folds and the UI breakdown reads. Order is
 * part of the result (float sums): farm, Sich, defence, relics, land, culture, heroes, content order within each —
 * the pre-M4-03 order with the M4-05 kinds appended, so a state without culture and heroes folds to the bit as before
 * (golden test). Locked Sich buildings, unfound relics, nodes of a closed branch and heroes not come give nothing;
 * the wind of the moment is no source (it varies with time: `collectModifiers` applies it on top).
 */
export function modifierSources(state: GameState): ModSource[] {
  const village = villageOf(state);
  const out: ModSource[] = [];
  const add = (src: ModSource): void => {
    if (src.share !== 0) out.push(src);
  };
  for (const b of village.buildings) {
    const e = b.effect;
    if (e === undefined) continue;
    switch (e.kind) {
      case 'armyPower':
      case 'glory':
        add({
          field: FARM_EFFECT_FIELD[e.kind],
          source: { kind: 'farm', id: b.id },
          share: e.perLevel * state.village.levels[b.id],
        });
        break;
      case 'fairDay':
        break;
      default:
        unreachable(e);
    }
  }
  for (const b of SICH_BUILDINGS) {
    if (!sichUnlocked(b, state)) continue;
    const level = state.village.sichLevels[b.id];
    const source: ModSourceRef = { kind: 'sich', id: b.id };
    const e = b.effects;
    if (e.powerPerLevel !== undefined) add({ field: 'powerMult', source, share: e.powerPerLevel * level });
    if (e.gloryPerLevel !== undefined) add({ field: 'gloryMult', source, share: e.gloryPerLevel * level });
    if (e.gloryCapSecPerLevel !== undefined) {
      add({ field: 'gloryCapSec', source, share: e.gloryCapSecPerLevel * level });
    }
    if (e.lootPerLevel !== undefined) add({ field: 'lootMult', source, share: e.lootPerLevel * level });
  }
  // «Спокій на хуторах»: one source for the defence points of every Sich building (as `defence()` counts them).
  add({ field: 'incomeMult', source: { kind: 'defence' }, share: defence(state) * DEFENCE.incomePerPoint });
  for (const r of RELIC_DEFS) {
    if (!state.relics.includes(r.id)) continue;
    add({ field: RELIC_FIELD[r.effect.kind], source: { kind: 'relic', id: r.id }, share: r.effect.share });
  }
  // The land passive «Вітряки ×N» as the share N − 1 of its building.
  add({
    field: 'buildingMult',
    building: PASSIVE_BUILDING[village.passive.kind],
    source: { kind: 'land', id: village.id },
    share: village.passive.mult - 1,
  });
  // M4-05, appended last (the fold of the sources above stays bit-exact): culture nodes of open branches, then the
  // heroes that came.
  const ranked = (source: ModSourceRef, effects: readonly RankedEffect[], rank: number): void => {
    if (rank === 0) return;
    for (const e of effects) {
      const share = e.perRank * rank;
      const target = EFFECT_TARGETS[e.kind];
      switch (target.to) {
        case 'field':
          add({ field: EFFECT_FIELD[target.field], source, share });
          break;
        case 'foodBuildings':
          for (const b of village.buildings)
            if (b.kharchPerLevel !== undefined) add({ field: 'buildingMult', building: b.id, source, share });
          break;
        default:
          unreachable(target);
      }
    }
  };
  for (const n of CULTURE_NODES) {
    if (cultureNodeOpen(n, state)) ranked({ kind: 'culture', id: n.id }, n.effects, state.culture[n.id] ?? 0);
  }
  for (const h of HEROES) ranked({ kind: 'hero', id: h.id }, h.effects, heroLevel(h.id, state));
  return out;
}

/** All multipliers in force at `now` (ms) (SPEC §9.6): the wind on the windmill depends on the time. */
export function collectModifiers(state: GameState, now: number): Modifiers {
  return modifiersUnder(state, windLookAt(state.seed, now, villageOf(state)).windmillMult);
}

/**
 * The multipliers without the wind of the moment (the windmill at ×1, a breeze): the rate a reward in minutes is
 * measured by, so it does not depend on when it is granted (plan M2-22: online = offline).
 */
export function steadyModifiers(state: GameState): Modifiers {
  return modifiersUnder(state, 1);
}

function modifiersUnder(state: GameState, windmillMult: number): Modifiers {
  return foldSources(modifierSources(state), windmillMult);
}

/**
 * The fold of sources, then the wind on the windmill: each field is its base ± every share of it in list order (a
 * reduction — a field with a floor — subtracts and never falls below the floor). Fields multiply where the systems
 * combine them.
 */
export function foldSources(sources: readonly ModSource[], windmillMult: number): Modifiers {
  const fields: Record<ScalarField, number> = { ...BASE };
  // fromEntries over FARM_BUILDING_IDS yields every id: the string-keyed result is the full record.
  const buildingMult = Object.fromEntries(FARM_BUILDING_IDS.map((id) => [id, 1])) as Record<FarmBuildingId, number>;
  for (const s of sources) {
    if (s.field === 'buildingMult') buildingMult[s.building] += s.share;
    else fields[s.field] += REDUCING.has(s.field) ? -s.share : s.share;
  }
  for (const [field, floor] of FLOOR_LIST) fields[field] = Math.max(floor, fields[field]);
  buildingMult[WIND_BUILDING] *= windmillMult;
  return { ...fields, buildingMult };
}

/** Ducats per second of the farm and suburb under `mods`. */
export function farmIncomeRate(state: GameState, mods: Modifiers): Big {
  // incomeMult folded into the per-building number product: one Big conversion per call (M1-09 review).
  return incomeRate(state.village.levels, villageOf(state), (id) => mods.buildingMult[id] * mods.incomeMult);
}
