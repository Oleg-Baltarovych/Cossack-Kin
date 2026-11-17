// Visual tuning of the time of day (plan §0, ART-04; ART-BIBLE §8). Data only — no Pixi, no DOM, no JSON
// imports — so `assets-src/luts/gen.ts` (Node, tools project) reads the same numbers as render.
// Colors are palette references `[ramp, index]` (index 0 = darkest), resolved by the consumer.
import type { RampName } from '../palette.ts';

export type ColorRef = readonly [RampName, number];

export const SKY_KEY_IDS = ['dawn', 'morning', 'day', 'golden', 'dusk', 'night'] as const;
export type SkyKeyId = (typeof SKY_KEY_IDS)[number];

export interface SkyKeyTime {
  readonly id: SkyKeyId;
  /** Minutes after midnight where the key is reached in full (screenshot keys 0530…2300). */
  readonly at: number;
  /** Minutes the key holds unchanged after `at`; the transition to the next key fills the rest. */
  readonly hold: number;
  /** `HHMM` label: LUT file `public/luts/<lut>.png`, screenshot names. */
  readonly lut: string;
}

/** Ordered by `at`; the last key wraps over midnight into the first. */
export const SKY_KEYS: readonly SkyKeyTime[] = [
  { id: 'dawn', at: 5 * 60 + 30, hold: 15, lut: '0530' },
  { id: 'morning', at: 7 * 60, hold: 60, lut: '0700' },
  { id: 'day', at: 13 * 60, hold: 4 * 60, lut: '1300' },
  { id: 'golden', at: 19 * 60 + 30, hold: 30, lut: '1930' },
  { id: 'dusk', at: 21 * 60, hold: 15, lut: '2100' },
  { id: 'night', at: 23 * 60, hold: 5 * 60, lut: '2300' },
];

/** Grading LUT: 16³ colors as a 256×16 strip (x = b·16 + r, y = g), the `ColorMapFilter` layout. */
export const LUT_SIZE = 16;
/** The blended LUT is rebuilt at most once per this many minutes of game time. */
export const LUT_UPDATE_MINUTES = 1;

// --- Sun and moon (summer, Khortytsia). Real solar geometry, so dawn/golden-hour heights are plausible.
export const LATITUDE_DEG = 47.8;
export const SUN_DECLINATION_DEG = 23.4;
/** Local solar noon in minutes (summer time, Zaporizhzhia ≈ 12:45). */
export const SOLAR_NOON = 12 * 60 + 45;
/** Cosmetic moon: transit time and declination chosen so the night moon stands high enough to light the sky. */
export const MOON_TRANSIT = 2 * 60;
export const MOON_DECLINATION_DEG = 10;
/** Altitude (deg) that maps to the top of the sky band. */
export const SKY_FOV_DEG = 72;
/** Share of the view width the moon's rise → set arc spans (centred). */
export const ARC_WIDTH = 0.9;
/**
 * Art convention, not geography (ART-BIBLE §3): sprites are always lit from the top-left, so the visible sun
 * stays on the left. Its x follows its altitude only — SUN_X_LOW at the horizon (dawn and golden hour alike),
 * SUN_X_HIGH at the highest noon altitude — so morning and evening suns both sit low on the left.
 */
export const SUN_X_LOW = 0.2;
export const SUN_X_HIGH = 0.38;

// --- Sky look per key -------------------------------------------------------------------------------
export interface HaloLook {
  /** Chain steps added at the centre of the halo. */
  readonly strength: number;
  /** Radius in logical px. */
  readonly radius: number;
  /** Horizontal stretch (>1 spreads the glow along the horizon). */
  readonly spread: number;
}

export interface SkyLook {
  /** Sky colors dark → light. Rows pick a continuous position along it; Bayer 4×4 dithers between steps. */
  readonly chain: readonly ColorRef[];
  /** Chain position at the top row and at the horizon row. */
  readonly top: number;
  readonly horizon: number;
  /** Gradient shape: > 1 keeps the zenith colour longer, the light gathers at the horizon. */
  readonly curve: number;
  /** Highest chain position of gradient + glow + streaks (halos may go one step below the disc color). */
  readonly baseMax: number;
  /** Extra chain steps at the horizon, fading out over `glowHeight` (share of the sky height). */
  readonly glow: number;
  readonly glowHeight: number;
  /** Amplitude (chain steps) of the soft air streaks that break up straight dither rows. */
  readonly streaks: number;
  readonly sunHalo: HaloLook;
  readonly moonHalo: HaloLook;
  /** Filled disc; `rim` marks only its lower edge (the side away from the light). */
  readonly sun: { readonly core: ColorRef; readonly rim: ColorRef; readonly radius: number };
  /** 0..1: share of stars shown. */
  readonly stars: number;
  /** 0..1: the moon disc is drawn above 0.5. */
  readonly moon: number;
}

