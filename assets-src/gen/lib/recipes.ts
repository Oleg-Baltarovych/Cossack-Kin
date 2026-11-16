// Pixel recipes, set 1 (art-director spec: docs/art/recipes/materials-1.md, extends ART-BIBLE §5). Each builder plots
// exact ramp steps per pixel role into a `Plot`; light is baked per plane (sun top-left), so these parts are composed
// with the light/AO passes off. Shade numbers are ramp indices into master.json — the hex each one stands for is
// noted where the recipe names it. Randomness only from `seededRng(<seed>:<builder>)`.
import { valueNoise, seedOf } from './noise.ts';
import { Plot } from './plot.ts';
import { seededRng } from './rng.ts';

type Rng = () => number;
const int = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
const inside = (r: Rect, x: number, y: number, margin = 0): boolean =>
  x >= r.x - margin && x < r.x + r.w + margin && y >= r.y - margin && y < r.y + r.h + margin;

// ── khata roof (reed thatch, hipped) ─────────────────────────────────────────────────────────────────────────

export interface RoofSpec {
  readonly seed: string;
  /** Left eave end and eave width (wall + 3-px overhang each side). */
  readonly x: number;
  readonly w: number;
  /** First row (ridge binding). */
  readonly top: number;
  /** First row of the 3-row eave lip; ragged tips hang into row `lip + 3`. */
  readonly lip: number;
  /** Ridge length as a share of the eave width (recipe: 0.40–0.50). */
  readonly ridge?: number;
}

export interface RoofInfo {
  /** Ridge ends (x, exclusive end) on the first row. */
  readonly ridgeX0: number;
  readonly ridgeX1: number;
}

interface Plane {
  readonly base: number;
  readonly light: number;
  readonly groove: number;
  /** Strand-top dash on the left / right half of the plane. */
  readonly dash: readonly [number, number];
}
// thatch: 1 #6e5426, 2 #93702e, 3 #b68f3b, 4 #d4ad52, 5 #ebcc78, 6 #f7e6a8
const PLANES: Readonly<Record<'left' | 'front' | 'right', Plane>> = {
  left: { base: 4, light: 5, groove: 3, dash: [5, 5] },
  front: { base: 3, light: 4, groove: 2, dash: [5, 4] },
  right: { base: 2, light: 3, groove: 1, dash: [3, 3] },
};

interface Segment {
  readonly start: number;
  readonly light: boolean;
  readonly dash: boolean;
}

/**
 * Hipped reed roof: trapezoid with a flat ridge (40–50 % of the width), 45° steps at the ridge ends, 3-px rounded
 * eave corners; three planes (left hip brightest, front, right hip darker) textured by 1-px vertical strands in
 * staggered 4–7 px segments with 1×2 light dashes at strand tops and broken 1-px grooves; ridge binding with ticks;
 * a 3-px rolled eave lip with a ragged hem.
 */
