// Передній план — near-camera plant clumps for the foreground layer (plan ART-14, ART-BIBLE §5 "Трава"): tall grass,
// reeds (очерет), sunflowers and tall mallows (summer). Larger than the ground layer's props: they stand between the
// viewer and the farm. Five sway frames each (SWAY_SHIFTS), whole-px row offsets eased from a still foot. No outline
// (thin blades would turn into ink bars) and no shadow (the foot hides under the bottom sheet).
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { footProfile, mallowTall, reeds, sunflower, SWAY_SHIFTS, swayed, tallGrass } from '../../lib/recipes-plants.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 72;
const H = 128;
/** Ground row for every variant; the pivot is the bottom edge of this row. */
export const PLANT_GROUND = 126;

/** Draws the variant upright; returns its height above the ground (for the sway profile). */
function draw(variant: string | null, p: Plot): number {
  const g = PLANT_GROUND;
  switch (variant) {
    case 'reeds':
      reeds(p, 6, 58, g, 100, 'fg');
      return 100;
    case 'sunflowers':
      sunflower(p, 14, g, 82, 7);
      sunflower(p, 36, g, 98, 8);
      sunflower(p, 56, g, 72, 7);
      tallGrass(p, 34, g, 22, 'fg-sun', 9);
      return 114;
    case 'mallows':
      mallowTall(p, 18, g, 78);
      mallowTall(p, 35, g, 100);
      mallowTall(p, 52, g, 68);
      tallGrass(p, 34, g, 20, 'fg-mal', 9);
      return 100;
    default:
      tallGrass(p, 22, g, 38, 'fg-a', 9);
      tallGrass(p, 46, g, 46, 'fg-b', 10);
      tallGrass(p, 34, g, 30, 'fg-c', 8);
      return 46;
  }
}

const plant: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'plant',
  size: { w: W, h: H },
  variants: ['grass', 'reeds', 'sunflowers', 'mallows'],
  frames: { idle: SWAY_SHIFTS.length },
  anchor: { x: 0.5, y: (PLANT_GROUND + 1) / H },
  generate(_rng, { variant, frame, buffer, rampSize }) {
    const upright = new Plot();
    const height = draw(variant, upright);
    const p = swayed(upright, SWAY_SHIFTS[frame] ?? 0, footProfile(PLANT_GROUND, height));
    compose(buffer, [p.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default plant;
