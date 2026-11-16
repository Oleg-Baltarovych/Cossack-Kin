// Берег — the near bank's edge under the river (plan ART-09, art-director review): a 1-px wet line `earth` 1
// (#47321f) right under the last water row, then 1 px of sand `earth` 4 (#9f7a48) on the land side, broken every
// 6–12 px by grass dipping into it (1–2 px `grass` 3/4 tufts), so the bank never reads as a ruled line. A 64-px tile,
// laid by Ground.ts across the width at the water's lower edge; graded with the ground. Reeds come with ART-14.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { seededRng } from '../../lib/rng.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

export const SHORE_TILE = { w: 64, h: 3 } as const;

const shore: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'shore',
  size: SHORE_TILE,
  frames: { idle: 1 },
  anchor: { x: 0, y: 0 },
  generate(_rng, { buffer, rampSize }) {
    const rng = seededRng('shore:edge');
    const plot = new Plot();
    // earth: 1 #47321f, 4 #9f7a48 · grass: 3 #3f7535, 4 #5c923a
    for (let x = 0; x < SHORE_TILE.w; x++) {
      plot.set(x, 0, 'earth', 1);
      plot.set(x, 1, 'earth', 4);
    }
    for (let x = 2 + Math.floor(rng() * 5); x < SHORE_TILE.w - 1; x += 6 + Math.floor(rng() * 7)) {
      const wide = rng() < 0.5;
      for (const dx of wide ? [0, 1] : [0]) {
        plot.set(x + dx, 1, 'grass', dx === 0 ? 4 : 3);
        // A blade tip reaching the wet line now and then.
        if (rng() < 0.3) plot.set(x + dx, 0, 'grass', 3);
      }
    }
    // A few pebbles of light sand on the wet line.
    for (let k = 0; k < 3; k++) plot.set(Math.floor(rng() * SHORE_TILE.w), 0, 'earth', 3);
    // Row 2: grass lip tufts below the sand.
    for (let x = Math.floor(rng() * 4); x < SHORE_TILE.w; x += 3 + Math.floor(rng() * 4)) plot.set(x, 2, 'grass', 2);
    compose(buffer, [plot.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default shore;