export function thatchRoof(plot: Plot, spec: RoofSpec): RoofInfo {
  const rng = seededRng(`${spec.seed}:roof`);
  const { x, w, top, lip } = spec;
  const body = lip - top;
  const side = (w - Math.round(w * (spec.ridge ?? 0.45))) / 2;
  const hipFoot = Math.round(side * 0.45);
  const tOf = (r: number): number => (body > 1 ? r / (body - 1) : 1);
  const span = (r: number): readonly [number, number] => {
    const inset = Math.round(side * (1 - tOf(r))) + (r === 0 ? 2 : r === 1 ? 1 : 0);
    return [x + inset, x + w - inset];
  };
  const hipLeft = (r: number): number => x + side + (hipFoot - side) * tOf(r);
  const hipRight = (r: number): number => x + w - side + (side - hipFoot) * tOf(r);

  // Per column: staggered strand segments and broken groove runs.
  const columns = Array.from({ length: w }, (_, c) => {
    // More light strands toward the sun (left); decided per strand segment, never per px (no speckle).
    const pLight = 0.5 - 0.35 * (c / w);
    const segments: Segment[] = [];
    for (let pos = -int(rng, 0, 6); pos < body;) {
      segments.push({ start: pos, light: rng() < pLight, dash: rng() < 0.4 });
      pos += int(rng, 4, 7);
    }
    const groove = rng() < 0.33;
    const runs: [number, number][] = [];
    if (groove) {
      for (let pos = int(rng, 0, 4); pos < body;) {
        const len = int(rng, 6, 10);
        runs.push([pos, pos + len]);
        pos += len + int(rng, 2, 4);
      }
    }
    return { segments, runs };
  });
  // Grooves ~1 in 3 columns, never two side by side.
  for (let c = 1; c < w; c++) {
    const prev = columns[c - 1];
    const cur = columns[c];
    if (prev && cur && prev.runs.length > 0 && cur.runs.length > 0) cur.runs.length = 0;
  }

  let brightest = 0;
  for (let r = 0; r < body; r++) {
    const [left, right] = span(r);
    const y = top + r;
    for (let px = left; px < right; px++) {
      const col = columns[px - x];
      if (!col) continue;
      const plane = px < hipLeft(r) ? PLANES.left : px >= hipRight(r) ? PLANES.right : PLANES.front;
      const planeLeft = plane === PLANES.left ? left : plane === PLANES.right ? hipRight(r) : hipLeft(r);
      const planeRight = plane === PLANES.left ? hipLeft(r) : plane === PLANES.right ? right : hipRight(r);
      const leftHalf = px < (planeLeft + planeRight) / 2;
      const frac = (px - x) / w;
      let seg: Segment = col.segments[0] ?? { start: 0, light: false, dash: false };
      for (const s of col.segments) if (s.start <= r) seg = s;
      let shade = seg.light ? plane.light : plane.base;
      if (seg.dash && r - seg.start < 2 && seg.start >= 1) {
        shade = leftHalf ? plane.dash[0] : plane.dash[1];
        if (shade === 5 && frac < 0.4 && r < body / 2 && r - seg.start === 0 && brightest < 4 && rng() < 0.3) {
          shade = 6; // #f7e6a8, at most 4 px, top-left
          brightest += 1;
        }
      }
      if (col.runs.some(([a, b]) => r >= a && r < b)) shade = plane.groove;
      plot.set(px, y, 'thatch', shade);
    }
  }

  // Ridge binding: highlight row, 2-px roll, ticks every 6–8 px.
  const [r0, r1] = span(0);
  const tickPhase = int(rng, 1, 4);
  let nextTick = r0 + tickPhase;
  for (let px = r0; px < r1; px++) {
    const tick = px === nextTick;
    if (tick) nextTick += int(rng, 6, 8);
    plot.set(px, top, 'thatch', 5);
    for (const rr of [1, 2]) {
      const [a, b] = span(rr);
      if (px >= a && px < b) plot.set(px, top + rr, 'thatch', tick ? 1 : 2);
    }
  }

  // Eave lip: rolled 3-px edge, rounded corners, ragged hem.
  const phase = int(rng, 0, 2);
  let nextTip = x + int(rng, 1, 3);
  for (let k = 0; k < 3; k++) {
    const q = k;
    for (let px = x + q; px < x + w - q; px++) {
      let shade = k === 0 ? 4 : k === 1 ? 2 : 1;
      if (k === 0 && px < x + w / 2 && (px - x + phase) % 3 === 0) shade = 5;
      plot.set(px, lip + k, 'thatch', shade);
      if (k === 2 && px === nextTip) {
        plot.set(px, lip + 3, 'thatch', 1);
        nextTip += int(rng, 3, 5);
      }
    }
  }
  return { ridgeX0: r0, ridgeX1: r1 };
}

/** AO under the eave on the wall: 1 px on the lit left third, 2 px in the middle, 3 px at the shaded right end. */
export function eaveAO(plot: Plot, x0: number, x1: number, y: number): void {
  // plaster: 1 #7f7b90, 2 #a6a2b0, 3 #cac4c6
  for (let c = x0; c < x1; c++) {
    const f = (c - x0) / (x1 - x0);
    const rows = f < 1 / 3 ? [1] : f >= 0.8 ? [1, 2, 3] : [1, 2];
    rows.forEach((shade, i) => {
      plot.set(c, y + i, 'plaster', shade);
    });
  }
}

