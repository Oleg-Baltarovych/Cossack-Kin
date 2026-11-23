// Visual tuning of the time of day (plan §0, ART-04; ART-BIBLE §8). Data only — no Pixi, no DOM, no JSON
// imports — so `assets-src/luts/gen.ts` (Node, tools project) reads the same numbers as render.
// Colors are palette references `[ramp, index]` (index 0 = darkest), resolved by the consumer.
import type { RampName } from '../palette.ts';
import { SHEET, TIER_CELEBRATION_MS } from '../../content/juice.ts';
import { FOREGROUND_PARALLAX } from '../../content/villages/khortytsia.layout.ts';

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

/**
 * File name of a key's grading LUT in `public/luts/`: `<HHMM>.png` (clear and fog), `<HHMM>-rain.png` (rain, M2-29 A4).
 */
export const lutFile = (lut: string, weather: 'clear' | 'rain' | 'fog'): string =>
  weather === 'rain' ? `${lut}-rain.png` : `${lut}.png`;

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
/**
 * Stepped band edges of the sky dither (M2-29, ART-BIBLE §8.2 «шви дизеру»; skyPaint `bandShift`): the gradient's row
 * holds over runs of `runMin`–`runMax` columns and drifts run to run in stairs of 1–`depthMax` whole px up or
 * down (A3, art-director: teeth of one depth on one grid read as a dashed rule). Each band of `cellRows` rows moves the run
 * grid `phaseStep` ± up to `phaseJitter` − 1 columns on from the band above (3–7 of 12: never the same grid).
 */
export const SKY_BAND_EDGES = {
  runMin: 3,
  runMax: 12,
  cellRows: 24,
  depthMax: 3,
  phaseStep: 5,
  phaseJitter: 3,
} as const;

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
    curve: 1.8,
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
  /** Hues the tone curve spares (M2-29 A4): part of the luminance it took is given back (see `HueKeep`). */
  readonly hueKeep?: readonly HueKeep[];
}

/**
 * A hue band the tone curve spares: a colour whose HSV hue lies in [from, to] (degrees, wraps past 360; `feather`
 * degrees of soft edge outside) and whose HSV saturation is past `sat[0]` (full from `sat[1]`) gets `keep` of the
 * luminance the curve took given back. The saturation gate keeps near-grey whitewash and muted ground out.
 */
