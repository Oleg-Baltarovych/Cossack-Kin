// Suburb recipes (plan M2-08, ART-BIBLE §6 «Передмістя»): the smithy, the tavern, the fair and their props. Like
// recipes-farm.ts, every builder plots exact ramp steps per px (light baked top-left), so parts are composed with the
// light and AO passes off. Randomness only from `seededRng(<seed>:<builder>)` or position hashes; no trig.
import type { RampName } from './buffer.ts';
import { Plot } from './plot.ts';
import { seededRng } from './rng.ts';

/**
 * Night-proof thatch (art-director M2-08, two rounds): the roof recipe's bright straw strokes (thatch 5–6 dashes, the
 * ridge highlight, the light strands) read as frost under the night grade, so suburb roofs take every step ≥ 4 one
 * down and keep to thatch ≤ 4: the lit hip 3/4, the front 3, the shaded hip 2/3.
 */
export function softenThatch(plot: Plot): void {
  for (const [key, px] of plot.px) {
    if (px.ramp === 'thatch' && px.shade >= 4) plot.px.set(key, { ...px, shade: Math.min(4, px.shade - 1) });
  }
}

/**
 * Whitewashed wattle-and-daub chimney (димар) through the thatch: 4 px wide — plaster 4 lit left, 3, 3, 2 shaded
 * right — under a 1-px dark (ink 2) cap.
 */
export function daubChimney(plot: Plot, x: number, top: number, h: number): void {
  for (let r = 1; r < h; r++) {
    [4, 3, 3, 2].forEach((shade, c) => {
      plot.set(x + c, top + r, 'plaster', shade);
    });
  }
  for (let c = 0; c < 4; c++) plot.set(x + c, top, 'ink', 2);
}

/** Integer line (Bresenham) of `ramp`/`shade`; `w` px thick downward, the lower px one step darker. */
export function line(
  plot: Plot,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  ramp: RampName,
  shade: number,
  w = 1,
): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    for (let k = 0; k < w; k++) plot.set(x, y + k, ramp, k === 0 ? shade : Math.max(0, shade - 2));
    if (x === x1 && y === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** A round wooden post `w` (2 or 3) px wide: lit left column, shaded right; `ground` is its last row. */
export function timberPost(plot: Plot, x: number, top: number, ground: number, w: 2 | 3 = 2): void {
  for (let y = top; y <= ground; y++) {
    plot.set(x, y, 'wood', 4);
    if (w === 3) plot.set(x + 1, y, 'wood', 3);
    plot.set(x + w - 1, y, 'wood', 2);
  }
}

/**
 * Бочка: a stave barrel 7 wide × `h` tall standing on `ground` — wood 4 lit left staves, 3 middle, 2 right, two dark
 * iron hoops (ink 2 with a lit stone px), a lighter lid ellipse on top.
 */
export function barrel(plot: Plot, cx: number, ground: number, h = 9): void {
  const top = ground - h + 1;
  for (let y = top; y <= ground; y++) {
    const bulge = y > top && y < ground ? 1 : 0;
    for (let c = -2 - bulge; c <= 2 + bulge; c++) {
      const u = c + 3;
      let shade = u <= 1 ? 4 : u <= 3 ? 3 : u <= 4 ? 2 : 1;
      if (c === 0 && (y - top) % 3 === 1) shade = 2; // stave seam
      plot.set(cx + c, y, 'wood', shade);
    }
  }
  for (const hy of [top + 2, ground - 2]) {
    for (let c = -3; c <= 3; c++) plot.set(cx + c, hy, 'ink', 2);
  }
  for (let c = -2; c <= 2; c++) plot.set(cx + c, top, 'wood', c < 1 ? 5 : 4);
  plot.set(cx - 1, top - 1, 'wood', 3);
  plot.set(cx, top - 1, 'wood', 3);
  plot.set(cx + 1, top - 1, 'wood', 2);
}

/** Plank door `w`×`h` at (x, y): a 1-px dark frame (reads as a door, not a blob), vertical boards, lit left board, a dark ledge and an iron latch. */
export function plankDoor(plot: Plot, x: number, y: number, w: number, h: number): void {
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const frame = c === 0 || c === w - 1 || r === 0;
      const seam = c > 0 && c < w - 1 && c % 2 === 0;
      plot.set(x + c, y + r, 'wood', frame ? 1 : seam ? 1 : c === 1 ? 3 : 2);
    }
  }
  for (let c = 1; c < w - 1; c++) plot.set(x + c, y + Math.floor(h / 2), 'wood', 1);
  plot.set(x + w - 2, y + Math.floor(h / 2) - 1, 'ink', 2);
}