// ── whitewash ────────────────────────────────────────────────────────────────────────────────────────────────

export interface WallSpec extends Rect {
  readonly seed: string;
  /** Windows (and anything else) that cracks, patches and clay must stay clear of. */
  readonly avoid?: readonly Rect[];
  /** Rows at the top already covered by the eave AO band (cracks start below; default 0). */
  readonly aoRows?: number;
  /** Draw a clay show-through (default true; at most one per wall). */
  readonly clay?: boolean;
}

/**
 * Whitewash: flat `#f5eee0` on the lit wall, the right end stepping to `#e5ddd3` then `#cac4c6`; one fresher patch
 * `#fffaf0` on the lit side; at most one clay show-through `#bd9a63` with a `#cac4c6` rim; 1–2 broken hairline
 * cracks `#cac4c6`; a dithered ground splash in the bottom 2 rows. No speckle.
 */
export function whitewashWall(plot: Plot, spec: WallSpec): void {
  const rng = seededRng(`${spec.seed}:wall`);
  const { x, y, w, h } = spec;
  const avoid = spec.avoid ?? [];
  const ao = spec.aoRows ?? 0;
  const clear = (px: number, py: number, margin: number): boolean => !avoid.some((r) => inside(r, px, py, margin));
  // Shaded right end: a ragged (not dithered) boundary between #f5eee0 and #e5ddd3, stepping every 2–4 rows.
  const boundary: number[] = [];
  for (let r = 0, shift = 0; r < h; r++) {
    if (r % int(rng, 2, 4) === 0) shift = int(rng, -1, 1);
    boundary.push(x + Math.round(w * 0.78) + shift);
  }
  for (let r = 0; r < h; r++) {
    for (let c = x; c < x + w; c++) {
      let shade = c >= x + w - 2 && w >= 16 ? 3 : c >= (boundary[r] ?? x + w) ? 4 : 5;
      if (r === h - 2) shade = Math.min(shade, (c + r) % 2 === 0 ? 4 : 3);
      if (r === h - 1) shade = Math.min(shade, (c + r) % 2 === 0 ? 3 : 2);
      plot.set(c, y + r, 'plaster', shade);
    }
  }
  // Fresh-plaster patch, lit side.
  for (let attempt = 0; attempt < 20; attempt++) {
    const pw = int(rng, 4, 6);
    const ph = int(rng, 3, 4);
    const px = x + int(rng, 1, Math.max(1, Math.floor(w / 2) - pw));
    const py = y + ao + int(rng, 2, Math.max(2, h - ao - ph - 4));
    const cells: [number, number][] = [];
    for (let r = 0; r < ph; r++) for (let c = 0; c < pw; c++) cells.push([px + c, py + r]);
    if (!cells.every(([cx, cy]) => clear(cx, cy, 1))) continue;
    const cut = [rng() < 0.6, rng() < 0.6, rng() < 0.6, rng() < 0.6];
    for (const [cx, cy] of cells) {
      const corner =
        (cx === px && cy === py && cut[0]) ||
        (cx === px + pw - 1 && cy === py && cut[1]) ||
        (cx === px && cy === py + ph - 1 && cut[2]) ||
        (cx === px + pw - 1 && cy === py + ph - 1 && cut[3]);
      if (!corner) plot.set(cx, cy, 'plaster', 6);
    }
    break;
  }
  // Clay show-through: 3×2 or 2×2 with a 1-px rim, ≥ 4 px from any window.
  if (spec.clay ?? true) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const cw = int(rng, 2, 3);
      const cx = x + int(rng, Math.floor(w / 3), Math.max(Math.floor(w / 3), w - cw - 3));
      const cy = y + ao + int(rng, 3, Math.max(3, h - ao - 6));
      let ok = true;
      for (let r = -1; r <= 2 && ok; r++) for (let c = -1; c <= cw && ok; c++) ok = clear(cx + c, cy + r, 4);
      if (!ok) continue;
      for (let r = -1; r <= 2; r++) {
        for (let c = -1; c <= cw; c++) {
          const core = r >= 0 && r < 2 && c >= 0 && c < cw;
          const cornerOfRim = (r === -1 || r === 2) && (c === -1 || c === cw);
          if (core) plot.set(cx + c, cy + r, 'earth', 5);
          else if (!cornerOfRim && rng() < 0.75) plot.set(cx + c, cy + r, 'plaster', 3);
        }
      }
      break;
    }
  }
  // Hairline cracks, broken, 3–6 px; from a window corner when there is one.
  const cracks = w >= 40 ? 2 : 1;
  for (let k = 0; k < cracks; k++) {
    const win = avoid[k % Math.max(1, avoid.length)];
    let cx: number;
    let cy: number;
    let dx: number;
    if (win && k < avoid.length) {
      const fromBottom = rng() < 0.6;
      cx = fromBottom ? win.x + win.w : win.x - 1;
      cy = fromBottom ? win.y + win.h : win.y - 1;
      dx = fromBottom ? 1 : -1;
    } else {
      cx = x + int(rng, 3, w - 4);
      cy = y + ao + int(rng, 1, Math.max(1, h - ao - 8));
      dx = rng() < 0.5 ? -1 : 1;
    }
    const len = int(rng, 3, 6);
    for (let i = 0; i < len; i++) {
      const dy = fromTop(win, cy) ? -1 : 1;
      if (i === 0 || rng() > 0.25) {
        if (cx >= x && cx < x + w && cy >= y + ao && cy < y + h - 2 && clear(cx, cy, 0)) {
          const nearEdge = cy < y + ao + 2 || cx < x + 2 || cx >= x + w - 2;
          plot.set(cx, cy, 'plaster', nearEdge ? 2 : 3);
        }
      }
      if (rng() < 0.6) cx += dx;
      cy += dy;
    }
  }
}

