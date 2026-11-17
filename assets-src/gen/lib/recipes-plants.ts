// Pixel recipes, set 4: plants and wind sway (plan ART-14, ART-BIBLE §5 "Трава", "Дуб / верба"). A plant is drawn
// once into a Plot; `swayed` derives its sway frames by shifting rows by whole px — the foot stays put, the top leans
// up to `shift` px, rows in between ease in quadratically — so every frame is on the pixel grid (no SwayFilter, no
// sub-px resampling) and render only picks a frame. Shade numbers index master.json:
// foliage 0 #18232b … 3 #3e6646; grass 0 #13291f … 7 #dfe08a; wood 0 #3b2419 … 6 #e6c084.
import type { RampName } from './buffer.ts';
import { Plot } from './plot.ts';
import { seededRng } from './rng.ts';

type Rng = () => number;

/** Sway frames: lean −2…+2 px at the top (frame 2 = upright). */
export const SWAY_SHIFTS = [-2, -1, 0, 1, 2] as const;

/** round(|shift| × f) with the sign of shift: symmetric (Math.round(−0.5) is −0, Math.round(0.5) is 1). */
export function lean(shift: number, f: number): number {
  return Math.sign(shift) * Math.round(Math.abs(shift) * f);
}

/** Row-shift profile: whole-px offset of the px at (x, y) in a frame whose top leans `shift` px. */
export type SwayProfile = (shift: number, x: number, y: number) => number;

/** The standard profile: round(shift × t²), t = height above `ground` / `height` (0 at the foot, 1 at the top). */
export function footProfile(ground: number, height: number): SwayProfile {
  return (shift, _x, y) => {
    const t = Math.min(1, Math.max(0, (ground - y) / height));
    return lean(shift, t * t);
  };
}

/** `plot`'s px moved right by the `profile` offset into `into` (the foot stays put); later px win. */
export function swayed(plot: Plot, shift: number, profile: SwayProfile, into: Plot = new Plot()): Plot {
  for (const [key, px] of [...plot.px.entries()].sort((a, b) => a[0] - b[0])) {
    const x = key % 4096;
    const y = Math.floor(key / 4096);
    into.set(x + profile(shift, x, y), y, px.ramp, px.shade);
  }
  return into;
}

type Tone = readonly [RampName, number];

/** Crown palettes, underside → lit, then the sun-side rim and the lit specks. */
export const CROWN_TONES = {
  /** Oak: deep cool green (foliage 1–3, grass 3 lit; foliage 0 would sink into the night ground). */
  oak: {
    steps: [
      ['foliage', 1],
      ['foliage', 2],
      ['foliage', 3],
      ['grass', 3],
    ],
    rim: ['grass', 4],
    speck: ['grass', 5],
  },
  /** Willow: lighter, yellower (ART-BIBLE §5: the willow is the light tree by the khata). */
  willow: {
    steps: [
      ['foliage', 2],
      ['grass', 2],
      ['grass', 3],
      ['grass', 4],
    ],
    rim: ['grass', 5],
    speck: ['grass', 5],
  },
} as const satisfies Record<string, { steps: readonly Tone[]; rim: Tone; speck: Tone }>;

/** Integer hash → 0..1 (leaf-clump jitter, so shade bands break into clumps instead of straight diagonals). */
function hash(a: number, b: number): number {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Crown of "clouds" (ART-BIBLE §5): clusters of round puffs, each shaded from the top-left with leaf-clump jitter
 * (2×2 blocks) on the band edges; a sun-side rim on the whole crown's top-left edge, a few lit specks, the crown's
 * underside the darkest step. `puffs` are centre x, centre y and radius.
 */
export function crown(
  plot: Plot,
  puffs: readonly (readonly [number, number, number])[],
  rng: Rng,
  tone: keyof typeof CROWN_TONES = 'oak',
): void {
  const t = CROWN_TONES[tone];
  const inside = (x: number, y: number): boolean => puffs.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
  const bottom = Math.max(...puffs.map(([, cy, r]) => cy + r));
  for (const [cx, cy, r] of puffs) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        const u = (x - cx) / r;
        const v = (y - cy) / r;
        const jitter = (hash(x >> 1, y >> 1) - 0.5) * 0.5;
        const lightness = -u * 0.6 - v * 0.8 + jitter; // top-left
        let step = lightness > 0.45 ? 3 : lightness > -0.2 ? 2 : 1;
        if (y >= bottom - 2) step = 0;
        let [ramp, shade]: Tone = t.steps[step] ?? t.steps[0];
        // Sun-side rim of the whole crown: where the px up-left is outside every puff.
        if (!inside(x - 1, y - 1) && -u * 0.6 - v * 0.8 > 0) [ramp, shade] = t.rim;
        else if (step === 3 && rng() < 0.07) [ramp, shade] = t.speck;
        plot.set(x, y, ramp, shade);
      }
    }
  }
}

