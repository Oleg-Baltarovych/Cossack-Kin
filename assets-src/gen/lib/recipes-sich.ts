// Pixel recipes, set 2: the Sich (plan ART-11, ART-BIBLE §5 "Зруб / колоди", "Частокіл", "Вал і рів", "Дошки й
// ґонт", §6 Січ). Like set 1 (recipes.ts), every builder plots exact ramp steps per px role into a `Plot`; light is
// baked per plane (sun top-left), so parts are composed with the light/AO passes off. Shade numbers are indices into
// master.json — wood: 0 #3b2419, 1 #57351f, 2 #774a28, 3 #966233, 4 #b37d42, 5 #cf9d5c, 6 #e6c084.
import { Plot } from './plot.ts';
import { seededRng } from './rng.ts';

type Rng = () => number;
const int = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));

/** Rows of one log course: lit top, body, lower body, dark groove (паз). */
export const COURSE = 4;

/**
 * Зруб: horizontal log courses from row `y` down, `h` rows, between `x` and `x + w`. Each course: a lit top row
 * (wood 4, wood 5 dashes on the left half), two body rows (wood 3 / wood 2), a 1-px groove (wood 0); the course's
 * right end sits a step darker (the shaded side); knots as 1-px wood 1 dots; course ends stagger ±1 px.
 * `ends`: round log ends with a 1-px ring on the corners (left lit, right shaded), sticking out 1 px.
 */
export function logWall(
  plot: Plot,
  spec: { seed: string; x: number; y: number; w: number; h: number; ends?: boolean },
): void {
  const rng = seededRng(`${spec.seed}:logs`);
  const { x, y, w, h } = spec;
  for (let r0 = 0; r0 < h; r0 += COURSE) {
    const jitterL = rng() < 0.4 ? 1 : 0;
    const jitterR = rng() < 0.4 ? 1 : 0;
    const knots = new Set<number>();
    for (let k = 0; k < Math.floor(w / 9); k++) knots.add(x + int(rng, 2, w - 3));
    for (let c = x + jitterL; c < x + w - jitterR; c++) {
      const shaded = (c - x) / w > 0.82 ? 1 : 0;
      for (let k = 0; k < COURSE && r0 + k < h; k++) {
        let shade = k === 0 ? 4 : k === 1 ? 3 : k === 2 ? 2 : 0;
        if (k === 0 && (c - x) / w < 0.5 && (c + r0) % 4 === 0) shade = 5;
        if (k > 0 && k < 3 && knots.has(c) && k === 1) shade = 1;
        plot.set(c, y + r0 + k, 'wood', Math.max(0, shade - (k < 3 ? shaded : 0)));
      }
    }
    if (spec.ends) {
      // Round log ends: 3 px tall discs on both corners, the left one lit, the right one in shade.
      for (const [cx, lit] of [
        [x - 1, true],
        [x + w, false],
      ] as const) {
        const face = lit ? 5 : 3;
        const ring = lit ? 3 : 1;
        for (let k = 0; k < 3 && r0 + k < h; k++) {
          plot.set(cx, y + r0 + k, 'wood', k === 1 ? face : ring);
          plot.set(cx + (lit ? 1 : -1), y + r0 + k, 'wood', k === 1 ? ring : face - 1);
        }
      }
    }
  }
}

/**
 * Частокіл stake: a 4-px log from row `top` (its point) down to `ground`: a 1-px lit left face (wood 5), body
 * (wood 3 / wood 2), a dark right face (wood 1) — strong enough to survive at phone size; a 2-row point with a 1-px
 * tip; bark specks; a darker foot. `lean` shifts the upper half 1 px (a stake that settled), −1, 0 or 1.
 */
export function palisadeStake(plot: Plot, x: number, top: number, ground: number, rng: Rng, lean = 0): void {
  const mid = top + Math.floor((ground - top) / 2);
  for (let y = top; y <= ground; y++) {
    const r = y - top;
    const dx = y < mid ? lean : 0;
    if (r === 0) {
      plot.set(x + 1 + dx, y, 'wood', 5);
      continue;
    }
    if (r === 1) {
      plot.set(x + dx, y, 'wood', 5);
      plot.set(x + 1 + dx, y, 'wood', 4);
      plot.set(x + 2 + dx, y, 'wood', 1);
      continue;
    }
    const foot = ground - y < 3 ? 1 : 0;
    const speck = rng() < 0.08 ? 1 : 0;
    plot.set(x + dx, y, 'wood', 5 - foot);
    plot.set(x + 1 + dx, y, 'wood', 3 - speck);
    plot.set(x + 2 + dx, y, 'wood', 2 - foot);
    plot.set(x + 3 + dx, y, 'wood', 1 - foot);
  }
}