/** Cracks from a window's top-left corner run up, from its bottom-right corner run down. */
const fromTop = (win: Rect | undefined, cy: number): boolean => win !== undefined && cy < win.y;

// ── pryzba ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Призьба: 4 rows, wall width + 1 px each side (caller passes that width). Top `#bd9a63`; two body rows `#9f7a48`
 * with irregular 1-px `#805d35` seams every 5–7 px; bottom `#634629`; the shaded right end one step darker.
 */
export function pryzbaBand(
  plot: Plot,
  spec: { readonly seed: string; readonly x: number; readonly y: number; readonly w: number },
): void {
  const rng = seededRng(`${spec.seed}:pryzba`);
  const { x, y, w } = spec;
  let nextSeam = x + int(rng, 3, 6);
  for (let c = x; c < x + w; c++) {
    const dark = (c - x) / (w - 1) > 0.8 ? 1 : 0;
    plot.set(c, y, 'earth', 5 - dark);
    plot.set(c, y + 1, 'earth', 4 - dark);
    plot.set(c, y + 2, 'earth', 4 - dark);
    plot.set(c, y + 3, 'earth', 2 - dark);
    if (c === nextSeam) {
      const rows = rng() < 0.65 ? [1, 2] : [rng() < 0.5 ? 1 : 2];
      for (const r of rows) plot.set(c, y + r, 'earth', 3 - dark);
      nextSeam += int(rng, 5, 7);
    }
  }
}

// ── window ───────────────────────────────────────────────────────────────────────────────────────────────────

export const WINDOW: Readonly<{ w: number; h: number }> = { w: 7, h: 8 };

/**
 * 7×8 window: frame `#774a28` with a lit `#966233` top and left edge; 5×6 glass `#21162a` split by `#57351f`
 * mullions, a 1-px `#7f7b90` reflection in the top-left pane; a 1-px `#cac4c6` sill below. The emissive plot gets the
 * glass minus mullions (`gold` 4).
 */
export function windowRecipe(plot: Plot, emissive: Plot | null, x: number, y: number): void {
  for (let r = 0; r < WINDOW.h; r++) {
    for (let c = 0; c < WINDOW.w; c++) {
      const border = r === 0 || c === 0 || r === WINDOW.h - 1 || c === WINDOW.w - 1;
      if (border) {
        plot.set(x + c, y + r, 'wood', r === 0 || c === 0 ? 3 : 2);
        continue;
      }
      const mullion = c === 3 || r === 3;
      if (mullion) {
        plot.set(x + c, y + r, 'wood', 1);
        continue;
      }
      plot.set(x + c, y + r, c === 1 && r === 1 ? 'plaster' : 'ink', 1);
      emissive?.set(x + c, y + r, 'gold', 4);
    }
  }
  for (let c = -1; c <= WINDOW.w; c++) plot.set(x + c, y + WINDOW.h, 'plaster', 3);
}

