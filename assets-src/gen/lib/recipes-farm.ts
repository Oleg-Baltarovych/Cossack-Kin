// Farm recipes (plan M2-06, ART-BIBLE §5–6): the wheat field, garden beds, log hives and their add-ons. Like
// recipes.ts, every builder plots exact ramp steps per px (light baked top-left), so parts are composed with the light
// and AO passes off. Randomness only from position hashes (`rand2`) or `seededRng(<seed>:<builder>)`; no trig.
import type { IndexBuffer } from './buffer.ts';
import { rand2, seedOf, valueNoise } from './noise.ts';
import { compose, type Part, type RampSize } from './passes.ts';
import { Plot } from './plot.ts';

/** Composes recipe parts: baked light, a coloured outer outline that vanishes on the lit (top-left) side. */
export function composeOutlined(
  buf: IndexBuffer,
  parts: readonly Part[],
  rampSize: RampSize,
  options: {
    readonly emissive?: IndexBuffer;
    readonly outlineParts?: readonly number[];
    /** Outline steps below the neighbour (default 2; 1 keeps busy multi-material plots inside the colour budget). */
    readonly drop?: number;
  } = {},
): void {
  compose(buf, parts, rampSize, {
    light: false,
    occlusion: false,
    outline: {
      mode: 'outer',
      drop: options.drop ?? 2,
      ...(options.outlineParts ? { parts: options.outlineParts } : {}),
    },
    selective: { lit: 'vanish' },
    ...(options.emissive ? { emissive: options.emissive } : {}),
  });
}

// ── wheat field ──────────────────────────────────────────────────────────────────────────────────────────────

export type Crop = 'sprout' | 'green' | 'ripe';

export interface FieldSpec {
  readonly seed: string;
  /** Left end and width of the field. */
  readonly x: number;
  readonly w: number;
  /** Front soil row (the field's ground row). */
  readonly ground: number;
  /** Soil rows from the back edge to the front row. */
  readonly depth: number;
  readonly crop: Crop;
  /** Crop rows above the soil's back edge (green / ripe). */
  readonly height: number;
  /** Share of the width, from the right, already reaped (stubble). */
  readonly mown?: number;
  /** Poppies and cornflowers at the foot of the crop. */
  readonly flowers?: boolean;
  /** Gold glints on the ears (the top tier's accent). */
  readonly gold?: boolean;
}

/** Where the standing crop ends (exclusive x): the reaped strip starts there. */
export interface FieldInfo {
  readonly standX1: number;
}

/** Soil rows per furrow: a lit ridge top, the ridge, a dark furrow line. */
const FURROW = 3;

/**
 * Ploughed soil seen from the side, furrows running along the view (FURROW rows each): the ridge top earth 4 (the lit
 * left end earth 5), the ridge earth 3, a dark furrow line earth 1; the front row earth 2 with earth 1 clods; the back
 * corners rounded. Sprouts (`sprout`): tufts 2–4 px tall every 3–4 px on each ridge top (grass 3 foot, grass 4, a
 * grass 5 tip).
 */
function soil(plot: Plot, spec: FieldSpec, sprouts: boolean): void {
  const s = seedOf(`${spec.seed}:soil`);
  const back = spec.ground - spec.depth + 1;
  for (let y = back; y <= spec.ground; y++) {
    const r = (y - back) % FURROW;
    for (let c = spec.x; c < spec.x + spec.w; c++) {
      if (y === back && (c === spec.x || c === spec.x + spec.w - 1)) continue;
      const lit = c - spec.x < 3;
      let shade = r === 0 ? (lit ? 5 : 4) : r === 1 ? 3 : 1;
      if (y === spec.ground) shade = rand2(c, y, s) < 0.25 ? 1 : 2;
      else if (r === 0 && !lit && rand2(c, y, s) < 0.12) shade = 3;
      plot.set(c, y, 'earth', shade);
    }
  }
  if (!sprouts) return;
  for (let y = back; y < spec.ground; y += FURROW) {
    for (let c = spec.x + 2 + ((y - back) % 2); c < spec.x + spec.w - 2; c += 3 + Math.floor(rand2(c, y, s + 1) * 2)) {
      const h = 2 + Math.floor(rand2(c, y, s + 2) * 3);
      for (let k = 0; k < h; k++) plot.set(c, y - k, 'grass', k === h - 1 ? 5 : k === 0 ? 3 : 4);
      if (h > 2) plot.set(c - 1, y - 1, 'grass', 3);
    }
  }
}

