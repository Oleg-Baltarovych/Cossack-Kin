// Coins to the counter, the pure part (plan M2-26, SPEC §6.7): which incomes are large (COIN_FLIGHT.tiers, in seconds
// of income) and the Bézier flight on the logical pixel grid, from the button to the counter.
import { describe, expect, it } from 'vitest';
import { COIN_FLIGHT } from '../../../src/content/juice.ts';
import { Big } from '../../../src/core/big.ts';
import { coinsFor, flightFrames, snap } from '../../../src/ui/coins.ts';

const [first, second] = COIN_FLIGHT.tiers;

describe('coinsFor (M2-26)', () => {
  const rate = Big.from(10);
  it('below the first tier: no coins (a small income flies nothing)', () => {
    expect(coinsFor(rate.mul(first.minIncomeSec - 1), rate)).toBe(0);
    expect(coinsFor(Big.ZERO, rate)).toBe(0);
  });

  it('each tier from its threshold on', () => {
    expect(coinsFor(rate.mul(first.minIncomeSec), rate)).toBe(first.coins);
    expect(coinsFor(rate.mul(second.minIncomeSec - 1), rate)).toBe(first.coins);
    expect(coinsFor(rate.mul(second.minIncomeSec), rate)).toBe(second.coins);
    expect(coinsFor(rate.mul(1e9), rate)).toBe(second.coins);
  });

  it('nothing earned per second: any amount sends the first tier (no measure); nothing granted: none', () => {
    expect(coinsFor(Big.from(1), Big.ZERO)).toBe(first.coins);
    expect(coinsFor(Big.from(1e9), Big.ZERO)).toBe(first.coins);
    expect(coinsFor(Big.ZERO, Big.ZERO)).toBe(0);
  });

  it('beyond the Number range: compared as Big, never through a float', () => {
    const huge = Big.from(10).pow(400);
    expect(coinsFor(huge, Big.from(10).pow(398))).toBe(first.coins);
    expect(coinsFor(huge, Big.from(10).pow(396))).toBe(second.coins);
    expect(coinsFor(huge, Big.from(10).pow(399))).toBe(0);
  });

  it('tiers grow: a larger income never sends fewer coins', () => {
    for (let i = 1; i < COIN_FLIGHT.tiers.length; i += 1) {
      const a = COIN_FLIGHT.tiers[i - 1];
      const b = COIN_FLIGHT.tiers[i];
      if (!a || !b) throw new Error('tiers');
      expect(b.minIncomeSec).toBeGreaterThan(a.minIncomeSec);
      expect(b.coins).toBeGreaterThan(a.coins);
    }
  });
});

const parse = (frame: string): { x: number; y: number } => {
  const m = /^translate\((-?[\d.]+)px, (-?[\d.]+)px\)$/.exec(frame);
  if (!m) throw new Error(`not a translate: ${frame}`);
  return { x: Number(m[1]), y: Number(m[2]) };
};

describe('flightFrames (M2-26)', () => {
  // A claim in the sheet to the ducats counter in the HUD; 4/3.5 css px per logical px (412×915 at DPR 3.5).
  const px = 4 / 3.5;
  const from = { x: 300 * px, y: 600 * px };
  const to = { x: 40 * px, y: 20 * px };
  const n = 5;
  // The 412×915 css px screen.
  const SCREEN = { width: 412, height: 915 };

  it('one frame per frameMs, from the button to the counter', () => {
    const frames = flightFrames(from, to, 2, n, px, SCREEN).map(parse);
    expect(frames).toHaveLength(Math.ceil(COIN_FLIGHT.flightMs / COIN_FLIGHT.frameMs) + 1);
    expect(frames[0]?.x).toBeCloseTo(from.x, 9);
    expect(frames[0]?.y).toBeCloseTo(from.y, 9);
    expect(frames.at(-1)?.x).toBeCloseTo(to.x, 9);
    expect(frames.at(-1)?.y).toBeCloseTo(to.y, 9);
  });

  it('every frame stands on the logical pixel grid', () => {
    for (let i = 0; i < n; i += 1)
      for (const p of flightFrames(from, to, i, n, px, SCREEN).map(parse)) {
        expect(Math.abs(p.x / px - Math.round(p.x / px))).toBeLessThan(1e-6);
        expect(Math.abs(p.y / px - Math.round(p.y / px))).toBeLessThan(1e-6);
      }
  });

  it('a curve, not a line: half-way the coin is above the straight line; the coins fan out and meet again', () => {
    const paths = Array.from({ length: n }, (_, i) => flightFrames(from, to, i, n, px, SCREEN).map(parse));
    const half = Math.floor((paths[0]?.length ?? 0) / 2);
    const centre = paths[2]?.[half];
    if (!centre) throw new Error('frames');
    // The straight line's y at the centre coin's x.
    const lineY = from.y + ((centre.x - from.x) / (to.x - from.x)) * (to.y - from.y);
    expect(centre.y).toBeLessThan(lineY);
    const xs = paths.map((p) => p[half]?.x ?? 0);
    expect(new Set(xs).size).toBe(n);
    expect(new Set(paths.map((p) => p.at(-1)?.x)).size).toBe(1);
  });
  it('from a button at the screen edge, 8 coins never leave the screen (control point clamped inside the margin)', () => {
    const margin = COIN_FLIGHT.marginPx * px;
    const coins = 8;
    // A button hard against the right edge, a counter in the top-right corner, a short climb: unclamped, the fan
    // would swing coins past the right edge and the arc above the top.
    const edge = snap({ x: SCREEN.width - 4 * px, y: 60 * px }, px);
    const counter = snap({ x: SCREEN.width - 20 * px, y: 10 * px }, px);
    for (let i = 0; i < coins; i += 1)
      for (const p of flightFrames(edge, counter, i, coins, px, SCREEN).map(parse)) {
        // Up to half a logical px of grid snapping past the hull.
        expect(p.x).toBeLessThanOrEqual(Math.max(edge.x, SCREEN.width - margin) + px / 2);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(Math.min(counter.y, margin) - px / 2);
      }
  });
});