// ── grass ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Ground solid `#2a5931` mottled only with 2×1 / 3×1 `#1d3f2a` dashes (~15 %). */
export function grassGround(plot: Plot, area: Rect, seed: string): void {
  const rng = seededRng(`${seed}:ground`);
  for (let r = 0; r < area.h; r++) for (let c = 0; c < area.w; c++) plot.set(area.x + c, area.y + r, 'grass', 2);
  // Dashes until ~15 % of the ground is covered (overlaps don't count twice).
  const target = Math.round(area.w * area.h * 0.15);
  for (let covered = 0, guard = 0; covered < target && guard < 1000; guard++) {
    const len = int(rng, 2, 3);
    const dx = area.x + int(rng, 0, area.w - len);
    const dy = area.y + int(rng, 0, area.h - 1);
    for (let k = 0; k < len; k++) {
      if (plot.get(dx + k, dy)?.shade === 2) covered += 1;
      plot.set(dx + k, dy, 'grass', 1);
    }
  }
}

/**
 * Tuft: a fan of 1-px blades from one root row, centre tallest, each blade out 1 px shorter and leaning 1 px outward
 * at the top. Base `#1d3f2a`, body `#3f7535`, left/centre tips `#84ad45`, right tips stay `#3f7535`; `bright` puts
 * `#b3c95c` on the centre tip (≤ 1 per tuft).
 */
export function grassTuft(plot: Plot, cx: number, baseY: number, width: 3 | 5, height: 3 | 4, bright: boolean): void {
  const half = (width - 1) / 2;
  for (let o = -half; o <= half; o++) {
    const tall = height - Math.abs(o);
    for (let k = 0; k < tall; k++) {
      const tip = k === tall - 1;
      const px = cx + o + (tip && o !== 0 ? Math.sign(o) : 0);
      const shade = k === 0 ? 1 : tip ? (o < 0 ? 5 : o === 0 ? (bright ? 6 : 5) : 3) : 3;
      plot.set(px, baseY - k, 'grass', shade);
    }
  }
}

/** Grass tile: ground + `tufts` tufts on a loose 3×3 grid (±3 px jitter) + gold flower flecks. */
export function grassField(
  plot: Plot,
  area: Rect,
  seed: string,
  options: { tufts?: number; flecks?: number } = {},
): void {
  const rng = seededRng(`${seed}:field`);
  grassGround(plot, area, seed);
  const cells = Array.from({ length: 9 }, (_, i) => i);
  const count = Math.min(9, options.tufts ?? 7);
  // Deterministic shuffle, keep `count` cells.
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j] ?? 0, cells[i] ?? 0];
  }
  const cw = area.w / 3;
  const ch = area.h / 3;
  for (const cell of cells.slice(0, count).sort((a, b) => a - b)) {
    const cx = Math.round(area.x + (cell % 3) * cw + cw / 2) + int(rng, -3, 3);
    const by = Math.round(area.y + Math.floor(cell / 3) * ch + ch / 2) + int(rng, 0, 3);
    grassTuft(plot, cx, Math.min(area.y + area.h - 1, by), rng() < 0.5 ? 3 : 5, rng() < 0.5 ? 3 : 4, rng() < 0.5);
  }
  for (let i = 0; i < (options.flecks ?? 3); i++) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const fx = area.x + int(rng, 1, area.w - 2);
      const fy = area.y + int(rng, 1, area.h - 2);
      const under = plot.get(fx, fy);
      if (under && under.shade <= 2) {
        plot.set(fx, fy, 'gold', 4);
        break;
      }
    }
  }
}

// ── earth and path ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * Pebbles: mostly 2×1 / 1×1 `#a6a2b0` with a 1-px `#5b5770` shadow below-right; at most one rounded 3×2.
 * `free(x, y)` says where a pebble may go.
 */