/**
 * Wheat field (пшеничне поле): ploughed soil and, for `green`/`ripe`, rows of standing wheat on the ridges, back to
 * front — each nearer row hides the stalks of the one behind, so the field reads as bands of ears receding in depth
 * (more soil rows = more bands = a taller field). Ripe ears are kept dark-warm (thatch 2, a thatch 3 glint at most 1 in
 * 6) so the night grade does not turn the field white; between ear tufts the top 3 rows are a 50 % checker of thatch 1
 * and earth 1. The left end lit, the right end — and the cut face of a half-reaped field — shaded; the reaped part
 * shows stubble. Ripe = thatch, green = grass.
 */
export function wheatField(plot: Plot, spec: FieldSpec): FieldInfo {
  soil(plot, spec, spec.crop === 'sprout');
  const standW = spec.crop === 'sprout' ? 0 : Math.round(spec.w * (1 - (spec.mown ?? 0)));
  const standX1 = spec.x + standW;
  const back = spec.ground - spec.depth + 1;
  const s = seedOf(`${spec.seed}:crop`);
  const green = spec.crop === 'green';
  const ramp = green ? 'grass' : 'thatch';
  const tone = green
    ? { ear: 5, glint: 6, body: 4, stroke: 3, foot: 3, footStroke: 2, gap: 2 }
    : { ear: 2, glint: 3, body: 2, stroke: 1, foot: 1, footStroke: 0, gap: 1 };
  const cut = (spec.mown ?? 0) > 0;
  const rows: number[] = [];
  for (let y = spec.ground - 1; y > back; y -= FURROW) rows.unshift(y);
  if (standW > 0) {
    rows.forEach((base, j) => {
      const front = j === rows.length - 1;
      // Ragged row ends; a reaped field keeps a straight cut face on the right.
      const x0 = spec.x + Math.floor(rand2(j, 0, s + 7) * 3);
      const x1 = cut ? standX1 : standX1 - Math.floor(rand2(j, 1, s + 7) * 3);
      for (let c = x0; c < x1; c++) {
        const fromL = c - x0;
        const fromR = x1 - 1 - c;
        const taper = Math.max(0, 2 - fromL, cut ? 0 : 2 - fromR);
        const r = rand2(c, base, s);
        const jitter = r < 0.2 ? -1 : r > 0.85 ? 1 : 0;
        const wave = Math.round(valueNoise(c, j, 7, 1, s) * 2) - 1;
        const top = base - (spec.height + jitter + wave - taper);
        const strokeCol = rand2(c, j, s + 3) < 0.34;
        // Ear tufts 2 px wide with a 1-px gap: the gap's top 3 rows are a checker of crop shade and soil.
        const gapCol = (c + j) % 3 === 2;
        const side = fromL < 2 ? 1 : fromR < 2 ? -1 : 0;
        for (let y = top; y <= base; y++) {
          const k = y - top;
          if (gapCol && k <= 2) {
            if ((c + y) % 2 === 0) plot.set(c, y, ramp, tone.gap);
            else if (k > 0) plot.set(c, y, 'earth', 1);
            continue;
          }
          let shade: number;
          if (k <= 1) shade = k === 0 && rand2(c, y, s + 8) < 1 / 6 ? tone.glint : tone.ear;
          else if (front && y >= spec.ground - 2) shade = strokeCol ? tone.footStroke : tone.foot;
          else shade = strokeCol ? tone.stroke : tone.body;
          if (k > 1 && !front) shade -= 1;
          // The lit left end may brighten the ears by one step; the shaded right end only darkens.
          const lift = k <= 1 ? side : Math.min(0, side);
          plot.set(c, y, ramp, Math.max(0, Math.min(6, shade + lift)));
          if (spec.gold && k === 0 && rand2(c, y, s + 4) < 1 / 6) plot.set(c, y, 'gold', side < 0 ? 2 : 3);
        }
      }
    });
  }
  // Stubble on the reaped ridge tops: short straw stumps (thatch 1, the stump's top thatch 2/3).
  for (let y = back; y < spec.ground; y += FURROW) {
    for (let c = standX1 + 1 + ((y - back) % 2); c < spec.x + spec.w - 1; c += 2) {
      plot.set(c, y, 'thatch', 1);
      plot.set(c, y - 1, 'thatch', rand2(c, y, s + 6) < 0.3 ? 3 : 2);
    }
  }
  if (spec.flowers && standW > 0) fieldFlowers(plot, spec.x + 3, standX1 - 3, spec.ground - 1, `${spec.seed}:flowers`);
  return { standX1 };
}