/**
 * The fair's square (art-director M2-08: it must sit in the ground, not float): a ragged ellipse `w`×`h` at the
 * bottom of a `w`×`top + h` canvas in the road's own earth (earth 4 base, earth 3 blotches, earth 5 light patches),
 * its rim dithering out in earth 3 (a darker ochre, never a grass shadow), and worn foot paths from the road (the
 * canvas top) down into it at `strokes` x; hoofprints and straw wisps inside.
 */
export function trodPatch(
  plot: Plot,
  w: number,
  h: number,
  top: number,
  strokes: readonly number[],
  seed: string,
  noise: (x: number, y: number) => number,
): void {
  const cx = (w - 1) / 2;
  const cy = top + (h - 1) / 2;
  const dist = (x: number, y: number): number => {
    const u = (x - cx) / (w / 2);
    const v = (y - cy) / (h / 2);
    return Math.sqrt(u * u + v * v) + 0.12 * noise(x, y);
  };
  const ground = (x: number, y: number): number => {
    const n = noise(x * 2 + 7, y * 3 + 11);
    return n > 0.72 ? 3 : n < 0.18 ? 5 : 4;
  };
  for (let y = top; y < top + h; y++) {
    for (let x = 0; x < w; x++) {
      const d = dist(x, y);
      if (d < 0.8) plot.set(x, y, 'earth', ground(x, y));
      else if ((d < 0.9 && (x + y) % 2 === 0) || (d < 1 && x % 2 === 0 && y % 2 === 0)) plot.set(x, y, 'earth', 3);
    }
  }
  // Foot paths from the road: 3 px wide, wandering 1 px every 5–7 rows, a dithered earth 3 edge.
  const rng = seededRng(`${seed}:paths`);
  for (const sx of strokes) {
    let x = sx;
    let next = 5 + Math.floor(rng() * 3);
    for (let y = 0; y < top + h / 2; y++) {
      if (y === next) {
        x += rng() < 0.5 ? -1 : 1;
        next += 5 + Math.floor(rng() * 3);
      }
      if (plot.get(x, y)?.shade === 4) continue;
      for (let c = 0; c < 3; c++) plot.set(x + c, y, 'earth', ground(x + c, y) === 3 ? 3 : 4); // the road's values
      if ((x + y) % 2 === 0) plot.set(x - 1, y, 'earth', 3);
      if ((x + y) % 2 === 1) plot.set(x + 3, y, 'earth', 3);
    }
  }
  const marks = seededRng(`${seed}:marks`);
  const interior = (x: number, y: number): boolean => plot.get(x, y)?.shade === 4 || plot.get(x, y)?.shade === 5;
  for (let k = 0, n = 0; k < 200 && n < Math.round((w * h) / 120); k++) {
    const x = 6 + Math.floor(marks() * (w - 12));
    const y = top + 3 + Math.floor(marks() * (h - 6));
    if (!interior(x, y) || !interior(x + 2, y) || !interior(x + 1, y + 1)) continue;
    if (marks() < 0.55) {
      plot.set(x, y, 'earth', 2);
      plot.set(x + 2, y, 'earth', 2);
      plot.set(x + 1, y + 1, 'earth', 2);
    } else {
      plot.set(x, y, 'thatch', 4);
      plot.set(x + 1, y, 'thatch', 4);
      plot.set(x + 2, y, 'thatch', 2);
    }
    n++;
  }
}

// ── smithy (кузня) ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * Горно: a clay hearth on a stone footing, `w` wide, 9 rows up to `ground`: stone courses (stone 4 lit left, 3, 2
 * right), an earth 4 clay top with a dark fire bed (ink 1) in the middle where the forge's coals lie (`forge` add-on).
 * Returns the fire bed's row (the forge sprite's pivot row).
 */
export function hearth(plot: Plot, cx: number, ground: number, w: number): number {
  const x0 = cx - Math.floor(w / 2);
  const top = ground - 8;
  for (let y = top; y <= ground; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const u = (x - x0) / (w - 1);
      if (y <= top + 1) {
        plot.set(x, y, 'earth', y === top ? (u < 0.6 ? 4 : 3) : 3);
        continue;
      }
      const course = (y - top - 2) % 3 === 2;
      const joint = (x + Math.floor((y - top) / 3) * 2) % 5 === 0;
      plot.set(x, y, 'stone', course || joint || u > 0.8 ? 2 : 3);
    }
  }
  for (let x = x0 + 2; x < x0 + w - 2; x++) plot.set(x, top, 'ink', 1);
  return top;
}

