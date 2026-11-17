// Дзвіниця — the belfry beside the Pokrova church (plan ART-12, ART-BIBLE §6): a log base, a ґонт skirt roof, an open
// belfry of four posts with a bronze bell (gold 1–4, a lit left rim) on a beam, a small pear dome and a gold cross.
// 32×80, pivot at the base.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { goldCross, pearDome, skirtRoof } from '../../lib/recipes-church.ts';
import { logWall } from '../../lib/recipes-sich.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 32;
const H = 80;
export const BELFRY_GROUND = 78;
const BASE = { x: 7, w: 18, top: 52 };
const OPEN = { top: 34, bottom: 48 };
const CX = 16;

const belfry: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'belfry',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['shadow'],
  anchor: { x: 0.5, y: (BELFRY_GROUND + 1) / H },
  generate(_rng, { buffer, layers, rampSize }) {
    const body = new Plot();
    logWall(body, { seed: 'belfry', x: BASE.x, y: BASE.top, w: BASE.w, h: BELFRY_GROUND + 1 - BASE.top, ends: true });
    const tops = new Plot();
    skirtRoof(tops, CX, BASE.top - 4, 4, BASE.w + 8);
    // Open belfry: the floor beam, four posts (the back two darker), the top beam.
    for (let x = BASE.x; x < BASE.x + BASE.w; x++) {
      tops.set(x, OPEN.bottom, 'wood', 2);
      tops.set(x, OPEN.top, 'wood', x < CX ? 4 : 2);
    }
    for (const [px, shade] of [
      [BASE.x, 4],
      [BASE.x + 5, 2],
      [BASE.x + BASE.w - 6, 2],
      [BASE.x + BASE.w - 1, 1],
    ] as const) {
      for (let y = OPEN.top + 1; y < OPEN.bottom; y++) tops.set(px, y, 'wood', shade);
    }
    // The bell: a bronze bell shape hanging from the top beam.
    const bell: readonly (readonly [number, number])[] = [
      [0, 1],
      [-1, 2],
      [0, 2],
      [1, 2],
      [-1, 3],
      [0, 3],
      [1, 3],
      [-2, 4],
      [-1, 4],
      [0, 4],
      [1, 4],
      [2, 4],
      [-2, 5],
      [-1, 5],
      [0, 5],
      [1, 5],
      [2, 5],
    ];
    for (const [dx, dy] of bell) {
      const shade = dx < 0 ? 4 : dx === 0 ? 3 : dy === 5 ? 1 : 2;
      tops.set(CX + dx, OPEN.top + 1 + dy, 'gold', dy === 5 ? Math.max(0, shade - 2) : shade);
    }
    skirtRoof(tops, CX, OPEN.top - 5, 5, BASE.w + 6);
    const tip = pearDome(tops, CX, OPEN.top - 5, 14, 12, 21);
    goldCross(tops, CX, tip - 9, 8);
    compose(buffer, [body.part(1, 1), tops.part(2, 2)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', parts: [2] },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: CX, x1: BASE.x + BASE.w + 1, groundY: BELFRY_GROUND });
  },
};

export default belfry;
