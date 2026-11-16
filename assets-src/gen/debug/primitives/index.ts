// Generator framework demo (plan ART-02): shape primitives through the full pass chain with both companion layers —
// a log tower under a tent roof, a pear dome with ґонт scales on a whitewashed drum, a hung pot, an emissive slit
// window. Debug atlas only; reviewed via `pnpm sprites:sheet primitives`. The khata is the real `khortytsia/khata`.
import { stake } from '../../lib/materials.ts';
import { compose, contactShadow, wedgeShadow, type Material } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { glechyk, whitewashWall } from '../../lib/recipes.ts';
import { rand2 } from '../../lib/noise.ts';
import { dome, log, rect, roof } from '../../lib/shapes.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const GROUND = 58;

const shingles: Material = {
  id: 32,
  base: (f) => ({
    ramp: 'wood',
    shade: 2.8 + ((f.x + (f.y % 2)) % 2 === 0 ? 0.3 : -0.3) - (f.y % 3 === 0 ? 0.8 : 0),
    depth: 2,
  }),
};
/** Ґонт on a dome: rows of 2-px offset scales (lit top, shaded lower edge), silver-grey weathering. */
const gont: Material = {
  id: 33,
  base: (f) => {
    const band = Math.floor(f.y / 2);
    const edgeX = (f.x + (band % 2)) % 2 === 0;
    const low = f.y % 2 === 1;
    const weathered = rand2(Math.floor((f.x + (band % 2)) / 2), band, 33) < 0.3;
    if (weathered) return { ramp: 'stone', shade: low ? 3 : 4.2, depth: 3 };
    return { ramp: 'wood', shade: low ? (edgeX ? 1.6 : 2.4) : 3.6, depth: 3 };
  },
};
const cross: Material = { id: 34, base: () => ({ ramp: 'gold', shade: 3.5, depth: 4 }) };
const slit: Material = {
  id: 35,
  base: () => ({ ramp: 'ink', shade: 1, depth: 0 }),
  emissive: () => ({ ramp: 'gold', shade: 4 }),
};

const primitives: SpriteGenerator = {
  atlas: 'debug',
  id: 'primitives',
  size: { w: 64, h: 64 },
  frames: { idle: 1 },
  layers: ['emissive', 'shadow'],
  generate(_rng, { buffer, layers, rampSize }) {
    const drum = new Plot();
    whitewashWall(drum, { seed: 'prim:drum', x: 40, y: 38, w: 12, h: 20, clay: false });
    const pot = new Plot();
    glechyk(pot, 32, 49);
    const logs = Array.from({ length: 6 }, (_, i) => ({
      shape: log(6, 34 + i * 4, 14, 4),
      material: stake({ seed: `prim:log-${String(i)}` }),
      partId: 20,
      depth: 1,
    }));
    compose(
      buffer,
      [
        ...logs,
        { shape: rect(12, 41, 2, 4), material: slit, partId: 22, depth: 2 },
        { shape: roof({ style: 'tent', x: 4, w: 18, top: 16, bottom: 34 }), material: shingles, partId: 21 },
        drum.part(30, 30),
        { shape: dome(46, 38, 14, 24, 'pear'), material: gont, partId: 31 },
        { shape: rect(45, 8, 2, 7), material: cross, partId: 32 },
        { shape: rect(43, 10, 6, 1), material: cross, partId: 32 },
        pot.part(40, 40),
      ],
      rampSize,
      {
        outline: { mode: 'outer', parts: [20, 21, 31] },
        selective: { lit: 'lighter' },
        dither: { spread: 0.6 },
        ...(layers.emissive ? { emissive: layers.emissive } : {}),
      },
    );
    const shadow = layers.shadow;
    if (shadow) {
      contactShadow(shadow, { x0: 6, x1: 20, groundY: GROUND - 1 });
      wedgeShadow(shadow, { x: 20, groundY: GROUND - 1 });
      contactShadow(shadow, { x0: 40, x1: 52, groundY: GROUND - 1 });
      wedgeShadow(shadow, { x: 52, groundY: GROUND - 1 });
    }
  },
};

export default primitives;
