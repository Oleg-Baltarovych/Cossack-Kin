// Render-side settings. In production they are always the defaults; dev/test builds derive them from
// debug URL params (render/debug/params.ts). Field names are deliberately neutral so the production
// bundle carries no debug vocabulary (plan M0-05: no `freeze` string in dist/).

export const WEATHERS = ['clear', 'rain', 'fog'] as const;
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export const ZONES = ['farm', 'suburb', 'sich'] as const;
export const QUALITIES = ['low', 'med', 'high'] as const;

export type Weather = (typeof WEATHERS)[number];
export type Season = (typeof SEASONS)[number];
export type Zone = (typeof ZONES)[number];
export type Quality = (typeof QUALITIES)[number];

export interface RenderSettings {
  /** Cosmetic RNG seed; `null` = random per session. */
  readonly seed: number | null;
  /** Animation time pinned to this many seconds; `null` = real time. */
  readonly frozenAt: number | null;
  /** Time of day pinned to minutes after midnight; `null` = the player's local time. */
  readonly fixedMinutes: number | null;
  readonly weather: Weather;
  readonly season: Season;
  readonly zone: Zone;
  /** `null` = automatic (fps-based detection arrives in ART-18; until then treated as `high`). */
  readonly quality: Quality | null;
  readonly showOverlay: boolean;
  /** Initial camera x in logical px; `null` = scene default. */
  readonly camX: number | null;
  /** «Менше руху» (SPEC §6.3, §6.8): plants stand upright (ART-14). The settings screen drives it from M2. */
  readonly lessMotion: boolean;
}

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  seed: null,
  frozenAt: null,
  fixedMinutes: null,
  weather: 'clear',
  season: 'summer',
  zone: 'farm',
  quality: null,
  showOverlay: false,
  camX: null,
  lessMotion: false,
};
