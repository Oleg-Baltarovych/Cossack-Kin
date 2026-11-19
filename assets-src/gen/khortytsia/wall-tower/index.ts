// Вежі частоколу, tiers II–IV of the walls (plan M2-09, ART-BIBLE §6: "частокіл із дерев'яними вежами (рубані,
// чотиригранні, шатровий дах)"): towers standing on the palisade line, seen from inside the Sich, in the `tower`
// family (log зруб, шатро, lit slits). II a log tower like `tower` with a gun port on the lower storey (a dark
// square opening, a cannon muzzle in it); III taller, the upper storey projecting 2 px each side over the lower
// (облам, the overhang of Cossack wooden fortress towers) under a bigger шатро; IV adds a crimson-and-gold band
// under the eaves, a gilt finial knob and a crimson pennant with a gold cross on the finial pole. Slits are lit at
// night (@emissive). 40×112, pivot at the base centre; cast shadow to the right.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { logWall, opening, tentRoof } from '../../lib/recipes-sich.ts';
import type { SpriteGenerator } from '../../lib/types.ts';

const W = 40;
const H = 112;
export const WALL_TOWER_GROUND = 110;
export const WALL_TOWER_PIVOT_X = 20;

interface WallTowerTier {
  /** Lower storey: left x, width, top row. */
  readonly lower: { readonly x: number; readonly w: number; readonly top: number };
  /** Projecting upper storey (облам): left x, width, top row; it ends where the lower storey starts. */
  readonly upper?: { readonly x: number; readonly w: number; readonly top: number };
  /** Roof apex row and eave width. */
  readonly apex: number;
  readonly eave: number;
  readonly gilt?: boolean;
}

export const WALL_TOWER_TIERS: Readonly<Record<string, WallTowerTier>> = {
  t2: { lower: { x: 9, w: 22, top: 56 }, apex: 28, eave: 30 },
  t3: { lower: { x: 9, w: 22, top: 62 }, upper: { x: 7, w: 26, top: 44 }, apex: 12, eave: 36 },
  t4: { lower: { x: 9, w: 22, top: 62 }, upper: { x: 7, w: 26, top: 44 }, apex: 12, eave: 36, gilt: true },
};

/** Gun port: a dark square opening on the lower storey, a cannon muzzle (stone) looking out of it. */
function gunPort(plot: Plot, cx: number, y: number): void {
  const [x0, w, h] = [cx - 4, 8, 7];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) plot.set(x0 + c, y + r, 'ink', r === 0 ? 1 : 0);
  // Lintel and sill logs (lit tops).
  for (let c = -1; c <= w; c++) {
    plot.set(x0 + c, y - 1, 'wood', 1);
    plot.set(x0 + c, y + h, 'wood', 4);
  }
  // Muzzle: a round iron mouth, lit top-left, the dark bore off-centre right-down.
  const muzzle: readonly (readonly [number, number, number])[] = [
    [-1, 0, 4],
    [0, 0, 3],
    [-2, 1, 4],
    [-1, 1, 3],
    [0, 1, 3],
    [1, 1, 2],
    [-2, 2, 3],
    [1, 2, 1],
    [-2, 3, 2],
    [-1, 3, 2],
    [0, 3, 1],
    [1, 3, 1],
    [-1, 4, 1],
    [0, 4, 1],
  ];
  for (const [dx, dy, s] of muzzle) plot.set(cx + dx, y + 1 + dy, 'stone', s);
  plot.set(cx - 1, y + 3, 'ink', 0);
  plot.set(cx, y + 3, 'ink', 0);
}

/** Crimson-and-gold band (2 rows) across a log wall, gold studs every 4 px. */
function band(plot: Plot, x0: number, x1: number, y: number): void {
  for (let x = x0; x < x1; x++) {
    const shaded = (x - x0) / (x1 - x0) > 0.82;
    plot.set(x, y, 'crimson', shaded ? 2 : (x & 3) === 0 ? 4 : 3);
    plot.set(x, y + 1, (x & 3) === 2 ? 'gold' : 'crimson', (x & 3) === 2 ? (shaded ? 3 : 4) : 2);
  }
}

