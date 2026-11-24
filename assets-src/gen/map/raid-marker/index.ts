// Маркери походів на мапі (plan M3-10, §0.1 П1): one flag planted on the map per offer of the day, its size and cloth
// growing with the raid's length so the five tiers read apart (×2 in the sheet, art-director M3-10) — 5 min a short staff with a small green pennant
// (the scouts), 30 min a longer blue pennant, 1 h a crimson swallow-tail, 4 h a crimson banner with a gold finial,
// 8 h («на ніч») the largest banner with a gold spearhead, a gold band at the hoist and a gold fringe. Plain cloth: no emblem, no
// state symbol (SPEC §16). The rumour badge is `raid-rumor`, the squad on the way `raid-squad`. A 1-px ink outline
// (never black) holds each flag on the parchment. Pivot: the flag's foot (the left edge of the pole column, bottom).
import { RAID_TIER_IDS, type RaidTierId } from '../../../../src/content/raids.ts';
import { Glyph } from '../../lib/glyph.ts';
import type { RampName, SpriteGenerator } from '../../lib/types.ts';

export const MARKER_W = 14;
export const MARKER_H = 20;
/** The pole's column; the frame's pivot is the bottom edge of this column. */
export const POLE_X = 2;
/** The ground mark's row (the pole stands on it). */
const GROUND = MARKER_H - 1;

interface Flag {
  /** Pole length above the ground mark. */
  readonly pole: number;
  /** Cloth: length × height, swallow-tail notch depth (0 = a pointed pennant). */
  readonly len: number;
  readonly h: number;
  readonly notch: number;
  /** Rectangular banner (true) or a tapering pennant. */
  readonly banner: boolean;
  readonly cloth: RampName;
  /** Shades: lit top edge, body, shaded hem. */
  readonly shades: readonly [number, number, number];
  /** Gold finial rows over the pole (0 none); a gold band at the hoist. */
  readonly finial: number;
  readonly band: boolean;
  /** A gold fringe along the hem (every other px). */
  readonly fringe: boolean;
}

export const FLAGS: Readonly<Record<RaidTierId, Flag>> = {
  m5: {
    pole: 9,
    len: 5,
    h: 4,
    notch: 0,
    banner: false,
    cloth: 'grass',
    shades: [4, 3, 2],
    finial: 0,
    band: false,
    fringe: false,
  },
  m30: {
    pole: 11,
    len: 7,
    h: 5,
    notch: 0,
    banner: false,
    cloth: 'cloth',
    shades: [3, 2, 1],
    finial: 0,
    band: false,
    fringe: false,
  },
  h1: {
    pole: 12,
    len: 8,
    h: 5,
    notch: 2,
    banner: false,
    cloth: 'crimson',
    shades: [4, 3, 2],
    finial: 0,
    band: false,
    fringe: false,
  },
  h4: {
    pole: 14,
    len: 8,
    h: 6,
    notch: 3,
    banner: true,
    cloth: 'crimson',
    shades: [4, 3, 2],
    finial: 1,
    band: false,
    fringe: false,
  },
  h8: {
    pole: 15,
    len: 9,
    h: 7,
    notch: 3,
    banner: true,
    cloth: 'crimson',
    shades: [4, 3, 2],
    finial: 2,
    band: true,
    fringe: true,
  },
};

/** A small wave along the cloth: the middle columns hang one row lower. */
const sag = (c: number, len: number): number => (c >= 2 && c < len - 2 && len >= 7 ? 1 : 0);

function flag(g: Glyph, f: Flag): void {
  const top = GROUND - f.pole;
  // Pole: wood, its lit (left) half is the pole itself, the outline does the rest.
  for (let y = top; y < GROUND; y++) g.set(POLE_X, y, 'wood', y === top ? 4 : 2);
  for (let i = 1; i <= f.finial; i++) g.set(POLE_X, top - i, 'gold', i === f.finial ? 5 : 3);
  // Cloth from the pole's top, flying right.
  const x0 = POLE_X + 1;
  for (let c = 0; c < f.len; c++) {
    // A pennant tapers to a point; a banner keeps its height and ends in the swallow-tail notch.
    const rows = f.banner ? f.h : Math.max(1, f.h - Math.floor((c * f.h) / (f.len + 1)));
    for (let r = 0; r < rows; r++) {
      const fromTip = f.len - 1 - c;
      if (f.notch > 0 && fromTip < f.notch) {
        // The notch: a V cut into the middle rows, deeper toward the tip.
        const mid = (rows - 1) / 2;
        if (Math.abs(r - mid) < (f.notch - fromTip) * (rows / (2 * f.notch)) - 0.01) continue;
      }
      const shade = r === 0 ? f.shades[0] : r === rows - 1 ? f.shades[2] : f.shades[1];
      const band = f.band && c === 0;
      const fringe = f.fringe && r === rows - 1 && c % 2 === 1;
      const gold = band || fringe;
      g.set(
        x0 + c,
        top + 1 + r + sag(c, f.len),
        gold ? 'gold' : f.cloth,
        band ? (r === 0 ? 4 : 3) : fringe ? 3 : shade,
      );
    }
  }
  // The foot: a small dark mark on the map where the flag stands.
  g.mark(POLE_X - 1, GROUND, 'ink', 3);
  g.mark(POLE_X, GROUND, 'ink', 2);
  g.mark(POLE_X + 1, GROUND, 'ink', 3);
}

const raidMarker: SpriteGenerator = {
  atlas: 'map',
  id: 'raid-marker',
  size: { w: MARKER_W, h: MARKER_H },
  frames: { idle: 1 },
  variants: RAID_TIER_IDS,
  anchor: { x: POLE_X / MARKER_W, y: 1 },
  generate(_rng, { variant, buffer }) {
    const f = RAID_TIER_IDS.find((id) => id === variant);
    if (f === undefined) throw new Error(`raid-marker: unknown tier ${String(variant)}`);
    const g = new Glyph();
    flag(g, FLAGS[f]);
    g.draw(buffer);
  },
};

export default raidMarker;
