// Ковила — a feather-grass tussock of the steppe band (plan M2-29 A5, Q13 item 5): a low dry tussock (thatch 1–3 over
// a dark grass root) with long silky awns arching out of it downwind — pale grey hair a step under whitewash (plaster
// 2, plaster 3 on the bend that catches the sun), so at night they grade down with the band instead of out-shining the
// windows. Placed as drifts (layout `steppeDrift`): a silvery sheet, not lone tufts. Five baked sway frames (SWAY_SHIFTS; the awns lean most), no outline (1-px awns would swell to 3 px),
// 1-row contact shadow. `a` five awns, `b` seven, fuller. 30×24, pivot at the root centre.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { footProfile, SWAY_SHIFTS, swayed } from '../../lib/recipes-plants.ts';
import { dryBlade } from '../../lib/recipes-steppe.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 30;
const H = 24;
export const KOVYLA_GROUND = 22;
const CX = 12;

/**
 * An awn: root x offset from the centre, root height above the ground, start angle (degrees from straight up,
 * + = downwind right), bend per px (degrees), length (px). Traced px by px; it rises, arcs over and droops.
 */
type Awn = readonly [number, number, number, number, number];

// Awns rise from the stem and bend over downwind, 1 px wide (art-director A5: arching hair, not parallel bars).
const AWNS: Readonly<Record<'a' | 'b', readonly Awn[]>> = {
  a: [
    [-1, 6, 5, 9, 13],
    [0, 7, 15, 8, 15],
    [1, 6, 30, 9, 12],
  ],
  b: [
    [-1, 7, 0, 8, 14],
    [0, 8, 12, 8, 17],
    [1, 7, 22, 8, 15],
    [2, 6, 38, 9, 12],
  ],
};

/** The tussock: a dark root row, dry blades fanning up from it, a few green ones in the middle. */
function tussock(p: Plot, wide: boolean): void {
  const half = wide ? 4 : 3;
  for (let dx = -half; dx <= half; dx++) p.set(CX + dx, KOVYLA_GROUND, 'grass', 1);
  for (let dx = -half; dx <= half; dx++) {
    const h = 2 + Math.max(0, 3 - Math.abs(dx));
    const lean = dx < -1 ? -1 : dx > 1 ? 1 : 0;
    if (Math.abs(dx) % 2 === 1 && Math.abs(dx) < half) {
      for (let k = 1; k < h; k++) p.set(CX + dx, KOVYLA_GROUND - k, 'grass', k === h - 1 ? 3 : 2);
    } else dryBlade(p, CX + dx, KOVYLA_GROUND - 1, h, lean, dx < 0);
  }
}

function awn(p: Plot, [dx, rise, angle, bend, len]: Awn): void {
  let x = CX + dx + 0.5;
  let y = KOVYLA_GROUND - rise + 0.5;
  let a = angle;
  const seen = new Set<number>();
  for (let k = 0; k < len * 3; k++) {
    const rad = (a * Math.PI) / 180;
    x += Math.sin(rad) / 3;
    y -= Math.cos(rad) / 3;
    a += bend / 3;
    const px = Math.floor(x);
    const py = Math.floor(y);
    const key = py * 64 + px;
    if (seen.has(key)) continue;
    seen.add(key);
    const t = seen.size / len;
    if (t > 1) break;
    // Silky hair: lit where it turns over (catches the sun), paler-cool toward the tip, the last px dithered away.
    if (t > 0.85 && (px + py) % 2 === 0) continue;
    p.set(px, py, 'plaster', t > 0.25 && t < 0.5 ? 3 : 2);
  }
}

const kovyla: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'kovyla',
  size: { w: W, h: H },
  frames: { idle: SWAY_SHIFTS.length },
  variants: ['a', 'b'],
  layers: ['shadow'],
  anchor: { x: CX / W, y: (KOVYLA_GROUND + 1) / H },
  generate(_rng, { frame, variant, buffer, layers, rampSize }) {
    const shift = SWAY_SHIFTS[frame] ?? 0;
    const v = variant === 'b' ? 'b' : 'a';
    const p = new Plot();
    for (const a of AWNS[v]) awn(p, a);
    tussock(p, v === 'b');
    const out = swayed(p, shift, footProfile(KOVYLA_GROUND, KOVYLA_GROUND - 6));
    compose(buffer, [out.part(1, 1)], rampSize, { light: false, occlusion: false });
    const shadow = layers.shadow;
    if (shadow) {
      const half = v === 'b' ? 4 : 3;
      for (let x = CX - half + 2; x <= CX + half + 1; x++) shadow.set(x, KOVYLA_GROUND + 1, { ramp: 'ink', shade: 1 });
    }
  },
};

export default kovyla;
