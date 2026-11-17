// Economy formulas (SPEC §3.2, §3.2.1; plan §0, M1-05). Pure functions over content records; every constant comes
// from src/content. Costs and incomes are Big; level counts are numbers.
//   cost(l)        = base × scale × growth^l × mult                     (level l → l + 1)
//   bulkCost(l, n) = base × scale × growth^l × (growth^n − 1)/(growth − 1) × mult
//   prod(l)        = baseProd × scale × l × milestoneMult(l) × mult
// The same `cost` prices Sich buildings (scale = the land's gloryScale, paid in glory).
import type { BUY_MODES, Milestone } from '../content/economy.ts';
import { FARM } from '../content/economy.ts';
import type { FarmBuildingId, Village } from '../content/villages/khortytsia.ts';
import { Big } from './big.ts';

/** Anything with a price: a farm or a Sich building. */
export interface Priced {
  readonly base: number;
  readonly growth: number;
}

/** A building that produces ducats. */
export interface Producing {
  readonly baseProd: number;
}

export type BuyMode = (typeof BUY_MODES)[number];

/** Income multiplier of all milestones reached at `level` (×2 at 10, 25, 50, 75; ×3 at 100). */
export function milestoneMult(level: number, milestones: readonly Milestone[] = FARM.milestones): number {
  let m = 1;
  for (const s of milestones) if (level >= s.level) m *= s.mult;
  return m;
}

/** Visual tier: how many milestone levels `level` has reached. */
export function tier(level: number, milestoneLevels: readonly number[]): number {
  let t = 0;
  for (const l of milestoneLevels) if (level >= l) t += 1;
  return t;
}

/** Price of level `level` → `level + 1`. */
export function cost(b: Priced, level: number, scale: number, mult = 1): Big {
  return Big.from(b.base).mul(scale).mul(Big.from(b.growth).pow(level)).mul(mult);
}

/** Price of `n` levels starting at `level` (geometric sum); 0 for n = 0. */
export function bulkCost(b: Priced, level: number, n: number, scale: number, mult = 1): Big {
  if (n <= 0) return Big.ZERO;
  const g = Big.from(b.growth);
  return cost(b, level, scale, mult)
    .mul(g.pow(n).sub(1))
    .div(b.growth - 1);
}

/**
 * Most levels `money` buys from `level`, capped at `levelMax`. Closed form n = ⌊log_g(money·(g−1)/cost(level) + 1)⌋,
 * then corrected by ±1 against `bulkCost` (pow goes through logarithms, so the closed form can be off by one).
 */
export function maxAffordable(b: Priced, level: number, money: Big, scale: number, levelMax: number, mult = 1): number {
  const room = Math.max(0, levelMax - level);
  if (room === 0 || money.lt(cost(b, level, scale, mult))) return 0;
  const ratio = money
    .mul(b.growth - 1)
    .div(cost(b, level, scale, mult))
    .add(1);
  let n = Math.min(room, Math.max(0, Math.floor(ratio.log10() / Math.log10(b.growth))));
  while (n > 0 && bulkCost(b, level, n, scale, mult).gt(money)) n -= 1;
  while (n < room && bulkCost(b, level, n + 1, scale, mult).lte(money)) n += 1;
  return n;
}

/**
 * Levels a buy button purchases: ×1/×10/×25 buy exactly n — or the rest up to the cap — and only if all of it is
 * affordable (otherwise 0: the button is disabled); MAX buys as many as `money` covers.
 */
export function buyCount(
  b: Priced,
  level: number,
  money: Big,
  scale: number,
  levelMax: number,
  mode: BuyMode,
  mult = 1,
): number {
  if (mode === 'max') return maxAffordable(b, level, money, scale, levelMax, mult);
  const n = Math.min(mode, Math.max(0, levelMax - level));
  if (n === 0) return 0;
  return bulkCost(b, level, n, scale, mult).lte(money) ? n : 0;
}

/**
 * Ducats per second of one building at `level`, as a plain number. A rate is a product of content constants and small
 * integers (≤ base 4e5 × scale ×1000 per land × level 100 × milestones 48 × modifiers), far inside a double even in the
 * last land; only accumulated totals need `Big`. Computing rates in `number` keeps a 0.1 s tick cheap (M1-09: Big
 * multiplications were 85 % of a tick).
 */
export function prodRate(b: Producing, level: number, scale: number, mult = 1): number {
  if (level <= 0) return 0;
  return b.baseProd * scale * level * milestoneMult(level) * mult;
}

/** Ducats per second of one building at `level`. */
export function prod(b: Producing, level: number, scale: number, mult = 1): Big {
  return Big.from(prodRate(b, level, scale, mult));
}

/** Ducats per second of the whole farm and suburb; `buildingMult` carries per-building modifiers (M1-06). */
export function incomeRate(
  levels: Readonly<Record<FarmBuildingId, number>>,
  village: Village,
  buildingMult: (id: FarmBuildingId) => number = () => 1,
): Big {
  let total = 0;
  for (const b of village.buildings) total += prodRate(b, levels[b.id], village.scale, buildingMult(b.id));
  return Big.from(total);
}