const NO_HALO: HaloLook = { strength: 0, radius: 1, spread: 1 };
const ramp = (name: RampName, from: number, to: number): ColorRef[] => {
  const out: ColorRef[] = [];
  for (let i = from; i <= to; i++) out.push([name, i]);
  return out;
};

// Index notes: ramps are 0-indexed here (sky[0] = #2b2350); ART-BIBLE §8 names the same steps.
// The last chain color is reserved for the sun/moon disc; halos stop one step below it, the gradient at `baseMax`.
export const SKY_LOOKS: Readonly<Record<SkyKeyId, SkyLook>> = {
  // Світанок: cold with pink — violet-blue zenith (sky 0 + cloth 2), pink-peach horizon (sky 3–4), not gold.
  dawn: {
    chain: [
      ['sky', 0],
      ['cloth', 2],
      ['sky', 2],
      ['sky', 3],
      ['sky', 4],
      ['sky', 5],
      ['gold', 5],
    ],
    top: 0.3,
    horizon: 4,
    baseMax: 4,
    curve: 1.4,
    glow: 0.3,
    glowHeight: 0.12,
    streaks: 0.12,
    sunHalo: { strength: 1.3, radius: 110, spread: 2.2 },
    moonHalo: NO_HALO,
    sun: { core: ['gold', 5], rim: ['gold', 3], radius: 6 },
    stars: 0.12,
    moon: 0,
  },
  // Ранок: blue → light, fresh; the horizon ends at water 6 so whitewash stays a step lighter.
  morning: {
    chain: [...ramp('water', 3, 7), ['plaster', 6]],
    top: 0.6,
    horizon: 3,
    baseMax: 3,
    curve: 1.3,
    glow: 0.15,
    glowHeight: 0.1,
    streaks: 0.1,
    sunHalo: { strength: 1.6, radius: 90, spread: 1.4 },
    moonHalo: NO_HALO,
    sun: { core: ['plaster', 6], rim: ['thatch', 5], radius: 5 },
    stars: 0,
    moon: 0,
  },
  // День: water 4 → water 6 (horizon below whitewash), neutral; the quietest key (streaks ≤ ½ step).
  day: {
    chain: [...ramp('water', 4, 7), ['plaster', 6]],
    top: 0,
    horizon: 2,
    baseMax: 2,
    curve: 1.2,
    glow: 0.1,
    glowHeight: 0.1,
    streaks: 0.06,
    sunHalo: { strength: 1.3, radius: 70, spread: 1 },
    moonHalo: NO_HALO,
    sun: { core: ['plaster', 6], rim: ['water', 7], radius: 5 },
    stars: 0,
    moon: 0,
  },
  // «Золота година»: sky 3 → sky 6 (#fbc77a), warm and low; sun on the left (SUN_X_*), halo in sky 5–6.
  golden: {
    chain: [...ramp('sky', 2, 6), ['gold', 5]],
    top: 1,
    horizon: 3.6,
    baseMax: 4,
    curve: 1.4,
    glow: 0,
    glowHeight: 0.1,
    streaks: 0.14,
    sunHalo: { strength: 1, radius: 130, spread: 2.2 },
    moonHalo: NO_HALO,
    sun: { core: ['gold', 5], rim: ['gold', 3], radius: 7 },
    stars: 0,
    moon: 0,
  },
  // Сутінки: sky 1 → sky 4, lilac; afterglow low on the left, first stars, the moon rises.
  dusk: {
    chain: [['ink', 2], ...ramp('sky', 0, 5)],
    top: 2,
    horizon: 4.4,
    baseMax: 4.4,
    curve: 1.6,
    glow: 0.25,
    glowHeight: 0.12,
    streaks: 0.14,
    sunHalo: { strength: 1.2, radius: 180, spread: 2.8 },
    moonHalo: { strength: 0.6, radius: 40, spread: 1 },
    sun: { core: ['sky', 6], rim: ['sky', 5], radius: 6 },
    stars: 0.35,
    moon: 1,
  },
  // Ніч: navy zenith (cloth 0, no ink blotches) → cloth 1–2 horizon glow; blue, contrasting, never black.
  night: {
    chain: [...ramp('cloth', 0, 3), ['water', 4]],
    top: 0.25,
    horizon: 1.6,
    baseMax: 2.2,
    curve: 1.3,
    glow: 0.5,
    glowHeight: 0.25,
    streaks: 0.12,
    sunHalo: NO_HALO,
    moonHalo: { strength: 1.2, radius: 48, spread: 1.2 },
    sun: { core: ['sky', 6], rim: ['sky', 5], radius: 6 },
    stars: 1,
    moon: 1,
  },
};