/** Poppies (crimson 4, a crimson 2 under-right) and cornflowers (cloth 3) at the crop's foot, ~1 per 6 px. */
function fieldFlowers(plot: Plot, x0: number, x1: number, y: number, seed: string): void {
  const s = seedOf(seed);
  for (let c = x0; c < x1; c += 5 + Math.floor(rand2(c, 0, s) * 3)) {
    const fy = y - Math.floor(rand2(c, 1, s) * 3);
    if (rand2(c, 2, s) < 0.7) {
      plot.set(c, fy, 'crimson', 4);
      plot.set(c + 1, fy + 1, 'crimson', 2);
    } else plot.set(c, fy, 'cloth', 3);
  }
}

/** «Борода» rows top → foot: [first, last] column offsets from the centre (fanned ears, the tie, the flared foot). */
const BORODA_ROWS: readonly (readonly [number, number])[] = [
  [-2, -2],
  [-3, 2],
  [-3, 3],
  [-2, 3],
  [-2, 2],
  [-1, 2],
  [-1, 1],
  [0, 1], // tie
  [0, 1], // tie
  [-1, 1],
  [-1, 2],
  [-2, 1],
  [-2, 2],
];
const BORODA_TIE = 7;

/**
 * «Борода» — the last tuft of wheat left uncut in a reaped field, bound with a ribbon (a harvest custom): ears fanned
 * 5–6 px wide at the top, pinched to 2 px at a 2-row crimson tie, flaring to 4 px at the foot; ragged sides (13 rows +
 * single ear tips). Ears thatch 3 (lit) / 2; stalks thatch 2 / 1; tie crimson 4 / 2.
 */
export function boroda(plot: Plot, cx: number, ground: number): void {
  const top = ground - BORODA_ROWS.length + 1;
  plot.set(cx - 1, top - 1, 'thatch', 3);
  plot.set(cx + 2, top - 1, 'thatch', 2);
  BORODA_ROWS.forEach(([a, b], r) => {
    const y = top + r;
    for (let d = a; d <= b; d++) {
      if (r === BORODA_TIE || r === BORODA_TIE + 1) {
        plot.set(cx + d, y, 'crimson', d === a ? 4 : 2);
        continue;
      }
      const ear = r < 5;
      if (ear && (d + r) % 3 === 2 && d !== a && d !== b) continue; // gaps between ears
      const lit = d < 0;
      plot.set(cx + d, y, 'thatch', ear ? (lit ? 3 : 2) : lit ? 2 : 1);
    }
  });
}

// ── sheaves, stooks ──────────────────────────────────────────────────────────────────────────────────────────

/** Widths of a stook (копа) from the top row down. */
const STOOK_ROWS = [2, 3, 4, 5, 5, 6, 6, 7, 7, 8, 8, 8] as const;