export function pebbles(
  plot: Plot,
  area: Rect,
  seed: string,
  count: number,
  free: (x: number, y: number) => boolean = () => true,
): void {
  const rng = seededRng(`${seed}:pebbles`);
  let round = rng() < 0.6;
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 15; attempt++) {
      const big = round;
      const len = big ? 3 : rng() < 0.6 ? 2 : 1;
      const px = area.x + int(rng, 0, area.w - len - 2);
      const py = area.y + int(rng, 0, area.h - (big ? 3 : 2));
      let ok = true;
      for (let r = 0; r <= (big ? 2 : 1) && ok; r++) for (let c = 0; c <= len && ok; c++) ok = free(px + c, py + r);
      if (!ok) continue;
      if (big) {
        // plaster: 0 #5b5770, 1 #7f7b90, 2 #a6a2b0, 3 #cac4c6
        plot.set(px + 1, py, 'plaster', 3);
        plot.set(px + 2, py, 'plaster', 2);
        plot.set(px, py + 1, 'plaster', 2);
        plot.set(px + 1, py + 1, 'plaster', 2);
        plot.set(px + 2, py + 1, 'plaster', 1);
        for (let c = 1; c <= 3; c++) plot.set(px + c, py + 2, 'plaster', 0);
        round = false;
      } else {
        for (let c = 0; c < len; c++) plot.set(px + c, py, 'plaster', 2);
        for (let c = 1; c <= len; c++) plot.set(px + c, py + 1, 'plaster', 0);
      }
      break;
    }
  }
}

export interface PathSpec extends Rect {
  readonly seed: string;
  /** Rut rows (offsets from the path top). */
  readonly ruts: readonly number[];
  /** Grass on the top / bottom edge, biting 1–3 px into the path (default both). */
  readonly grass?: { readonly top: number; readonly bottom: number };
}

/**
 * Path: packed earth `#9f7a48` with soft `#805d35` / `#bd9a63` blotches (no speckle), ruts 1–2 px `#634629` wavering
 * ±1 px every 6–8 px with a 1-px `#bd9a63` lip above, broken for 2–3 px every 10–15 px; grass edges biting 1–3 px in.
 */
export function pathField(plot: Plot, spec: PathSpec): void {
  const rng = seededRng(`${spec.seed}:path`);
  const s = seedOf(spec.seed);
  const { x, y, w, h } = spec;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const n = valueNoise(x + c, y + r, 9, 4, s);
      plot.set(x + c, y + r, 'earth', n > 0.74 ? 3 : n < 0.14 ? 5 : 4);
    }
  }
  for (const rut of spec.ruts) {
    let offset = 0;
    let nextWave = x + int(rng, 6, 8);
    let nextBreak = x + int(rng, 4, 12);
    let thick = int(rng, 1, 2);
    for (let c = x; c < x + w; c++) {
      if (c === nextWave) {
        offset = Math.max(-1, Math.min(1, offset + (rng() < 0.5 ? -1 : 1)));
        thick = int(rng, 1, 2);
        nextWave += int(rng, 6, 8);
      }
      if (c >= nextBreak) {
        const gap = int(rng, 2, 3);
        if (c < nextBreak + gap) continue;
        nextBreak += gap + int(rng, 10, 15);
      }
      const ry = y + rut + offset;
      plot.set(c, ry - 1, 'earth', 5);
      for (let t = 0; t < thick; t++) plot.set(c, ry + t, 'earth', 2);
    }
  }
  const edges = spec.grass ?? { top: 3, bottom: 3 };
  const edge = (fromTop: boolean, depth: number): void => {
    if (depth <= 0) return;
    let bite = int(rng, 1, 3);
    let next = x + int(rng, 1, 3);
    for (let c = x; c < x + w; c++) {
      if (c === next) {
        bite = int(rng, 1, 3);
        next += int(rng, 1, 3);
      }
      const d = depth + bite - 1;
      for (let k = 0; k < d; k++) {
        const ry = fromTop ? y + k : y + h - 1 - k;
        const rim = k === d - 1;
        // Top grass: dark shadow edge where it overhangs the path; bottom grass: lit top edge.
        const shade = rim ? (fromTop ? 1 : 3) : (c + k) % 7 === 0 ? 1 : 2;
        plot.set(c, ry, 'grass', shade);
      }
    }
  };
  edge(true, edges.top);
  edge(false, edges.bottom);
}

