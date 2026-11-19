// Риштування — the scaffold a new building rises behind (plan M2-12, SPEC §6.5 «будівництво»): 2 sizes (`s` for a low
// plot — a field, beds, the fair ground; `l` for a house, the smithy, a mill) × 3 stages (`idle` frames 0–2), shown
// for 0.4 s each before the building pops in (render/fx/construction.ts). Stage 0: the front posts half up, stakes for
// the back ones and a pile of logs at the foot; 1: every post up, tied with ledgers and a cross-brace; 2: plank decks
// on the ledgers and a ladder. Rough-hewn wood in 3/4 view (back posts higher in the frame and darker), lit from the
// top-left: a light left edge, a dark right one. Binary alpha, wood ramp only. Pivot = bottom centre (ground row).
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

interface Look {
  readonly w: number;
  readonly h: number;
  /** Ledger rows above the ground row (front posts), bottom up. */
  readonly ledgers: readonly number[];
  /** The back posts stand this many rows further up (depth). */
  readonly depth: number;
}

export const SCAFFOLD_LOOKS: Readonly<Record<'s' | 'l', Look>> = {
  s: { w: 40, h: 40, ledgers: [11, 22, 32], depth: 4 },
  l: { w: 56, h: 64, ledgers: [13, 26, 39, 52], depth: 6 },
};
/** The common frame (the larger look); each look is drawn centred on its bottom row. */
const W = 56;
const H = 64;
const BASE = H - 1;

/** A 2-px post; `cap`: a fresh-cut stake — both top px light end grain (stage 0, art-director M2-12). */
function post(p: Plot, x: number, foot: number, height: number, back: boolean, cap = false): void {
  for (let y = foot - height + 1; y <= foot; y++) {
    p.set(x, y, 'wood', back ? 3 : 5);
    p.set(x + 1, y, 'wood', back ? 1 : 2);
  }
  // A cut top: lighter px on the end grain.
  p.set(x, foot - height + 1, 'wood', cap ? 6 : back ? 4 : 6);
  if (cap) p.set(x + 1, foot - height + 1, 'wood', 6);
  // A 1-px contact shadow on the ground beside the foot, every other px (a 50 % dither).
  p.set(x - 1, foot, 'ink', 0);
  p.set(x + 2, foot, 'ink', 0);
}

/** Dug, turned soil under the scaffold's footprint: a checker of two dark earth steps. */
function soil(p: Plot, x0: number, x1: number, y0: number, y1: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) p.set(x, y, 'earth', (x + y) % 2 === 0 ? 1 : 2);
}

function hline(p: Plot, x0: number, x1: number, y: number, shade: number): void {
  for (let x = x0; x <= x1; x++) p.set(x, y, 'wood', shade);
}

/** A 1-px brace from (x0, y0) to (x1, y1), stepped in whole px (no trig). */
function brace(p: Plot, x0: number, y0: number, x1: number, y1: number): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++)
    p.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), 'wood', 3);
}

function logs(p: Plot, cx: number, foot: number): void {
  // Three log ends stacked 2 + 1: rings (end grain) with a dark rim.
  for (const [ox, oy] of [
    [0, 0],
    [4, 0],
    [2, -3],
  ] as const) {
    for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 1; dx++) p.set(cx + ox + dx, foot + oy + dy, 'wood', 4);
    p.set(cx + ox, foot + oy - 1, 'wood', 6);
    p.set(cx + ox + 1, foot + oy, 'wood', 1);
  }
  // Contact shadow under the pile: a 50 % ink dither.
  for (let x = cx - 2; x <= cx + 7; x += 2) p.set(x, foot + 1, 'ink', 0);
}

const scaffold: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'scaffold',
  size: { w: W, h: H },
  frames: { idle: 3 },
  variants: ['s', 'l'],
  anchor: { x: W / 2 / W, y: BASE / H },
  generate(_rng, { variant, frame, buffer, rampSize }) {
    const look = SCAFFOLD_LOOKS[variant === 'l' ? 'l' : 's'];
    const p = new Plot();
    const x0 = (W - look.w) / 2;
    const left = x0 + 1;
    const right = x0 + look.w - 3;
    const backL = left + look.depth + 2;
    const backR = right - look.depth - 2;
    const backFoot = BASE - look.depth;
    const top = look.ledgers[look.ledgers.length - 1] ?? 10;
    const full = top + 3;
    soil(p, left - 1, right + 2, backFoot + 1, BASE);
    if (frame === 0) {
      // Back stakes only a few px; the front posts half up; logs waiting at the foot.
      post(p, backL, backFoot, 4, true, true);
      post(p, backR, backFoot, 4, true, true);
      post(p, left, BASE, Math.floor(full / 2), false, true);
      post(p, right, BASE, Math.floor(full / 2) - 3, false, true);
      logs(p, Math.floor(W / 2) - 3, BASE - 1);
      compose(buffer, [p.part(1, 1)], rampSize, { light: false, occlusion: false });
      return;
    }
    post(p, backL, backFoot, full, true);
    post(p, backR, backFoot, full, true);
    // Back ledgers first (the front ones cover them), at the same heights above their own foot.
    for (const l of look.ledgers) hline(p, backL + 2, backR - 1, backFoot - l, 2);
    post(p, left, BASE, full, false);
    post(p, right, BASE, full, false);
    for (const l of look.ledgers) {
      hline(p, left + 2, right - 1, BASE - l, 4);
      hline(p, left + 2, right - 1, BASE - l + 1, 2);
    }
    // One cross-brace in the lowest bay.
    const firstLedger = look.ledgers[0] ?? 10;
    brace(p, left + 2, BASE - 1, right - 1, BASE - firstLedger + 2);
    if (frame === 2) {
      // Plank decks on every ledger but the lowest: a light top row, a dark lip; a ladder up to the first deck.
      for (const l of look.ledgers.slice(1)) {
        hline(p, left - 1, right + 2, BASE - l - 1, 5);
        hline(p, left - 1, right + 2, BASE - l, 3);
        for (let x = left + 4; x < right; x += 7) p.set(x, BASE - l, 'wood', 1);
      }
      // Inboard of the right post (never touching it).
      const lx = right - 9;
      for (let y = BASE - (look.ledgers[1] ?? full) - 1; y <= BASE; y++) {
        p.set(lx, y, 'wood', 5);
        p.set(lx + 4, y, 'wood', 2);
        if ((BASE - y) % 4 === 2) hline(p, lx + 1, lx + 3, y, 4);
      }
    }
    compose(buffer, [p.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default scaffold;