/**
 * A stook of sheaves (копа): a bundle widening toward the foot, ears on top (thatch 4, lit left; kept below the night-white range), stalk strokes in
 * the body (thatch 3 / 2), the right side shaded, a thatch 1 binding band; `h` = rows used from the top of the table.
 */
export function stook(plot: Plot, cx: number, ground: number, h: number): void {
  const rows = STOOK_ROWS.slice(STOOK_ROWS.length - h);
  const top = ground - rows.length + 1;
  rows.forEach((w, r) => {
    const x0 = cx - Math.floor(w / 2);
    for (let c = x0; c < x0 + w; c++) {
      const u = (c - x0) / Math.max(1, w - 1);
      let shade: number;
      if (r < 3) shade = u < 0.5 ? 4 - (r === 2 ? 1 : 0) : 3;
      else shade = (c - cx) % 2 === 0 ? (u < 0.4 ? 4 : 3) : u < 0.6 ? 3 : 2;
      if (u > 0.8) shade = Math.min(shade, 2);
      if (r === Math.floor(rows.length / 2)) shade = u < 0.3 ? 2 : 1;
      plot.set(c, top + r, 'thatch', shade);
    }
  });
}

// ── garden ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A raised bed (грядка) running along the view: `rows` rows of dug earth (a highlight top row earth 5 lit / earth 4, then earth 3,
 * the foot earth 2), rounded ends, an earth 1 furrow row in front.
 */
export function bed(plot: Plot, x: number, w: number, ground: number, rows = 3): void {
  for (let r = 0; r < rows; r++) {
    const y = ground - rows + r;
    const inset = r === 0 ? 1 : 0;
    for (let c = x + inset; c < x + w - inset; c++) {
      const lit = c - x < w / 3;
      plot.set(c, y, 'earth', r === 0 ? (lit ? 5 : 4) : r === rows - 1 ? 2 : (c + r) % 5 === 0 ? 2 : 3);
    }
  }
  for (let c = x; c < x + w; c++) plot.set(c, ground, 'earth', 1);
}

/** Head of cabbage (капуста), 5×4: grass 5 lit top-left leaves, grass 4 body, grass 3 shaded right/foot, a grass 6 heart. */
export function cabbage(plot: Plot, cx: number, ground: number): void {
  const rows: readonly (readonly [number, number])[] = [
    [-1, 1],
    [-2, 2],
    [-2, 2],
    [-1, 1],
  ];
  rows.forEach(([a, b], r) => {
    for (let d = a; d <= b; d++) {
      const shade = r === 3 || d === b ? 3 : d < 0 && r < 2 ? 5 : 4;
      plot.set(cx + d, ground - 3 + r, 'grass', shade);
    }
  });
  plot.set(cx, ground - 2, 'grass', 5);
}

/** Onions/garlic: a pair of 1-px leaves 4–5 px tall (grass 4, grass 5 tips), slightly splayed. */
export function onion(plot: Plot, cx: number, ground: number, s: number): void {
  const h = 4 + (rand2(cx, ground, s) < 0.5 ? 1 : 0);
  for (let k = 0; k < h; k++) {
    plot.set(cx + (k > 2 ? -1 : 0), ground - k, 'grass', k === h - 1 ? 5 : 4);
    if (k < h - 1) plot.set(cx + 1 + (k > 2 ? 1 : 0), ground - k, 'grass', k === h - 2 ? 4 : 3);
  }
}

/** Beet (буряк): a crimson-veined leaf tuft 3 px tall with a crimson 2 crown at the soil. */
export function beet(plot: Plot, cx: number, ground: number): void {
  plot.set(cx, ground, 'crimson', 2);
  plot.set(cx + 1, ground, 'crimson', 1);
  plot.set(cx - 1, ground - 1, 'grass', 4);
  plot.set(cx, ground - 1, 'crimson', 3);
  plot.set(cx + 1, ground - 1, 'grass', 3);
  plot.set(cx - 1, ground - 2, 'grass', 5);
  plot.set(cx + 1, ground - 2, 'grass', 4);
  plot.set(cx, ground - 3, 'grass', 4);
}

