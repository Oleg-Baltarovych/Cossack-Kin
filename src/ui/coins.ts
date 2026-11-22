// Coins to the counter (plan M2-26, SPEC §6.7), the pure part: whether an income is large enough to send coins and
// how many (COIN_FLIGHT.tiers, by the seconds of income it is worth), and each coin's flight — a quadratic Bézier from
// the pressed button to the HUD counter, worked out once at launch as one CSS transform per COIN_FLIGHT.frameMs on the
// logical pixel grid, so a frame of the flight only picks a ready string (components/CoinFlight.tsx).
import { COIN_FLIGHT } from '../content/juice.ts';
import type { Big } from '../core/big.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * How many coins `amount` sends when the currency earns `perSec` now: 0 below the first tier (a small income flies
 * nothing), else the coins of the highest tier it reaches. With nothing earned per second there is no measure: any
 * amount sends the first tier (a 5-glory reward before the Sich earns glory is no torrent).
 */
export function coinsFor(amount: Big, perSec: Big): number {
  if (!amount.gt(0)) return 0;
  if (!perSec.gt(0)) return COIN_FLIGHT.tiers[0].coins;
  let coins = 0;
  for (const tier of COIN_FLIGHT.tiers) {
    if (amount.lt(perSec.mul(tier.minIncomeSec))) break;
    coins = tier.coins;
  }
  return coins;
}

/** `p` on the logical pixel grid (`px` css px per logical px): no shimmer between device px in flight. */
export const snap = (p: Point, px: number): Point => ({ x: Math.round(p.x / px) * px, y: Math.round(p.y / px) * px });

/** Ease in and out along the curve: the coin leaves gently, speeds up, and settles into the counter. */
const ease = (t: number): number => t * t * (3 - 2 * t);

/**
 * Coin `i` of `n` from `from` to `to` (css px, already on the grid): the transforms of its flight, one per
 * COIN_FLIGHT.frameMs from 0 to COIN_FLIGHT.flightMs inclusive, each at whole logical px. The control point stands
 * COIN_FLIGHT.arcPx above the middle of the line, `spreadPx` to the side per coin from the centre one (inside `screen`,
 * `marginPx` from its edges), so the coins of one flight fan out and meet again at the counter.
 */
export function flightFrames(
  from: Point,
  to: Point,
  i: number,
  n: number,
  px: number,
  screen: { readonly width: number; readonly height: number },
): readonly string[] {
  // Kept COIN_FLIGHT.marginPx inside the screen: the curve never leaves the triangle of its three points.
  const margin = COIN_FLIGHT.marginPx * px;
  const clamp = (v: number, size: number): number => Math.min(Math.max(v, margin), Math.max(margin, size - margin));
  const control = {
    x: clamp((from.x + to.x) / 2 + (i - (n - 1) / 2) * COIN_FLIGHT.spreadPx * px, screen.width),
    y: clamp((from.y + to.y) / 2 - COIN_FLIGHT.arcPx * px, screen.height),
  };
  const steps = Math.ceil(COIN_FLIGHT.flightMs / COIN_FLIGHT.frameMs);
  const frames: string[] = [];
  for (let k = 0; k <= steps; k += 1) {
    const t = ease(k / steps);
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    const p = snap({ x: a * from.x + b * control.x + c * to.x, y: a * from.y + b * control.y + c * to.y }, px);
    frames.push(`translate(${String(p.x)}px, ${String(p.y)}px)`);
  }
  return frames;
}