export const MOON = {
  radius: 5,
  lit: ['plaster', 6] as ColorRef,
  body: ['plaster', 4] as ColorRef,
  maria: ['plaster', 2] as ColorRef,
};

export const STARS = {
  count: 150,
  /** Twinkle steps per second (whole steps, so a frozen clock always shows the same frame). */
  hz: 6,
  /** Stars fade out where the sky is lighter than this chain share (0..1 of the chain length). */
  maxSkyLight: 0.55,
  colors: {
    bright: ['plaster', 6] as ColorRef,
    mid: ['plaster', 4] as ColorRef,
    dim: ['water', 5] as ColorRef,
  },
};

// --- Grading per key (LUT generator) ----------------------------------------------------------------
export interface GradeLook {
  /** Brightness multiplier. */
  readonly exposure: number;
  readonly contrast: number;
  readonly saturation: number;
  /** Shadows take this hue (luminance kept), weighted by darkness². */
  readonly shadowTint: ColorRef;
  readonly shadowAmount: number;
  /** Mid tones take this hue, weighted by 4·y·(1 − y). */
  readonly midTint?: ColorRef;
  readonly midAmount?: number;
  /** Luminance remap `[in, out]` points (0..1, sorted); applied after exposure, before toning. */
  readonly curve?: readonly (readonly [number, number])[];
  /** Curve input uses night-vision weights (greens/blues brighter than reds). */
  readonly scotopic?: boolean;
  /** Lights take this hue, weighted by lightness (weights are clamped to 1). */
  readonly lightTint: ColorRef;
  readonly lightAmount: number;
  /** Black is lifted to `lift · liftAmount` (night never reaches black). */
  readonly lift: ColorRef;
  readonly liftAmount: number;
  /** 0..1 pull of every LUT entry toward its nearest palette color. */
  readonly snap: number;
}

