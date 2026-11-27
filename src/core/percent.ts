// Shown percents (SPEC §6.1; plans M3-06, M4-07): the UI never computes a percent itself, it reads one of these. Both
// round down, so a shown chance or bonus never overstates the real one.
import { PERCENT_STEP } from '../content/effects.ts';

const PERCENT = 100;
/**
 * Floating-point slack: a share written as a whole percent (0.29) is 28.999…96 after × 100 in binary, and must still
 * read 29 (as 0.015 × 3 must read 4.5). Far below any real difference between two shares (content shares are ≥ 0.005).
 */
const PERCENT_EPS = 1e-9;

function percentDown(share: number, step: number): number {
  return Math.floor((share * PERCENT) / step + PERCENT_EPS) * step;
}

/** A share (0…1) as the whole percent the player reads (raid chances). */
export function wholePercent(share: number): number {
  return percentDown(share, 1);
}

/**
 * A bonus share as the percent the player reads, to the content step (`PERCENT_STEP`, half a percent): culture, hero
 * and modifier-breakdown lines. 0.045 (the Кобзар at level 3) reads 4.5, never 4.
 */
export function effectPercent(share: number): number {
  return percentDown(share, PERCENT_STEP);
}
