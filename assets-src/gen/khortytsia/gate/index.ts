// Брама — the Sich gate (plan ART-11, ART-BIBLE §6: a tower over the passage with the crimson корогва; the zone's
// accent): two log pylons and an open passage — the steppe and a strip of sky show through it, one plank leaf swung
// back against the left pylon — a crimson-and-gold band and a lantern (lit at night) over the lintel, a log upper
// storey with two lit windows, a broad шатро roof, and the crimson корогва with a gold cross on a tall pole.
// 80×112 (larger than the towers: the accent of the zone), pivot at the base.
import { castShadow, compose } from '../../lib/passes.ts';
import { Plot } from '../../lib/plot.ts';
import { banner, logWall, opening, tentRoof } from '../../lib/recipes-sich.ts';
import type { GeneratorParams, SpriteGenerator } from '../../lib/types.ts';

export const GATE_W = 80;
export const GATE_H = 112;
const W = GATE_W;
const H = GATE_H;
export const GATE_GROUND = 110;
const STOREY = { x: 8, w: 60, top: 44, bottom: 64 };
const PASSAGE = { x: 25, w: 26 };
const PYLON = { left: 10, right: 66 };
/** The корогва pole: x, top row, height; the cloth hangs from its top right (`BANNER_HOIST`). */
const POLE = { x: 66, top: 2, h: 44 } as const;
/** Frame px where a separate wind-blown `banner` hangs (the cloth's top-left: right of the pole, a row under its top). */
export const BANNER_HOIST = { x: POLE.x + 2, y: POLE.top + 1 } as const;
export const GATE_ANCHOR = { x: 38 / W, y: (GATE_GROUND + 1) / H } as const;

/**
 * The gate's look by tier (plan M2-09): `cloth` — the M1 static корогва (from walls II the cloth is the separate
 * wind-blown `banner` and only the pole is drawn); `bridge` — the moat (walls II+) and a plank bridge seen through the
 * passage; `gilt` — walls IV: a gilt finial, the Pokrova icon over the passage, a gold-studded eave band.
 */
export interface GateLook {
  readonly cloth: boolean;
  readonly bridge: boolean;
  readonly gilt: boolean;
}
export const GATE_M1: GateLook = { cloth: true, bridge: false, gilt: false };
/** A 3 × 3 gilt ball (dx, dy, gold shade), lit top-left. */
const GILT_KNOB: readonly (readonly [number, number, number])[] = [
  [0, 0, 5],
  [-1, 1, 5],
  [0, 1, 4],
  [1, 1, 3],
  [0, 2, 3],
];
/** The icon's figure inside its frame (dx, dy, ramp, shade): halo, face, mantle widening down. */
const ICON: readonly (readonly [number, number, 'gold' | 'crimson', number])[] = [
  [2, 1, 'gold', 4],
  [3, 1, 'gold', 5],
  [4, 1, 'gold', 4],
  [3, 2, 'gold', 3],
  [2, 3, 'crimson', 4],
  [3, 3, 'crimson', 3],
  [4, 3, 'crimson', 3],
  [2, 4, 'crimson', 4],
  [3, 4, 'crimson', 3],
  [4, 4, 'crimson', 2],
  [1, 5, 'crimson', 4],
  [2, 5, 'crimson', 3],
  [3, 5, 'crimson', 3],
  [4, 5, 'crimson', 3],
  [5, 5, 'crimson', 2],
  [1, 6, 'crimson', 3],
  [2, 6, 'crimson', 3],
  [3, 6, 'crimson', 3],
  [4, 6, 'crimson', 2],
  [5, 6, 'crimson', 2],
];

