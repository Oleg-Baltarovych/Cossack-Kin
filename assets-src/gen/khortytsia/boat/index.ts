// Човен on the Dnipro (plan M2-11, SPEC §3.0 «ріка / пристань — човни», §6.3 boat ripples): seen from the near bank
// a little from above — the hull's side (planks, a lit gunwale, a darker tarred strake at the waterline) and the open
// hull behind it (the far gunwale's line over a dark inside, thwarts across). Variants: `a` a plank boat afloat at the
// bank, tied by a 1-px rope to a stake in the shore 2 rows below its waterline, an oar laid across; `b` a tarred
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
const W = 26;
/** Rows under the waterline in the frame: the mooring stake stands on the shore below the last water row. */
const BELOW = 6;
const H = 8 + BELOW;
/** The waterline row (the hull's last visible row); the pivot is its bottom edge. */
const WATERLINE = H - 1 - BELOW;
/** Boat `a`'s mooring: the stake's column right of the bow and the rows it spans under the waterline (the shore). */
export const BOAT_STAKE = { dx: 12, top: 2, bottom: 5 } as const;
const CX = W / 2;

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
      // The mooring: a stake in the shore right of the bow, a 1-px rope from the bow post down to it.
      const sx = CX + BOAT_STAKE.dx;
      for (let y = WATERLINE + BOAT_STAKE.top; y <= WATERLINE + BOAT_STAKE.bottom; y++) {
        p.set(sx, y, 'wood', y === WATERLINE + BOAT_STAKE.top ? 4 : 2);
      }
      const bow = { x: CX + half - 1, y: top - 1 };
      const tie = { x: sx, y: WATERLINE + BOAT_STAKE.top };
      for (let k = 1; k < tie.y - bow.y; k++) {
        p.set(bow.x + Math.round(((tie.x - bow.x) * k) / (tie.y - bow.y)), bow.y + k, 'thatch', 2);
      }
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
