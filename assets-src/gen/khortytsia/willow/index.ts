// Верба — a willow by the khata (plan ART-14, ART-BIBLE §5 "Дуб / верба"): a short thick trunk splitting into two
// limbs, a rounded crown, and long hanging strands (звисаючі пасма) of leaves falling from its underside. Five sway
// frames (SWAY_SHIFTS): the trunk stands still, the crown moves by up to the shift, and each strand trails further the
// lower it hangs — the willow's signature motion. Whole-px offsets only. 80×88, pivot at the base; cast shadow.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { crown, lean, SWAY_SHIFTS, swayed, trunk } from '../../lib/recipes-plants.ts';
import { seededRng } from '../../lib/rng.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 80;
const H = 88;
export const WILLOW_GROUND = 86;
const CROWN_BOTTOM = 48;
const PUFFS = [
  [40, 28, 15],
  [25, 34, 11],
  [55, 33, 12],
  [32, 18, 10],
  [50, 17, 10],
  [40, 38, 10],
] as const;

const willow: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'willow',
  size: { w: W, h: H },
  frames: { idle: SWAY_SHIFTS.length },
  layers: ['shadow'],
  anchor: { x: 40 / W, y: (WILLOW_GROUND + 1) / H },
  generate(_rng, { frame, buffer, layers, rampSize }) {
    const shift = SWAY_SHIFTS[frame] ?? 0;
    const wood = new Plot();
    trunk(wood, 36, CROWN_BOTTOM + 6, WILLOW_GROUND, 9, seededRng('willow:trunk'));
    for (const dx of [-1, 9]) wood.set(36 + dx, WILLOW_GROUND, 'wood', dx < 0 ? 2 : 0);
    // A pollard's fork: two thick limbs out of the trunk top.
    for (let k = 0; k < 10; k++) {
      for (let c = 0; c < 3; c++) {
        wood.set(37 - Math.floor(k * 0.8) + c, CROWN_BOTTOM + 6 - k, 'wood', c === 0 ? 3 : 1);
        wood.set(42 + Math.floor(k * 0.8) + c, CROWN_BOTTOM + 6 - k, 'wood', c === 0 ? 2 : 0);
      }
    }
    const leaves = new Plot();
    crown(leaves, PUFFS, seededRng('willow:crown'), 'willow');
    // Hanging strands: from the crown's underside every 2–3 px, 8–30 px long, dashed leaves (grass 4 lit / foliage 2,
    // foliage 1 on the shaded right), longest in the middle of each side, so the outline reads as a curtain.
    const strands = new Plot();
    const top = new Map<number, number>();
    const rng = seededRng('willow:strands');
    for (let x = 12; x <= 68; x += 2 + Math.floor(rng() * 2)) {
      let y0 = 0;
      for (let y = 0; y < H; y++) if (leaves.has(x, y)) y0 = y;
      if (y0 === 0) continue;
      const side = Math.abs(x - 40) / 28;
      const len = Math.round((8 + 22 * Math.sin(Math.min(1, side) * Math.PI * 0.9)) * (0.75 + rng() * 0.25));
      top.set(x, y0);
      for (let k = 1; k <= len; k++) {
        const leaf = (k + x) % 3 !== 0;
        const shaded = x > 44;
        strands.set(x, y0 + k, leaf ? (shaded ? 'foliage' : 'grass') : 'foliage', leaf ? (shaded ? 2 : 4) : 1);
      }
    }
    const crownProfile = (s: number, _x: number, y: number): number =>
      y >= CROWN_BOTTOM + 6 ? 0 : lean(s, y < 24 ? 1 : 0.5);
    const strandProfile = (s: number, x: number, y: number): number =>
      lean(s, 0.5 + Math.min(1.5, (y - (top.get(x) ?? y)) / 16));
    const p = swayed(wood, shift, crownProfile);
    swayed(leaves, shift, crownProfile, p);
    swayed(strands, shift, strandProfile, p);
    compose(buffer, [p.part(1, 1)], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', drop: 2 },
      selective: { lit: 'vanish' },
    });
    if (layers.shadow) castShadow(layers.shadow, { x0: 40, x1: 70, groundY: WILLOW_GROUND, reach: 14, depth: 6 });
  },
};

export default willow;