/**
 * Hood and flue over the hearth: a clay (earth 3/4, sooty ink 2 lower edge) hood narrowing from `w` to 4 px over
 * `h` rows above `top`, then the flue up to `flueTop` — clay, or stone courses from tier V.
 */
export function hoodAndFlue(
  plot: Plot,
  cx: number,
  top: number,
  w: number,
  h: number,
  flueTop: number,
  stone: boolean,
): void {
  for (let r = 0; r < h; r++) {
    const y = top - 1 - r;
    const half = Math.max(2, Math.round(w / 2 - ((w / 2 - 2) * r) / Math.max(1, h - 1)));
    for (let x = cx - half; x < cx + half; x++) {
      const lit = x < cx - half + 2;
      plot.set(x, y, r === 0 ? 'ink' : 'earth', r === 0 ? 2 : lit ? 4 : 3);
    }
  }
  for (let y = flueTop; y < top - h; y++) {
    for (let x = cx - 2; x < cx + 2; x++) {
      const u = x - (cx - 2);
      if (stone) plot.set(x, y, 'stone', (y - flueTop) % 3 === 2 || u === 3 ? 2 : 3);
      else plot.set(x, y, 'earth', u === 0 ? 4 : 3);
    }
  }
  for (let x = cx - 2; x < cx + 2; x++) plot.set(x, flueTop, 'ink', 2); // sooty mouth
}

/** Ковадло on a stump: the stump (wood 4/3/2, 5×4) with the anvil on it — horn to the left, iron ink/stone, 9 wide. */
export function anvil(plot: Plot, cx: number, ground: number): void {
  for (let y = ground - 3; y <= ground; y++) {
    for (let c = -2; c <= 2; c++) plot.set(cx + c, y, 'wood', y === ground - 3 ? 4 : c < 0 ? 3 : c === 2 ? 1 : 2);
  }
  const base = ground - 4;
  for (let c = -2; c <= 2; c++) plot.set(cx + c, base, 'ink', 2);
  for (let c = -1; c <= 1; c++) plot.set(cx + c, base - 1, 'ink', 2);
  for (let c = -4; c <= 4; c++) {
    plot.set(cx + c, base - 2, 'stone', c < 0 ? 3 : 2);
    if (c >= -2) plot.set(cx + c, base - 3, 'stone', 3);
  }
  plot.set(cx - 5, base - 2, 'stone', 2); // horn tip
}

/** Wooden cart wheel (колесо) `r` px radius at (cx, cy): wood 4/2 rim, 6 spokes, a dark hub; lit top-left. */
export function wheel(plot: Plot, cx: number, cy: number, r: number): void {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = x * x + y * y;
      if (d > r * r + r || d < (r - 1) * (r - 1) - (r - 1)) continue;
      plot.set(cx + x, cy + y, 'wood', x + y < 0 ? 4 : 2);
    }
  }
  for (let k = 1; k < r - 1; k++) {
    plot.set(cx + k, cy, 'wood', 3);
    plot.set(cx - k, cy, 'wood', 3);
    plot.set(cx, cy + k, 'wood', 3);
    plot.set(cx, cy - k, 'wood', 3);
  }
  plot.set(cx, cy, 'ink', 2);
}

/** Підкова: a 5×4 horseshoe hung opening down, lit left (iron stone 3/2, or gold 4/2 for tier VI). */
export function horseshoe(plot: Plot, x: number, y: number, ramp: 'stone' | 'gold'): void {
  const lit = ramp === 'gold' ? 4 : 3;
  for (let c = 1; c <= 3; c++) plot.set(x + c, y, ramp, c === 3 ? 2 : lit);
  for (let r = 1; r <= 3; r++) {
    plot.set(x, y + r, ramp, lit);
    plot.set(x + 4, y + r, ramp, 2);
  }
}