// ── wattle fence (тин) and pot (глечик) ──────────────────────────────────────────────────────────────────────

export interface WattleSpec {
  readonly seed: string;
  readonly x: number;
  readonly w: number;
  /** Ground row (stakes stand on it). */
  readonly ground: number;
  /** Top row of the first rod. */
  readonly topRod: number;
  readonly rods: number;
  /** Fixed rise above the top rod for stake `index` (e.g. the stake that carries a pot). */
  readonly rise?: Readonly<Record<number, number>>;
}

export interface Stake {
  readonly x: number;
  readonly top: number;
}

/**
 * Тин: 2-px stakes every 8–10 px (lit left `#966233`, dark right `#57351f`) rising 3–7 px above the top rod to a 1-px
 * point; 2-px rods (top `#b37d42` near the stake they pass in front of, `#966233` near the one they pass behind;
 * bottom `#774a28`) over `#3b2419` gap rows. Over/under: rod `k` passes in front of stake `i` when (k + i) is even
 * and swaps each row; in front it covers the stake and darkens the stake px above/below, behind it breaks 1 px
 * before the stake. 1-px sag mid-segment.
 */
export function wattle(plot: Plot, spec: WattleSpec): readonly Stake[] {
  const rng = seededRng(`${spec.seed}:wattle`);
  const { x, w, ground, topRod, rods } = spec;
  const stakes: Stake[] = [];
  for (let sx = x + int(rng, 1, 2); sx + 1 < x + w; sx += int(rng, 8, 10)) {
    const rise = spec.rise?.[stakes.length] ?? int(rng, 3, 7);
    stakes.push({ x: sx, top: topRod - rise });
  }
  const rowOf = (k: number): number => topRod + 3 * k;
  // Gap rows behind everything.
  for (let k = 0; k < rods - 1; k++) for (let c = x; c < x + w; c++) plot.set(c, rowOf(k) + 2, 'wood', 0);
  // Stakes, intact.
  for (const st of stakes) {
    const tipLeft = rng() < 0.5;
    for (let y = st.top; y < ground; y++) {
      if (y === st.top) {
        plot.set(tipLeft ? st.x : st.x + 1, y, 'wood', tipLeft ? 3 : 1);
        continue;
      }
      plot.set(st.x, y, 'wood', 3);
      plot.set(st.x + 1, y, 'wood', 1);
    }
  }
  const stakeAt = (c: number): number => stakes.findIndex((st) => c === st.x || c === st.x + 1);
  for (let k = 0; k < rods; k++) {
    const y0 = rowOf(k);
    const front = (i: number): boolean => (k + i) % 2 === 0;
    for (let c = x; c < x + w; c++) {
      const on = stakeAt(c);
      if (on >= 0) {
        if (!front(on)) continue; // behind: the stake stays intact
        const st = stakes[on];
        plot.set(c, y0, 'wood', 4);
        plot.set(c, y0 + 1, 'wood', 2);
        if (st) {
          for (const yy of [y0 - 1, y0 + 2]) {
            if (yy >= st.top && yy < ground) plot.set(c, yy, 'wood', c === st.x ? 2 : 0);
          }
        }
        continue;
      }
      // Between stakes: which stake is left / right of this column?
      let li = -1;
      for (let i = 0; i < stakes.length; i++) if ((stakes[i]?.x ?? 0) < c) li = i;
      const ri = li + 1 < stakes.length ? li + 1 : -1;
      const ls = li >= 0 ? stakes[li] : undefined;
      const rs = ri >= 0 ? stakes[ri] : undefined;
      // Behind a neighbouring stake: break 1 px before it.
      if ((ls && c === ls.x + 2 && !front(li)) || (rs && c === rs.x - 1 && !front(ri))) {
        plot.set(c, y0, 'wood', 0);
        plot.set(c, y0 + 1, 'wood', 0);
        continue;
      }
      const a = ls ? ls.x + 2 : x - 1;
      const b = rs ? rs.x - 1 : x + w;
      const t = (c - a) / Math.max(1, b - a);
      const sag = ls !== undefined && rs !== undefined && t > 1 / 3 && t < 2 / 3 ? 1 : 0;
      const nearLeft = t < 0.5;
      const nearIndex = nearLeft ? li : ri;
      const lit = nearIndex >= 0 ? front(nearIndex) : true;
      if (sag) plot.set(c, y0, 'wood', 0);
      plot.set(c, y0 + sag, 'wood', lit ? 4 : 3);
      plot.set(c, y0 + 1 + sag, 'wood', 2);
    }
  }
  return stakes;
}

