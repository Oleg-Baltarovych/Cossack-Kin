// The hours of the sky keys (plan §0, ART-04) and the phase of the day they make. Pure data and arithmetic — no Pixi,
// no DOM, no layout imports — so the DOM UI can follow the sky (M4-16a: the night scrim) without pulling
// `config.ts` (and the village layout) into its start chunk.

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

const DAY = 1440;
const FALLBACK_MINUTES = 13 * 60;

export function wrapMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return FALLBACK_MINUTES;
  const m = minutes % DAY;
  return m < 0 ? m + DAY : m;
}

/** What the UI dims for: dusk from the dusk key to the night key, night until dawn, day otherwise. */
export type SkyPhase = 'day' | 'dusk' | 'night';

function keyAt(id: SkyKeyId): number {
  const key = SKY_KEYS.find((k) => k.id === id);
  if (!key) throw new Error(`skyKeys: no ${id} key`);
  return key.at;
}

const DAWN = keyAt('dawn');
const DUSK = keyAt('dusk');
const NIGHT = keyAt('night');

export function skyPhase(minutes: number): SkyPhase {
  const m = wrapMinutes(minutes);
  if (m >= DUSK && m < NIGHT) return 'dusk';
  if (m >= NIGHT || m < DAWN) return 'night';
  return 'day';
}