export const GRADE_LOOKS: Readonly<Record<SkyKeyId, GradeLook>> = {
  dawn: {
    exposure: 0.86,
    contrast: 0.95,
    saturation: 0.85,
    shadowTint: ['cloth', 2],
    shadowAmount: 0.35,
    lightTint: ['sky', 5],
    lightAmount: 0.35,
    lift: ['ink', 1],
    liftAmount: 0.6,
    snap: 0.2,
  },
  morning: {
    exposure: 1,
    contrast: 1,
    saturation: 1,
    shadowTint: ['water', 3],
    shadowAmount: 0.15,
    lightTint: ['thatch', 6],
    lightAmount: 0.1,
    lift: ['ink', 0],
    liftAmount: 0,
    snap: 0.15,
  },
  day: {
    exposure: 1,
    contrast: 1,
    saturation: 1,
    shadowTint: ['water', 2],
    shadowAmount: 0.03,
    lightTint: ['plaster', 6],
    lightAmount: 0,
    lift: ['ink', 0],
    liftAmount: 0,
    snap: 0,
  },
  golden: {
    exposure: 1,
    contrast: 1.05,
    saturation: 1.15,
    // Darkest tones lean to ink 3 (violet), mids warm toward gold 3 while grass stays green (sunlit, not olive
    // mud — art-director ART-05 review), gold in the lights.
    shadowTint: ['ink', 3],
    shadowAmount: 0.4,
    midTint: ['gold', 3],
    midAmount: 0.15,
    lightTint: ['gold', 3],
    lightAmount: 0.3,
    lift: ['ink', 3],
    liftAmount: 0.3,
    snap: 0.1,
  },
  dusk: {
    exposure: 0.6,
    contrast: 1,
    saturation: 0.8,
    shadowTint: ['sky', 0],
    shadowAmount: 0.85,
    lightTint: ['sky', 2],
    lightAmount: 0.8,
    lift: ['ink', 1],
    liftAmount: 0.9,
    snap: 0.1,
  },
  night: {
    exposure: 1,
    contrast: 1,
    saturation: 0.6,
    // Moonlight: the ground sinks to ink 2…cloth 1 values (darker than the cloth 2 horizon), whitewash stays a
    // pale cool blue. Scotopic curve input keeps equally bright green and brown bands apart.
    curve: [
      [0, 0.134],
      [0.2, 0.139],
      [0.28, 0.154],
      [0.34, 0.17],
      [0.42, 0.186],
      [0.5, 0.2],
      [0.65, 0.32],
      [0.85, 0.58],
      [1, 0.7],
    ],
    scotopic: true,
    shadowTint: ['cloth', 2],
    shadowAmount: 2,
    midTint: ['cloth', 2],
    midAmount: 1,
    lightTint: ['water', 6],
    lightAmount: 1.2,
    lift: ['ink', 2],
    liftAmount: 0,
    snap: 0,
  },
};

// --- Emissive night masks (windows, later forge and fire) --------------------------------------------
/** Opacity of the emissive layer per key (blended like the sky): off by day, partial at golden hour, on at night. */
export const EMISSIVE_LEVELS: Readonly<Record<SkyKeyId, number>> = {
  dawn: 0.35,
  morning: 0,
  day: 0,
  golden: 0.4,
  dusk: 1,
  night: 1,
};

// --- Clouds (ART-07) ---------------------------------------------------------------------------------
export type CloudVariant = 'c1' | 'c2' | 'c3' | 'c4' | 'c5';

export interface CloudPlacement {
  readonly variant: CloudVariant;
  /** Start x in the clouds layer's own space (logical px; the layer moves at parallax 0.1). */
  readonly x: number;
  /** Base row as a share of the sky height from the top (0 = top of the view, 1 = horizon). */
  readonly y: number;
  /** Drift to the right, logical px per second (wind). */
  readonly speed: number;
}

/**
 * Two big clouds high, one mid-size, then a loose group of small ones low over the horizon; the band in between stays
 * mostly open sky (art-director ART-07: an even zig-zag of five read as stamped).
 */
export const CLOUDS: readonly CloudPlacement[] = [
  { variant: 'c1', x: 30, y: 0.13, speed: 1.6 },
  { variant: 'c5', x: 250, y: 0.24, speed: 1.4 },
  { variant: 'c2', x: 400, y: 0.4, speed: 1.1 },
  { variant: 'c3', x: 120, y: 0.74, speed: 0.8 },
  { variant: 'c4', x: 180, y: 0.8, speed: 0.7 },
];
/** Clouds lower than this share of the sky are far away: squashed vertically and see-through toward the sky. */
export const LOW_CLOUD = { below: 0.65, scaleY: 0.7, alpha: 0.7 } as const;

/**
 * Per-key cloud look (blended like the sky). `brightness` multiplies the cloud before the LUT (dark masses at dusk and
 * night instead of daytime clouds with a blue filter); `rim` tints the underside / sun-side rim frame, `rimAlpha`
 * shows it (the glow of a low sun from below; none when the sun is high or gone).
 */
export interface CloudLook {
  readonly brightness: number;
  readonly rim: ColorRef;
  readonly rimAlpha: number;
}
export const CLOUD_LOOKS: Readonly<Record<SkyKeyId, CloudLook>> = {
  dawn: { brightness: 0.8, rim: ['sky', 4], rimAlpha: 0.8 },
  morning: { brightness: 1, rim: ['gold', 5], rimAlpha: 0.25 },
  day: { brightness: 1, rim: ['plaster', 6], rimAlpha: 0 },
  // gold 3 at 0.85: the glow sits into the belly instead of edging it (gold 4 at 1 read as a yellow outline).
  golden: { brightness: 0.95, rim: ['gold', 3], rimAlpha: 0.85 },
  dusk: { brightness: 0.7, rim: ['sky', 3], rimAlpha: 0.6 },
  night: { brightness: 0.45, rim: ['water', 6], rimAlpha: 0 },
};
/** Clouds re-enter on the left once they have drifted this far past the layer's right edge (logical px). */
export const CLOUD_WRAP_MARGIN = 72;