/** A trunk: `w` px wide from `top` to `ground`, lit left column (wood 3), bark wood 1/2 with dark furrows (wood 0). */
export function trunk(plot: Plot, x: number, top: number, ground: number, w: number, rng: Rng): void {
  for (let y = top; y <= ground; y++) {
    for (let c = 0; c < w; c++) {
      const furrow = rng() < 0.12;
      const shade = c === 0 ? 3 : c === w - 1 ? 0 : furrow ? 0 : c < w / 2 ? 2 : 1;
      plot.set(x + c, y, 'wood', shade);
    }
  }
}

/** A 2-px stalk column pair: lit left px, shaded right px (near plants are thicker than the farm's 1-px stems). */
function stalk(plot: Plot, x: number, y: number, lit: number, shade: number): void {
  plot.set(x, y, 'grass', lit);
  plot.set(x + 1, y, 'grass', shade);
}

/**
 * Reeds (очерет), near: 2-px stalks (grass 4 / grass 2; a dry one thatch 3 / thatch 2) with long blade leaves peeling
 * off to one side, and brown cattail heads (earth 3 lit / earth 1) on some. Each stalk bows a little one way.
 */
export function reeds(plot: Plot, x0: number, w: number, ground: number, height: number, seed: string): void {
  const rng = seededRng(`${seed}:reeds`);
  for (let x = x0; x < x0 + w; x += 3 + Math.floor(rng() * 3)) {
    const h = Math.round(height * (0.6 + rng() * 0.4));
    const dry = rng() < 0.2;
    const side = rng() < 0.5 ? -1 : 1;
    const ramp = dry ? 'thatch' : 'grass';
    const at = (k: number): number => x + Math.round((k / h) ** 2 * 2 * side);
    for (let k = 0; k < h; k++) {
      plot.set(at(k), ground - k, ramp, dry ? 3 : k < 4 ? 2 : 4);
      plot.set(at(k) + 1, ground - k, ramp, dry ? 2 : k < 4 ? 1 : 2);
    }
    // A blade leaf: from a third of the way up, arcing out and down.
    const k0 = Math.round(h * (0.25 + rng() * 0.2));
    for (let j = 0; j < 12; j++) {
      plot.set(at(k0) - side * j, ground - k0 - Math.round(6 * Math.sin((j / 12) * Math.PI)), 'grass', j < 6 ? 3 : 4);
    }
    if (!dry && rng() < 0.45) {
      for (let k = 0; k < 7; k++) {
        plot.set(at(h), ground - h + 2 + k, 'earth', k < 2 ? 3 : 2);
        plot.set(at(h) + 1, ground - h + 2 + k, 'earth', 1);
      }
      plot.set(at(h) + 1, ground - h, 'grass', 4);
      plot.set(at(h) + 1, ground - h + 1, 'grass', 4);
    }
  }
}

/**
 * Tall grass, near: a fan of 1-px blades `spread` px to each side, foot grass 2 (no darker: packed
 * blades would merge into a dark slab), body grass 3 on the lit left half / grass 2 on the right, tips grass 4 (now
 * and then grass 5) — a step darker than the meadow tufts, so the clumps frame the view (art-director ART-14).
 */