export interface HueKeep {
  readonly from: number;
  readonly to: number;
  readonly feather: number;
  readonly sat: readonly [number, number];
  readonly keep: number;
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
    contrast: 1,
    saturation: 1.25,
    // Tonal structure (M2-29, ART-19 deferred 1, Kuindzhi «Вечір на Україні»): the luminance curve sinks the meadow
    // and tree masses (grass 2–3, foliage: y 0.2–0.45) about a ramp step while whitewash and sunlit thatch (y ≥ 0.75)
    // keep their value, so the lit walls glow on a dark ground; mids take thatch 2 — a deep warm olive, not brown
    // mud (green stays ≥ red, luts.test). Darkest tones lean to ink 3 (violet), gold in the lights.
    curve: [
      [0, 0],
      [0.2, 0.13],
      [0.3, 0.185],
      [0.42, 0.29],
      [0.55, 0.43],
      [0.66, 0.65],
      [0.8, 0.8],
      [1, 1],
    ],
    shadowTint: ['ink', 3],
    shadowAmount: 0.3,
    midTint: ['thatch', 2],
    midAmount: 0.4,
    lightTint: ['gold', 3],
    lightAmount: 0.3,
    lift: ['ink', 3],
    liftAmount: 0.2,
    snap: 0.1,
    // M2-29 A4 (art-director A3 deferrals): the curve must not sink what the low sun lights up — the red of the
    // mallows and banners (crimson) and the sunlit log faces of the Sich (wood 3–5).
    hueKeep: [
      { from: 335, to: 12, feather: 8, sat: [0.55, 0.7], keep: 0.85 },
      { from: 22, to: 33, feather: 4, sat: [0.55, 0.62], keep: 0.6 },
    ],
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

/**
 * Rain grade (M2-29 A4, ART-19 deferred 3): under a closed overcast there is no direct sun, so each key loses colour
 * by day (the land greys toward the sky; the wet film over it darkens it about a ramp step) and the golden key loses its
 * sun-only tonal structure — no sunk meadow under glowing walls, only a gentle evening dip and a warm cast (A3: rain at
 * 19:30 had become the darkest daytime frame). `pnpm luts` writes them as `public/luts/<HHMM>-rain.png`; the world
 * loads the set of its weather (`loadLuts`).
 */
export const RAIN_GRADE_LOOKS: Readonly<Record<SkyKeyId, GradeLook>> = {
  dawn: { ...GRADE_LOOKS.dawn, saturation: 0.6 },
  morning: { ...GRADE_LOOKS.morning, saturation: 0.62, shadowTint: ['stone', 2], shadowAmount: 0.2, lightAmount: 0 },
  day: { ...GRADE_LOOKS.day, saturation: 0.62, shadowTint: ['stone', 2], shadowAmount: 0.2 },
  golden: {
    exposure: 1,
    contrast: 0.95,
    saturation: 0.72,
    curve: [
      [0, 0],
      [0.3, 0.26],
      [0.6, 0.56],
      [1, 1],
    ],
    shadowTint: ['ink', 3],
    shadowAmount: 0.25,
    midTint: ['thatch', 2],
    midAmount: 0.2,
    lightTint: ['sky', 5],
    lightAmount: 0.15,
    lift: ['ink', 3],
    liftAmount: 0.15,
    snap: 0.1,
  },
  // Dusk and night already grade the land to one cool tint (saturation does not show through it): kept as they are.
  dusk: GRADE_LOOKS.dusk,
  night: GRADE_LOOKS.night,
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

/**
 * Day-only props (M2-06 bees, art-director): shown while the emissive level (EMISSIVE_LEVELS) is below `maxEmissive` —
 * morning, day, golden hour (0.4) and dawn (0.35); gone at dusk and night (1). Never shown under «менше руху».
 */
export const DAYTIME_PROPS = { maxEmissive: 0.5 } as const;

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
 * Two big clouds and a mid-size one in the sky the game shows (M2-29 framing, art-director 2nd pass: c1/c5 lay wholly
 * under the HUD), then a loose group of small ones low over the horizon. Bases from 0.53 of the sky height: every cloud
 * stands wholly below the HUD edge on the reference phones (clouds.test). The big ones at three heights (no 2×2
 * checker) and clear of the night moon's disc and halo core in every zone's frame at freeze 0 (art-director M2-29a:
 * a cloud chopped the moon in the Sich night frame; clouds.test) — so they keep to the layer's ends, where the moon is
 * not, and the small ones fill the middle low over the horizon.
 */
export const CLOUDS: readonly CloudPlacement[] = [
  { variant: 'c1', x: 10, y: 0.53, speed: 1.6 },
  { variant: 'c2', x: 330, y: 0.58, speed: 1.1 },
  { variant: 'c5', x: 480, y: 0.63, speed: 1.4 },
  { variant: 'c3', x: 160, y: 0.76, speed: 0.8 },
  { variant: 'c4', x: 250, y: 0.84, speed: 0.7 },
];
/**
 * Clouds lower than this share of the sky are far away: squashed vertically and see-through toward the sky.
 * `scaleY` = p/q with p even and q odd (12/17 ≈ 0.7): a row's sample point (j + ½)·q/p is then never on a texel edge,
 * so nearest sampling never hits a tie that UV rounding — i.e. the atlas layout — decides (M2-09: 0.7 = 7/10 tied
 * every 7th row and flipped those rows when the clouds moved to the `sky` atlas).
 */
export const LOW_CLOUD = { below: 0.65, scaleY: 12 / 17, alpha: 0.7 } as const;

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
/**
 * Clear-air haze band under the horizon: rows at haze 0 and 1, top coverage at haze 1; `edge` px over which it fades
 * out before a zone without ground haze (M2-01: the Sich's rampart).
 */
export const HAZE_BAND = { rows: [10, 40], cover: 0.6, edge: 32 } as const;
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
 * Where the river ends (M2-01 seam review): broken 1-px foam on the waterline (`share` of the rows, `len` px, changing
 * `hz` times a second), and the sun/moon path stops `pathGap` px before the bank.
 */
export const RIVER_END = { foamShare: 0.45, foamLen: 2, foamHz: 1, pathGap: 4 } as const;

/**
 * Sun/moon path on the water: `sparkle` = loose glints sampled from the disc (high sun, dawn); `column` = a solid
 * vertical path under the disc, 1 px wide far away, up to `width` px at the bank, `core` colour with `edge` dashes
 * (the golden-hour sun column); `dashes` = a short moon glint near the far bank: a few broken horizontal dashes, the
 * widest on top (M2-01 art review: the night column read as a tall spike).
 */
export type WaterPath =
  | { readonly kind: 'sparkle'; readonly density: number }
  | { readonly kind: 'column'; readonly core: ColorRef; readonly edge: ColorRef; readonly width: number }
  | { readonly kind: 'dashes'; readonly core: ColorRef; readonly edge: ColorRef };

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
    path: { kind: 'dashes', core: ['water', 6], edge: ['water', 5] },
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
/** Wind strength 0..1 (calm … gale) without a game attached (render alone, the M-ART look): a breeze. */
export const WIND = { strength: 0.55 } as const;
/**
 * The game's wind (land 1 mechanic, core `windAt`) as a strength for sails and sway (M1-19): calm barely turns the
 * sails and stills the grass, a storm bends everything. Breeze = the M-ART look.
 */
export const WIND_STRENGTH = { calm: 0.15, breeze: WIND.strength, storm: 0.95 } as const;
/**
 * Sail frames per second for a wind strength: 8 frames make a quarter turn, so 2 fps (a lazy turn in light air) to
 * 10 fps (a full turn in 3.2 s in a gale). Whole frames only: the sails never sit at a sub-px angle.
 */
export function sailFps(strength: number): number {
  const s = Math.min(1, Math.max(0, strength));
  return 2 + 8 * s;
}

// --- Plant sway and the foreground (ART-14) -------------------------------------------------------------------
/**
 * Sway of trees and plants: the generator bakes `frames` sprites leaning −2…+2 px at the top (whole-px row offsets,
 * ART-BIBLE §5), render only picks one. The top swings a·sin(2π·f·t) with f from `hz` (calm … gale), a = `maxShift`
 * × the plant's own `amp` × wind strength, breathed by a slow gust (± `gustDepth`).
 */
export const SWAY = {
  frames: 5,
  maxShift: 2,
  hz: { calm: 0.25, gale: 0.55 },
  gustHz: 0.045,
  gustDepth: 0.35,
} as const;
/**
 * Foreground layer (SPEC §6.2 layer 5): plant clumps nearer than the farm, moving faster than the ground (parallax).
 * Over a person behind it a clump drops to `fadeAlpha`, so no one is hidden behind the grass.
 */
export const FOREGROUND = { parallax: FOREGROUND_PARALLAX, fadeAlpha: 0.5 } as const;

// --- Night lights (ART-16; ART-BIBLE §8 night: blue, fire light warm and local) --------------------------------
/**
 * The campfire (flame frames cycle at the prop's `animate` rate, emissive, post-grade): its light pool on the ground
 * flickers between 1 − `flicker.depth` and 1 in 1/8 steps, `flicker.hz` changes a second (seeded, so `?freeze` frames
 * repeat); up to `sparks` 1-px sparks rise `sparkRise` px over `sparkLife` s.
 */
export const FIRE = {
  flicker: { hz: 8, depth: 0.25 },
  sparks: 10,
  sparkRise: 30,
  sparkLife: 1.4,
  spark: ['gold', 5],
} as const;
/** A fire's light pool on the ground: a round ellipse rx × ry, flickering like the fire (`FIRE.flicker`). */
export interface FireLight {
  readonly rx: number;
  readonly ry: number;
  readonly alpha: number;
  readonly color: ColorRef;
  /** Ground offset of the pool's centre from the prop's pivot row, logical px (negative = up, behind the pivot). */
  readonly below: number;
  /** Horizontal offset of the pool's centre from the pivot (a fire off the sprite's axis: the beacon), default 0. */
  readonly dx?: number;
}
/**
 * Fire props (by sprite id) and their pools: the campfire's wide pool centred on the flames (ART-16, ART-BIBLE §8.3),
 * the watchtower's beacon (M2-09) and the smithy's forge (M2-08) — smaller, in front of the open bay. Every other prop with an `@emissive` frame gets
 * a flat `WINDOW_POOL`.
 */
export const FIRE_LIGHTS: Readonly<Record<'campfire' | 'forge' | 'watchtower.t3' | 'watchtower.t4', FireLight>> = {
  campfire: { rx: 46, ry: 20, alpha: 0.6, color: ['gold', 2], below: -4 },
  forge: { rx: 30, ry: 12, alpha: 0.5, color: ['gold', 2], below: -2 },
  // The watchtower's beacon (M2-09): a small warm halo round the basket high on the tower (generator
  // `watchtowerBeacon`, unit-tested); it replaces the slits' window pool.
  'watchtower.t3': { rx: 12, ry: 9, alpha: 0.45, color: ['gold', 2], below: -79, dx: 17 },
  'watchtower.t4': { rx: 12, ry: 9, alpha: 0.45, color: ['gold', 2], below: -82, dx: 19 },
};
/**
 * A guard's torch (M2-19): a small warm pool on the rampart round his feet, centred `dx` px toward the torch hand
 * (mirrored with the guard), flickering like a fire. One per guard holding a torch (≤ `max`: the scene's guard posts).
 */
export const TORCH_LIGHT: FireLight & {
  /** Flicker seeds `seedBase + agent id`: clear of the props' seeds (their index in the zone), one per guard. */
  readonly seedBase: number;
  /** Torch pools at most (the scene's guard posts, content test): a budget guard for the light layer. */
  readonly max: number;
} = { rx: 13, ry: 6, alpha: 0.5, color: ['gold', 2], below: 0, dx: 3, seedBase: 1000, max: 4 };
/**
 * Window light spilling on the ground in front of every building with a night mask (M2-29 focal glow, ART-19 deferred
 * 2 — Kuindzhi's warm ground under the windows): the near half of an ellipse (`paintSpill`) `rxShare` × the sprite
 * width (a prop's `poolRx` overrides it) × `widen` each side (at least `minRx`), reaching `ry` rows out from the wall
 * foot `below` rows under the pivot — strongest at the wall, dithered out; a slow candle flicker.
 */
export const WINDOW_POOL = {
  rxShare: 0.45,
  widen: 1.25,
  minRx: 4,
  ry: 14,
  below: 0,
  alpha: 0.6,
  color: ['gold', 2],
} as const;
/**
 * Light pools are alpha-blended (not additive: orange added to the blue night ground lands on grey-pink), so the
 * middle step reads amber (gold 2 at 0.6 over the night ground ≈ #916037, art-director ART-16). They show only once
 * the emissive level is past `from` (no grey smudge on sunlit ground at golden hour).
 */
export const POOLS = { from: 0.5 } as const;
/**
 * Moonlight on the ground props' upper edges (M2-29, art-director M2-15 tail 5 + ART-BIBLE §8.8 «холодний місячний
 * верх стін»): at night everything away from a window read as one flat blue. A 1-px rim (`render/fx/moonRim.ts`, one
 * filter pass on the sorted props before the grade; pixi-filters `BevelFilter` until M2-29 A4) pulls every px whose neighbour toward the moon — one up and one toward the
 * moon's side — is open air `alpha` of the way to `color`; through the night LUT's steep low end that is about one
 * ramp step lighter on dark wood and thatch and next to nothing on whitewash. The scene's exposure is untouched. Per
 * key in `MOON_RIM_LEVELS` (blended like the sky); only under a clear sky with the moon up.
 */
export const MOON_RIM = { color: ['plaster', 6], alpha: 0.45, thin: 0.2 } as const satisfies {
  readonly color: ColorRef;
  readonly alpha: number;
  /** Share of the rim the px of a 1-px vertical line keep below its top px (willow strands, thin stakes; M2-29 A4). */
  readonly thin: number;
};
export const MOON_RIM_LEVELS: Readonly<Record<SkyKeyId, number>> = {
  dawn: 0,
  morning: 0,
  day: 0,
  golden: 0,
  dusk: 0.5,
  night: 1,
};
/**
 * Summer fireflies over the meadow (≤ 40, SPEC §6.3): each blinks on for `blinkOn` of its 3–5 s cycle, the first
 * `peak` of it with a dim + of 4 neighbours (so the blink registers among the 1-px grass highlights); yellow-green.
 * `count` (and the tier's limit) is for an area `span` px wide; a zone's area gets its share by width (M2-01).
 */
export const FIREFLIES = { count: 32, span: 720, blinkOn: 0.4, peak: 0.3, color: ['grass', 6] } as const;

// --- Weather: rain and fog (ART-17) ------------------------------------------------------------------------------
/** An overcast rain sky per key: a grey chain (dark → light, last step unused: no sun disc), flat with a lighter horizon. */
const overcast = (chain: readonly ColorRef[]): Omit<SkyLook, 'sunHalo' | 'moonHalo' | 'sun'> => ({
  chain,
  top: 0.4,
  horizon: chain.length - 2.2,
  curve: 1.3,
  baseMax: chain.length - 2,
  glow: 0.4,
  glowHeight: 0.3,
  streaks: 0.6,
  stars: 0,
  moon: 0,
});
export const OVERCAST_CHAINS: Readonly<Record<SkyKeyId, readonly ColorRef[]>> = {
  dawn: [
    ['stone', 1],
    ['stone', 2],
    ['stone', 3],
    ['plaster', 1],
    ['plaster', 2],
    ['plaster', 3],
  ],
  morning: [
    ['stone', 2],
    ['stone', 3],
    ['stone', 4],
    ['plaster', 2],
    ['plaster', 3],
    ['plaster', 4],
  ],
  day: [
    ['stone', 2],
    ['stone', 3],
    ['stone', 4],
    ['plaster', 2],
    ['plaster', 3],
    ['plaster', 4],
  ],
  // M2-29 A4: one step muter (no clear-sky sunset over the greyed rain land) — sun breaking under the storm edge.
  golden: [
    ['stone', 1],
    ['stone', 2],
    ['plaster', 0],
    ['plaster', 1],
    ['sky', 3],
    ['sky', 4],
  ],
  // One hue family per chain: alternating blue and grey steps band into stripes (night, first try).
  dusk: [
    ['stone', 0],
    ['stone', 1],
    ['stone', 2],
    ['sky', 2],
    ['sky', 3],
    ['sky', 4],
  ],
  // Night: one neutral grey from top to horizon (art-director ART-17: blue cloth stops over grey ones read as two
  // temperatures in one sky).
  night: [
    ['stone', 0],
    ['stone', 1],
    ['stone', 2],
    ['stone', 3],
    ['stone', 4],
    ['stone', 5],
  ],
};
export const OVERCAST_LOOKS: Readonly<Record<SkyKeyId, ReturnType<typeof overcast>>> = {
  dawn: overcast(OVERCAST_CHAINS.dawn),
  morning: overcast(OVERCAST_CHAINS.morning),
  day: overcast(OVERCAST_CHAINS.day),
  golden: overcast(OVERCAST_CHAINS.golden),
  dusk: overcast(OVERCAST_CHAINS.dusk),
  night: overcast(OVERCAST_CHAINS.night),
};
/** Fog: a light, nearly flat grey sky (dark → light per key; the ART-08 deferral: no blue left in the murk). */
export const FOG_LOOKS: Readonly<Record<SkyKeyId, ReturnType<typeof overcast>>> = {
  dawn: {
    ...overcast([
      ['stone', 2],
      ['stone', 3],
      ['plaster', 1],
      ['plaster', 2],
      ['plaster', 3],
      ['plaster', 4],
    ]),
    top: 3,
  },
  morning: {
    ...overcast([
      ['stone', 3],
      ['stone', 4],
      ['plaster', 2],
      ['plaster', 3],
      ['plaster', 4],
      ['plaster', 5],
    ]),
    top: 3,
  },
  day: {
    ...overcast([
      ['stone', 3],
      ['stone', 4],
      ['plaster', 2],
      ['plaster', 3],
      ['plaster', 4],
      ['plaster', 5],
    ]),
    top: 3,
  },
  golden: {
    ...overcast([
      ['stone', 2],
      ['stone', 3],
      ['plaster', 1],
      ['sky', 4],
      ['sky', 5],
      ['sky', 6],
    ]),
    top: 3,
  },
  dusk: {
    ...overcast([
      ['stone', 0],
      ['stone', 1],
      ['stone', 2],
      ['sky', 2],
      ['sky', 3],
      ['sky', 4],
    ]),
    top: 2.9,
  },
  night: {
    ...overcast([
      ['cloth', 0],
      ['stone', 0],
      ['stone', 1],
      ['stone', 2],
      ['stone', 3],
      ['stone', 4],
    ]),
    top: 2.9,
  },
};
/**
 * Fog sky extras (the ART-08 deferral): soft streaks and a small pale sun disc; the chain is FOG_LOOKS.
 */
export const FOG_SKY = { streaks: 0.3, sunRadius: 3 } as const;
/** Air haze under rain (at least this much): the far planes fade toward the grey horizon. */
export const RAIN_HAZE = 0.6;

/**
 * Rain (ART-17): two tiled streak textures `tile` px square (far: short, sparse, slow; near: longer, faster),
 * slanted `slant` px across per px down by the wind, scrolled in whole px; colour and alpha per key (the light layer
 * is not graded). `splashes` ≤ 80 short-lived specks on the ground, ripples in the river band.
 */
export const RAIN = {
  tile: 64,
  slant: 0.25,
  far: { count: 20, len: 3, speed: 150, alpha: 0.3 },
  near: { count: 9, len: 5, speed: 280, alpha: 0.45 },
  splashes: 64,
  splashLife: 0.3,
} as const;
export const RAIN_LOOKS: Readonly<
  Record<
    SkyKeyId,
    { readonly streak: ColorRef; readonly wet: number; readonly puddle: ColorRef; readonly ripple: ColorRef }
  >
> = {
  // Night: a light film only — on top of the night grade a strong one sinks fences and trees into one field.
  dawn: { streak: ['stone', 4], wet: 0.25, puddle: ['stone', 4], ripple: ['water', 6] },
  morning: { streak: ['stone', 4], wet: 0.25, puddle: ['stone', 4], ripple: ['water', 6] },
  day: { streak: ['stone', 5], wet: 0.25, puddle: ['stone', 5], ripple: ['water', 7] },
  // Golden streaks grey (M2-29 A4): warm drops over the greyed land read as orange specks.
  golden: { streak: ['stone', 4], wet: 0.25, puddle: ['sky', 5], ripple: ['sky', 6] },
  dusk: { streak: ['stone', 3], wet: 0.18, puddle: ['sky', 3], ripple: ['water', 5] },
  night: { streak: ['stone', 2], wet: 0.12, puddle: ['stone', 3], ripple: ['water', 4] },
};
/** Wet ground: a dark film (ink 1) over the land below the river band, alpha per key (RAIN_LOOKS.wet). */
export const WET = { color: ['ink', 1] } as const;
/**
 * Rain at night: the night key's share of the world grade is capped here, the rest from its neighbour key (dusk), so
 * the land keeps enough value separation that fences and trees read with no moon (art-director ART-17).
 */
export const RAIN_NIGHT_GRADE = 0.7;
/**
 * Cast shadows under rain (M2-29 A4, ART-19 deferred 3): no direct sun, so the props' `@shadow` frames (contact ellipse
 * and the down-right cast) fade to a soft occlusion at this alpha.
 */
export const RAIN_SHADOWS = { alpha: 0.45 } as const;

// --- Quality tiers and auto-detect (ART-18) ---------------------------------------------------------------------
/**
 * Per-tier effect budgets. Light shafts have their own variants (RAYS, `rayVariant`); the rest scale here: dust
 * motes in the shafts, campfire sparks, fireflies, rain splashes, the far rain layer, cloud shadows on the ground,
 * chimney smoke puffs per chimney (M2-11).
 */
export const QUALITY_TIERS = {
  low: { dust: 0, sparks: 4, fireflies: 12, splashes: 24, rainFar: false, cloudShadows: false, smoke: 4 },
  med: { dust: 20, sparks: 8, fireflies: 24, splashes: 40, rainFar: true, cloudShadows: true, smoke: 6 },
  high: { dust: 40, sparks: 10, fireflies: 32, splashes: 64, rainFar: true, cloudShadows: true, smoke: 8 },
} as const;

// --- Building life (M2-11, SPEC §6.3 wind, §6.5 idle animation) ------------------------------------------------
/**
 * Chimney smoke: each chimney keeps `QUALITY_TIERS[q].smoke` puffs (`smoke` frames 0–2 by age, `ages` the frame
 * boundaries) staggered over `life` s, so the plume is continuous. A puff climbs up to `rise` px, easing out; the wind
 * (strength s, 0..1) bends it downwind (+x, the way the clouds drift) by `lean.calm` (the game's calm wind) … `lean.gale` px per px climbed
 * and flattens it (`flatten`: the share of the climb a gale takes away). `wobble` = whole px a puff wanders sideways.
 * «Менше руху»: a still plume of `stillPuffs` puffs at fixed ages, leaning with the wind (not particles: it never moves).
 */
export const SMOKE = {
  life: 7,
  rise: 30,
  lean: { calm: 0.12, gale: 1.6 },
  flatten: 0.45,
  wobble: 1,
  ages: [0.22, 0.55],
  stillPuffs: 3,
} as const;
/**
 * Boats (render/boats.ts): a drifting boat swings `drift` px each way over `driftPeriod` s on the stream; ripple frames
 * (3) cycle at `rippleFps`. Both stand still under «менше руху».
 */
export const BOATS = { driftPeriod: 38, rippleFps: 3 } as const;
export type QualityTier = (typeof QUALITY_TIERS)[keyof typeof QUALITY_TIERS];
/**
 * Auto quality (`?quality` absent, live time): start at `med`, skip `warmup` s of start-up, then the mean fps over
 * `window` s picks the tier — ≥ `high` fps → high, < `low` → low, else med. Never under `?freeze` (screenshots). A gap
 * over `maxGapMs` between frames (a hidden tab, a paused webview) restarts the measurement: no frames ≠ slow frames.
 */
export const AUTO_QUALITY = { start: 'med', warmup: 1, window: 3, high: 57, low: 45, maxGapMs: 250 } as const;

// --- Tap coins (M1-19, SPEC §6.7) ------------------------------------------------------------------------------
/**
 * A ducat from a tap: rises `rise` logical px over `life` s (ease-out), spins at `spinFps` through its 4 frames, fades
 * after `fadeFrom` of its life. `max` in the air at once (10 taps/s cap × life). «Менше руху»: still, `stillLife` s.
 */
export const COIN = {
  life: 0.7,
  stillLife: 0.4,
  rise: 14,
  spinFps: 12,
  fadeFrom: 0.55,
  max: 8,
  stillFrame: 0,
} as const;
/**
 * The work-done cue (plan M2-18, review): a tool glint (`glint`, 4 frames: point → star → point) born `lift` px above
 * the worker's feet as a spell of work ends — decoration of a building that stands, deliberately unlike the tap coin
 * (no disc, no gold, no amount, nothing read from the economy). At most `perFrame` start in one frame (a catch-up
 * after a hitch finishes several spells at once); `max` in the air.
 */
export const WORK_GLINT = {
  life: 0.9,
  stillLife: 0.5,
  rise: 6,
  spinFps: 8,
  fadeFrom: 0.6,
  max: 4,
  stillFrame: 2,
  lift: 30,
  perFrame: 3,
} as const;

// --- Construction and tier juice (M2-12, SPEC §6.5/§6.7, plan Q5) ------------------------------------------------
/**
 * A new building (level 0 → 1): 3 scaffold stages of `stageMs` each (the building hidden; `dust` puffs at the
 * scaffold's foot, ≤ `dustRise` px up, `dustLife` ms each), then it pops 1 → `popPeak` → 1 over `popMs` (≤ 200 ms,
 * Q5: whole-px sizes in the low-res RT) while `confetti` pieces burst for `confettiMs` (thrown up at `confettiUp` px/s
 * ± `confettiJitter`, sideways ≤ `confettiSide` px/s, falling at `gravity` px/s², tumbling at `confettiFlipFps`).
 * A new tier: a flash (3 frames over `flashMs`) and a standard rising through its 6 frames at `standardFps`, standing
 * until `celebrationMs`. «Менше руху»: no pop, confetti, dust or flash; the standard stands raised. A scaffold frame
 * taller than `largeMinH` and at least `largeMinRatio` × its width (a house, not a field) takes the large scaffold;
 * dust kicks up along the scaffold's footprint `scaffoldW`.
 */
export const BUILD = {
  stageMs: 400,
  popMs: 180,
  popPeak: 1.08,
  confettiMs: 1200,
  confetti: 24,
  confettiUp: 70,
  confettiJitter: 30,
  confettiSide: 40,
  gravity: 140,
  confettiFlipFps: 10,
  /** The burst starts this share of the base frame's height above its pivot (frames are padded, not trimmed). */
  confettiFrom: 0.4,
  dust: 4,
  dustRise: 6,
  dustLife: 500,
  flashMs: 180,
  standardFps: 10,
  celebrationMs: TIER_CELEBRATION_MS,
  largeMinH: 56,
  largeMinRatio: 0.5,
  /** Footprints of the `scaffold.s|l` looks (the generator's SCAFFOLD_LOOKS; a gen test holds them equal). */
  scaffoldW: { s: 40, l: 56 },
} as const;

/**
 * A building's 1-px warm outline (M2-29, art-director M2-15 tails 2–3; render/fx/outline.ts, after the grade): while
 * its row is the selected one in the sheet — a closed ring, `select.day`, or `select.night` once the emissive level
 * reaches `nightFrom` (the light pools' threshold: a softer gold beside the lit windows). From `nightFrom` on, a new
 * tier flashes as a warm rim light on the building instead of the day star (art-director M2-29a: a closed ring read as
 * «selected»): only the edges facing the light (top and left), pulsing with the flash's three steps over `flashRimMs`
 * — `[share of the time, colour]` per step, gold 1 → gold 2 → gold 1 (opaque, so every px stays a palette colour). «Менше руху»: no flash, so no rim; the selection stays.
 */
export const PLOT_MARK = {
  select: { day: ['gold', 4], night: ['gold', 3] },
  nightFrom: 0.5,
  flashRimMs: 480,
  flashRimSteps: [
    [0.25, ['gold', 1]],
    [0.7, ['gold', 2]],
    [1, ['gold', 1]],
  ],
} as const satisfies {
  readonly select: { readonly day: ColorRef; readonly night: ColorRef };
  readonly nightFrom: number;
  readonly flashRimMs: number;
  readonly flashRimSteps: readonly (readonly [number, ColorRef])[];
};

// --- Camera (M2-02, SPEC §6.1) ---------------------------------------------------------------------------------
/**
 * Camera motion (render/camera/motion.ts), logical px and ms. A press that moved more than `slopPx` is a drag (never a
 * tap); a fling keeps the drag's speed over the last `velocityWindowMs`, capped at `maxSpeed` px/s, and decays as
 * e^(−friction·t) until it is under `stopSpeed` px/s — ln(maxSpeed / stopSpeed) / friction ≈ 0.88 s ≤ 1 s (plan M2-02).
 * A tab or a double tap glides there in `glideMs` (ease in-out; ≤ 600 ms); two taps within `doubleTapMs` and
 * `doubleTapSlopPx` of each other are a double tap; its centring waits `doubleTapMs` more and a third tap cancels it
 * (tapping to earn never moves the camera). Logical px ≈ CSS px on phones (scale ≈ dpr), so the old 8 CSS px tap slop
 * carries over. The tab follows the settled camera; it keeps its zone until the view centre is `zoneHysteresisPx`
 * past the zone's edge.
 */
export const CAMERA = {
  slopPx: 8,
  velocityWindowMs: 80,
  maxSpeed: 2400,
  friction: 6,
  stopSpeed: 12,
  glideMs: 500,
  doubleTapMs: 300,
  doubleTapSlopPx: 16,
  zoneHysteresisPx: 32,
  /** Pinch (M2-03): spread to 1.25× the finger distance → closer level; pinch to 0.8× → normal (from the last switch). */
  pinchInRatio: 1.25,
  pinchOutRatio: 0.8,
  /** Fingers closer than this (normal-level logical px ≈ css px) do not measure a ratio (two fingers landing together). */
  pinchMinBasePx: 24,
  /** Ctrl+wheel: accumulated |deltaY| (css px) per level switch, so trackpad jitter cannot flip levels. */
  wheelZoomPx: 50,
  /** Closer level (M2-03 review): rows kept between the sun/moon disc centre and the window edge or the horizon. */
  skyDiscMarginPx: 12,
} as const;

/**
 * Default framing (M2-29 «Хвости M2-15» (1), owner 2026-11-20; camera.ts `horizonRow`): the horizon at 35 % of the
 * world window between the HUD and the half-open sheet, so the village — not the sky — fills the screen. `windowTop`
 * is the HUD's height share, a measured constant (e2e framing.spec checks the result on every phone): 11.4 % on 390×844,
 * 12.1 % on 360×800, 11.7 % on 412×915. Safe-area insets are ignored (none on the reference phones; a notch would push
 * the HUD — and the window — down, so re-measure then). The window's bottom is the sheet's half state. Resulting horizon
 * ≈ 32 % of the frame (it was 42 %).
 *
 * `closer`: the closer zoom level's start (`?zoom=1`, camera.ts `framedY`) frames the sheet-less window — HUD bottom to
 * the screen bottom — so the village fills the screen instead of the plain ground under it. Pinch and ctrl+wheel keep
 * the world point under the fingers / cursor instead.
 */
export const FRAMING = {
  windowTop: 0.117,
  windowBottom: 1 - SHEET.halfRatio,
  horizon: 0.35,
  closer: { windowTop: 0.117, windowBottom: 1, horizon: 0.35 },
} as const;

/**
 * Tap on a building (plan M2-13, SPEC §3.3): a miss within `slopPx` logical px of a building's drawn px still opens its
 * row (Chebyshev rings, nearest first). When its row opens in the bottom sheet at the closer zoom level, the camera
 * moves up just enough that the building's ground row stands `revealMarginPx` rows above the sheet's top edge.
 */
export const PLOT_TAP = {
  slopPx: 2,
  revealMarginPx: 4,
} as const;
