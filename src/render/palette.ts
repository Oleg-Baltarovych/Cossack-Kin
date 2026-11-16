// Master palette access for render code (assets-src/palettes/master.json). No hard-coded hex in render.
import master from '../../assets-src/palettes/master.json';

export type RampName = keyof typeof master.ramps;

const ramps: Readonly<Record<RampName, readonly string[]>> = master.ramps;

export function rampSize(ramp: RampName): number {
  return ramps[ramp].length;
}

/** Color `index` of `ramp` (dark → light) as 0xRRGGBB; a negative index counts from the light end. */
export function rampColor(ramp: RampName, index: number): number {
  const colors = ramps[ramp];
  const hex = colors[index < 0 ? colors.length + index : index];
  if (hex === undefined) throw new RangeError(`palette: ramp "${ramp}" has no index ${String(index)}`);
  return Number.parseInt(hex.slice(1), 16);
}

/** Same color as a CSS hex string, for DOM styling owned by render (host background, debug overlay). */
export function rampCss(ramp: RampName, index: number): string {
  return `#${rampColor(ramp, index).toString(16).padStart(6, '0')}`;
}