/** Clay (unwhitened) wall: earth 4 with earth 5 trowel marks on the lit left, earth 3 streaks; the last `side` columns are the shaded side wall (earth 3/2). */
export function clayWall(plot: Plot, x: number, y: number, w: number, h: number, side: number, seed: string): void {
  const rng = seededRng(`${seed}:clay`);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const sideWall = c >= w - side;
      const shade = sideWall || r < 2 ? 3 : 4; // the side wall and the eave shadow one step down
      plot.set(x + c, y + r, 'earth', shade);
    }
  }
  for (let k = 0; k < Math.round((w * h) / 40); k++) {
    const c = Math.floor(rng() * (w - side - 2));
    const r = 2 + Math.floor(rng() * (h - 3));
    plot.set(x + c, y + r, 'earth', 3);
    plot.set(x + c + 1, y + r, 'earth', 3);
  }
}

// ── fair (ярмарок) ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * Рядно: a woven linen mat `w` wide, 3 rows on the ground — unbleached plaster 3/2 weave (art-director: a white mat
 * glowed at night), a crimson stripe near each end.
 */
export function ryadno(plot: Plot, x: number, w: number, ground: number): void {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < w; c++) {
      const stripe = c === 2 || c === w - 3;
      plot.set(x + c, ground - 2 + r, stripe ? 'crimson' : 'plaster', stripe ? 3 : (c + r) % 2 === 0 ? 3 : 2);
    }
  }
}

/** Мішок: a grain sack 5 wide × `h` tall, tied at the top — thatch 3 lit left, 2 right, a darker tie and ear. */
export function sack(plot: Plot, cx: number, ground: number, h = 7): void {
  for (let y = ground - h + 2; y <= ground; y++) {
    const half = y === ground - h + 2 ? 1 : 2;
    for (let c = -half; c <= half; c++) plot.set(cx + c, y, 'thatch', c < 0 ? 3 : c === half ? 1 : 2);
  }
  plot.set(cx, ground - h + 1, 'thatch', 1);
  plot.set(cx - 1, ground - h, 'thatch', 3);
  plot.set(cx + 1, ground - h, 'thatch', 2);
}

/** Скриня-ящик: a plank crate `w`×`h`: lit top board, plank seams, darker right end. */
export function crate(plot: Plot, x: number, ground: number, w: number, h: number): void {
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const shade = r === 0 ? 4 : c === w - 1 ? 1 : r % 3 === 0 ? 1 : c === 0 ? 3 : 2;
      plot.set(x + c, ground - h + 1 + r, 'wood', shade);
    }
  }
}

/** Upright pot on a mat: 5×5, earth 3 lit upper left (earth 5); the outline gives its rim and shade side. */
export function smallPot(plot: Plot, cx: number, ground: number): void {
  const rows = [3, 5, 5, 5, 3];
  rows.forEach((w, r) => {
    const half = (w - 1) / 2;
    for (let c = -half; c <= half; c++) {
      plot.set(cx + c, ground - 4 + r, 'earth', c < 0 && r > 0 && r < 3 ? 5 : 3);
    }
  });
}

/** Капуста / цибуля heap: a 3-row mound of round heads, grass (cabbage) or thatch (onions) 4 / 3 / 2. */
export function heads(plot: Plot, cx: number, ground: number, ramp: 'grass' | 'thatch'): void {
  [3, 5, 7].forEach((w, r) => {
    const half = (w - 1) / 2;
    for (let c = -half; c <= half; c++) plot.set(cx + c, ground - 2 + r, ramp, (c + r) % 2 === 0 ? 4 : c > 0 ? 2 : 3);
  });
}

/**
 * A pennant pole `h` tall (wood 4 lit left, 2 shaded) with a knob; the cloth is the wind-animated `pennant` add-on
 * hung at `pennantHoist` (plan M2-11; until then a static crimson cloth was baked in here).
 */
export function pennantPole(plot: Plot, x: number, ground: number, h: number): void {
  for (let y = ground - h; y <= ground; y++) {
    plot.set(x, y, 'wood', 4);
    plot.set(x + 1, y, 'wood', 2);
  }
  plot.set(x, ground - h - 1, 'wood', 4);
}

/**
 * Where a `pennant` hangs off a `pennantPole(x, ground, h)` drawn in a frame whose pivot is (`pivotX`, `pivotGround`):
 * the cloth's top-left px right of the pole, one row under its top — a layout offset (`dx`, `lift`) from the pivot.
 */
export function pennantHoist(
  pole: { readonly x: number; readonly ground: number; readonly h: number },
  pivotX: number,
  pivotGround: number,
): { readonly dx: number; readonly lift: number } {
  return { dx: pole.x + 2 - pivotX, lift: pivotGround + 1 - (pole.ground - pole.h + 1) };
}
