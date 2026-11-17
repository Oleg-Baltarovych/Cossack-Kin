// Вогнище — the campfire on the Sich maidan (plan ART-16, ART-BIBLE §8 night: "світло вогню тепле й локальне"). The
// base sprite is the fire pit by day and night: a ring of field stones, crossed logs charred at the ends, a few
// embers. The flame lives on the emissive companion layer, 6 frames: tongues of fire whose heights and lean change
// per frame (seeded per column and frame — deterministic), a gold 5 core, gold 4/3 body, crimson 4/3 tips. Emissive
// frames are composited after the night grade (render/postGrade.ts), so the fire keeps its colour at night and is
// off by day. 24×32, pivot at the base; contact shadow.
import { contactShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 24;
const H = 32;
export const CAMPFIRE_GROUND = 30;
export const CAMPFIRE_FRAMES = 6;
const CX = 12;
/** Flame lean per frame (tip 1 px left / right) and the row from which the whole flame leans. */
const LEANS = [1, -1, 0, 1, -1, 0] as const;
const LEAN_FROM = 7;
/** Embers between the logs. */
const EMBERS = [
  [-2, -2, 'crimson', 3],
  [1, -1, 'gold', 3],
  [3, -2, 'crimson', 2],
  [-4, -1, 'crimson', 2],
] as const;

/** Integer hash → 0..1. */
function hash(a: number, b: number): number {
  let h = Math.imul(a + 1, 374761393) + Math.imul(b + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Flame column heights (px above the logs) for a frame: tallest in the middle, each tongue flickering on its own. */
function tongues(frame: number): number[] {
  return Array.from({ length: 9 }, (_, i) => {
    const dx = i - 4;
    const base = 14 - dx * dx * 0.7;
    // The middle tongues vary little (no 'pumping' loop), the side tongues flicker more.
    const f = Math.abs(dx) <= 1 ? 0.85 + 0.15 * hash(i, frame) : 0.55 + 0.4 * hash(i, frame);
    return Math.max(2, Math.round(base * f));
  });
}

const campfire: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'campfire',
  size: { w: W, h: H },
  frames: { idle: CAMPFIRE_FRAMES },
  layers: ['emissive', 'shadow'],
  anchor: { x: 0.5, y: (CAMPFIRE_GROUND + 1) / H },
  generate(_rng, { frame, buffer, layers, rampSize }) {
    const p = new Plot();
    // Stone ring: an ellipse of rounded field stones, lit tops (stone 4), shaded fronts (stone 2).
    const stoneTops: (readonly [number, number])[] = [];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const x = Math.round(CX + Math.cos(a) * 9);
      const y = Math.round(CAMPFIRE_GROUND - 2 + Math.sin(a) * 2.5);
      p.set(x, y, 'stone', 4);
      stoneTops.push([x, y]);
      p.set(x + 1, y, 'stone', 3);
      p.set(x, y + 1, 'stone', 2);
      p.set(x + 1, y + 1, 'stone', 1);
    }
    // Crossed logs (wood 3 lit top, wood 1 under), charred ends (ink 2), embers between (crimson 3 / gold 3).
    for (let k = -7; k <= 7; k++) {
      const y1 = CAMPFIRE_GROUND - 3 - Math.round(k * 0.35);
      const y2 = CAMPFIRE_GROUND - 3 + Math.round(k * 0.35);
      const end = Math.abs(k) >= 6;
      p.set(CX + k, y1, end ? 'ink' : 'wood', end ? 2 : 3);
      p.set(CX + k, y1 + 1, end ? 'ink' : 'wood', end ? 1 : 1);
      p.set(CX + k, y2 - 1, end ? 'ink' : 'wood', end ? 2 : 4);
      p.set(CX + k, y2, end ? 'ink' : 'wood', end ? 1 : 2);
    }
    for (const [dx, dy, ramp, shade] of EMBERS) p.set(CX + dx, CAMPFIRE_GROUND + dy, ramp, shade);
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'lighter' },
    });
    const glow = layers.emissive;
    if (glow) {
      // Flame tongues on the emissive layer, rising from the logs. Above row LEAN_FROM the whole flame — core
      // included — leans 1 px by frame, on one row for every column, so the lean never tears a hole.
      const heights = tongues(frame);
      const lean = LEANS[frame % LEANS.length] ?? 0;
      const flame = new Plot();
      heights.forEach((h, i) => {
        for (let k = 0; k < h; k++) {
          const t = k / h;
          const x = CX - 4 + i + (k >= LEAN_FROM ? lean : 0);
          const y = CAMPFIRE_GROUND - 4 - k;
          const core = Math.abs(i - 4) <= 1 && t < 0.45;
          if (core) flame.set(x, y, 'gold', 5);
          else if (t < 0.6) flame.set(x, y, 'gold', t < 0.3 ? 4 : 3);
          else flame.set(x, y, 'crimson', t < 0.85 ? 4 : 3);
        }
      });
      // Close 1-px gaps between tongues (they read as flicker noise at ×3, art-director ART-16).
      for (const key of [...flame.px.keys()]) {
        const x = key % 4096;
        const y = Math.floor(key / 4096);
        if (!flame.has(x + 1, y) && flame.has(x + 2, y)) flame.set(x + 1, y, 'crimson', 3);
      }
      // The fire lights its own base: warm rims on the stones' tops, the embers and the log tops near the flame at
      // full value (the emissive layer is not graded, so the pit does not vanish at night).
      for (const [x, y] of stoneTops) flame.set(x, y, 'gold', 1);
      for (let k = -3; k <= 3; k++) flame.set(CX + k, CAMPFIRE_GROUND - 3 + Math.round(k * 0.35) - 1, 'gold', 2);
      for (const [dx, dy, ramp, shade] of EMBERS) flame.set(CX + dx, CAMPFIRE_GROUND + dy, ramp, shade);
      for (const [key, px] of flame.px) {
        const x = key % 4096;
        const y = Math.floor(key / 4096);
        if (glow.inBounds(x, y)) glow.set(x, y, { ramp: px.ramp, shade: px.shade });
      }
    }
    if (layers.shadow) contactShadow(layers.shadow, { x0: 3, x1: 22, groundY: CAMPFIRE_GROUND, height: 3 });
  },
};

export default campfire;