/**
 * Cloud shadows on the ground: scroll speed (px/s, ground plane), opacity at full daylight, and the far strip under the
 * horizon (its height in rows; it scrolls at `farSpeed` × speed, smaller shadows further away).
 */
export const CLOUD_SHADOW = { speed: 6, alpha: 0.24, farRows: 48, farSpeed: 0.5 } as const;
/** Cloud-shadow strength per key (blended like the sky): only with direct sun; none at dusk or night. */
export const CLOUD_SHADOW_LEVELS: Readonly<Record<SkyKeyId, number>> = {
  dawn: 0.25,
  morning: 0.8,
  day: 1,
  golden: 0.55,
  dusk: 0,
  night: 0,
};

// --- Far planes, aerial perspective and haze (ART-08) ------------------------------------------------
/**
 * Air haze per key (blended like the sky), 0..1: thins far planes toward the horizon colour and sets the strength of
 * the dithered haze band over the ground under the horizon. Strongest at dawn (morning mist), weakest at noon.
 */
export const HAZE_LEVELS: Readonly<Record<SkyKeyId, number>> = {
  dawn: 1,
  morning: 0.7,
  day: 0.2,
  golden: 0.4,
  dusk: 0.5,
  night: 0.3,
};
/**
 * Weather `fog`: haze at least this, plane depths scaled down and capped (far fades more than near), a tall dense
 * band over the ground whose top `leadRows` reach above the horizon over the bases of the far planes.
 */
export const FOG = { haze: 1, depthScale: 0.35, maxDepth: 0.8, bandRows: 110, bandCover: 0.85, leadRows: 12 } as const;
/** Clear-air haze band under the horizon: rows at haze 0 and 1, top coverage at haze 1. */
export const HAZE_BAND = { rows: [10, 40], cover: 0.6 } as const;
/** How much haze thins plane depth in clear air (depth × (1 − k·haze)). */
export const HAZE_DEPTH_K = 0.35;
/**
 * Local colour of the nearest planes (groves): `foliage` shade per key, dithered 50 % into the aerial colour. Night
 * and dusk sink it, day lifts it.
 */
export const FOLIAGE_LEVELS: Readonly<Record<SkyKeyId, number>> = {
  dawn: 1,
  morning: 2,
  day: 3,
  golden: 2,
  dusk: 1,
  night: 0,
};

// --- Water: the Dnipro (ART-09) ----------------------------------------------------------------------
/**
 * Mirror reflection of the scene above the horizon, one 1-px row per strip: rows shift by whole px (waves, larger
 * toward the viewer) on a `waveHz` step clock; every `darkEvery` rows a broken line of wave dashes drifts down.
 */
export const WATER = { waveHz: 4, maxShift: 2, darkEvery: 5, maxDashes: 160, maxPath: 90, maxGlints: 28 } as const;

/**
 * Sun/moon path on the water: `sparkle` = loose glints sampled from the disc (high sun, dawn); `column` = a solid
 * vertical path under the disc, 1 px wide far away, up to `width` px at the bank, `core` colour with `edge` dashes
 * (Kuindzhi's moon path; the golden-hour sun column).
 */
export type WaterPath =
  | { readonly kind: 'sparkle'; readonly density: number }
  | { readonly kind: 'column'; readonly core: ColorRef; readonly edge: ColorRef; readonly width: number };

/**
 * Per-key water look. `tint` multiplies the reflection (a step darker and cooler than the sky it shows); `depth`
 * darkens the near rows further (0..1 at the bank; none at night, where the water must not go black); `wave` scales
 * the tint on the wave dashes (darker ripples by day, a moonlit sheen at night); `sheen` is the 1-px waterline at the
 * far bank.
 */