/**
 * Pumpkin (гарбуз), 7×5 with leaves either side: gold 3 body, gold 4 lit upper-left, gold 2 shaded right and foot,
 * gold 2 ribs, a grass 2 stem.
 */
export function pumpkin(plot: Plot, cx: number, ground: number): void {
  plot.set(cx - 5, ground, 'grass', 3);
  plot.set(cx - 4, ground - 1, 'grass', 4);
  plot.set(cx - 4, ground, 'grass', 3);
  plot.set(cx + 4, ground, 'grass', 2);
  plot.set(cx + 5, ground - 1, 'grass', 3);
  const rows: readonly (readonly [number, number])[] = [
    [-2, 2],
    [-3, 3],
    [-3, 3],
    [-3, 3],
    [-2, 2],
  ];
  rows.forEach(([a, z], r) => {
    for (let d = a; d <= z; d++) {
      let shade = 3;
      if (d === -2 || d === 2) shade = 2;
      if (d < 0 && r < 2 && d !== -2) shade = 4;
      if (d >= 2 || r === 4) shade = 2;
      plot.set(cx + d, ground - 4 + r, 'gold', shade);
    }
  });
  plot.set(cx, ground - 5, 'grass', 2);
  plot.set(cx + 1, ground - 6, 'grass', 3);
}

/**
 * Beans on poles (квасоля на тичках): pairs of 1-px poles (wood 3 lit / wood 2) leaning into a teepee `h` tall, a vine
 * winding up each (grass 3/4 px on alternating sides, grass 5 leaf tips) with a few crimson 3 blossoms.
 */
export function beanPoles(plot: Plot, cx: number, ground: number, h: number, s: number): void {
  for (const side of [-1, 1] as const) {
    for (let k = 0; k < h; k++) {
      const x = cx + side * (2 - Math.floor((k * 2) / h));
      plot.set(x, ground - k, 'wood', side < 0 ? 3 : 2);
      if (k > 1 && k < h - 1 && k % 2 === (side < 0 ? 0 : 1)) {
        const vx = x + (k % 4 < 2 ? -side : side);
        plot.set(vx, ground - k, 'grass', rand2(vx, k, s) < 0.3 ? 5 : side < 0 ? 4 : 3);
        if (rand2(vx, k, s + 1) < 0.18) plot.set(vx, ground - k - 1, 'crimson', 3);
      }
    }
  }
  plot.set(cx, ground - h, 'wood', 3);
}

/** Чорнобривці (marigolds): a front border of 3×2 clumps — grass 3 leaves, gold 4/3 and gold 2 heads. */
export function marigolds(plot: Plot, x0: number, x1: number, ground: number, s: number): void {
  for (let c = x0; c < x1; c += 4) {
    plot.set(c, ground, 'grass', 3);
    plot.set(c + 1, ground, 'grass', 2);
    plot.set(c, ground - 1, 'gold', rand2(c, 0, s) < 0.5 ? 4 : 3);
    plot.set(c + 1, ground - 1, 'gold', 2);
    if (rand2(c, 1, s) < 0.5) plot.set(c - 1, ground - 1, 'gold', 3);
  }
}

/**
 * Погріб: a grassed earth mound (half ellipse w × h; grass 4 lit top-left, grass 3, grass 2 shaded right) with a plank
 * door in a wood frame at its front, a tiny ridge board over it.
 */
