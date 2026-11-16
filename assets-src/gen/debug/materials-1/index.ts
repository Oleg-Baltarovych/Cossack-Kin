// Material set 1 swatches (plan ART-03, ART-BIBLE §5, recipes docs/art/recipes/materials-1.md): one 32×32 vignette
// per material. Debug atlas only (dev/test); reviewed via `pnpm sprites:sheet materials-1`.
import { batten, boardLayout, earth, MATERIAL, nail, planks } from '../../lib/materials.ts';
import { compose, type ComposeOptions, type Part } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import {
  eaveAO,
  glechyk,
  grassField,
  pathField,
  pebbles,
  POT_HEIGHT,
  pryzbaBand,
  thatchRoof,
  wattle,
  whitewashWall,
} from '../../lib/recipes.ts';
import { rect, type Fragment, type Shape } from '../../lib/shapes.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const S = 32;
export const MATERIAL_SWATCHES = ['whitewash', 'thatch', 'earth', 'path', 'grass', 'planks', 'wattle'] as const;
type Swatch = (typeof MATERIAL_SWATCHES)[number];

const RECIPE: ComposeOptions = { light: false, occlusion: false };
const custom = (fragments: Fragment[]): Shape => ({ fragments, x: 0, y: 0, w: S, h: S });
const dots = (points: readonly (readonly [number, number])[], uOf: (i: number) => number = () => 0): Shape =>
  custom(points.map(([x, y], i) => ({ x, y, normal: [0, 0, 127], u: uOf(i), v: 0 })));

function swatch(name: Swatch): { parts: Part[]; options: ComposeOptions } {
  const plot = new Plot();
  const seed = `m1:${name}`;
  switch (name) {
    case 'whitewash':
      whitewashWall(plot, { seed, x: 0, y: 0, w: S, h: 28, aoRows: 2 });
      eaveAO(plot, 0, S, 0);
      pryzbaBand(plot, { seed, x: 0, y: 28, w: S });
      return { parts: [plot.part(MATERIAL.plaster, 1)], options: RECIPE };
    case 'thatch':
      whitewashWall(plot, { seed, x: 0, y: 24, w: S, h: 8, aoRows: 3, clay: false });
      eaveAO(plot, 0, S, 24);
      thatchRoof(plot, { seed, x: 0, w: S, top: 1, lip: 21 });
      return { parts: [plot.part(MATERIAL.thatch, 1)], options: RECIPE };
    case 'earth': {
      const stones = new Plot();
      pebbles(stones, { x: 1, y: 1, w: S - 2, h: S - 2 }, seed, 4);
      return {
        parts: [{ shape: rect(0, 0, S, S), material: earth({ seed }), partId: 1 }, stones.part(MATERIAL.pebble, 2)],
        options: { dither: { spread: 0.6 } },
      };
    }
    case 'path':
      pathField(plot, { seed, x: 0, y: 0, w: S, h: S, ruts: [10, 21], grass: { top: 3, bottom: 3 } });
      pebbles(plot, { x: 1, y: 6, w: S - 2, h: S - 12 }, seed, 3, (x, y) => plot.get(x, y)?.ramp === 'earth');
      return { parts: [plot.part(MATERIAL.path, 1)], options: RECIPE };
    case 'grass':
      grassField(plot, { x: 0, y: 0, w: S, h: S }, seed);
      return { parts: [plot.part(MATERIAL.grass, 1)], options: RECIPE };
    case 'planks': {
      const nails: [number, number][] = [];
      for (const b of boardLayout('m1:planks', S)) {
        const cx = b.start + Math.floor((b.width - 1) / 2);
        if (cx >= S - 1) continue;
        nails.push([cx, 7], [cx, 8], [cx, 24], [cx, 25]);
      }
      return {
        parts: [
          { shape: rect(0, 0, S, S), material: planks({ seed: 'm1:planks' }), partId: 1 },
          { shape: rect(0, 6, S, 4), material: batten({ seed: 'm1:batten-a' }), partId: 2 },
          { shape: rect(0, 23, S, 4), material: batten({ seed: 'm1:batten-b' }), partId: 2 },
          { shape: dots(nails, (i) => i % 2), material: nail(), partId: 3 },
        ],
        options: { dither: { spread: 0.6 } },
      };
    }
    case 'wattle': {
      const stakes = wattle(plot, { seed, x: 0, w: S, ground: S, topRod: 13, rods: 5, rise: { 1: 4 } });
      const st = stakes[1];
      if (st) glechyk(plot, st.x, st.top - (POT_HEIGHT - 1));
      return { parts: [plot.part(MATERIAL.rod, 1)], options: RECIPE };
    }
  }
}

const materials1: SpriteGenerator = {
  atlas: 'debug',
  id: 'materials-1',
  size: { w: S, h: S },
  frames: { idle: 1 },
  variants: MATERIAL_SWATCHES,
  anchor: { x: 0, y: 0 },
  generate(_rng, { variant, buffer, rampSize }) {
    const spec = swatch((variant ?? 'whitewash') as Swatch);
    compose(buffer, spec.parts, rampSize, spec.options);
  },
};

export default materials1;
