// Debug swatch (plan M0-08): every master-palette ramp as a column of 3×3 cells (dark at the bottom), and a
// sky-ramp strip whose shade rises continuously left → right to show the Bayer 4×4 quantization.
// Shown in the M0 scene; proves the atlas pipeline end to end (generator → atlas → Pixi Spritesheet).
import type { RampName, SpriteGenerator } from '../../../../tools/lib/sprites/types.ts';

const CELL = 3;
const RAMPS: readonly RampName[] = [
  'ink',
  'wood',
  'thatch',
  'plaster',
  'earth',
  'grass',
  'foliage',
  'water',
  'sky',
  'crimson',
  'gold',
  'stone',
  'skin',
  'cloth',
];
const MAX_RAMP = 8;
const GRID_H = MAX_RAMP * CELL;
const STRIP_GAP = 1;
const STRIP_H = 4;
const SKY_TOP = 7;
const WIDTH = RAMPS.length * CELL;

const swatch: SpriteGenerator = {
  atlas: 'debug',
  id: 'swatch',
  size: { w: WIDTH, h: GRID_H + STRIP_GAP + STRIP_H },
  frames: { idle: 1 },
  generate(_rng, { buffer, rampSize }) {
    RAMPS.forEach((ramp, column) => {
      const count = rampSize(ramp);
      for (let shade = 0; shade < count; shade++) {
        const top = GRID_H - (shade + 1) * CELL;
        for (let y = 0; y < CELL; y++) {
          for (let x = 0; x < CELL; x++) buffer.set(column * CELL + x, top + y, ramp, shade);
        }
      }
    });
    for (let x = 0; x < WIDTH; x++) {
      const shade = (x / (WIDTH - 1)) * SKY_TOP;
      for (let y = 0; y < STRIP_H; y++) buffer.set(x, GRID_H + STRIP_GAP + y, 'sky', shade);
    }
  },
};

export default swatch;