export function cellarMound(plot: Plot, cx: number, ground: number, w: number, h: number): void {
  const rx = w / 2;
  for (let y = ground - h + 1; y <= ground; y++) {
    const v = (ground + 1 - y) / h;
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - v * v)));
    for (let c = cx - half; c <= cx + half; c++) {
      const u = (c - cx) / Math.max(1, half);
      const shade = y === ground ? 2 : u < -0.2 && v > 0.5 ? 5 : u < 0.35 ? 4 : 3;
      plot.set(c, y, 'grass', y === ground - h + 1 ? 4 : u > 0.75 ? 2 : shade);
    }
  }
  // Door: 5×6 frame, planks, an iron-dark latch.
  const dx = cx - 2;
  const top = ground - 6;
  for (let y = top; y <= ground; y++) {
    for (let c = dx - 1; c <= dx + 5; c++) {
      const frame = c === dx - 1 || c === dx + 5 || y === top;
      plot.set(c, y, 'wood', frame ? (c === dx - 1 || y === top ? 4 : 2) : c % 2 === 0 ? 3 : 2);
    }
  }
  plot.set(dx + 3, top + 3, 'wood', 1);
  for (let c = dx - 2; c <= dx + 6; c++) plot.set(c, top - 1, 'wood', c < cx ? 4 : 2);
}

/**
 * Small garden sunflower: a 1-px stem (grass 3) with two leaves, a 5×5 head — a 3×3 dark centre (earth 1)
 * in a ring of petals (gold 4 lit top-left, gold 3, gold 2 shaded), corners open.
 */
export function gardenSunflower(plot: Plot, x: number, ground: number, height: number): void {
  for (let k = 0; k < height; k++) plot.set(x, ground - k, 'grass', k < 2 ? 2 : 3);
  plot.set(x - 1, ground - 5, 'grass', 4);
  plot.set(x - 2, ground - 6, 'grass', 4);
  plot.set(x + 1, ground - 9, 'grass', 3);
  plot.set(x + 2, ground - 10, 'grass', 3);
  const cy = ground - height - 2;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;
      const inner = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
      if (inner) plot.set(x + dx, cy + dy, 'earth', 1);
      else plot.set(x + dx, cy + dy, 'gold', dx + dy < 0 ? 4 : dx + dy > 1 ? 2 : 3);
    }
  }
}

/** A crimson рушник tie round a 2-px post at row y: a 2-px knot (crimson 3 lit / crimson 2), a 3-px end hanging right. */
export function postTie(plot: Plot, x: number, y: number): void {
  plot.set(x, y, 'crimson', 3);
  plot.set(x + 1, y, 'crimson', 2);
  plot.set(x, y + 1, 'crimson', 3);
  plot.set(x + 1, y + 1, 'crimson', 2);
  plot.set(x + 2, y + 1, 'crimson', 3);
  plot.set(x + 2, y + 2, 'crimson', 2);
  plot.set(x + 3, y + 3, 'crimson', 2);
}

/** A squared post (wood 4 lit left / wood 2), `h` tall, a wood 4/3 cap. */
export function post(plot: Plot, x: number, ground: number, h: number): void {
  for (let k = 0; k < h; k++) {
    plot.set(x, ground - k, 'wood', 4);
    plot.set(x + 1, ground - k, 'wood', 2);
  }
  plot.set(x, ground - h, 'wood', 4);
  plot.set(x + 1, ground - h, 'wood', 3);
}

// ── apiary ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Flower meadow (луг з квітами) for the bees: the ground stays the tile's grass; this plots clover and wildflower
 * tufts over a w × depth patch — grass 4/5 leaves, thatch 6 (white) / crimson 4 clover heads, gold 4 dots (~1 per 9 px²).
 */
export function flowerPatch(plot: Plot, x: number, w: number, ground: number, depth: number, seed: string): void {
  const s = seedOf(`${seed}:meadow`);
  for (let y = ground - depth + 1; y <= ground; y++) {
    for (let c = x; c < x + w; c++) {
      const r = rand2(c, y, s);
      // Elliptic patch: fewer flowers toward the ends.
      const u = (c - x - w / 2) / (w / 2);
      const v = (ground - y - depth / 2) / (depth / 2 + 0.5);
      if (u * u + v * v > 1) continue;
      if (r < 0.05) {
        plot.set(c, y, 'grass', 4);
        plot.set(c, y - 1, 'thatch', 6);
      } else if (r < 0.09) {
        plot.set(c, y, 'grass', 4);
        plot.set(c, y - 1, 'crimson', 4);
      } else if (r < 0.12) plot.set(c, y, 'gold', 4);
      else if (r < 0.2) plot.set(c, y, 'grass', r < 0.16 ? 5 : 4);
    }
  }
}

