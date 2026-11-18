// The Dnipro (ART-09): a mirror of what the viewer sees right above the horizon — sky, clouds, far bluffs, groves —
// laid into the water band right under it. After the base world is rendered into worldRT:
//   pass 1 (1 draw call): the band of worldRT above the horizon, flipped, into waterRT; sparkle glints (1-px frames of
//          the sun disc in worldRT) batch with it;
//   pass 2 (1 draw call): waterRT back onto worldRT as 1-px row strips shifted by whole px (waves, stronger toward
//          the viewer), tinted per key and darker toward the viewer; broken wave dashes (frames of the same rows,
//          darker); the 1-px waterline sheen at the far bank; the moon/sun column. Pixi batches the waterRT frames and
//          the white-texture strokes together (multi-texture batch).
// Whole-px shifts only: the pixel grid never blurs. Deterministic under `?freeze` (step clock from animation time).
// The river has a world x range (M2-01, content `River`): every pass-2 sprite is clipped per row to the part of the
// row on screen (render/zones.ts `riverSpan`, the taper toward the far bank), and with no water on screen both passes
// are skipped.
import type { River } from '../content/villages/khortytsia.layout.ts';
import type { Weather } from './settings.ts';
import { Container, Rectangle, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import { RIVER_END, WATER, WATER_LOOKS, type ColorRef } from './atmosphere/config.ts';
import type { DayCycle } from './atmosphere/dayCycle.ts';
import { moonShown, skyPixel } from './atmosphere/skyPaint.ts';
import { rampColor } from './palette.ts';
import { riverRowEnd, riverSpan } from './zones.ts';

/** Integer hash → 0..1. */
function hash(a: number, b: number): number {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Wave step for animation time `seconds` (WATER.waveHz steps per second). */
export const waveStep = (seconds: number): number => Math.floor(seconds * WATER.waveHz);

/**
 * Whole-px x shift of water row `row` (0 = right under the horizon) of `rows` at wave `step`: 0 in the far third,
 * up to WATER.maxShift in the near rows; a slow travelling wave, not noise.
 */
export function waveOffset(row: number, rows: number, step: number): number {
  const near = rows > 1 ? row / (rows - 1) : 1;
  const amp = near < 0.3 ? 0 : near < 0.65 ? 1 : WATER.maxShift;
  if (amp === 0) return 0;
  // Triangle wave over (row, step): period 6 rows, drifting one row per step.
  const phase = (((row * 2 + step) % 12) + 12) % 12;
  const tri = phase < 6 ? phase / 3 - 1 : 3 - phase / 3; // −1…1
  return Math.round(tri * amp);
}

/** Whether water row `row` carries a line of wave dashes at `step` (lines drift toward the viewer). */
export function darkWave(row: number, rows: number, step: number): boolean {
  return row > rows * 0.25 && (((row - step) % WATER.darkEvery) + WATER.darkEvery) % WATER.darkEvery === 0;
}

export interface Segment {
  readonly x: number;
  readonly len: number;
}

/**
 * Broken dashes along a row of `width` px: dashes `min..max` px with gaps `gapMin..gapMax` px, seeded by `seed`
 * (no ruled lines).
 */
export function dashes(width: number, seed: number, min: number, max: number, gapMin = 2, gapMax = 6): Segment[] {
  const out: Segment[] = [];
  let x = Math.floor(hash(seed, 7) * 6);
  for (let k = 0; x < width; k++) {
    const len = min + Math.floor(hash(seed, k * 2 + 11) * (max - min + 1));
    out.push({ x, len: Math.min(len, width - x) });
    x += len + gapMin + Math.floor(hash(seed, k * 2 + 12) * (gapMax - gapMin + 1));
  }
  return out;
}

/**
 * The waterline sheen at the far bank: an uneven run of 3–24 px dashes with 1–10 px gaps and, now and then, a lone
 * 1-px glint instead of a dash (an even dash rhythm read as a road marking).
 */
export function sheenDashes(width: number): Segment[] {
  return dashes(width, 4242, 3, 24, 1, 10).map((s, k) => (hash(k, 77) < 0.2 ? { x: s.x, len: 1 } : s));
}

/** Wave dashes of row `row`: 3–8 px near, at most 2 px in the far third. */
export function waveDashes(row: number, rows: number, width: number, step: number): Segment[] {
  const far = row < rows / 3;
  return dashes(width, row * 977 + Math.floor(step / WATER.darkEvery) * 31, far ? 1 : 3, far ? 2 : 8);
}

export interface Glint {
  /** Row in the water band (0 = under the horizon) and x on screen. */
  readonly row: number;
  readonly x: number;
  readonly width: number;
}

/** Loose sparkles under the disc at screen x `cx`: denser and wider toward the viewer. */
export function glints(cx: number, rows: number, density: number, step: number, max = WATER.maxGlints): Glint[] {
  const out: Glint[] = [];
  for (let row = 2; row < rows && out.length < max; row++) {
    const near = row / rows;
    if (hash(row, step) >= density * (0.35 + 0.65 * near)) continue;
    const spread = 2 + near * 10;
    out.push({
      row,
      x: Math.round(cx + (hash(row + 101, step) - 0.5) * 2 * spread),
      width: 1 + Math.floor(hash(row + 202, step) * (1 + near * 3)),
    });
  }
  return out;
}

export interface PathStroke extends Glint {
  readonly core: boolean;
}

/**
 * A solid column under the disc at `cx`, centred on it in every row (no wave shift, no jitter: a sideways step read as
 * a lightning bolt): 1 px in the far third, 3 px in the middle, `maxWidth` at the bank; shimmering 1–2 px edge dashes
 * just outside it on both sides; ~12 % of the rows break (the surface moves).
 */
export function columnPath(cx: number, rows: number, maxWidth: number, step: number): PathStroke[] {
  const out: PathStroke[] = [];
  for (let row = 1; row < rows; row++) {
    if (hash(row + 303, step) < 0.12) continue;
    const near = row / (rows - 1);
    const w = Math.min(maxWidth, near < 1 / 3 ? 1 : near < 2 / 3 ? 3 : 5);
    const half = (w - 1) / 2;
    out.push({ row, x: cx - half, width: w, core: true });
    for (const side of [-1, 1]) {
      if (hash(row * 3 + side + 505, step) >= 0.6) continue;
      const len = 1 + Math.floor(hash(row * 5 + side, step) * 2);
      const gap = near < 1 / 3 ? 1 : 1 + Math.floor(hash(row * 7 + side, step) * 2);
      out.push({ row, x: side < 0 ? cx - half - gap - len : cx + half + gap + 1, width: len, core: false });
    }
  }
  return out;
}

/** Moon glint dashes: row share, width (widest on top). */
const MOON_DASHES: readonly (readonly [number, number])[] = [
  [0.08, 7],
  [0.2, 5],
  [0.36, 4],
  [0.55, 2],
];

/**
 * A short moon glint under the disc at `cx`: 3–4 horizontal dashes near the far bank, the widest on top, the wider
 * ones broken by a 1-px gap, each shifting ±1 px with the waves; the outer px are `edge`, the rest `core`.
 */
export function moonDashes(cx: number, rows: number, step: number): PathStroke[] {
  const out: PathStroke[] = [];
  MOON_DASHES.forEach(([share, w], k) => {
    const row = Math.max(1, Math.round(share * rows));
    if (row >= rows || hash(k + 909, step) < 0.15) return;
    const x = cx - Math.floor(w / 2) + Math.round((hash(k + 707, step) - 0.5) * 2);
    const gap = w >= 5 ? 1 + Math.floor(hash(k + 808, step) * (w - 3)) : -1;
    for (let i = 0; i < w; i++) {
      if (i === gap) continue;
      out.push({ row, x: x + i, width: 1, core: i > 0 && i < w - 1 });
    }
  });
  return out;
}

const channel = (c: number, shift: number, k: number): number => Math.min(255, Math.round(((c >> shift) & 0xff) * k));
const scaleTint = (c: number, k: number): number =>
  (channel(c, 16, k) << 16) | (channel(c, 8, k) << 8) | channel(c, 0, k);
const lerpTint = (a: number, b: number, t: number): number => {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const x = (a >> shift) & 0xff;
    out |= Math.round(x + (((b >> shift) & 0xff) - x) * t) << shift;
  }
  return out;
};
const color = ([ramp, i]: ColorRef): number => rampColor(ramp, i);

export interface Water {
  /** Rebuilds textures and strips for a new worldRT size; `horizon` is the first water row. */
  resize(width: number, height: number, horizon: number): void;
  /**
   * Renders the two water passes onto worldRT (call right after the base world render); `camX` in whole world px,
   * `skyY` = rows the sky band is moved down (closer zoom level), so the glints sample the disc where it is drawn.
   */
  render(renderer: Renderer, seconds: number, cycle: DayCycle, camX: number, skyY?: number): void;
  destroy(): void;
}

/** Extra columns each side of the mirror, so row shifts never uncover the band's edges. */
const PAD = WATER.maxShift;
/** The first reflected rows sit one shade darker, so the mirror starts at the bank line. */
const BANK_ROWS = 2;
const BANK_SHADE = 0.85;

export function createWater(worldRT: RenderTexture, river: River | null, weather: Weather): Water {
  const rows = river?.rows ?? 0;
  const fog = weather === 'fog';
  const mirrorScene = new Container({ label: 'water-mirror' });
  const band = new Container({ label: 'water' });
  let waterRT: RenderTexture | null = null;
  let textures: Texture[] = [];
  let strips: Sprite[] = [];
  let glintPool: Sprite[] = [];
  let dashPool: Sprite[] = [];
  let sheen: Sprite[] = [];
  let sheenSegs: Segment[] = [];
  let strokePool: Sprite[] = [];
  let foamPool: Sprite[] = [];
  let width = 0;
  let horizon = 0;

  const freeFrames = (): void => {
    for (const child of mirrorScene.removeChildren()) child.destroy();
    for (const child of band.removeChildren()) child.destroy();
    for (const t of textures) t.destroy(false);
    textures = [];
    strips = [];
    glintPool = [];
    dashPool = [];
    sheen = [];
    strokePool = [];
    foamPool = [];
  };
  const frameOf = (source: RenderTexture, x: number, y: number, w: number, h: number): Texture => {
    const t = new Texture({ source: source.source, frame: new Rectangle(x, y, w, h) });
    textures.push(t);
    return t;
  };
  const setFrame = (sprite: Sprite, x: number, y: number, w: number): void => {
    const f = sprite.texture.frame;
    f.x = x;
    f.y = y;
    f.width = w;
    sprite.texture.updateUvs();
  };
  const pool = (into: Container, count: number, texture: () => Texture): Sprite[] =>
    Array.from({ length: count }, () => {
      const s = new Sprite({ texture: texture(), roundPixels: true });
      s.visible = false;
      into.addChild(s);
      return s;
    });

  return {
    resize(w, h, hz) {
      freeFrames();
      waterRT?.destroy(true);
      waterRT = null;
      width = w;
      horizon = hz;
      const n = Math.min(rows, Math.max(0, h - hz), hz);
      if (n <= 0 || w <= 0) return;
      const rt = RenderTexture.create({
        width: w + 2 * PAD,
        height: n,
        resolution: 1,
        scaleMode: 'nearest',
        antialias: false,
      });
      waterRT = rt;
      // Pass 1: the n rows above the horizon, flipped (row 0 of waterRT = the row right above the horizon).
      const mirror = new Sprite({ texture: frameOf(worldRT, 0, hz - n, w, n), roundPixels: true });
      mirror.scale.y = -1;
      mirror.position.set(PAD, n);
      mirrorScene.addChild(mirror);
      // Edge padding: the outermost columns stretched over PAD px, flipped like the mirror.
      for (const [srcX, dstX] of [
        [0, 0],
        [w - 1, w + PAD],
      ] as const) {
        const edge = new Sprite({ texture: frameOf(worldRT, srcX, hz - n, 1, n), roundPixels: true });
        edge.scale.set(PAD, -1);
        edge.position.set(dstX, n);
        mirrorScene.addChild(edge);
      }
      glintPool = pool(mirrorScene, WATER.maxGlints, () => frameOf(worldRT, 0, 0, 1, 1));
      // Pass 2: one strip per row, then the wave dashes, the waterline sheen and the path strokes on top.
      for (let r = 0; r < n; r++) {
        const strip = new Sprite({ texture: frameOf(rt, 0, r, w + 2 * PAD, 1), roundPixels: true });
        strip.y = hz + r;
        band.addChild(strip);
        strips.push(strip);
      }
      dashPool = pool(band, WATER.maxDashes, () => frameOf(rt, 0, 0, 1, 1));
      sheenSegs = sheenDashes(w);
      sheen = sheenSegs.map((seg) => {
        const s = new Sprite({ texture: Texture.WHITE, roundPixels: true });
        s.position.set(seg.x, hz);
        s.scale.set(seg.len, 1);
        band.addChild(s);
        return s;
      });
      strokePool = pool(band, WATER.maxPath, () => Texture.WHITE);
      foamPool = pool(band, n, () => Texture.WHITE);
    },
    render(renderer, seconds, cycle, camX, skyY = 0) {
      if (!waterRT || strips.length === 0 || !river) return;
      const n = strips.length;
      // Screen span of every row; nothing on screen = no passes at all (the Sich).
      const spans = strips.map((_, r) => riverSpan(river, r, camX, width));
      if (spans.every((sp) => sp === null)) return;
      const step = waveStep(seconds);
      const a = WATER_LOOKS[cycle.keyA];
      const b = WATER_LOOKS[cycle.keyB];
      const dominant = cycle.t < 0.5 ? a : b;
      const tint = lerpTint(a.tint, b.tint, cycle.t);
      const depth = a.depth + (b.depth - a.depth) * cycle.t;
      const wave = a.wave + (b.wave - a.wave) * cycle.t;

      // The disc the path follows: the sun while it is up, else the moon while it is shown; none under rain clouds.
      const disc =
        weather === 'rain' ? null : cycle.sun.y > 0.02 ? cycle.sun : moonShown(cycle, weather) ? cycle.moon : null;
      const at = disc ? skyPixel(disc, width, horizon) : null;
      const centre = at ? { x: at.x, y: at.y + skyY } : null;
      const onSky =
        centre !== null && centre.y >= 0 && centre.y < horizon && centre.x >= 0 && centre.x < width ? centre : null;

      // Pass 1: mirror + sparkles (sampled from the disc, so they carry its colour).
      const sparkles = onSky && dominant.path.kind === 'sparkle' ? glints(onSky.x, n, dominant.path.density, step) : [];
      glintPool.forEach((g, i) => {
        const glint = sparkles[i];
        g.visible = glint !== undefined && onSky !== null;
        if (!glint || !onSky) return;
        setFrame(g, onSky.x, onSky.y, 1);
        g.position.set(glint.x + PAD, glint.row);
        g.scale.set(glint.width, 1);
      });
      renderer.render({ container: mirrorScene, target: waterRT, clear: true });

      // Pass 2: strips — key tint, darker toward the viewer, the first rows a shade darker (bank line).
      strips.forEach((strip, r) => {
        const near = n > 1 ? r / (n - 1) : 0;
        const span = spans[r];
        strip.visible = span !== null && span !== undefined;
        if (!span) return;
        // Screen column x shows waterRT column x − shift + PAD; the strip is cut to [a, b).
        const dx = waveOffset(r, n, step);
        setFrame(strip, span.a - dx + PAD, r, span.b - span.a);
        strip.x = span.a;
        strip.tint = scaleTint(tint, (1 - depth * near) * (r < BANK_ROWS ? BANK_SHADE : 1));
      });
      // Wave dashes: frames of the same row at the row's shift, darker by day, a moonlit sheen at night.
      let used = 0;
      for (let r = 0; r < n; r++) {
        const span = spans[r];
        if (!span || !darkWave(r, n, step)) continue;
        const near = n > 1 ? r / (n - 1) : 0;
        const dx = waveOffset(r, n, step);
        for (const seg of waveDashes(r, n, width, step)) {
          const x0 = Math.max(seg.x + dx, span.a);
          const x1 = Math.min(seg.x + dx + seg.len, span.b);
          const sprite = dashPool[used];
          if (!sprite) break;
          // A dash cut away still takes its slot: the pool runs out where it always did (M-ART frames unchanged).
          used += 1;
          sprite.visible = x1 > x0;
          if (!sprite.visible) continue;
          setFrame(sprite, x0 - dx + PAD, r, x1 - x0);
          sprite.position.set(x0, horizon + r);
          sprite.tint = scaleTint(tint, (1 - depth * near) * wave);
        }
      }
      for (let i = used; i < dashPool.length; i++) {
        const sprite = dashPool[i];
        if (sprite) sprite.visible = false;
      }
      // Waterline sheen at the far bank (gone in fog).
      const sheenTint = color(dominant.sheen);
      const top = spans[0];
      sheenSegs.forEach((seg, i) => {
        const s = sheen[i];
        if (!s) return;
        const x0 = Math.max(seg.x, top?.a ?? 0);
        const x1 = Math.min(seg.x + seg.len, top?.b ?? 0);
        s.tint = sheenTint;
        s.visible = !fog && x1 > x0;
        s.position.x = x0;
        s.scale.x = x1 - x0;
      });
      // Sun/moon path: the golden column or the moon's dashes; it stops short of the bank where the river ends.
      const path = onSky && dominant.path.kind !== 'sparkle' ? dominant.path : null;
      const strokes =
        path && onSky
          ? path.kind === 'column'
            ? columnPath(onSky.x, n, path.width, step)
            : moonDashes(onSky.x, n, step)
          : [];
      strokePool.forEach((p, i) => {
        const s = strokes[i];
        const span = s ? spans[s.row] : null;
        const end = s ? riverRowEnd(river, s.row) - camX : 0;
        const stop = span && end <= span.b ? span.b - RIVER_END.pathGap : (span?.b ?? 0);
        const x0 = s && span ? Math.max(s.x, span.a) : 0;
        const x1 = s && span ? Math.min(s.x + s.width, stop) : 0;
        p.visible = s !== undefined && path !== null && x1 > x0;
        if (!s || !path || x1 <= x0) return;
        p.position.set(x0, horizon + s.row);
        p.scale.set(x1 - x0, 1);
        p.tint = color(s.core ? path.core : path.edge);
      });
      // Foam on the waterline where each row ends on screen: broken 1–2 px dashes in the sheen colour, always at a
      // boulder (the river's `rocks`).
      const foamStep = Math.floor(seconds * RIVER_END.foamHz);
      foamPool.forEach((f, r) => {
        const span = spans[r];
        const end = riverRowEnd(river, r) - camX;
        const rock = river.rocks?.some((k) => Math.abs(k - r) <= 1) ?? false;
        const on = !!span && end <= span.b && end > 0 && (rock || hash(r + 31, foamStep) < RIVER_END.foamShare);
        f.visible = on;
        if (!on) return;
        const len = Math.min(RIVER_END.foamLen, end);
        f.position.set(end - len, horizon + r);
        f.scale.set(len, 1);
        f.tint = sheenTint;
      });
      renderer.render({ container: band, target: worldRT, clear: false });
    },
    destroy() {
      freeFrames();
      mirrorScene.destroy();
      band.destroy();
      waterRT?.destroy(true);
      waterRT = null;
    },
  };
}
