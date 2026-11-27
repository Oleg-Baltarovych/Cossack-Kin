// Culture and heroes (SPEC §3.5 «Модель M4»; plan M4-05; ADR 013). `buyCulture` learns one rank of a node in an open
// branch whose prerequisites hold, for `base × growth^rank × cultureCostMult` glory; `levelHero` raises a hero who came
// with the shared ×1/×10/×25/Max picker, `base × growth^level` a level. Their effects are not read here: they are
// sources of `modifierSources` (modifiers.ts), so the engine and the UI breakdown see the same numbers.
// `CultureBought` / `HeroLevelled` come only from these actions (time never buys).
import { CULTURE_NODES, type CultureNode, type CultureNodeId } from '../../content/culture.ts';
import { HEROES, type HeroDef, type HeroId } from '../../content/heroes.ts';
import type { Big } from '../big.ts';
import { bulkCost, buyCount, cost, type BuyMode } from '../economy.ts';
import type { GameEvent, RejectReason } from '../events.ts';
import { collectModifiers, cultureNodeOpen, heroLevel } from '../modifiers.ts';
import type { GameState } from '../state.ts';

/** Culture and hero prices are not scaled by the land (glory scale applies to Sich buildings only; M5 decides). */
const UNSCALED = 1;

interface Result {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/** Glory price of rank `rank` → `rank + 1` (plan §0). */
export function culturePrice(node: CultureNode, rank: number, cultureCostMult: number): Big {
  return cost(node, rank, UNSCALED, cultureCostMult);
}

/** Glory price of `n` hero levels from `level` (the level of `level + 1` costs base × growth^level). */
export function heroPrice(hero: HeroDef, level: number, n: number): Big {
  return bulkCost(hero, level, n, UNSCALED);
}

/** Whether `node`'s prerequisites hold: the root always, any/all of the listed nodes at rank ≥ 1. */
export function culturePrereqMet(node: CultureNode, state: Pick<GameState, 'culture'>): boolean {
  const r = node.requires;
  switch (r.kind) {
    case 'root':
      return true;
    case 'anyOf':
      return r.ids.some((id) => (state.culture[id] ?? 0) >= 1);
    case 'allOf':
      return r.ids.every((id) => (state.culture[id] ?? 0) >= 1);
  }
}

/** One rank of `id` at time `at` (the action's time after `advance`). */
export function buyCulture(s: GameState, id: CultureNodeId, at: number): Result | RejectReason {
  const node = CULTURE_NODES.find((n) => n.id === id);
  if (!node || !cultureNodeOpen(node, s)) return 'locked';
  const rank = s.culture[id] ?? 0;
  if (rank >= node.maxRank) return 'max';
  if (!culturePrereqMet(node, s)) return 'prereq';
  const price = culturePrice(node, rank, collectModifiers(s, at).cultureCostMult);
  if (s.currencies.glory.lt(price)) return 'glory';
  const to = rank + 1;
  return {
    state: {
      ...s,
      currencies: { ...s.currencies, glory: s.currencies.glory.sub(price) },
      culture: { ...s.culture, [id]: to },
      stats: { ...s.stats, cultureRanks: s.stats.cultureRanks + 1 },
    },
    events: [{ type: 'CultureBought', id, from: rank, to }],
  };
}

/** Levels of hero `id` by the picker `mode` (×n: exactly n or the rest to the cap, all affordable; max: what pays). */
export function levelHero(s: GameState, id: HeroId, mode: BuyMode): Result | RejectReason {
  const hero = HEROES.find((h) => h.id === id);
  const level = heroLevel(id, s);
  if (!hero || level === 0) return 'locked';
  if (level >= hero.levelMax) return 'max';
  const n = buyCount(hero, level, s.currencies.glory, UNSCALED, hero.levelMax, mode);
  if (n === 0) return 'glory';
  const to = level + n;
  return {
    state: {
      ...s,
      currencies: { ...s.currencies, glory: s.currencies.glory.sub(heroPrice(hero, level, n)) },
      heroes: { ...s.heroes, [id]: to },
      stats: { ...s.stats, heroLevels: s.stats.heroLevels + n },
    },
    events: [{ type: 'HeroLevelled', id, from: level, to }],
  };
}