/** A stump (пень) seen from the side: wood 3 bark with a lit left edge, a wood 5 / wood 6 ring-cut top. */
export function stump(plot: Plot, cx: number, ground: number, w: number, h: number): void {
  const x0 = cx - Math.floor(w / 2);
  for (let k = 0; k < h; k++) {
    for (let c = x0 - (k === 0 ? 1 : 0); c < x0 + w + (k === 0 ? 1 : 0); c++) {
      const u = (c - x0) / Math.max(1, w - 1);
      plot.set(c, ground - k, 'wood', u < 0.25 ? 4 : u > 0.7 ? 2 : 3);
    }
  }
  for (let c = x0; c < x0 + w; c++) plot.set(c, ground - h, 'wood', c === x0 + 1 ? 6 : 5);
}

/** A bench (лава): a w-px plank (wood 4 top, wood 2 edge) on two legs 3 px tall. */
export function bench(plot: Plot, x: number, ground: number, w: number): void {
  for (let c = x; c < x + w; c++) {
    plot.set(c, ground - 4, 'wood', 4);
    plot.set(c, ground - 3, 'wood', 2);
  }
  for (const lx of [x + 2, x + w - 3]) for (let k = 0; k < 3; k++) plot.set(lx, ground - k, 'wood', 1);
}

/**
 * A курінь shelter (шалаш): an A-frame of reeds `w` wide, `h` tall — the lit left slope thatch 4/5 strands, the
 * shaded right thatch 2/3, a dark wood 1 opening in the middle of the front, the ridge poles crossing above.
 */
export function shelter(plot: Plot, cx: number, ground: number, w: number, h: number): void {
  const half = w / 2;
  for (let k = 0; k < h; k++) {
    const y = ground - k;
    const span = Math.round(half * (1 - k / h));
    for (let c = cx - span; c <= cx + span; c++) {
      const left = c < cx;
      const strand = (c + (left ? k : -k)) % 3 === 0;
      let shade = left ? (strand ? 5 : 4) : strand ? 2 : 3;
      if (c === cx) shade = 3;
      plot.set(c, y, 'thatch', shade);
    }
    // Opening: the lower half of the front.
    if (k < h / 2 - 1) {
      const o = Math.max(0, Math.round((h / 2 - 1 - k) / 2));
      for (let c = cx - o; c <= cx + o - 1; c++) plot.set(c, y, 'wood', 1);
    }
  }
  plot.set(cx - 1, ground - h - 1, 'wood', 4);
  plot.set(cx + 1, ground - h - 1, 'wood', 2);
  plot.set(cx - 2, ground - h - 2, 'wood', 4);
  plot.set(cx + 2, ground - h - 2, 'wood', 2);
}

/**
 * Голубець: a roofed post shrine with the beekeepers' icon — a post, a small gable roof (wood 4/2) over a gold-framed
 * icon (gold 4 / gold 3 frame, a gold 4/3 face, crimson 3 robe), a gold 4 cross on the roof.
 */
export function holubets(plot: Plot, cx: number, ground: number, h: number): void {
  for (let k = 0; k < h - 8; k++) {
    plot.set(cx, ground - k, 'wood', 3);
    plot.set(cx + 1, ground - k, 'wood', 2);
  }
  const top = ground - h;
  // Icon box 6×6 under the roof.
  for (let y = top + 3; y < top + 9; y++) {
    for (let c = cx - 2; c <= cx + 3; c++) {
      const frame = y === top + 3 || y === top + 8 || c === cx - 2 || c === cx + 3;
      if (frame) plot.set(c, y, 'gold', c === cx - 2 || y === top + 3 ? 4 : 3);
      else plot.set(c, y, y < top + 6 ? 'gold' : 'crimson', y < top + 6 ? (c < cx + 1 ? 4 : 3) : 3);
    }
  }
  // Gable roof 10 wide, 3 rows.
  for (let r = 0; r < 3; r++) {
    for (let c = cx - 1 - r * 2; c <= cx + 2 + r * 2; c++) plot.set(c, top + r, 'wood', c <= cx ? 4 : 2);
  }
  plot.set(cx, top - 1, 'gold', 4);
  plot.set(cx, top - 2, 'gold', 4);
  plot.set(cx - 1, top - 2, 'gold', 4);
  plot.set(cx + 1, top - 2, 'gold', 4);
  plot.set(cx, top - 3, 'gold', 4);
}

