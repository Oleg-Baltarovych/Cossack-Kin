// Wind sway and foreground fading (plan ART-14). Pure: driven only by animation seconds and the wind strength, so
// `?freeze=<s>` frames repeat. The plant sprites carry SWAY.frames baked lean frames (whole-px row offsets in the
// generator, frame (n − 1)/2 upright); here we only pick which one shows — no filter, no sub-px resampling.
import { FOREGROUND, SWAY } from './atmosphere/config.ts';

/** The upright frame. */
export const SWAY_UPRIGHT = (SWAY.frames - 1) / 2;

export interface SwayParams {
  /** Share of the full lean this plant takes (a stiff oak < 1 < a willow's strands are baked in the frames). */
  readonly amp: number;
  /** 0..1 offset of the swing, so neighbours do not move in step. */
  readonly phase: number;
}

const TAU = Math.PI * 2;

/** Sway frame index for animation time `seconds`; upright in calm air or when `still` («менше руху»). */
export function swayFrame(seconds: number, plant: SwayParams, strength: number, still: boolean): number {
  const s = Math.min(1, Math.max(0, strength));
  if (still || s === 0) return SWAY_UPRIGHT;
  const hz = SWAY.hz.calm + (SWAY.hz.gale - SWAY.hz.calm) * s;
  const gust = 1 + SWAY.gustDepth * Math.sin(TAU * (SWAY.gustHz * seconds + plant.phase * 0.37));
  const reach = SWAY.maxShift * plant.amp * s * gust;
  const lean = reach * Math.sin(TAU * (hz * seconds + plant.phase));
  // Symmetric rounding (Math.round(−0.5) is −0 but Math.round(0.5) is 1): both sides lean alike.
  const shift = Math.sign(lean) * Math.round(Math.abs(lean));
  return SWAY_UPRIGHT + Math.max(-SWAY_UPRIGHT, Math.min(SWAY_UPRIGHT, shift));
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Alpha of a foreground clump: `FOREGROUND.fadeAlpha` while any person's box overlaps it, else opaque. */
export function foregroundAlpha(plant: Rect, people: readonly Rect[]): number {
  const hit = people.some(
    (p) => p.x < plant.x + plant.w && plant.x < p.x + p.w && p.y < plant.y + plant.h && plant.y < p.y + p.h,
  );
  return hit ? FOREGROUND.fadeAlpha : 1;
}