/** Глечик rows, top → bottom as hung upside down: foot, taper ×2, shoulder ×3, neck ×2, rim (widths). */
const POT_ROWS = [3, 5, 5, 7, 7, 7, 3, 3, 5] as const;
export const POT_HEIGHT = POT_ROWS.length;

/**
 * Clay pot hung upside down on a stake top, 7×9: body `#9f7a48`, upper-left highlight `#bd9a63`, right side
 * `#634629`, outline `#47321f`, a `#805d35` glaze band; the rim (bottom row) sits on the stake top at `top + 8`.
 */
export function glechyk(plot: Plot, cx: number, top: number): void {
  const inMask = (c: number, r: number): boolean => {
    const width = POT_ROWS[r];
    return width !== undefined && Math.abs(c - cx) <= (width - 1) / 2;
  };
  POT_ROWS.forEach((width, r) => {
    const half = (width - 1) / 2;
    for (let c = cx - half; c <= cx + half; c++) {
      const edge = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ].some(([dx, dy]) => !inMask(c + (dx ?? 0), r + (dy ?? 0)));
      let shade = 4;
      if (r === POT_ROWS.length - 1) shade = c === cx - half || c === cx + half ? 1 : 2;
      else if (edge) shade = 1;
      else if (c >= cx + 2) shade = 2;
      else if (r === 4) shade = 3;
      else if (r >= 1 && r <= 3 && c <= cx - 1) shade = 5;
      plot.set(c, top + r, 'earth', shade);
    }
  });
}

// ── khata tier extras (modest) ───────────────────────────────────────────────────────────────────────────────

/** Рушник draped over a window: a white towel across the frame top, ends hanging both sides, red embroidery. */
export function rushnyk(plot: Plot, win: Rect): void {
  const y = win.y - 1;
  for (let c = win.x - 1; c <= win.x + win.w; c++) plot.set(c, y, 'plaster', 6);
  for (let c = win.x + 1; c < win.x + win.w; c += 2) plot.set(c, y, 'crimson', 3);
  for (const c of [win.x - 1, win.x + win.w]) {
    for (let r = 1; r <= 5; r++)
      plot.set(c, y + r, r % 2 === 0 ? 'crimson' : 'plaster', r % 2 === 0 ? 3 : c < win.x ? 6 : 4);
    plot.set(c, y + 6, 'crimson', 2);
  }
}

/** Whitewashed chimney through the thatch: lit left column, shaded right, a sooty top. */
export function chimney(plot: Plot, x: number, top: number, height: number): void {
  for (let r = 0; r < height; r++) {
    plot.set(x, top + r, 'plaster', r === 0 ? 3 : 5);
    plot.set(x + 1, top + r, 'plaster', r === 0 ? 2 : 4);
    plot.set(x + 2, top + r, 'plaster', r === 0 ? 1 : 2);
  }
  plot.set(x + 1, top - 1, 'earth', 1);
}

/** Мальва: a 1-px stalk with leaves and blossoms on alternating sides toward the top. */
export function mallow(plot: Plot, x: number, ground: number, height: number): void {
  for (let k = 0; k < height; k++) plot.set(x, ground - k, 'grass', 3);
  plot.set(x - 1, ground - 2, 'grass', 2);
  plot.set(x + 1, ground - 4, 'grass', 2);
  for (let k = height - 5; k < height; k += 2) {
    plot.set(x - 1, ground - k, 'crimson', 4);
    plot.set(x + 1, ground - k - 1, 'crimson', 3);
  }
  plot.set(x, ground - height, 'crimson', 5);
}