/**
 * Log hive (вулик-колода): an upright hollow log w 7 — bark wood 3 with a lit left edge (wood 4/5), the right two
 * columns wood 2/1, bark cracks (wood 2 dashes) — a straw cap (thatch, a cone with an overhang) and the entrance
 * (льоток, ink 1) with a wood 5 landing board.
 */
export function logHive(plot: Plot, cx: number, ground: number, seed: string): void {
  const s = seedOf(`${seed}:hive`);
  const x0 = cx - 3;
  const capH = 4;
  const top = ground - 13;
  for (let y = top + capH - 1; y <= ground; y++) {
    for (let c = x0; c < x0 + 7; c++) {
      const u = c - x0;
      let shade = u === 0 ? 4 : u === 1 ? 5 : u >= 5 ? (u === 6 ? 1 : 2) : 3;
      if (u >= 2 && u <= 4 && rand2(c, y, s) < 0.12) shade = 2;
      plot.set(c, y, 'wood', shade);
    }
  }
  // Entrance and landing board.
  const ey = ground - 6;
  plot.set(cx - 1, ey, 'ink', 1);
  plot.set(cx, ey, 'ink', 1);
  plot.set(cx - 2, ey + 1, 'wood', 5);
  plot.set(cx - 1, ey + 1, 'wood', 5);
  plot.set(cx, ey + 1, 'wood', 4);
  plot.set(cx + 1, ey + 1, 'wood', 3);
  // Straw cap: widths 3, 5, 7, 9 from the top.
  for (let r = 0; r < capH; r++) {
    const half = r + 1;
    for (let c = cx - half; c <= cx + half; c++) {
      const u = (c - (cx - half)) / (2 * half);
      let shade = u < 0.45 ? (r === 0 ? 6 : 5) : u < 0.75 ? 4 : 3;
      if (r === capH - 1) shade = u < 0.5 ? 3 : 2;
      plot.set(c, top + r, 'thatch', shade);
    }
  }
  plot.set(cx, top - 1, 'thatch', 4);
}

/**
 * Stump hive (дуплянка): a hollowed stump 8 wide, 7 tall (wood 4 lit left, wood 3, wood 2 right, bark cracks) under a
 * 3-row straw cap (thatch, widths 4 / 6 / 8), a dark entrance (ink 1) above a wood 5 sill. 10 px tall in all.
 */
export function stumpHive(plot: Plot, cx: number, ground: number): void {
  const x0 = cx - 4;
  for (let y = ground - 6; y <= ground; y++) {
    for (let c = x0; c < x0 + 8; c++) {
      const u = c - x0;
      let shade = u < 2 ? 4 : u > 5 ? 2 : 3;
      if (u >= 2 && u <= 5 && (c * 3 + y) % 7 === 0) shade = 2;
      plot.set(c, y, 'wood', shade);
    }
  }
  plot.set(cx - 1, ground - 3, 'ink', 1);
  plot.set(cx, ground - 3, 'ink', 1);
  plot.set(cx - 1, ground - 2, 'wood', 5);
  plot.set(cx, ground - 2, 'wood', 4);
  [4, 6, 8].forEach((w, r) => {
    const a = cx - w / 2;
    for (let c = a; c < a + w; c++) {
      const u = (c - a) / (w - 1);
      plot.set(c, ground - 9 + r, 'thatch', r === 2 ? (u < 0.5 ? 3 : 2) : u < 0.45 ? 5 : u < 0.75 ? 4 : 3);
    }
  });
}