export interface WaterLook {
  readonly tint: number;
  readonly depth: number;
  readonly wave: number;
  readonly sheen: ColorRef;
  readonly path: WaterPath;
}
export const WATER_LOOKS: Readonly<Record<SkyKeyId, WaterLook>> = {
  dawn: { tint: 0xa88e9c, depth: 0.15, wave: 0.85, sheen: ['sky', 6], path: { kind: 'sparkle', density: 0.6 } },
  morning: { tint: 0x98b4d0, depth: 0.2, wave: 0.82, sheen: ['water', 5], path: { kind: 'sparkle', density: 0.35 } },
  day: { tint: 0x8eaccc, depth: 0.22, wave: 0.82, sheen: ['water', 5], path: { kind: 'sparkle', density: 0.3 } },
  golden: {
    tint: 0xc89c8c,
    depth: 0.15,
    wave: 0.85,
    sheen: ['sky', 6],
    path: { kind: 'column', core: ['gold', 4], edge: ['gold', 3], width: 3 },
  },
  dusk: {
    tint: 0x9a8eb2,
    depth: 0.1,
    wave: 0.92,
    sheen: ['sky', 4],
    path: { kind: 'column', core: ['water', 6], edge: ['water', 5], width: 3 },
  },
  night: {
    tint: 0xc8d0f0,
    depth: 0,
    wave: 1.15,
    sheen: ['water', 3],
    path: { kind: 'column', core: ['water', 7], edge: ['water', 5], width: 5 },
  },
};

// --- Light shafts (ART-10 spike) -----------------------------------------------------------------------
/**
 * Per-key light shafts: strength 0..1, light colour and dust colour. Only a low sun (dawn, golden hour) casts them
 * (ART-BIBLE §8).
 */
export const RAY_LOOKS: Readonly<
  Record<SkyKeyId, { readonly level: number; readonly color: ColorRef; readonly dust: ColorRef }>
> = {
  dawn: { level: 0.9, color: ['sky', 6], dust: ['plaster', 6] },
  morning: { level: 0.3, color: ['gold', 5], dust: ['plaster', 6] },
  day: { level: 0, color: ['plaster', 6], dust: ['plaster', 6] },
  golden: { level: 1, color: ['gold', 4], dust: ['gold', 5] },
  dusk: { level: 0.15, color: ['sky', 4], dust: ['gold', 5] },
  night: { level: 0, color: ['water', 6], dust: ['water', 7] },
};
/**
 * Shaft geometry: reach from the sun (logical px), the densest dither share at the sun, the polar shadow map's
 * angle bins, dust motes (≤ 40, ART-10), and for the beam variant the fan of beam angles (degrees from +x, screen y
 * down) with their end widths.
 */
export const RAYS = {
  reach: 300,
  cover: 0.3,
  bins: 720,
  dust: 40,
  beams: [-18, -6, 8, 22, 40],
  beamWidth: 20,
  /** Occlusion variant per tier: buffer resolution (logical px per buffer px) and repaints per second. */
  high: { scale: 1, repaintHz: 8 },
  med: { scale: 2, repaintHz: 4 },
  /** Beam variant: seconds to fade out when the sun goes behind a cloud (and back in). */
  beamFade: 1,
} as const;
/** Cloud footprints for the shadow map (logical px, approximate the generated sprites: width, height above base). */
export const CLOUD_FOOTPRINTS: Readonly<Record<CloudVariant, { readonly w: number; readonly h: number }>> = {
  c1: { w: 116, h: 30 },
  c2: { w: 88, h: 30 },
  c3: { w: 66, h: 26 },
  c4: { w: 50, h: 18 },
  c5: { w: 100, h: 30 },
};

// --- Wind (ART-13; ART-14 sway and the land-1 wind mechanic build on it) ------------------------------------
/** Wind strength 0..1 (calm … gale). M6 weather makes it deterministic per time; for now a fixed breeze. */
export const WIND = { strength: 0.55 } as const;
/**
 * Sail frames per second for a wind strength: 8 frames make a quarter turn, so 2 fps (a lazy turn in light air) to
 * 10 fps (a full turn in 3.2 s in a gale). Whole frames only: the sails never sit at a sub-px angle.
 */
export function sailFps(strength: number): number {
  const s = Math.min(1, Math.max(0, strength));
  return 2 + 8 * s;
}