/** Gilt finial: the pole from the apex up, a gold knob on it, a crimson pennant with a gold cross at the top. */
function giltFinial(plot: Plot, cx: number, apex: number): void {
  for (let y = 2; y < apex; y++) plot.set(cx, y, 'wood', 1);
  plot.set(cx, 1, 'gold', 4);
  // Knob (makivka): 3×4, lit top-left.
  const knob: readonly (readonly [number, number, number])[] = [
    [0, 0, 4],
    [-1, 1, 5],
    [0, 1, 4],
    [1, 1, 3],
    [-1, 2, 4],
    [0, 2, 3],
    [1, 2, 2],
    [0, 3, 2],
  ];
  const ky = apex - 6;
  for (const [dx, dy, s] of knob) plot.set(cx + dx, ky + dy, 'gold', s);
  // Pennant: 7×5 off the pole top, a swallowtail cut, the gold cross in its body.
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 7; c++) {
      if (c >= 5 && r === 2) continue;
      if (c === 6 && (r === 1 || r === 3)) continue;
      plot.set(cx + 1 + c, 2 + r, 'crimson', r === 4 ? 2 : c === 0 ? 4 : c % 3 === 2 ? 2 : 3);
    }
  }
  for (let k = -1; k <= 1; k++) {
    plot.set(cx + 3, 4 + k, 'gold', 4);
    plot.set(cx + 3 + k, 4, 'gold', 4);
  }
}

const wallTower: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'wall-tower',
  size: { w: W, h: H },
  frames: { idle: 1 },
  variants: Object.keys(WALL_TOWER_TIERS),
  layers: ['emissive', 'shadow'],
  anchor: { x: WALL_TOWER_PIVOT_X / W, y: (WALL_TOWER_GROUND + 1) / H },
  generate(_rng, { variant, buffer, layers, rampSize }) {
    const v = variant ?? 't2';
    const t = WALL_TOWER_TIERS[v] ?? { lower: { x: 9, w: 22, top: 56 }, apex: 28, eave: 30 };
    const g = WALL_TOWER_GROUND;
    const cx = WALL_TOWER_PIVOT_X;
    const { lower, upper } = t;
    const body = new Plot();
    const glow = new Plot();
    logWall(body, { seed: `wall-tower.${v}`, x: lower.x, y: lower.top, w: lower.w, h: g + 1 - lower.top, ends: true });
    // The gun port sits above the stake points (~32 px), where it clears the palisade.
    gunPort(body, cx, g - 40);
    const eaveRow = upper ? upper.top : lower.top;
    if (upper) {
      logWall(body, {
        seed: `wall-tower.${v}:upper`,
        x: upper.x,
        y: upper.top,
        w: upper.w,
        h: lower.top - upper.top,
        ends: true,
      });
      // Underside of the облам: a dark soffit row on the projecting ends, AO on the lower storey's top row.
      for (let x = upper.x; x < upper.x + upper.w; x++) {
        const out = x < lower.x || x >= lower.x + lower.w;
        body.set(x, lower.top - 1, 'wood', out ? 0 : 1);
        if (!out) body.set(x, lower.top, 'ink', 1);
      }
      for (const x of [upper.x - 1, upper.x + upper.w]) body.set(x, lower.top - 1, 'wood', 0);
      if (t.gilt) band(body, upper.x, upper.x + upper.w, upper.top);
      opening(body, glow, { x: cx - 8, y: upper.top + 5, w: 3, h: 6 }, 1);
      opening(body, glow, { x: cx - 1, y: upper.top + 5, w: 3, h: 6 }, 1);
      opening(body, glow, { x: cx + 6, y: upper.top + 5, w: 3, h: 6 }, 1);
    } else {
      opening(body, glow, { x: lower.x + 5, y: lower.top + 3, w: 3, h: 5 }, 1);
      opening(body, glow, { x: lower.x + 14, y: lower.top + 3, w: 3, h: 5 }, 1);
    }
    const roof = new Plot();
    tentRoof(roof, cx, t.apex, eaveRow, t.eave);
    const finial = new Plot();
    if (t.gilt) {
      // Replace the wooden knob with the gilt finial (no outline: it would swell the 1-px pole).
      for (let y = t.apex - 3; y < t.apex; y++) for (let x = cx - 1; x <= cx; x++) roof.delete(x, y);
      giltFinial(finial, cx, t.apex);
    }
    compose(buffer, [body.part(1, 1, glow), roof.part(2, 2), ...(t.gilt ? [finial.part(3, 3)] : [])], rampSize, {
      light: false,
      occlusion: false,
      outline: { mode: 'outer', parts: [2] },
      selective: { lit: 'vanish' },
      ...(layers.emissive ? { emissive: layers.emissive } : {}),
    });
    const right = (upper ?? lower).x + (upper ?? lower).w;
    if (layers.shadow)
      castShadow(layers.shadow, { x0: cx, x1: lower.x + lower.w + 1, groundY: g, reach: right > 32 ? 14 : 12 });
  },
};

export default wallTower;
