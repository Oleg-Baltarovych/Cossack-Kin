// Whole-device-px placement for DOM pixel art (plan M2-29 B1, art-director M2-14).

/**
 * The box's offset (css px) to the nearest whole device px: an icon laid out after text or centred in a button lands
 * on a fraction of a device px, and at dpr 3.5 its outer outline row then blends over 1 device px (art-director M2-14).
 */
export function deviceSnap(pos: number, dpr: number): number {
  return (Math.round(pos * dpr) - pos * dpr) / dpr;
}