/**
 * Lashing (лоза) across a row of stakes: a 2-px band wood 0 (it reads at phone size), one wood 4 glint px where it
 * passes over each stake.
 */
export function lashing(plot: Plot, x0: number, x1: number, y: number, stakeAt: (x: number) => boolean): void {
  for (let c = x0; c < x1; c++) {
    plot.set(c, y, 'wood', 0);
    plot.set(c, y + 1, 'wood', 0);
    if (stakeAt(c) && !stakeAt(c - 1)) plot.set(c + 1, y, 'wood', 4);
  }
}

/**
 * Шатро (tent roof): a pyramid from apex (cx, top) to the eave row `bottom`, `w` px wide at the eave. Board courses
 * converge on the apex: the left face lit (wood 4 with wood 5 board edges), the right face shaded (wood 2 with wood 1
 * edges), a 1-px eave rim (wood 1), a finial pole with a knob above the apex.
 */
export function tentRoof(plot: Plot, cx: number, top: number, bottom: number, w: number): void {
  const h = bottom - top;
  for (let y = top; y < bottom; y++) {
    const t = (y - top + 1) / h;
    const half = Math.max(1, Math.round((w / 2) * t));
    for (let c = cx - half; c < cx + half; c++) {
      const left = c < cx;
      // Boards: radial lines every ~3 px at the eave, converging up.
      const u = Math.round(((c - cx + 0.5) / Math.max(1, half)) * 6);
      const edge = u % 2 === 0;
      let shade = left ? (edge ? 5 : 4) : edge ? 1 : 2;
      if (y === bottom - 1) shade = left ? 2 : 1;
      if (c === cx - half && left) shade = 3;
      plot.set(c, y, 'wood', shade);
    }
  }
  // Finial: a 1-px pole and a 2-px knob.
  plot.set(cx, top - 1, 'wood', 2);
  plot.set(cx, top - 2, 'wood', 2);
  plot.set(cx - 1, top - 3, 'wood', 4);
  plot.set(cx, top - 3, 'wood', 3);
}

/**
 * Корогва: a crimson banner hanging from a pole at (x, top): the pole (wood 2/1) `pole` px tall with a gold knob,
 * the cloth `w` × `h` to the right, crimson 3 body, crimson 4 lit left fold, crimson 2 right fold and lower edge,
 * a gold cross in the middle, a swallowtail cut at the free end.
 */
export function banner(plot: Plot, x: number, top: number, pole: number, w: number, h: number): void {
  for (let y = top; y < top + pole; y++) {
    plot.set(x, y, 'wood', 2);
    plot.set(x + 1, y, 'wood', 1);
  }
  plot.set(x, top - 1, 'gold', 4);
  plot.set(x + 1, top - 1, 'gold', 3);
  const cy = top + 1;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      // Swallowtail: a V notch in the free end's lower half.
      if (c >= w - 3 && r > h / 2 - 1 && Math.abs(r - h * 0.75) < c - (w - 3) + 0.5) continue;
      const fold = c % 4 === 1 ? 4 : c % 4 === 3 ? 2 : 3;
      const shade = r === h - 1 ? 2 : c === 0 ? 4 : fold;
      plot.set(x + 2 + c, cy + r, 'crimson', shade);
    }
  }
  // Gold cross centred on the cloth.
  const mx = x + 2 + Math.floor((w - 3) / 2);
  const my = cy + Math.floor(h / 2) - 1;
  for (let k = -2; k <= 2; k++) plot.set(mx, my + k, 'gold', k < 0 ? 4 : 3);
  for (let k = -1; k <= 1; k++) plot.set(mx + k, my - 1, 'gold', 4);
}

/** A dark opening (doorway, gate passage, window) with a lit sill row. `glow` = night emissive plot. */
export function opening(
  plot: Plot,
  glow: Plot | null,
  r: { x: number; y: number; w: number; h: number },
  lightAt = 0,
): void {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      plot.set(x, y, 'ink', y === r.y ? 1 : 2);
      if (glow && y >= r.y + lightAt) glow.set(x, y, 'gold', 4);
    }
  }
  for (let x = r.x - 1; x <= r.x + r.w; x++) plot.set(x, r.y + r.h, 'wood', 4);
}