/** Paints the gate in `look` (the M1 `gate` frame with GATE_M1; `brama` t2/t4 with the later looks). */
export function paintGate({ buffer, layers, rampSize }: GeneratorParams, look: GateLook): void {
  const body = new Plot();
  const glow = new Plot();
  const pylonH = GATE_GROUND + 1 - STOREY.bottom;
  const rx = PASSAGE.x + PASSAGE.w;
  logWall(body, {
    seed: 'gate:l',
    x: PYLON.left,
    y: STOREY.bottom,
    w: PASSAGE.x - PYLON.left,
    h: pylonH,
    ends: true,
  });
  logWall(body, { seed: 'gate:r', x: rx, y: STOREY.bottom, w: PYLON.right - rx, h: pylonH, ends: true });
  // The passage: dark under the lintel, then the open view outside — the sky strip is left transparent (the real
  // sky, far planes and meadow show through, graded by the time of day; a painted sky stayed day-blue at dusk and in
  // fog, art-director ART-19), then the far steppe (grass 3/2) and the trodden road (earth 4) running out of the gate.
  const horizonRow = STOREY.bottom + 14;
  const MOAT = { top: horizonRow + 5, rows: 5 };
  for (let y = STOREY.bottom; y <= GATE_GROUND; y++) {
    for (let x = PASSAGE.x; x < rx; x++) {
      const edge = x === PASSAGE.x || x === rx - 1;
      if (y < STOREY.bottom + 4 || edge) body.set(x, y, 'ink', 2);
      else if (y < horizonRow) continue;
      else {
        const road = Math.abs(x - (PASSAGE.x + PASSAGE.w / 2)) < 3 + (y - horizonRow) / 4;
        const moat = look.bridge && y >= MOAT.top && y < MOAT.top + MOAT.rows;
        if (moat && road) {
          // The plank bridge over the moat: planks across (lit / shaded rows), dark rails at its sides.
          const rail = !(Math.abs(x + 1 - (PASSAGE.x + PASSAGE.w / 2)) < 3 + (y - horizonRow) / 4);
          body.set(x, y, 'wood', rail ? 1 : (y - MOAT.top) % 2 === 0 ? 4 : 3);
        } else if (moat) body.set(x, y, y > MOAT.top && (x + y) % 5 === 0 ? 'stone' : 'ink', y === MOAT.top ? 1 : 2);
        else body.set(x, y, road ? 'earth' : 'grass', road ? 4 : y < horizonRow + 4 ? 3 : 2);
      }
    }
  }
  // One plank leaf swung back against the left pylon: vertical boards, 1-px gaps, iron bands, a lit wood 4 edge.
  for (let y = STOREY.bottom + 4; y <= GATE_GROUND; y++) {
    for (let x = PASSAGE.x; x < PASSAGE.x + 6; x++) {
      const gap = (x - PASSAGE.x) % 3 === 2;
      const band = y === STOREY.bottom + 9 || y === GATE_GROUND - 6;
      if (band) body.set(x, y, 'stone', 2);
      else body.set(x, y, 'wood', x === PASSAGE.x + 5 ? 4 : gap ? 1 : 3);
    }
  }
  // Upper storey bridging the passage, with two lit windows.
  logWall(body, {
    seed: 'gate:storey',
    x: STOREY.x,
    y: STOREY.top,
    w: STOREY.w,
    h: STOREY.bottom - STOREY.top,
    ends: true,
  });
  opening(body, glow, { x: STOREY.x + 13, y: STOREY.top + 6, w: 5, h: 6 }, 1);
  opening(body, glow, { x: STOREY.x + 42, y: STOREY.top + 6, w: 5, h: 6 }, 1);
  // Lintel: a 2-px crimson band with gold studs over the passage, and a lantern hanging from it (lit at night).
  for (let x = PASSAGE.x - 2; x < rx + 2; x++) {
    body.set(x, STOREY.bottom, 'crimson', (x & 3) === 0 ? 4 : 3);
    body.set(x, STOREY.bottom + 1, (x & 3) === 2 ? 'gold' : 'crimson', (x & 3) === 2 ? 4 : 2);
  }
  const lx = PASSAGE.x + PASSAGE.w - 5;
  body.set(lx, STOREY.bottom + 2, 'wood', 1);
  for (let y = STOREY.bottom + 3; y < STOREY.bottom + 6; y++) {
    for (let x = lx - 1; x <= lx + 1; x++) {
      const frame = x !== lx || y === STOREY.bottom + 3;
      if (frame) body.set(x, y, 'wood', 1);
      else {
        body.set(x, y, 'gold', 4);
        glow.set(x, y, 'gold', 5);
      }
    }
  }
  const roof = new Plot();
  const cx = STOREY.x + STOREY.w / 2;
  tentRoof(roof, cx, 14, STOREY.top, STOREY.w + 8);
  // The корогва on a tall pole beside the roof: crimson against the sky, the zone's accent.
  const flag = new Plot();
  if (look.cloth) banner(flag, POLE.x, POLE.top, POLE.h, 11, 10);
  else {
    // The pole alone: the cloth is the wind-blown `banner` add-on (4 frames), hung at BANNER_HOIST.
    for (let y = POLE.top; y < POLE.top + POLE.h; y++) {
      flag.set(POLE.x, y, 'wood', 2);
      flag.set(POLE.x + 1, y, 'wood', 1);
    }
    flag.set(POLE.x, POLE.top - 1, 'gold', 4);
    flag.set(POLE.x + 1, POLE.top - 1, 'gold', 3);
  }
  if (look.gilt) {
    // Gilt finial ball on the roof and a bigger knob on the pole.
    for (const [dx, dy, shade] of GILT_KNOB) {
      roof.set(cx + dx, 14 - 4 + dy, 'gold', shade);
      flag.set(POLE.x + dx, POLE.top - 2 + dy, 'gold', shade);
    }
    // The eave band: crimson with gold studs under the roof's rim.
    for (let x = STOREY.x; x < STOREY.x + STOREY.w; x++) {
      body.set(x, STOREY.top, 'crimson', x % 4 === 1 ? 4 : 2);
      body.set(x, STOREY.top + 1, x % 4 === 1 ? 'gold' : 'crimson', x % 4 === 1 ? 4 : 3);
    }
    // The Pokrova icon over the passage (Sich gates carried one): a gold frame, a dark field, the Virgin's crimson
    // mantle under a gold halo — 7 × 9, between the windows.
    const ix = cx - 3;
    const iy = STOREY.top + 4;
    for (let y = iy; y < iy + 9; y++) {
      for (let x = ix; x < ix + 7; x++) {
        const rim = x === ix || x === ix + 6 || y === iy || y === iy + 8;
        body.set(x, y, rim ? 'gold' : 'ink', rim ? (x === ix || y === iy ? 4 : 3) : 2);
      }
    }
    for (const [dx, dy, ramp, shade] of ICON) body.set(ix + dx, iy + dy, ramp, shade);
  }
  compose(buffer, [body.part(1, 1, glow), roof.part(2, 2), flag.part(3, 3)], rampSize, {
    light: false,
    occlusion: false,
    outline: { mode: 'outer', parts: [2] },
    selective: { lit: 'vanish' },
    ...(layers.emissive ? { emissive: layers.emissive } : {}),
  });
  if (layers.shadow) castShadow(layers.shadow, { x0: 38, x1: PYLON.right + 1, groundY: GATE_GROUND });
}

const gate: SpriteGenerator = {
  atlas: 'khortytsia',
  id: 'gate',
  size: { w: W, h: H },
  frames: { idle: 1 },
  layers: ['emissive', 'shadow'],
  anchor: GATE_ANCHOR,
  generate(_rng, params) {
    paintGate(params, GATE_M1);
  },
};

export default gate;
