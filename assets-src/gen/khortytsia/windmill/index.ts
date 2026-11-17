// Козловий вітряк — a post mill (plan ART-13, ART-BIBLE §6 "вітряк (козлового типу)"): a plank cabin under a gable
// plank roof standing on a trestle (козли: a central post on a cross-base, two diagonal struts), a ladder up to the
// back door and the long tail pole (водило) the miller turns the mill into the wind with. The sails are a separate
// animated sprite (`windmill-sails`, 8 frames) hung on the hub. 56×96, pivot at the base; cast shadow.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 56;
const H = 96;
export const WINDMILL_GROUND = 94;
/** Closer to a cube than a tower (a narrow tall cabin read as a water tower). */
const CABIN = { x: 12, w: 36, top: 36, bottom: 66 };
/** Hub (sail axle) position in the sprite: on the cabin's front, under the gable. */
export const WINDMILL_HUB = { x: 30, y: 42 };
const POST_X = 29;

const windmill: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'windmill',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 30 / W, y: (WINDMILL_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const p = new Plot();
    // Ladder and tail pole (водило) at the back: drawn first, so the trestle post overlaps them; the ladder one ramp
    // darker (wood 1 rails, wood 2 rungs), the водило 2 px wide (wood 2 with a wood 4 top px).
    for (let k = 0; k < 22; k++) {
      const x = CABIN.x + 12 - Math.floor(k * 0.35);
      const y = CABIN.bottom + k;
      p.set(x, y, 'wood', 1);
      p.set(x + 4, y, 'wood', 1);
      if (k % 3 === 0) for (let r = 1; r < 4; r++) p.set(x + r, y, 'wood', 2);
    }
    for (let k = 0; k < 34; k++) {
      const x = CABIN.x + 4 - Math.floor(k * 0.5);
      const y = CABIN.bottom + k;
      if (y >= WINDMILL_GROUND) break;
      p.set(x, y, 'wood', 4);
      p.set(x, y + 1, 'wood', 2);
      p.set(x + 1, y + 1, 'wood', 2);
    }
    // Trestle: the cross-base beam on the ground, the central post, two diagonal struts.
    for (let x = 14; x < 46; x++) {
      p.set(x, WINDMILL_GROUND - 1, 'wood', 3);
      p.set(x, WINDMILL_GROUND, 'wood', 1);
    }
    for (let y = CABIN.bottom; y < WINDMILL_GROUND - 1; y++) {
      p.set(POST_X, y, 'wood', 4);
      p.set(POST_X + 1, y, 'wood', 3);
      p.set(POST_X + 2, y, 'wood', 1);
    }
    for (let k = 0; k < 20; k++) {
      const y = WINDMILL_GROUND - 2 - k;
      p.set(16 + Math.floor(k * 0.65), y, 'wood', 4);
      p.set(17 + Math.floor(k * 0.65), y, 'wood', 2);
      p.set(43 - Math.floor(k * 0.65), y, 'wood', 2);
      p.set(44 - Math.floor(k * 0.65), y, 'wood', 1);
    }
    // Cabin: vertical boards with 1-px seams, lit left third, shaded right; a dark plank skirt at the bottom.
    for (let y = CABIN.top; y < CABIN.bottom; y++) {
      for (let x = CABIN.x; x < CABIN.x + CABIN.w; x++) {
        const u = (x - CABIN.x) / (CABIN.w - 1);
        const seam = (x - CABIN.x) % 4 === 3;
        let shade = u < 0.3 ? 4 : u > 0.75 ? 2 : 3;
        if (seam) shade -= 1;
        if (y >= CABIN.bottom - 3) shade = Math.max(1, shade - 1);
        if (x === CABIN.x) shade = 6; // sun-side rim, like the khatas
        p.set(x, y, 'wood', shade);
      }
    }
    // A small window under the hub and a plank door at the back (left side).
    for (let y = CABIN.top + 12; y < CABIN.top + 16; y++) for (let x = 38; x < 41; x++) p.set(x, y, 'ink', 2);
    for (let y = CABIN.bottom - 12; y < CABIN.bottom - 1; y++) for (let x = 15; x < 19; x++) p.set(x, y, 'wood', 1);
    // Gable plank roof: from the eaves (1 px overhang) up to a ridge; lit left slope, dark right, a ridge board.
    const roofTop = CABIN.top - 16;
    for (let y = roofTop; y < CABIN.top; y++) {
      const r = y - roofTop;
      const half = Math.round(2 + (r * (CABIN.w / 2 + 1)) / 16);
      for (let x = 30 - half; x < 30 + half; x++) {
        const left = x < 30;
        const board = (y + (left ? x : -x)) % 3 === 0;
        // A 1-px wood 6 rim along the sun-side (left) gable edge.
        const rim = left && x === 30 - half;
        p.set(x, y, 'wood', rim ? 6 : left ? (board ? 5 : 4) : board ? 1 : 2);
      }
    }
    for (let x = 28; x < 32; x++) p.set(x, roofTop - 1, 'wood', 3);
    // Hub boss (the axle end), under the sails.
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      p.set(WINDMILL_HUB.x + dx - 1, WINDMILL_HUB.y + dy - 1, 'wood', 1);
    }
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: 30, x1: 47, groundY: WINDMILL_GROUND });
  },
};

export default windmill;
