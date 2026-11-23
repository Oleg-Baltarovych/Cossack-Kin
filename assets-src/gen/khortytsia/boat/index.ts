// Човен on the Dnipro (plan M2-11, SPEC §3.0 «ріка / пристань — човни», §6.3 boat ripples): seen from the near bank
// a little from above — the hull's side (planks, a lit gunwale, a darker tarred strake at the waterline) and the open
// hull behind it (the far gunwale's line over a dark inside, thwarts across). Variants: `a` a plank boat afloat at the
// bank, tied by a 1-px rope to the end pile of a кладка — a plank walk on piles from the shore out into the water past
// its bow (M2-29 B3: it was a lone stake in the grass) — an oar laid across; `b` a tarred
// dugout (дуб) of a fisherman out on the river, a net heaped in the stern. Lit top-left; drawn over the water (render
// boats.ts), the ripple frames (`ripple`) lap at its waterline. Pivot = the waterline row's centre.
import { compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

interface BoatLook {
  readonly w: number;
  /** Hull side height above the waterline (px). */
  readonly side: number;
  /** Plank shades top → bottom of the side (the last one at the waterline). */
  readonly planks: readonly number[];
  readonly ramp: 'wood' | 'earth';
}

export const BOAT_LOOKS: Readonly<Record<string, BoatLook>> = {
  a: { w: 24, side: 4, planks: [4, 3, 2, 1], ramp: 'wood' },
  b: { w: 20, side: 3, planks: [3, 2, 1], ramp: 'earth' },
};
/** The hull's centre column; the frame runs on past the bow for boat `a`'s plank walk. */
const CX = 13;
const W = 36;
/** Rows under the waterline in the frame: the plank walk's foot rests on the shore below the last water row. */
const BELOW = 4;
const H = 8 + BELOW;
/** The waterline row (the hull's last visible row); the pivot is its bottom edge. */
const WATERLINE = H - 1 - BELOW;
/**
 * Boat `a`'s кладка: the deck's columns from the pivot (right of the bow) and its rows from the waterline — `far` rows
 * up (out over the water, where the boat is tied), `foot` rows down (resting on the shore, the river's first dry row
 * and the one under it).
 */
export const BOAT_PIER = { dx0: 13, dx1: 18, far: 5, foot: 3 } as const;

const boat: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'boat',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: Object.keys(BOAT_LOOKS),
  anchor: { x: CX / W, y: (WATERLINE + 1) / H },
  generate(_rng, { variant, buffer, rampSize }) {
    const look = BOAT_LOOKS[variant ?? 'a'] ?? BOAT_LOOKS.a;
    if (!look) return;
    const p = new Plot();
    const half = look.w / 2;
    const top = WATERLINE - look.side;
    // The open hull: the far gunwale's lit line over the dark inside, between the rising bow and stern.
    for (let x = CX - half + 2; x < CX + half - 2; x++) {
      p.set(x, top - 2, look.ramp, look.ramp === 'wood' ? 3 : 2);
      p.set(x, top - 1, look.ramp, look.ramp === 'wood' ? 1 : 0);
    }
    // The side: rows of planks, the ends rising (bow right, stern left) and cut in toward the waterline.
    for (let r = 0; r <= look.side; r++) {
      const y = top + r;
      const inset = r === look.side ? 2 : r === look.side - 1 ? 1 : 0;
      for (let x = CX - half + inset; x < CX + half - inset; x++) {
        // The near gunwale lit, but a step under the hottest wood (it read hot in rain and at golden hour).
        const shade = r === 0 ? 3 : (look.planks[r - 1] ?? 1);
        p.set(x, y, look.ramp, x < CX - half + 2 && r === 0 ? 4 : shade);
      }
    }
    // Bow and stern posts one row higher.
    p.set(CX - half, top - 1, look.ramp, 3);
    p.set(CX + half - 1, top - 1, look.ramp, 3);
    // Thwarts across the inside (lit tops).
    for (const x of [CX - 4, CX + 3]) p.set(x, top - 1, 'wood', 3);
    if (variant === 'a') {
      // An oar laid across, its blade over the side toward the viewer.
      for (let x = CX - 5; x <= CX + 4; x++) p.set(x, top - 2, 'wood', 4);
      p.set(CX + 5, top - 1, 'wood', 4);
      p.set(CX + 6, top - 1, 'wood', 3);
      // The кладка: a plank walk on piles from the shore out past the bow. Seen from the bank it recedes upward:
      // planks laid across two rows of piles, a 1-px shaded gap (wood 0) between every two (art-director B3: edge to edge it
      // read as a crate on the bank); the piles dark 1-px posts at the plank ends, the far pair 2 px over the deck
      // (the near one's top lit: the tie point); at the foot the near end's dark face on the bank.
      const x0 = CX + BOAT_PIER.dx0;
      const x1 = CX + BOAT_PIER.dx1;
      const far = WATERLINE - BOAT_PIER.far;
      const foot = WATERLINE + BOAT_PIER.foot;
      for (let y = far; y < foot; y++) {
        p.set(x0, y, 'wood', 1);
        p.set(x1, y, 'wood', 1);
        if ((foot - 1 - y) % 3 === 2) {
          // The gap between planks in their shadow, the piles' dark wood: opaque, so the bright shore reflection does
          // not show through as white rungs (r1), and warm, so it grades with the wood at sunset (water read navy, r2).
          for (let x = x0 + 1; x < x1; x++) p.set(x, y, 'wood', 0);
          continue;
        }
        for (let x = x0 + 1; x < x1; x++) p.set(x, y, 'wood', x === x0 + 1 ? 5 : (foot - 1 - y) % 3 === 0 ? 3 : 4);
      }
      for (let x = x0; x <= x1; x++) p.set(x, foot, 'wood', 1);
      p.set(x0, far - 2, 'wood', 5);
      p.set(x0, far - 1, 'wood', 3);
      p.set(x1, far - 2, 'wood', 2);
      p.set(x1, far - 1, 'wood', 1);
      // A 1-px rope from the bow post to the far pile's foot.
      const bow = { x: CX + half - 1, y: top - 1 };
      for (let x = bow.x + 1; x < x0; x++) p.set(x, bow.y - 1, 'thatch', 2);
    } else {
      // A net heaped in the stern: a lumpy mound of linen-grey mesh.
      for (const [x, y, s] of [
        [-6, -2, 3],
        [-5, -2, 4],
        [-4, -2, 3],
        [-7, -1, 2],
        [-6, -1, 3],
        [-5, -1, 2],
        [-4, -1, 3],
        [-3, -1, 2],
      ] as const)
        p.set(CX + x, top + y, 'plaster', s);
      // A pole leaning out over the bow.
      for (let k = 0; k < 5; k++) p.set(CX + 4 + k, top - 1 - Math.floor(k / 2), 'wood', 4);
    }
    compose(buffer, [p.part(1, 1)], rampSize, { light: false, occlusion: false });
  },
};

export default boat;