export function tallGrass(plot: Plot, cx: number, ground: number, height: number, seed: string, spread = 6): void {
  const rng = seededRng(`${seed}:grass`);
  for (let i = -spread; i <= spread; i += 1) {
    const h = Math.round(height * (1 - Math.abs(i) / (spread * 1.5)) * (0.65 + rng() * 0.35));
    const bend = (i / spread) * 2;
    for (let k = 0; k < h; k++) {
      const x = cx + Math.round(i * 0.7 + bend * (k / h) ** 2 * 3);
      const tip = k > h - 3;
      const shade = k === 0 ? 2 : tip ? (rng() < 0.08 ? 5 : 4) : i < 0 ? 3 : 2;
      plot.set(x, ground - k, 'grass', shade);
    }
  }
}

/** A heart-ish leaf on a stalk at (x, y) toward `dir`: 6×4, lit top (grass 4), body grass 3, underside grass 2. */
function leaf(plot: Plot, x: number, y: number, dir: 1 | -1): void {
  const rows: readonly (readonly [number, number])[] = [
    [1, 3],
    [1, 6],
    [2, 6],
    [3, 5],
  ];
  rows.forEach(([from, to], r) => {
    for (let c = from; c <= to; c++) plot.set(x + dir * c, y - 2 + r, 'grass', r === 0 ? 4 : r === 3 ? 2 : 3);
  });
}

/**
 * Sunflower, near: a 2-px stem with heart leaves on alternate sides, a big head (radius `r`) turned to the sun: an
 * earth seed disc (earth 2 lit, earth 1, an earth 0 seed grid) inside a jagged ring of gold petals (gold 4 lit, gold
 * 3, gold 2 at the shaded lower right).
 */
export function sunflower(plot: Plot, x: number, ground: number, height: number, r = 7): void {
  for (let k = 0; k < height; k++) stalk(plot, x, ground - k, k < 3 ? 2 : 3, 2);
  for (let k = 10, dir: 1 | -1 = -1; k < height - 8; k += 11, dir = dir === 1 ? -1 : 1) {
    leaf(plot, dir === 1 ? x + 1 : x, ground - k, dir);
  }
  const cx = x;
  const cy = ground - height - r + 2;
  const disc = r * 0.55;
  for (let dy = -r - 1; dy <= r + 1; dy++) {
    for (let dx = -r - 1; dx <= r + 1; dx++) {
      const d = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const petal = r + (Math.cos(angle * 8) > 0.3 ? 1 : 0);
      if (d > petal) continue;
      const lit = dx + dy < 0;
      if (d <= disc) {
        const seedPx = (dx + dy) % 2 === 0 && d < disc - 1;
        plot.set(cx + dx, cy + dy, 'earth', seedPx ? 0 : lit ? 2 : 1);
      } else {
        plot.set(cx + dx, cy + dy, 'gold', lit ? 4 : dx + dy > r * 0.6 ? 2 : 3);
      }
    }
  }
}

/**
 * Мальва, near: a 2-px stalk with round leaves low down, cup blossoms (3×3: crimson 4 lit, crimson 3, a crimson 1
 * heart) on alternate sides up the top half, tight buds (crimson 5) at the tip.
 */
export function mallowTall(plot: Plot, x: number, ground: number, height: number): void {
  for (let k = 0; k < height; k++) stalk(plot, x, ground - k, 3, 2);
  for (let k = 6, dir: 1 | -1 = 1; k < height * 0.45; k += 8, dir = dir === 1 ? -1 : 1) {
    leaf(plot, dir === 1 ? x + 1 : x, ground - k, dir);
  }
  for (let k = Math.round(height * 0.45), i = 0; k < height - 4; k += 5, i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const bx = x + (side < 0 ? -3 : 3);
    const by = ground - k;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const heart = dx === 0 && dy === 0;
        plot.set(bx + dx, by + dy, 'crimson', heart ? 1 : dx + dy < 0 ? 4 : 3);
      }
    }
    plot.set(bx - side * 2, by, 'grass', 3);
  }
  for (let k = height - 4; k <= height; k += 2) {
    plot.set(x, ground - k, 'crimson', 5);
    plot.set(x + 1, ground - k, 'crimson', 3);
  }
}
