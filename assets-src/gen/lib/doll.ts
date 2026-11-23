// Paper-doll characters (plan ART-06, ART-BIBLE §7). A character is drawn from small hand-authored ASCII masks —
// body, then limb masks chosen per frame from offset tables — whose characters name a clothing *slot* and a *tone*,
// not a color. An outfit maps each slot to a palette ramp and its tone shades, so one set of masks gives many people
// by palette swap (crimson / cloth / grass / thatch, skin tones). Outlines are not drawn by hand: compose() adds the
// colored outer outline (one ramp, 2 steps darker) and lightens it on the sun side.
import { Plot } from './plot.ts';
import type { RampName } from './buffer.ts';
import type { SelectiveOptions } from './passes.ts';

/**
 * Every person's selective outline (ART-BIBLE §3, §7): the sunny side one step lighter, except where a light material
 * meets the air — a white shirt (plaster ≥ 4) or a shaved head / bare face (skin ≥ 3), whose lighter step vanished on
 * the light maidan and in the crowd: there a warm brown 1-px contour (ART-19 deferred 7, M2-29 A4). Skin only, so no
 * figure gains a ramp.
 */
export const PEOPLE_SELECTIVE: SelectiveOptions = {
  lit: 'lighter',
  warm: [
    { ramp: 'plaster', from: 4, to: ['skin', 2] },
    { ramp: 'skin', from: 3, to: ['skin', 1] },
  ],
};

/** Clothing / body slots a mask can paint. */
export const SLOTS = ['skin', 'hair', 'shirt', 'lower', 'accent', 'belt', 'boots', 'hat'] as const;
export type Slot = (typeof SLOTS)[number];

/** Tone of a mask px: 0 deepest shade … 3 light. */
export type Tone = 0 | 1 | 2 | 3;

export interface Swatch {
  readonly ramp: RampName;
  /** Ramp shades for tones 0..3 (deep shade, shade, base, light). */
  readonly tones: readonly [number, number, number, number];
}

export type Outfit = Readonly<Record<Slot, Swatch>>;

/**
 * Mask legend. Upper case = light, lower = base, the paired letter = shade, its upper case = deep shade.
 * skin s/S z/Z · hair h/H j/J · shirt w/W v/V · lower (skirt, sharovary) p/P q/Q · accent (plakhta stripes,
 * embroidery) a/A x/X · belt r/R t/T · boots b/B d/D · hat c/C g/G · `.` or space = empty.
 */
const LEGEND: Readonly<Record<string, readonly [Slot, Tone]>> = (() => {
  const table: Record<string, readonly [Slot, Tone]> = {};
  const pairs: readonly (readonly [Slot, string, string])[] = [
    ['skin', 's', 'z'],
    ['hair', 'h', 'j'],
    ['shirt', 'w', 'v'],
    ['lower', 'p', 'q'],
    ['accent', 'a', 'x'],
    ['belt', 'r', 't'],
    ['boots', 'b', 'd'],
    ['hat', 'c', 'g'],
  ];
  for (const [slot, base, shade] of pairs) {
    table[base] = [slot, 2];
    table[base.toUpperCase()] = [slot, 3];
    table[shade] = [slot, 1];
    table[shade.toUpperCase()] = [slot, 0];
  }
  return table;
})();

export type Mask = readonly string[];

/** Checks that a mask uses only legend characters (throws with the offending char and row). */
export function checkMask(mask: Mask, name: string): void {
  mask.forEach((row, y) => {
    for (const ch of row) {
      if (ch !== '.' && ch !== ' ' && !LEGEND[ch])
        throw new Error(`${name}: unknown mask char "${ch}" in row ${String(y)}`);
    }
  });
}

/** A mask placed at (x, y); later stamps cover earlier ones. (Facing left is a mirrored sprite in render.) */
export interface Stamp {
  readonly mask: Mask;
  readonly x: number;
  readonly y: number;
}

/** Paints stamps in order into a Plot with the outfit's ramps. */
export function paintDoll(plot: Plot, outfit: Outfit, stamps: readonly Stamp[]): void {
  for (const { mask, x, y } of stamps) {
    mask.forEach((row, r) => {
      // Masks are ASCII by contract (checkMask), so indexing by UTF-16 unit is exact.
      for (let c = 0; c < row.length; c++) {
        const entry = LEGEND[row.charAt(c)];
        if (!entry) continue;
        const [slot, tone] = entry;
        const swatch = outfit[slot];
        plot.set(x + c, y + r, swatch.ramp, swatch.tones[tone]);
      }
    });
  }
}
